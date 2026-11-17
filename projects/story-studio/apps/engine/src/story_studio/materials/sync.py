"""Make the index match the catalog. Every step can be repeated, so an interrupted run is simply run again."""
from ..catalog import model_specs
from .chunks import OVERLAP, SIZE, split
from .embedding import document_text, load_embedder
from .index import clear, maintain, open_table, remove_documents, replace_document
from .store import index_folder, read_catalog, read_state, text_path, write_state

SAVE_EVERY = 20


def recipe():
    """What the stored vectors depend on. Vectors made another way cannot be compared with new ones."""
    spec = model_specs()['embedding']
    return {'embedding': {'repo': spec['repo'], 'revision': spec['revision']}, 'chunk': {'size': SIZE, 'overlap': OVERLAP}}


def signature(document):
    return {key: document[key] for key in ('digest', 'title', 'collection', 'role')}


def plan(catalog, state, current):
    """Returns (rebuild everything, ids to remove from the index, documents to index)."""
    rebuild = any(state.get(key) != current[key] for key in current)
    indexed = {} if rebuild else state.get('documents', {})
    wanted = {document['id']: document for document in catalog}
    stale = [key for key, entry in indexed.items()
             if key not in wanted or entry.get('signature') != signature(wanted[key])]
    pending = [document for document in catalog if document['id'] not in indexed or document['id'] in stale]
    return rebuild, stale, pending


def sync_materials(root, request, progress):
    catalog = read_catalog(root)
    for document in catalog:
        text_path(root, document['id'])
    current = recipe()
    state = read_state(root)
    rebuild, stale, pending = plan(catalog, state, current)
    table = open_table(root)
    if rebuild:
        clear(table)
    elif stale:
        remove_documents(table, stale)
    documents = {} if rebuild else {key: entry for key, entry in state.get('documents', {}).items() if key not in stale}
    write_state(root, {**current, 'documents': documents})
    if pending:
        embed = load_embedder(root)
        for number, document in enumerate(pending, start=1):
            progress(f'참고 자료를 색인하는 중 ({number}/{len(pending)})')
            passages = split(text_path(root, document['id']).read_text(encoding='utf-8'))
            vectors = embed([document_text(document['title'], passage) for passage in passages])
            replace_document(table, document, passages, vectors)
            documents[document['id']] = {'signature': signature(document), 'passages': len(passages)}
            if number % SAVE_EVERY == 0:
                write_state(root, {**current, 'documents': documents})
        write_state(root, {**current, 'documents': documents})
    if rebuild or stale or pending:
        progress('검색 색인을 정리하는 중')
        maintain(table)
    return {'indexed': len(pending), 'removed': len(stale), 'documents': len(documents)}


def delete_materials(root, request):
    """Remove passages before the web app drops the documents from its catalog, never after."""
    ids = request['ids']
    for document_id in ids:
        text_path(root, document_id)
    if ids and index_folder(root).is_dir():
        remove_documents(open_table(root), ids)
        state = read_state(root)
        write_state(root, {**state, 'documents': {key: entry for key, entry in state.get('documents', {}).items() if key not in ids}})
    return {'deleted': len(ids)}
