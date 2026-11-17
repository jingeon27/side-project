"""Embedded vector index of reference passages. LanceDB keeps it as files in the data folder."""
from .embedding import DIMENSIONS

TABLE = "passages"


def index_folder(root):
    return root / "materials/index"


def open_table(root):
    import lancedb
    import pyarrow as pa
    schema = pa.schema([
        pa.field("vector", pa.list_(pa.float32(), DIMENSIONS)),
        pa.field("document", pa.string()),
        pa.field("collection", pa.string()),
        pa.field("title", pa.string()),
        pa.field("position", pa.int32()),
        pa.field("text", pa.string()),
    ])
    return lancedb.connect(str(index_folder(root))).create_table(TABLE, schema=schema, exist_ok=True)


def quoted(value):
    return "'" + str(value).replace("'", "''") + "'"


def any_of(column, values):
    return f"{column} IN ({', '.join(quoted(value) for value in values)})"


def replace_document(table, document, passages, vectors):
    """Indexing a document again replaces its earlier passages instead of duplicating them."""
    table.delete(any_of("document", [document["id"]]))
    if passages:
        table.add([{"vector": vector, "document": document["id"], "collection": document["collection"],
                    "title": document["title"], "position": position, "text": passage}
                   for position, (passage, vector) in enumerate(zip(passages, vectors))])


def remove_documents(table, ids):
    table.delete(any_of("document", ids))


def count(table, collections):
    return table.count_rows(any_of("collection", collections) if collections else None)


def nearest(table, vector, collections, limit):
    query = table.search(vector).distance_type("cosine").select(["document", "title", "position", "text"]).limit(limit)
    return (query.where(any_of("collection", collections)) if collections else query).to_list()
