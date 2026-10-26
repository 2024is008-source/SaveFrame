"""Offline contract/security checks. Never contacts Instagram."""
import importlib.util
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace as Obj
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('worker', Path(__file__).with_name('instagrapi_worker.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
CDN = 'https://scontent.cdninstagram.com/'


def photo(pk='1', **extra):
    return Obj(pk=pk, media_type=1, thumbnail_url=CDN + pk + '.jpg', width=1080, height=1350, **extra)


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.user = Obj(username='owner', pk='123', is_private=False, profile_pic_url=CDN+'avatar.jpg')
        self.media = photo(user=self.user, code='Example1')
        self.client = Obj(media_pk_from_code=lambda code: '1', media_info_gql=lambda pk: self.media,
                          user_info_by_username_gql=lambda name: self.user)

    def request(self, category='photo', url='https://www.instagram.com/p/Example1/'):
        return {'version': 1, 'url': url, 'category': category}

    def test_photo_video_carousel_order(self):
        self.assertEqual(worker.extract(self.request(), self.client)['items'][0]['type'], 'photo')
        self.media.media_type = 2
        self.media.video_url = CDN+'1.mp4'
        self.media.has_audio = True
        self.assertTrue(worker.extract(self.request(), self.client)['items'][0]['hasAudio'])
        self.media.media_type = 8
        self.media.resources = [photo('9'), photo('7')]
        self.assertEqual([i['id'] for i in worker.extract(self.request(), self.client)['items']], ['9', '7'])

    def test_story_exact_id_and_profile(self):
        story = photo('4016120619302180887', user=self.user)
        self.client.user_stories_gql = lambda *args, **kwargs: [photo('8'), story]
        result = worker.extract(self.request('story', 'https://www.instagram.com/stories/owner/4016120619302180887/'), self.client)
        self.assertEqual(result['items'][0]['id'], '4016120619302180887')
        result = worker.extract(self.request('profile', 'https://www.instagram.com/owner/'), self.client)
        self.assertEqual(result['items'][0]['url'], CDN+'avatar.jpg')
        with self.assertRaises(worker.Failure) as error:
            worker.extract(self.request('story', 'https://www.instagram.com/stories/owner/99/'), self.client)
        self.assertEqual(error.exception.code, 'EXPIRED_STORY')

    def test_private_and_owner_scope(self):
        self.user.is_private = True
        with self.assertRaises(worker.Failure):
            worker.extract(self.request(), self.client)
        self.user.is_private = False
        request = self.request()
        request['access'] = {'ownerUsername': 'other', 'ownerUserId': '123'}
        with self.assertRaises(worker.Failure):
            worker.extract(request, self.client)

    def test_input_and_cdn_restrictions(self):
        for url in ('http://www.instagram.com/p/a/', 'https://www.instagram.com/p/a/?x=1', 'https://evil.com/p/a/', 'https://www.instagram.com@evil.com/p/a/'):
            with self.assertRaises(worker.Failure):
                worker.validate_input(self.request(url=url))
        for url in ('file:///etc/passwd', 'https://127.0.0.1/x', 'https://fbcdn.net.evil.com/x', 'https://user:pass@fbcdn.net/x'):
            with self.assertRaises(worker.Failure):
                worker.cdn_url(url)
        request = self.request()
        request['access'] = {'sessionKey': '../session'}
        with self.assertRaises(worker.Failure):
            worker.secure_session(request)

    def test_redirects_no_private_transport_and_pinned_dns(self):
        class Response:
            status_code = 200
            def iter_content(self, size):
                return iter([b'{}'])
            def close(self):
                pass
        sent = []
        public = Obj(trust_env=True, proxies={'https': 'proxy'}, verify=False,
                     send=lambda request, **kwargs: (sent.append(kwargs) or Response()))
        client = Obj(public=public, public_graphql_request=lambda: {}, public_doc_id_graphql_request=lambda: {})
        public_answer = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('8.8.8.8', 443))]
        with patch.object(socket, 'getaddrinfo', return_value=public_answer) as resolver:
            # protect_transport replaces the patched lookup, restored by patch context.
            worker.protect_transport(client)
            socket.getaddrinfo('www.instagram.com', 443)
            socket.getaddrinfo('www.instagram.com', 443)
            self.assertEqual(resolver.call_count, 1)
            with self.assertRaises(worker.Failure):
                socket.getaddrinfo('127.0.0.1', 443)
            public.send(Obj(url='https://www.instagram.com/graphql/query/'))
            self.assertFalse(sent[0]['allow_redirects'])
            self.assertTrue(sent[0]['verify'])
            self.assertEqual(public.proxies, {})
            with self.assertRaises(worker.Failure):
                client.private_request('feed/')
            with self.assertRaises(worker.Failure):
                client.login('user', 'password')
        with patch.object(socket, 'getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 443))]):
            worker.protect_transport(Obj(public=public, public_graphql_request=lambda: {}, public_doc_id_graphql_request=lambda: {}))
            with self.assertRaises(worker.Failure):
                socket.getaddrinfo('www.instagram.com', 443)

    def test_unknown_error_does_not_leak_details(self):
        self.assertEqual(worker.error_code(Exception('cookie=session-secret')), 'EXTRACTOR_FAILURE')
        self.assertEqual(worker.error_code(type('ChallengeRequired', (Exception,), {})()), 'LOGIN_REQUIRED')

    def test_persisted_session_scope_and_permissions(self):
        with tempfile.TemporaryDirectory(prefix='saveframe-python-session-fixture-') as directory:
            root = Path(directory).resolve()
            root.chmod(0o700)
            target = root / 'owner.json'
            settings = {'authorization_data': {'ds_user_id': '123', 'sessionid': 'synthetic-not-a-real-session'}}
            target.write_text(json.dumps(settings), encoding='utf-8')
            target.chmod(0o600)
            request = self.request()
            request['access'] = {'sessionKey': 'owner', 'ownerUsername': 'owner', 'ownerUserId': '123'}
            # A controlled test-only exclusion replaces the actual OS temp root.
            with patch.dict(os.environ, {'INSTAGRAPI_SESSION_DIR': str(root)}), patch.object(worker.tempfile, 'gettempdir', return_value=str(root / 'unrelated')):
                self.assertEqual(worker.secure_session(request), settings)
                self.assertEqual(json.loads(target.read_text(encoding='utf-8')), settings, 'Never rewrites a saved session')
                request['access']['ownerUserId'] = '999'
                with self.assertRaises(worker.Failure):
                    worker.secure_session(request)
                request['access']['ownerUserId'] = '123'
                if os.name != 'nt':
                    target.chmod(0o644)
                    with self.assertRaises(worker.Failure):
                        worker.secure_session(request)
                    target.chmod(0o600)

    def test_real_sdk_contract_without_network(self):
        from instagrapi import Client
        from instagrapi.types import Resource
        client = Client(public_transport='requests', public_request_retries_count=1, session_retry_total=0)
        with patch.object(socket, 'getaddrinfo'):
            worker.protect_transport(client)
            resource = Resource(pk='55', media_type=1, thumbnail_url=CDN+'55.jpg')
            result = worker.item(resource)
            self.assertEqual(result['id'], '55')
            self.assertIsNone(result['width'])
            with self.assertRaises(worker.Failure):
                client.private_request('feed/')

    def owner_request(self):
        data = self.request('story', 'https://www.instagram.com/stories/owner/4016120619302180887/')
        data.update(operation='owner-story', access={'sessionKey': 'owner', 'ownerUsername': 'owner', 'ownerUserId': '123'})
        return data

    def test_owner_exact_story_and_identity(self):
        story = photo('4016120619302180887', user=self.user, taken_at=datetime.now(timezone.utc))
        client = Obj(account_info=lambda: self.user, user_stories_v1=lambda *args, **kwargs: [photo('8'), story])
        data = self.owner_request()
        self.assertEqual(worker.extract_owner_story(data, client)['items'][0]['id'], story.pk)
        story.media_type = 2
        story.video_url = CDN+'story.mp4'
        self.assertEqual(worker.extract_owner_story(data, client)['items'][0]['type'], 'video')
        self.user.username = 'different'
        with self.assertRaises(worker.Failure) as error:
            worker.extract_owner_story(data, client)
        self.assertEqual(error.exception.code, 'PRIVATE_CONTENT')

    def test_owner_session_restrictions_and_expiry(self):
        data = self.owner_request()
        for name, code in [('ClientLoginRequired', 'SESSION_EXPIRED'), ('ChallengeRequired', 'CHALLENGE_REQUIRED')]:
            def rejected():
                raise type(name, (Exception,), {})('sessionid=NEVER_PRINT')
            with self.assertRaises(worker.Failure) as error:
                worker.extract_owner_story(data, Obj(account_info=rejected))
            self.assertEqual(error.exception.code, code)
            self.assertNotIn('NEVER_PRINT', str(error.exception))
        story = photo('4016120619302180887', user=self.user, taken_at=datetime.now(timezone.utc)-timedelta(days=2))
        client = Obj(account_info=lambda: self.user, user_stories_v1=lambda *args, **kwargs: [story])
        with self.assertRaises(worker.Failure) as error:
            worker.extract_owner_story(data, client)
        self.assertEqual(error.exception.code, 'EXPIRED_STORY')
        self.user.pk = '999'
        with self.assertRaises(worker.Failure):
            worker.extract_owner_story(data, client)

    def test_owner_load_settings_no_login_no_rewrite(self):
        calls = []
        client = Obj(user_id='123', load_settings=lambda target: calls.append(target),
                     set_retry_config=lambda **kwargs: calls.append(kwargs), set_tls_verify=lambda value: calls.append(value))
        with patch.dict(os.environ, {'INSTAGRAPI_AUTH_ENABLED': '1', 'INSTAGRAPI_SESSION_DIR': str(Path.home() / 'private-sessions')}):
            worker.load_owner_session(client, self.owner_request(), {'authorization_data': {'ds_user_id': '123'}})
        self.assertEqual(calls[0].name, 'owner.json')
        self.assertEqual(calls[1]['private_transport'], 'requests')
        self.assertFalse(client.with_challenge_flow)
        self.assertIsNone(client.handle_exception)
        client.user_id = '999'
        with patch.dict(os.environ, {'INSTAGRAPI_AUTH_ENABLED': '1'}), self.assertRaises(worker.Failure):
            worker.load_owner_session(client, self.owner_request(), {})

    def test_installed_sdk_loads_saved_owner_identity(self):
        from instagrapi import Client
        with tempfile.TemporaryDirectory(prefix='saveframe-sdk-load-fixture-') as directory:
            settings = {'authorization_data': {'ds_user_id': '123', 'sessionid': '123:synthetic-not-real'}}
            target = Path(directory) / 'owner.json'
            original = json.dumps(settings)
            target.write_text(original, encoding='utf-8')
            client = Client(public_transport='requests', private_transport='requests', with_challenge_flow=False)
            with patch.dict(os.environ, {'INSTAGRAPI_AUTH_ENABLED': '1', 'INSTAGRAPI_SESSION_DIR': directory}):
                worker.load_owner_session(client, self.owner_request(), settings)
            self.assertEqual(str(client.user_id), '123')
            self.assertEqual(client.private_transport, 'requests')
            self.assertTrue(client.private.verify)
            self.assertEqual(target.read_text(encoding='utf-8'), original)

    def test_owner_transport_read_only(self):
        from instagrapi import Client
        client = Client(public_transport='requests', private_transport='requests', with_challenge_flow=False)
        calls = []
        client._send_private_request = lambda endpoint, **kwargs: calls.append(endpoint)
        with patch.object(socket, 'getaddrinfo'):
            worker.protect_transport(client, '123')
            client.private_request('accounts/current_user/?edit=true')
            client.private_request('feed/user/123/story/')
            for endpoint in ('feed/user/999/story/', 'accounts/login/', 'https://evil.example/'):
                with self.assertRaises(worker.Failure):
                    client.private_request(endpoint)
            with self.assertRaises(worker.Failure):
                client.private_request('feed/user/123/story/', data={'write': True})
        self.assertEqual(len(calls), 2)

    def test_local_session_export_without_real_login(self):
        spec = importlib.util.spec_from_file_location('session_creator', Path(__file__).with_name('create_instagram_session.py'))
        creator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(creator)
        with tempfile.TemporaryDirectory(prefix='saveframe-export-fixture-') as directory:
            target = Path(directory) / 'owner.json'
            client = Obj(user_id='123', login=lambda *args, **kwargs: None, account_info=lambda: self.user,
                         dump_settings=lambda file: Path(file).write_text('{"synthetic":true}', encoding='utf-8'))
            creator.login_and_export(client, 'owner', 'not-real-password', target)
            self.assertEqual(json.loads(target.read_text()), {'synthetic': True})
            self.assertEqual(list(Path(directory).glob('.owner-*')), [])
            client.account_info = lambda: Obj(username='wrong', pk='123')
            with self.assertRaises(creator.SetupError):
                creator.login_and_export(client, 'owner', 'not-real-password', target)
            self.assertEqual(json.loads(target.read_text()), {'synthetic': True}, 'Failed renewal preserves the old session')
        with self.assertRaises(creator.SetupError):
            creator.safe_target(str(Path.cwd() / 'owner.json'))

    def test_linux_worker_resource_limits(self):
        calls = []
        resource = Obj(RLIMIT_AS=1, RLIMIT_CPU=2, RLIMIT_FSIZE=3, RLIMIT_NOFILE=4, RLIMIT_CORE=5,
                       setrlimit=lambda kind, limits: calls.append((kind, limits)))
        with patch.dict(sys.modules, {'resource': resource}), patch.object(worker.os, 'name', 'posix'), patch.dict(os.environ, {'INSTAGRAPI_MEMORY_MB': '512'}):
            worker.limits()
        self.assertIn((1, (512*1024*1024, 512*1024*1024)), calls)
        self.assertIn((3, (0, 0)), calls)
        self.assertIn((4, (64, 64)), calls)


if __name__ == '__main__':
    unittest.main()
