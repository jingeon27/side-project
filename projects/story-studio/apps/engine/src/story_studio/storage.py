"""Atomic private JSON documents shared by durable jobs."""
import json


def atomic_json(target, value):
    import os
    import uuid
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + '.' + str(uuid.uuid4()) + '.partial')
    try:
        with temporary.open('x') as output:
            os.chmod(temporary, 0o600)
            json.dump(value, output, ensure_ascii=False)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
