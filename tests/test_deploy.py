from pathlib import Path
import hashlib
import importlib.util
import io
import json
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy_hub', Path(__file__).resolve().parents[1] / 'scripts' / 'deploy_hub.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DeploymentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace = Path(__file__).resolve().parents[1] / '.runtime' / 'test-deploy'
        cls.workspace.mkdir(parents=True, exist_ok=True)

    def archive(self, root, unsafe=None):
        archive = root / 'release.tar.gz'
        files = {'dist/index.html': b'<html>Infra Lab</html>', 'dist/app.js': b'import "./model.js";', 'dist/model.js': b'export const version=1;', 'dist/style.css': b'body{}'}
        manifest = {n: hashlib.sha256(v).hexdigest() for n, v in files.items()}
        files['manifest.json'] = json.dumps(manifest).encode()
        if unsafe:
            files[unsafe] = b'unsafe'
        with tarfile.open(archive, 'w:gz') as tar:
            for name, data in files.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                tar.addfile(entry, io.BytesIO(data))
        return archive

    def test_card_preserves_existing_apps_bytes_and_line_endings(self):
        old = b'<script>\r\nconst apps = [\r\n{name:"Old",url:"/old/"}\r\n];\r\n</script>'
        new = module.add_card(old)
        self.assertEqual(new.replace(module.CARD.replace('\n', '\r\n').encode(), b''), old)
        self.assertEqual(module.add_card(new), new)

    def test_archive_rejects_parent_traversal(self):
        with tempfile.TemporaryDirectory(dir=self.workspace) as tmp:
            root = Path(tmp)
            stage = root / 'stage'
            stage.mkdir()
            with self.assertRaises(ValueError):
                module.unpack(self.archive(root, 'dist/../../escape.js'), stage)
            self.assertFalse((root / 'escape.js').exists())

    def test_deploy_publishes_hub_last_and_keeps_previous_files(self):
        with tempfile.TemporaryDirectory(dir=self.workspace) as tmp:
            root = Path(tmp)
            web = root / 'web'
            web.mkdir()
            original = b'const apps = [\n{name:"Old",url:"/old/"}\n];'
            (web / 'index.html').write_bytes(original)
            class Response:
                status = 200
                def __enter__(self):
                    self_hub = (web / 'index.html').read_bytes()
                    self.assert_original = self_hub == original
                    if not self.assert_original:
                        raise AssertionError('Hub was published before app check')
                    return self
                def __exit__(self, *args):
                    return False
                def read(self):
                    return (web / 'infra-lab' / 'index.html').read_bytes()
            with patch.object(module.urllib.request, 'urlopen', return_value=Response()):
                result = module.deploy(self.archive(root), module.digest(original), 'a' * 40, web, root / 'backups')
            self.assertIn(b'/infra-lab/', (web / 'index.html').read_bytes())
            self.assertIn(b'/old/', (web / 'index.html').read_bytes())
            self.assertEqual((Path(result['backup']) / 'hub-index.html').read_bytes(), original)

    def test_http_failure_restores_previous_release_and_hub(self):
        with tempfile.TemporaryDirectory(dir=self.workspace) as tmp:
            root = Path(tmp)
            web = root / 'web'
            web.mkdir()
            original = b'const apps = [\n];'
            (web / 'index.html').write_bytes(original)
            (web / 'infra-lab').mkdir()
            (web / 'infra-lab' / 'index.html').write_bytes(b'previous release')
            with patch.object(module.urllib.request, 'urlopen', side_effect=OSError('HTTP unavailable')):
                with self.assertRaises(OSError):
                    module.deploy(self.archive(root), module.digest(original), 'b' * 40, web, root / 'backups')
            self.assertEqual((web / 'index.html').read_bytes(), original)
            self.assertEqual((web / 'infra-lab' / 'index.html').read_bytes(), b'previous release')

    def test_concurrent_hub_update_is_not_overwritten(self):
        with tempfile.TemporaryDirectory(dir=self.workspace) as tmp:
            root = Path(tmp)
            web = root / 'web'
            web.mkdir()
            (web / 'index.html').write_bytes(b'const apps = [\n];')
            with self.assertRaisesRegex(ValueError, 'Hub changed'):
                module.deploy(self.archive(root), '0' * 64, 'c' * 40, web, root / 'backups')
            self.assertFalse((web / 'infra-lab').exists())

    def test_change_during_http_check_keeps_external_hub_and_rolls_back_app(self):
        with tempfile.TemporaryDirectory(dir=self.workspace) as tmp:
            root = Path(tmp)
            web = root / 'web'
            web.mkdir()
            original = b'const apps = [\n];'
            concurrent = b'const apps = [\n{name:"Other",url:"/other/"}\n];'
            (web / 'index.html').write_bytes(original)
            class Response:
                status = 200
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    return False
                def read(self):
                    (web / 'index.html').write_bytes(concurrent)
                    return (web / 'infra-lab' / 'index.html').read_bytes()
            with patch.object(module.urllib.request, 'urlopen', return_value=Response()):
                with self.assertRaisesRegex(ValueError, 'Concurrent hub change'):
                    module.deploy(self.archive(root), module.digest(original), 'd' * 40, web, root / 'backups')
            self.assertEqual((web / 'index.html').read_bytes(), concurrent)
            self.assertFalse((web / 'infra-lab').exists())
            self.assertFalse((web / '.infra-lab-deploy.lock').exists())

    def test_another_deployment_lock_prevents_writes(self):
        with tempfile.TemporaryDirectory(dir=self.workspace) as tmp:
            root = Path(tmp)
            web = root / 'web'
            web.mkdir()
            original = b'const apps = [\n];'
            (web / 'index.html').write_bytes(original)
            with module.deploy_lock(web):
                with self.assertRaises(FileExistsError):
                    module.deploy(self.archive(root), module.digest(original), 'e' * 40, web, root / 'backups')
            self.assertEqual((web / 'index.html').read_bytes(), original)
            self.assertFalse((web / 'infra-lab').exists())


if __name__ == '__main__':
    unittest.main()
