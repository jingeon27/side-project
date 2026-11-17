"""Find the indexed passages closest to what is about to be written."""
from .embedding import load_embedder, query_text, release
from .index import count, index_folder, nearest, open_table

LIMIT = 6
CANDIDATES = 24
PER_DOCUMENT = 2


def pick(rows, limit=LIMIT, per_document=PER_DOCUMENT):
    """Keep the closest passages while no single document crowds out the others."""
    chosen, used = [], {}
    for row in sorted(rows, key=lambda item: item["_distance"]):
        if used.get(row["document"], 0) >= per_document:
            continue
        used[row["document"]] = used.get(row["document"], 0) + 1
        chosen.append({"title": row["title"], "text": row["text"]})
        if len(chosen) == limit:
            break
    return chosen


def retrieve(root, retrieval, progress):
    """Passages for one writing request; an empty list when nothing was asked for or indexed."""
    if not retrieval or not retrieval.get("query", "").strip() or not index_folder(root).is_dir():
        return []
    table = open_table(root)
    collections = retrieval.get("collections") or []
    if not count(table, collections):
        return []
    progress("참고 자료에서 관련 내용을 찾는 중")
    vector = load_embedder(root)([query_text(retrieval["query"])])[0]
    release()
    return pick(nearest(table, vector, collections, CANDIDATES))
