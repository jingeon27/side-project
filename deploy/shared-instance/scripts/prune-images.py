#!/usr/bin/env python3
"""Remove only old images from these four repositories; preserve both apps' current/previous."""
import datetime
import fcntl
import json
import os
import pathlib
import re
import subprocess

root = pathlib.Path(os.environ.get('SIDE_DEPLOY_ROOT', '/srv/side-project')).resolve()
pattern = re.compile(r'^ghcr\.io/jingeon27/side-project-(game-feedback|photo-contest)-(api|web)@sha256:[a-f0-9]{64}$')
with (root / '.host-operations.lock').open('w') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    protected = set()
    for service in ['game-feedback', 'photo-contest']:
        base = root / 'services' / service
        for name in ['current', 'previous']:
            link = base / name
            if not link.is_symlink():
                if name == 'current': raise SystemExit('Both services must have a successful current release before pruning.')
                continue
            release = link.resolve()
            if release.parent != base / 'releases' or not re.fullmatch(r'[a-f0-9]{40}', release.name):
                raise SystemExit('Refusing an unowned release path.')
            env = dict(line.split('=', 1) for line in (release / '.release.env').read_text().splitlines())
            for key in ['API_IMAGE', 'WEB_IMAGE']:
                if not pattern.fullmatch(env.get(key, '')): raise SystemExit('Invalid protected image metadata.')
                protected.add(env[key])
    listed = subprocess.check_output(['docker', 'image', 'ls', '--digests', '--format', '{{.Repository}}@{{.Digest}}'], text=True)
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)
    for image in set(listed.splitlines()) - protected:
        if not pattern.fullmatch(image): continue
        inspected = json.loads(subprocess.check_output(['docker', 'image', 'inspect', image], text=True))[0]
        created = datetime.datetime.fromisoformat(inspected['Created'].replace('Z', '+00:00'))
        if created >= cutoff: continue
        # No --force: Docker also protects an image used by any other container.
        result = subprocess.run(['docker', 'image', 'rm', image], capture_output=True, text=True)
        print(('Removed old owned image: ' if result.returncode == 0 else 'Kept an image still referenced by Docker: ') + image)
