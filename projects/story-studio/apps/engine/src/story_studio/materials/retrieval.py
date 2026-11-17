"""Choose what the writer reads from the indexed materials, by the role each document was given.

- always: short documents that must be in every request, such as a character bible
- search: the passages closest to what is being written, by meaning and by shared words
- style: a few passages sampled as prose to imitate, whatever their subject
"""
import random

from .embedding import load_embedder, query_text, release
from .index import count, keyword, nearest, open_table, quoted, scan, scope
from .store import index_folder

SEARCH_LIMIT = 6
CANDIDATES = 24
PER_DOCUMENT = 2
ALWAYS_CHARACTERS = 6000
STYLE_SAMPLES = 2


def passage_key(row):
    return (row["document"], row["position"])


def fuse(rankings, constant=60):
    """Reciprocal rank fusion: a passage ranked well by either search rises, one ranked by both rises most."""
    scores, rows = {}, {}
    for ranking in rankings:
        for rank, row in enumerate(ranking):
            key = passage_key(row)
            scores[key] = scores.get(key, 0) + 1 / (constant + rank + 1)
            rows.setdefault(key, row)
    return [rows[key] for key in sorted(scores, key=scores.get, reverse=True)]


def pick(rows, limit=SEARCH_LIMIT, per_document=PER_DOCUMENT):
    """Keep the best passages in order while no single document crowds out the others."""
    chosen, used = [], {}
    for row in rows:
        if used.get(row["document"], 0) >= per_document:
            continue
        used[row["document"]] = used.get(row["document"], 0) + 1
        chosen.append(row)
        if len(chosen) == limit:
            break
    return chosen


def within(rows, characters):
    """Rows in order until the next one would pass the character budget."""
    kept, used = [], 0
    for row in rows:
        if used + len(row["text"]) > characters:
            break
        kept.append(row)
        used += len(row["text"])
    return kept


def excerpt(row):
    return {"title": row["title"], "text": row["text"]}


def retrieve(root, retrieval, progress, embed=None):
    """Materials for one writing request. `embed` reuses a loaded embedding model across requests."""
    found = {"materials": [], "style": []}
    if not retrieval or not index_folder(root).is_dir():
        return found
    collections = retrieval.get("collections") or []
    table = open_table(root)
    always = within(sorted(scan(table, scope("always", collections)), key=passage_key), ALWAYS_CHARACTERS)
    searched = []
    query = retrieval.get("query", "").strip()
    if query and count(table, scope("search", collections)):
        progress("참고 자료에서 관련 내용을 찾는 중")
        if embed is None:
            vector = load_embedder(root)([query_text(query)])[0]
            release()
        else:
            vector = embed([query_text(query)])[0]
        where = scope("search", collections)
        searched = pick(fuse([nearest(table, vector, where, CANDIDATES), keyword(table, query, where, CANDIDATES)]))
    keys = scan(table, scope("style", collections), ["document", "position"])
    sampled = random.sample(keys, min(STYLE_SAMPLES, len(keys)))
    style = [row for key in sampled
             for row in scan(table, f"document = {quoted(key['document'])} AND position = {int(key['position'])}")]
    found["materials"] = [excerpt(row) for row in always + searched]
    found["style"] = [excerpt(row) for row in style]
    return found
