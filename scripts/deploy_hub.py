"""Install reviewed static assets on the iLeech Tools host; publish its card last."""
from pathlib import Path
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
import re
import shutil
import tarfile
import time
import urllib.request

CARD = '''
    {
        name: "Infra Lab",
        desc: "Сетевая лаборатория: Proxmox, Kubernetes, Docker и путь пакета",
        url: "/infra-lab/",
        icon: "M3 3h7v6H3zM14 15h7v6h-7zM3 15h7v6H3zM6 9v6M6 12h12v3"
    },'''


def digest(data):
    return hashlib.sha256(data).hexdigest()


def add_card(data):
    text = data.decode('utf-8')
    if re.search(r'url\s*:\s*[\"\']/infra-lab/[\"\']', text):
        return data
    marker = 'const apps = ['
    if text.count(marker) != 1:
        raise ValueError('Hub layout changed: expected exactly one apps array')
    nl = '\r\n' if '\r\n' in text else '\n'
    card = CARD.replace('\n', nl)
    return text.replace(marker, marker + card, 1).encode('utf-8')


def unpack(archive, stage):
    """Allow only regular static assets from the signed-by-hash manifest."""
    with tarfile.open(archive, 'r:gz') as tar:
        members = tar.getmembers()
        names = [m.name for m in members]
        if len(names) != len(set(names)) or 'manifest.json' not in names:
            raise ValueError('Duplicate files or missing manifest')
        for m in members:
            parts = Path(m.name).parts
            if not m.isfile() or m.name.startswith('/') or '..' in parts or '\\' in m.name or ':' in m.name:
                raise ValueError('Archive contains non-regular or unsafe path')
            if m.name != 'manifest.json' and (not m.name.startswith('dist/') or Path(m.name).suffix not in {'.html', '.js', '.css'}):
                raise ValueError('Unexpected archive member')
        if sum(m.size for m in members) > 10_000_000:
            raise ValueError('Archive is too large')
        manifest = json.load(tar.extractfile('manifest.json'))
        if set(manifest) != set(names) - {'manifest.json'}:
            raise ValueError('Manifest does not match archive')
        for m in members:
            if m.name == 'manifest.json':
                continue
            data = tar.extractfile(m).read()
            if digest(data) != manifest[m.name]:
                raise ValueError('Asset hash mismatch: ' + m.name)
            target = stage / m.name.removeprefix('dist/')
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            target.chmod(0o644)
        for required in ['index.html', 'app.js', 'style.css']:
            if not (stage / required).is_file():
                raise ValueError('Missing required asset: ' + required)
        return manifest


@contextmanager
def deploy_lock(web):
    lock = web / '.infra-lab-deploy.lock'
    fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    identity = os.fstat(fd)
    try:
        os.write(fd, str(os.getpid()).encode())
        yield
    finally:
        os.close(fd)
        try:
            current = lock.stat()
            if (current.st_dev, current.st_ino) == (identity.st_dev, identity.st_ino):
                lock.unlink()
        except FileNotFoundError:
            pass


def deploy(archive, expected_hub_sha, release, web=Path('/var/www/ileech'), backup_root=Path('/root/infra-lab-backups'), check_url='http://127.0.0.1/infra-lab/'):
    web = web.resolve(strict=True)
    with deploy_lock(web):
        return deploy_locked(archive, expected_hub_sha, release, web, backup_root, check_url)


def deploy_locked(archive, expected_hub_sha, release, web, backup_root, check_url):
    if not re.fullmatch(r'[a-f0-9]{40}', release) or not re.fullmatch(r'[a-f0-9]{64}', expected_hub_sha):
        raise ValueError('Expected reviewed commit SHA and current hub SHA256')
    web = web.resolve(strict=True)
    hub = web / 'index.html'
    original = hub.read_bytes()
    if digest(original) != expected_hub_sha:
        raise ValueError('Hub changed: read and prepare against the current version')
    updated = add_card(original)
    suffix = time.strftime('%Y%m%d-%H%M%S', time.gmtime()) + '-' + release[:10]
    stage = web / ('.infra-lab-stage-' + suffix)
    live = web / 'infra-lab'
    if live.is_symlink() or (live.exists() and not live.is_dir()):
        raise ValueError('Unexpected existing app path')
    backup = backup_root / suffix
    stage.mkdir(mode=0o755)
    manifest = unpack(archive, stage)
    backup.mkdir(parents=True, exist_ok=False)
    (backup / 'hub-index.html').write_bytes(original)
    (backup / 'release.json').write_text(json.dumps({'sha': release, 'assets': manifest}, indent=2), encoding='utf-8')
    old = backup / 'infra-lab'
    installed = False
    try:
        if live.exists():
            shutil.move(str(live), str(old))
        os.replace(stage, live)
        installed = True
        (live / 'release.json').write_text(json.dumps({'sha': release}), encoding='utf-8')
        with urllib.request.urlopen(check_url, timeout=15) as response:
            if response.status != 200 or response.read() != (live / 'index.html').read_bytes():
                raise ValueError('The deployed application did not pass HTTP verification')
        tmp = web / ('index.html.infra-lab-' + suffix)
        tmp.write_bytes(updated)
        tmp.chmod(0o644)
        # Cooperative publishers hold the same lock. Recheck the live bytes after
        # preparing the temporary file; arbitrary writers must also honor the lock.
        if digest(hub.read_bytes()) != expected_hub_sha:
            raise ValueError('Concurrent hub change: card not published')
        os.replace(tmp, hub)
    except Exception:
        # Retain the failed release for inspection, then restore the previous app.
        if installed:
            shutil.move(str(live), str(backup / 'failed-release'))
        if old.exists():
            shutil.move(str(old), str(live))
        raise
    return {'release': release, 'backup': str(backup), 'hub_sha256': digest(updated), 'app': '/infra-lab/'}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive', type=Path, required=True)
    p.add_argument('--expected-hub-sha256', required=True)
    p.add_argument('--release', required=True)
    args = p.parse_args()
    print(json.dumps(deploy(args.archive, args.expected_hub_sha256, args.release), ensure_ascii=False))
