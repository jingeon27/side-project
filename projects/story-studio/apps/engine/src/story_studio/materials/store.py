"""Where reference materials live in the data folder, and who owns each part.

The web app owns the catalog and the texts; they decide which documents exist. The engine owns the
vector index and its state file, and rebuilds either one from the catalog whenever they disagree.
"""
import json
import re

from ..storage import atomic_json

DOCUMENT_ID = re.compile(r'[a-f0-9-]{36}')


def folder(root):
    return root / 'materials'


def index_folder(root):
    return folder(root) / 'index'


def text_path(root, document_id):
    if not isinstance(document_id, str) or not DOCUMENT_ID.fullmatch(document_id):
        raise ValueError('올바른 참고 자료가 아닙니다')
    return folder(root) / 'files' / f'{document_id}.txt'


def read_catalog(root):
    path = folder(root) / 'catalog.json'
    return json.loads(path.read_text(encoding='utf-8'))['documents'] if path.is_file() else []


def read_state(root):
    path = folder(root) / 'index-state.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.is_file() else {'documents': {}}


def write_state(root, state):
    atomic_json(folder(root) / 'index-state.json', state)
