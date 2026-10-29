"""One request per process; metadata only, no login/challenge/download APIs."""
import contextlib
import ipaddress
import json
import logging
import math
import os
from pathlib import Path
import re
import socket
import sys
import tempfile
import time
from urllib.parse import urlsplit

MAX_INPUT = 8192
MAX_RESPONSE = 2 * 1024 * 1024


class Failure(Exception):
    def __init__(self, code):
        self.code = code


def error_code(error):
    if isinstance(error, Failure):
        return error.code
    name = type(error).__name__
    if any(word in name for word in ('Challenge', 'Login', 'Unauthorized', 'TwoFactor', 'Password', 'Verification')):
        return 'LOGIN_REQUIRED'
    if any(word in name for word in ('Private', 'Forbidden')):
        return 'PRIVATE_CONTENT'
    if any(word in name for word in ('Throttl', 'RateLimit', 'PleaseWait', 'FeedbackRequired', 'SentryBlock')):
        return 'RATE_LIMITED'
    if any(word in name for word in ('NotFound', 'Unavailable')):
        return 'DELETED_CONTENT'
    if 'Timeout' in name:
        return 'DOWNLOAD_TIMEOUT'
    return 'EXTRACTOR_FAILURE'


def validate_input(data):
    if not isinstance(data, dict) or data.get('version') != 1:
        raise Failure('INVALID_URL')
    url = data.get('url', '')
    if not isinstance(url, str) or len(url) > 512:
        raise Failure('INVALID_URL')
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc != 'www.instagram.com' or parsed.query or parsed.fragment or url != 'https://www.instagram.com' + parsed.path:
        raise Failure('INVALID_URL')
    patterns = {
        'photo': r'/p/([A-Za-z0-9_-]{1,64})/',
        'reel': r'/reel/([A-Za-z0-9_-]{1,64})/',
        'video': r'/(?:tv|p)/([A-Za-z0-9_-]{1,64})/',
        'profile': r'/([A-Za-z0-9._]{1,30})/',
    }
    match = re.fullmatch(patterns.get(data.get('category'), r'(?!)'), parsed.path)
    if not match:
        raise Failure('INVALID_URL')
    return match.groups()


def secure_session(data):
    """Only the operator-only Node entry point supplies this object."""
    auth = data.get('access')
    if auth is None:
        return None
    keys = os.environ.get('INSTAGRAPI_SESSION_KEYS', 'owner').split(',')
    if auth.get('sessionKey') not in keys:
        raise Failure('PRIVATE_CONTENT')
    if not isinstance(auth, dict) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', str(auth.get('sessionKey', ''))):
        raise Failure('PRIVATE_CONTENT')
    if not re.fullmatch(r'[A-Za-z0-9._]{1,30}', str(auth.get('ownerUsername', ''))) or not re.fullmatch(r'\d{1,30}', str(auth.get('ownerUserId', ''))):
        raise Failure('PRIVATE_CONTENT')
    root = Path(os.environ.get('INSTAGRAPI_SESSION_DIR', '/var/lib/saveframe/instagram-sessions'))
    if not root.is_absolute() or root.resolve() != root:
        raise Failure('PRIVATE_CONTENT')
    forbidden = [Path.cwd().resolve(), Path(tempfile.gettempdir()).resolve()]
    for key in ('DOWNLOAD_TEMP_DIR',):
        if os.environ.get(key):
            forbidden.append(Path(os.environ[key]).resolve())
    if any(root == base or base in root.parents for base in forbidden):
        raise Failure('PRIVATE_CONTENT')
    target = root / (auth['sessionKey'] + '.json')
    if target.is_symlink() or target.resolve() != target:
        raise Failure('PRIVATE_CONTENT')
    for item in (root, target):
        details = item.stat()
        if os.name != 'nt' and (details.st_mode & 0o077 or details.st_uid != os.getuid()):
            raise Failure('PRIVATE_CONTENT')
    if not root.is_dir() or not target.is_file() or target.stat().st_size > 65536:
        raise Failure('PRIVATE_CONTENT')
    with os.fdopen(os.open(target, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0)), encoding='utf-8') as stream:
        text = stream.read(65537)
        if len(text) > 65536:
            raise Failure('PRIVATE_CONTENT')
        settings = json.loads(text)
    identity = settings.get('authorization_data', {})
    cookies = settings.get('cookies', {})
    if str(identity.get('ds_user_id') or cookies.get('ds_user_id') or '') != auth['ownerUserId']:
        raise Failure('PRIVATE_CONTENT')
    if not (identity.get('sessionid') or cookies.get('sessionid')):
        raise Failure('LOGIN_REQUIRED')
    # Preserve the existing protected settings. No automatic refresh/login or writes.
    return settings


