"""Split a reference text into overlapping passages on paragraph and sentence boundaries."""
import re

SIZE = 900  # characters, roughly 500 to 600 tokens of Korean
OVERLAP = 120
SENTENCE_END = re.compile(r'(?<=[.!?。…”"’\'」』])\s+')


def units(text, size):
    """Paragraphs first; a paragraph longer than one passage breaks into sentences, then by length."""
    for paragraph in re.split(r'\n+', text.replace('\r\n', '\n').replace('\r', '\n')):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if len(paragraph) <= size:
            yield paragraph
            continue
        for sentence in SENTENCE_END.split(paragraph):
            for start in range(0, len(sentence), size):
                yield sentence[start:start + size]


def tail(parts, overlap):
    """The last units of a finished passage that fit in the overlap, repeated at the start of the next."""
    kept = []
    for part in reversed(parts):
        if sum(len(item) + 1 for item in kept) + len(part) > overlap:
            break
        kept.insert(0, part)
    return kept


def split(text, size=SIZE, overlap=OVERLAP):
    passages, current = [], []
    for unit in units(text, size):
        if current and sum(len(item) + 1 for item in current) + len(unit) > size:
            passages.append('\n'.join(current))
            current = tail(current, overlap)
        current.append(unit)
    if current:
        passages.append('\n'.join(current))
    return passages
