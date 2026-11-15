"""Validated voice-run and checkpoint locations."""
import re


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', value):
        raise ValueError('올바른 음성 ID가 아닙니다')
    return value


def run_folder(root, run_id):
    if not isinstance(run_id, str) or not run_id.startswith('local-'):
        raise ValueError('올바른 학습 작업이 아닙니다')
    identifier(run_id[6:])
    return root / 'voice-training/runs' / run_id


def checkpoint_path(folder):
    checkpoint = (folder / 'checkpoints/latest').read_text()
    if not re.fullmatch(r'step-\d{6}', checkpoint):
        raise ValueError('학습 체크포인트가 올바르지 않습니다')
    return folder / 'checkpoints' / checkpoint