def bounded_response(original_send, request, kwargs, hosts, budget):
    parsed = urlsplit(request.url)
    if parsed.scheme != 'https' or parsed.netloc not in hosts or budget[0] <= 0:
        raise Failure('SSRF_BLOCKED')
    budget[0] -= 1
    kwargs.update(allow_redirects=False, stream=True, timeout=5, verify=True, proxies={})
    response = original_send(request, **kwargs)
    try:
        content = bytearray()
        for chunk in response.iter_content(32768):
            content.extend(chunk)
            if len(content) > MAX_RESPONSE:
                raise Failure('FILE_TOO_LARGE')
        status = response.status_code
        try:
            payload = json.loads(content)
        except (ValueError, UnicodeError):
            payload = {}
        marker = str(payload.get('message', '')) if isinstance(payload, dict) else ''
        if isinstance(payload, dict) and (payload.get('challenge') or marker in ('challenge_required', 'checkpoint_required', 'two_factor_required')):
            raise Failure('CHALLENGE_REQUIRED')
        if 300 <= status < 400 or status == 401 or marker in ('login_required', 'user_has_logged_out'):
            raise Failure('LOGIN_REQUIRED')
        if status == 403:
            raise Failure('PRIVATE_CONTENT')
        if status in (404, 410):
            raise Failure('DELETED_CONTENT')
        if status == 429:
            raise Failure('RATE_LIMITED')
        if status < 200 or status >= 300:
            raise Failure('EXTRACTOR_FAILURE')
        response._content = bytes(content)
        response._content_consumed = True
        return response
    finally:
        response.close()


def authenticated_error(error):
    code = error_code(error)
    if 'Challenge' in type(error).__name__ or 'TwoFactor' in type(error).__name__:
        return 'CHALLENGE_REQUIRED'
    return 'SESSION_EXPIRED' if code == 'LOGIN_REQUIRED' else code


def protect_transport(client):
    """Pin approved DNS answers; deny redirects, proxies and mobile/curl calls."""
    original_lookup = socket.getaddrinfo
    hosts = {'www.instagram.com'}
    pinned = {}

    def lookup(host, port, *args, **kwargs):
        if host not in hosts or int(port) != 443:
            raise Failure('SSRF_BLOCKED')
        key = (host, port, args, tuple(sorted(kwargs.items())))
        if key not in pinned:
            answers = original_lookup(host, port, *args, **kwargs)
            if not answers or any(not ipaddress.ip_address(answer[4][0]).is_global for answer in answers):
                raise Failure('SSRF_BLOCKED')
            pinned[key] = answers
        return pinned[key]

    socket.getaddrinfo = lookup
    budget = [6]
    for session in [client.public]:
        session.trust_env = False
        session.proxies.clear()
        session.verify = True
        original = session.send
        session.send = lambda request, _send=original, **kwargs: bounded_response(_send, request, kwargs, hosts, budget)

    def denied(*args, **kwargs):
        raise Failure('LOGIN_REQUIRED')

    client.private_request = denied
    client.login = denied
    client.challenge_resolve = denied
    client.challenge_code_handler = denied
    client.change_password_handler = denied
    # Convert access errors before media_info_gql can try another endpoint.
    for method in ('public_graphql_request', 'public_doc_id_graphql_request'):
        original = getattr(client, method)

        def guarded(*args, _original=original, **kwargs):
            try:
                return _original(*args, **kwargs)
            except Exception as error:
                raise Failure(error_code(error)) from None

        setattr(client, method, guarded)


def positive(value, maximum):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and 0 < value <= maximum else None


def cdn_url(value):
    value = str(value or '')
    parsed = urlsplit(value)
    if len(value) > 8192 or parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443) or not any(parsed.hostname == host or (parsed.hostname or '').endswith('.' + host) for host in ('cdninstagram.com', 'fbcdn.net')):
        raise Failure('SSRF_BLOCKED')
    return value


