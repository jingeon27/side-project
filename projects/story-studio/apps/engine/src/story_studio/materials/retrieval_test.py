"""Passage selection and the no-model paths of retrieval."""
from pathlib import Path
import tempfile
import unittest

from .indexing import delete_materials, index_materials
from .retrieval import pick, retrieve


def row(document, distance, text='본문'):
    return {'document': document, 'title': f'{document} 제목', 'text': text, '_distance': distance}


class PickTests(unittest.TestCase):
    def test_closest_passages_come_first_within_the_limit(self):
        rows = [row('a', 0.5, '먼 글'), row('b', 0.1, '가까운 글'), row('c', 0.3, '중간 글')]
        self.assertEqual([item['text'] for item in pick(rows, limit=2)], ['가까운 글', '중간 글'])

    def test_one_document_cannot_fill_every_slot(self):
        rows = [row('a', 0.1), row('a', 0.11), row('a', 0.12), row('b', 0.4)]
        self.assertEqual([item['title'] for item in pick(rows, limit=3, per_document=2)], ['a 제목', 'a 제목', 'b 제목'])


class RetrieveTests(unittest.TestCase):
    def test_nothing_is_loaded_without_a_query_or_an_index(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            messages = []
            self.assertEqual(retrieve(root, None, messages.append), [])
            self.assertEqual(retrieve(root, {'query': '  '}, messages.append), [])
            self.assertEqual(retrieve(root, {'query': '비 오는 골목', 'collections': ['무협']}, messages.append), [])
            self.assertEqual(messages, [])
            self.assertFalse((root / 'materials').exists())


class DocumentIdTests(unittest.TestCase):
    def test_ids_that_could_leave_the_materials_folder_are_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(ValueError):
                index_materials(root, {'documents': [{'id': '../secret', 'title': 't', 'collection': 'c'}]}, print)
            with self.assertRaises(ValueError):
                delete_materials(root, {'ids': ["x' OR 1=1 --"]})
            self.assertEqual(delete_materials(root, {'ids': ['12345678-1234-1234-1234-123456789abc']}), {'deleted': 1})
            self.assertFalse((root / 'materials').exists())


if __name__ == '__main__':
    unittest.main()
