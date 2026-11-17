"""Embedded vector index of reference passages. LanceDB keeps it as files in the data folder."""
from .embedding import DIMENSIONS
from .store import index_folder

TABLE = "passages"
COLUMNS = ["document", "title", "position", "text"]
# Below this many passages an exact scan is fast enough and needs no training.
VECTOR_INDEX_ROWS = 100_000


def open_table(root):
    import lancedb
    import pyarrow as pa
    schema = pa.schema([
        pa.field("vector", pa.list_(pa.float32(), DIMENSIONS)),
        pa.field("document", pa.string()),
        pa.field("collection", pa.string()),
        pa.field("role", pa.string()),
        pa.field("title", pa.string()),
        pa.field("position", pa.int32()),
        pa.field("text", pa.string()),
    ])
    return lancedb.connect(str(index_folder(root))).create_table(TABLE, schema=schema, exist_ok=True)


def quoted(value):
    return "'" + str(value).replace("'", "''") + "'"


def any_of(column, values):
    return f"{column} IN ({', '.join(quoted(value) for value in values)})"


def scope(role, collections):
    """Passages of one role, limited to the chosen collections when any are given."""
    return f"role = {quoted(role)}" + (f" AND {any_of('collection', collections)}" if collections else "")


def replace_document(table, document, passages, vectors):
    """Indexing a document again replaces its earlier passages instead of duplicating them."""
    remove_documents(table, [document["id"]])
    if passages:
        table.add([{"vector": vector, "document": document["id"], "collection": document["collection"],
                    "role": document["role"], "title": document["title"], "position": position, "text": passage}
                   for position, (passage, vector) in enumerate(zip(passages, vectors))])


def remove_documents(table, ids):
    # Long IN lists are split so one statement stays small.
    for start in range(0, len(ids), 200):
        table.delete(any_of("document", ids[start:start + 200]))


def clear(table):
    table.delete("document IS NOT NULL")


def count(table, where):
    return table.count_rows(where)


def scan(table, where, columns=COLUMNS):
    """Every passage matching the filter, without a similarity query."""
    return table.search().where(where).select(columns).to_list()


def nearest(table, vector, where, limit):
    return table.search(vector).distance_type("cosine").where(where).select(COLUMNS).limit(limit).to_list()


def indexed_columns(table):
    return {column for index in table.list_indices() for column in index.columns}


def keyword(table, query, where, limit):
    """Passages sharing the query's words, so names and terms an embedding blurs are still found."""
    if "text" not in indexed_columns(table):
        return []
    return table.search(query, query_type="fts").where(where).select(COLUMNS).limit(limit).to_list()


def maintain(table):
    """Keep the keyword index, and the vector index once the table is large, in step with new passages."""
    rows = table.count_rows()
    if not rows:
        return
    columns = indexed_columns(table)
    if "text" not in columns:
        # Korean attaches particles to words, so two and three character grams match where whole words do not.
        table.create_fts_index("text", base_tokenizer="ngram", ngram_min_length=2, ngram_max_length=3, replace=True)
    if "vector" not in columns and rows >= VECTOR_INDEX_ROWS:
        table.create_index(metric="cosine", vector_column_name="vector")
    table.optimize()