def item(value):
    media_type = getattr(value, 'media_type', None)
    if media_type not in (1, 2):
        raise Failure('UNSUPPORTED_MEDIA_TYPE')
    thumbnail = cdn_url(getattr(value, 'thumbnail_url', None))
    return {
        'id': str(value.pk).split('_')[0], 'type': 'video' if media_type == 2 else 'photo',
        'url': cdn_url(value.video_url) if media_type == 2 else thumbnail,
        'thumbnail': thumbnail, 'width': positive(getattr(value, 'width', None), 32768),
        'height': positive(getattr(value, 'height', None), 32768),
        'duration': positive(getattr(value, 'video_duration', None), 86400),
        # Unknown audio availability is not advertised as confirmed audio.
        'hasAudio': getattr(value, 'has_audio', None) is True,
    }


def extract(data, client):
    parts = validate_input(data)
    category = data['category']
    access = data.get('access')
    if category == 'profile':
        user = client.user_info_by_username_gql(parts[0])
        if user.username.lower() != parts[0].lower():
            raise Failure('PRIVATE_CONTENT')
    else:
        media = client.media_info_gql(client.media_pk_from_code(parts[0]))
        user = media.user
        if str(media.code) != parts[0]:
            raise Failure('EXTRACTOR_FAILURE')
    if getattr(user, 'is_private', None) is not False:
        # Media.user is UserShort and may omit is_private. Resolve it explicitly.
        expected = (user.username.lower(), str(user.pk))
        user = client.user_info_by_username_gql(user.username)
        if getattr(user, 'is_private', None) is not False or (user.username.lower(), str(user.pk)) != expected:
            raise Failure('PRIVATE_CONTENT')
    if access and (user.username.lower() != access['ownerUsername'].lower() or str(user.pk) != access['ownerUserId']):
        raise Failure('PRIVATE_CONTENT')
    if category == 'profile':
        avatar = cdn_url(getattr(user, 'profile_pic_url_hd', None) or user.profile_pic_url)
        items = [{'id': str(user.pk), 'type': 'photo', 'url': avatar, 'thumbnail': avatar, 'hasAudio': False}]
    else:
        resources = list(media.resources) if media.media_type == 8 else [media]
        if not resources or len(resources) > 100:
            raise Failure('EXTRACTOR_FAILURE')
        items = [item(resource) for resource in resources]
    return {'version': 1, 'status': 'ok', 'username': user.username, 'items': items}








def limits():
    if os.name == 'posix':
        import resource
        memory = max(256, min(768, int(os.environ.get('INSTAGRAPI_MEMORY_MB', '512')))) * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
        resource.setrlimit(resource.RLIMIT_CPU, (25, 26))
        resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))  # Metadata worker never writes files.
        resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def main():
    logging.disable(logging.CRITICAL)
    os.umask(0o077)
    result = {'version': 1, 'status': 'error', 'code': 'EXTRACTOR_FAILURE'}
    try:
        limits()
        text = sys.stdin.buffer.read(MAX_INPUT + 1)
        if len(text) > MAX_INPUT:
            raise Failure('INVALID_URL')
        data = json.loads(text)
        validate_input(data)
        if data.get('access') and os.environ.get('INSTAGRAPI_AUTH_ENABLED') != '1':
            raise Failure('PRIVATE_CONTENT')
        settings = secure_session(data)
        # Redirect incidental library prints; only the protocol reaches stdout.
        with contextlib.redirect_stdout(sys.stderr):
            from instagrapi import Client
            client = Client(public_transport='requests', private_transport='requests', with_challenge_flow=False, request_timeout=0.1, public_request_retries_count=1, session_retry_total=0)
            if settings:
                # Restore only credential/device keys; never transport/retry/proxy settings.
                client.set_settings({key: settings[key] for key in ('uuids', 'device_settings', 'cookies', 'authorization_data') if key in settings})
                if not client.inject_sessionid_to_public():
                    raise Failure('LOGIN_REQUIRED')
            client.public_request_retries_count = 1
            client.session_retry_total = 0
            client._configure_public_session_retry()
            protect_transport(client)
            result = extract(data, client)
    except Exception as error:
        result = {'version': 1, 'status': 'error', 'code': error_code(error)}
    sys.stdout.write(json.dumps(result, separators=(',', ':'), allow_nan=False))


if __name__ == '__main__':
    main()
