#!/usr/bin/env python3
"""Replace registry/cloud boundaries only; every Compose/app/database operation uses real Docker."""
import json
import os
import pathlib
import sys
import datetime

args = sys.argv[1:]
if args[:1] == ['run'] and any(arg.startswith(('amazon/aws-cli:', 'amazon/aws-cli@')) for arg in args):
    point = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if os.environ.get('SIDE_SMOKE_NO_PITR') == '1': point = '2000-01-01T00:00:00+00:00'
    print(json.dumps({'DBInstances': [{
        'Engine': 'postgres', 'Endpoint': {'Address': 'side.abcdef.ap-northeast-2.rds.amazonaws.com'},
        'BackupRetentionPeriod': 7, 'StorageEncrypted': True, 'PubliclyAccessible': False,
        'DeletionProtection': True, 'LatestRestorableTime': point,
        'DBInstanceArn': 'arn:aws:rds:ap-northeast-2:000000000000:db:side-smoke',
    }]}))
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
