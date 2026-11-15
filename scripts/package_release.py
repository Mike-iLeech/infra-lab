"""Package static assets from an exact reviewed Git revision, never a dirty tree."""
from pathlib import Path
import argparse
import hashlib
import io
import json
import re
import subprocess
import tarfile


def package(revision, output):
    if not re.fullmatch('[a-f0-9]{40}', revision):
        raise ValueError('An exact 40-character Git commit SHA is required')
    names = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', revision, '--', 'dist'], text=True).splitlines()
    if not names or any(not n.startswith('dist/') or Path(n).suffix not in {'.html', '.js', '.css'} for n in names):
        raise ValueError('Unexpected release assets')
    files = {n: subprocess.check_output(['git', 'show', revision + ':' + n]) for n in names}
    manifest = {n: hashlib.sha256(data).hexdigest() for n, data in files.items()}
    files['manifest.json'] = json.dumps(manifest, sort_keys=True).encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(output, 'w:gz') as archive:
        for name, data in files.items():
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            entry.mode = 0o644
            archive.addfile(entry, io.BytesIO(data))
    return {'release': revision, 'archive': str(output), 'assets': len(manifest), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--revision', required=True)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    print(json.dumps(package(args.revision, args.output)))
