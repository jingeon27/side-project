"""Install only the pinned native Mac engine into the existing project venv."""
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import tarfile
import urllib.request

from clash_bot.paths import CONTRACTS_DIR, DATA_DIR


def main():
    spec = json.loads((CONTRACTS_DIR / 'arena.json').read_text())
    if sys.platform != 'darwin' or platform.machine() != 'arm64':
        raise RuntimeError('The pinned engine wheel currently supports Apple Silicon macOS.')
    python = DATA_DIR / 'qwen/.venv/bin/python'
    if not python.exists():
        raise RuntimeError('Run qwen:setup first; the local arena uses the project Python environment.')
    metadata = json.load(urllib.request.urlopen(f"https://pypi.org/pypi/royalesim/{spec['version']}/json", timeout=20))
    asset = next(row for row in metadata['urls'] if row['filename'] == spec['wheel'])
    if asset['digests']['sha256'] != spec['sha256']:
        raise ValueError('Pinned wheel identity changed')
    path = DATA_DIR / 'arena/vendor' / spec['wheel']
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_bytes(urllib.request.urlopen(asset['url'], timeout=30).read())
    if hashlib.sha256(path.read_bytes()).hexdigest() != spec['sha256']:
        raise ValueError('Local engine wheel checksum mismatch')
    source_asset = next(row for row in metadata['urls'] if row['filename'].endswith('.tar.gz'))
    source = path.parent / source_asset['filename']
    if not source.exists():
        source.write_bytes(urllib.request.urlopen(source_asset['url'], timeout=30).read())
    if hashlib.sha256(source.read_bytes()).hexdigest() != spec['sourceSHA256']:
        raise ValueError('Engine source archive checksum mismatch')
    with tarfile.open(source) as archive:
        name = f"royalesim-{spec['version']}/data/derived/{spec['tableFile']}"
        table = archive.extractfile(name).read()
    if hashlib.sha256(table).hexdigest() != spec['tableSHA256']:
        raise ValueError('Pinned source card table checksum mismatch')
    output = DATA_DIR / 'arena/rules/source' / spec['tableFile']
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(table)
    subprocess.run([str(python), '-m', 'pip', 'install', '--no-deps', str(path)], check=True)
    print(json.dumps({'installed': True, 'engine': spec['engine'], 'version': spec['version'], 'sha256': spec['sha256']}))


if __name__ == '__main__':
    main()
