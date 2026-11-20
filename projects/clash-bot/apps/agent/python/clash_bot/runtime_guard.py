"""Refuse setup work that would change files a running Trophy learner or self-play is using."""

import fcntl
import json
import os

from clash_bot.paths import DATA_DIR


def _learner_running():
    # An empty or malformed lock was left by a crash and has no live owner.
    try:
        owner = json.loads((DATA_DIR / "trophy/learning/control/lock.json").read_text())
        pid = int(owner["pid"])
    except (FileNotFoundError, ValueError, KeyError, TypeError):
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _self_play_running():
    path = DATA_DIR / "arena/control/lock.json"
    if not path.exists():
        return False
    with path.open("a+") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_SH | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
    return False


def refuse_while_running(action):
    if _learner_running() or _self_play_running():
        raise SystemExit(f"실행 중인 봇이나 자가대국을 stop으로 종료한 뒤 {action}해주세요.")
