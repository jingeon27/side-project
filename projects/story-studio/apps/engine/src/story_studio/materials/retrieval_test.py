"""Passage selection and the no-model paths of retrieval."""
from pathlib import Path
import tempfile
import unittest

from .retrieval import fuse, pick, retrieve, within


def row(document, position=0, text='본문'):
    return {'document': document, 'position': position, 'title': f'{document} 제목', 'text': text}


class FuseTests(unittest.TestCase):
    def test_a_passage_found_by_both_searches_outranks_one_found_by_either(self):
        by_meaning = [row('a'), row('b'), row('c')]
        by_keyword = [row('d'), row('b')]
        self.assertEqual([item['document'] for item in fuse([by_meaning, by_keyword])][0], 'b')
        self.assertEqual({item['document'] for item in fuse([by_meaning, by_keyword])}, {'a', 'b', 'c', 'd'})

    def test_one_ranking_keeps_its_order_and_an_empty_keyword_search_changes_nothing(self):
        ranking = [row('a'), row('a', 1), row('b')]
        self.assertEqual(fuse([ranking, []]), ranking)


class PickTests(unittest.TestCase):
    def test_best_passages_stay_in_order_within_the_limit(self):
        rows = [row('b', text='가까운 글'), row('c', text='중간 글'), row('a', text='먼 글')]
        self.assertEqual([item['text'] for item in pick(rows, limit=2)], ['가까운 글', '중간 글'])

    def test_one_document_cannot_fill_every_slot(self):
        rows = [row('a'), row('a', 1), row('a', 2), row('b')]
        self.assertEqual([item['document'] for item in pick(rows, limit=3, per_document=2)], ['a', 'a', 'b'])


class BudgetTests(unittest.TestCase):
    def test_always_included_documents_stop_before_passing_the_character_budget(self):
        rows = [row('a', 0, '가' * 40), row('a', 1, '나' * 40), row('b', 0, '다' * 40)]
        self.assertEqual([item['position'] for item in within(rows, 100)], [0, 1])
        self.assertEqual(within(rows, 30), [])


class RetrieveTests(unittest.TestCase):
    def test_nothing_is_loaded_without_a_request_or_an_index(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            messages = []
            empty = {'materials': [], 'style': []}
            self.assertEqual(retrieve(root, None, messages.append), empty)
            self.assertEqual(retrieve(root, {'query': '비 오는 골목', 'collections': ['무협']}, messages.append), empty)
            self.assertEqual(messages, [])
            self.assertFalse((root / 'materials').exists())


if __name__ == '__main__':
    unittest.main()
