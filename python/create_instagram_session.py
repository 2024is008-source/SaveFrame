"""Interactive owner login. Never called by the web app or automated tests."""
import argparse
import contextlib
import getpass
import io
import logging
import os
from pathlib import Path
import re
import sys
import tempfile


class SetupError(ValueError):
    pass


def safe_target(value):
    target = Path(value)
    if not target.is_absolute() or target.name != 'owner.json' or target.resolve() != target:
        raise SetupError('Use an absolute, non-symlink path ending in owner.json.')
    forbidden = [Path(__file__).resolve().parent.parent, Path.cwd().resolve(), Path(tempfile.gettempdir()).resolve()]
    for key in ('DOWNLOAD_TEMP_DIR',):
        if os.environ.get(key):
            forbidden.append(Path(os.environ[key]).resolve())
    if any(target == root or root in target.parents for root in forbidden):
        raise SetupError('Session storage must be outside the checkout and temporary/download directories.')
    target.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    for item in [target.parent, *([target] if target.exists() else [])]:
        info = item.lstat()
        if item.is_symlink() or (os.name != 'nt' and (info.st_mode & 0o077 or info.st_uid != os.getuid())):
            raise SetupError('Session directory/file must be private and owned by you (700/600).')
    if not target.parent.is_dir() or (target.exists() and not target.is_file()):
        raise SetupError('Invalid private session location.')
    return target


def login_and_export(client, username, password, target, code_reader=getpass.getpass):
    from instagrapi.exceptions import TwoFactorRequired
    try:
        client.login(username, password)
    except TwoFactorRequired:
        code = code_reader('Enter your Instagram two-factor code (hidden): ').strip()
        if not re.fullmatch(r'[0-9 ]{6,20}', code):
            raise SetupError('Invalid verification code format.')
        client.login(username, password, verification_code=code.replace(' ', ''))
    account = client.account_info()
    if account.username.lower() != username.lower() or str(client.user_id) != str(account.pk):
        raise SetupError('Authenticated account identity did not match.')
    fd, staging = tempfile.mkstemp(prefix='.owner-', suffix='.json', dir=target.parent)
    os.close(fd)
    try:
        os.chmod(staging, 0o600)
        client.dump_settings(staging)
        if Path(staging).stat().st_size > 65536:
            raise SetupError('Session export is too large.')
        with open(staging, 'r+b') as stream:
            os.fsync(stream.fileno())
        os.replace(staging, target)
        if os.name != 'nt':
            target.chmod(0o600)
    finally:
        Path(staging).unlink(missing_ok=True)
    return account


def main():
    parser = argparse.ArgumentParser(description='Create/renew a private owner Instagram session locally. No password arguments.')
    base = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / '.local' / 'share'))) / 'SaveFrame' / 'instagram-sessions'
    parser.add_argument('--output', default=str(base / 'owner.json'))
    parser.add_argument('--renew', action='store_true', help='Explicitly replace an existing owner.json after successful login')
    args = parser.parse_args()
    logging.disable(logging.CRITICAL)
    os.umask(0o077)
    lock = None
    try:
        if not sys.stdin.isatty():
            raise SetupError('Run this login script in your own interactive terminal; piped credentials are not accepted.')
        target = safe_target(args.output)
        if target.exists() and not args.renew:
            raise SetupError('Session already exists. Use --renew for an explicit replacement.')
        lock_path = target.with_suffix('.lock')
        lock = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        username = input('Instagram username you own/manage: ').strip().lstrip('@')
        if not re.fullmatch(r'[A-Za-z0-9._]{1,30}', username):
            raise SetupError('Invalid Instagram username.')
        password = getpass.getpass('Instagram password (hidden; never saved): ')
        if not password:
            raise SetupError('A password is required for this local login.')
        from instagrapi import Client
        # All codes are supplied manually. Unknown challenges stop the login.
        client = Client(with_challenge_flow=False, session_retry_total=0, public_request_retries_count=1)
        terminal = sys.stderr
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            if args.renew and target.exists():
                client.load_settings(target)
                client.with_challenge_flow = False
                client.set_retry_config(session_retry_total=0, public_request_retries_count=1)
            account = login_and_export(client, username, password, target, code_reader=lambda prompt: getpass.getpass(prompt, stream=terminal))
        password = None
        print('Session saved privately. No upload or server configuration was performed.')
        print('File:', target)
        print('Expected owner username:', account.username)
        print('Expected owner user ID:', account.pk)
        if os.name == 'nt':
            print('Restrict this directory ACL to your Windows account and administrators before transfer.')
    except FileExistsError:
        print('Session creation is already locked. Stop the other login before renewing.', file=sys.stderr)
        return 1
    except (KeyboardInterrupt, EOFError):
        print('Session creation cancelled.', file=sys.stderr)
        return 1
    except SetupError as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception:
        print('Instagram login/verification failed. Complete any account checks in Instagram; no retry loop was started.', file=sys.stderr)
        return 1
    finally:
        if lock is not None:
            os.close(lock)
            lock_path.unlink(missing_ok=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
