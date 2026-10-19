#!/usr/bin/env python3
"""Verify provider-reported PITR before applying SQL; never create a paid snapshot."""
import datetime
import json
import os
import pathlib
import re
import subprocess
import sys

directory, destination = sys.argv[1:]
settings = dict(line.strip().split('=', 1) for line in (pathlib.Path(directory) / '.env').read_text().splitlines()
                if line.strip() and not line.lstrip().startswith('#'))
region = settings.get('RDS_REGION')
identifier = settings.get('RDS_INSTANCE_ID', '')
host = settings.get('RDS_HOST', '')
if region != 'ap-northeast-2' or not re.fullmatch(r'[a-z][a-z0-9-]{0,62}', identifier):
    raise SystemExit('Configure the Seoul RDS instance identifier.')
result = subprocess.run([
    'docker', 'run', '--rm', '--network', 'bridge',
    os.environ.get('SIDE_AWSCLI_IMAGE', 'amazon/aws-cli:2'),
    'rds', 'describe-db-instances', '--region', region,
    '--db-instance-identifier', identifier, '--output', 'json',
], capture_output=True, text=True)
if result.returncode:
    raise SystemExit('RDS PITR inspection failed. Check the EC2 instance role and IMDS access.')
now = datetime.datetime.now(datetime.timezone.utc)
try:
    instance = json.loads(result.stdout)['DBInstances'][0]
    latest = datetime.datetime.fromisoformat(instance.get('LatestRestorableTime', '').replace('Z', '+00:00'))
    if latest.tzinfo is None:
        raise ValueError('Missing timezone')
except (KeyError, IndexError, TypeError, ValueError):
    raise SystemExit('RDS must use a valid provider-reported PITR timestamp with a timezone.') from None
if (instance.get('Engine') != 'postgres' or instance.get('Endpoint', {}).get('Address') != host
        or instance.get('BackupRetentionPeriod', 0) < 7 or not instance.get('StorageEncrypted')
        or instance.get('PubliclyAccessible') or not instance.get('DeletionProtection')
        or not datetime.timedelta(0) <= now - latest <= datetime.timedelta(minutes=20)):
    raise SystemExit('RDS must use private encrypted PostgreSQL, deletion protection and fresh PITR with >=7 day retention.')
receipt = {'checkedAt': now.isoformat(), 'latestRestorableTime': latest.isoformat(),
           'instanceArn': instance['DBInstanceArn'], 'retentionDays': instance['BackupRetentionPeriod']}
path = pathlib.Path(destination)
path.write_text(json.dumps(receipt, indent=2) + '\n')
path.chmod(0o600)
print('Recorded provider-reported RDS PITR point. This is not a database restore drill.')
