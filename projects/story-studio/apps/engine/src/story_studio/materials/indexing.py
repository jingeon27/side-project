"""Index reference documents the web app stored, and remove them again."""
import re

from .chunks import split
from .embedding import document_text, load_embedder
from .index import index_folder, open_table, remove_documents, replace_document

DOCUMENT_ID = re.compile(r'[a-f0-9-]{36}')


def checked(ids):
    for value in ids:
        if not isinstance(value, str) or not DOCUMENT_ID.fullmatch(value):
            raise ValueError('올바른 참고 자료가 아닙니다')
    return ids


def index_materials(root, request, progress):
    documents = request['documents']
    checked([document['id'] for document in documents])
    table = open_table(root)
    embed = load_embedder(root)
    indexed = []
    for number, document in enumerate(documents, start=1):
        progress(f'참고 자료를 색인하는 중 ({number}/{len(documents)})')
        passages = split((root / 'materials/files' / f"{document['id']}.txt").read_text(encoding='utf-8'))
        vectors = embed([document_text(document['title'], passage) for passage in passages])
        replace_document(table, document, passages, vectors)
        indexed.append({'id': document['id'], 'passages': len(passages)})
    return {'documents': indexed}


def delete_materials(root, request):
    ids = checked(request['ids'])
    if ids and index_folder(root).is_dir():
        remove_documents(open_table(root), ids)
    return {'deleted': len(ids)}
