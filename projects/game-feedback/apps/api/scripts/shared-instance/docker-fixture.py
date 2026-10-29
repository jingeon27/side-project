#!/usr/bin/env python3
"""Replace registry/cloud boundaries only; every Compose/app/database operation uses real Docker."""
import json
import os
import pathlib
import sys

args = sys.argv[1:]
if args[:1] == ['run'] and any(arg.startswith(('amazon/aws-cli:', 'amazon/aws-cli@')) for arg in args):
    # The backup bucket is the only AWS call. Check the mounted dump, then record the upload instead of sending it.
    if os.environ.get('SIDE_SMOKE_BACKUP_FAIL') == '1':
        print('upload: AccessDenied (smoke fixture)', file=sys.stderr)
        sys.exit(1)
    dump = pathlib.Path(args[args.index('--volume') + 1].split(':')[0])
    if dump.read_bytes()[:5] != b'PGDMP':
        sys.exit('The backup fixture expects a custom-format pg_dump archive.')
    with open(os.environ['SIDE_SMOKE_UPLOAD_LOG'], 'a') as log:
        log.write(' '.join(args) + '\n')
    sys.exit(0)
images = json.loads(pathlib.Path(os.environ['SIDE_SMOKE_IMAGE_MAP']).read_text())
if args[:1] == ['compose']:
    files = [args[i + 1] for i, arg in enumerate(args[:-1]) if arg == '--env-file']
    for file in files:
        for line in pathlib.Path(file).read_text().splitlines():
            key, separator, value = line.partition('=')
            if separator and key in ['API_IMAGE', 'WEB_IMAGE'] and value in images:
                os.environ[key] = images[value]
args = [images.get(arg, arg) for arg in args]
os.execv(os.environ['SIDE_REAL_DOCKER'], [os.environ['SIDE_REAL_DOCKER'], *args])
