"""Deciding what a sync must do, without a model or a database."""
from pathlib import Path
import tempfile
import unittest

from .sync import delete_materials, plan, signature, sync_materials

CURRENT = {'embedding': {'repo': 'model', 'revision': 'r2'}, 'chunk': {'size': 900, 'overlap': 120}}


def document(key, **changes):
    return {'id': key, 'title': f'{key} 제목', 'collection': '무협 설정', 'role': 'search', 'digest': f'{key}-digest', **changes}


def indexed(*documents):
    return {**CURRENT, 'documents': {item['id']: {'signature': signature(item), 'passages': 3} for item in documents}}


class PlanTests(unittest.TestCase):
    def test_only_documents_missing_from_the_index_are_indexed(self):
        first, second = document('a'), document('b')
        self.assertEqual(plan([first, second], indexed(first), CURRENT), (False, [], [second]))
        self.assertEqual(plan([first], indexed(first), CURRENT), (False, [], []))

    def test_documents_no_longer_in_the_catalog_leave_the_index(self):
        first, second = document('a'), document('b')
        self.assertEqual(plan([first], indexed(first, second), CURRENT), (False, ['b'], []))

    def test_a_changed_text_title_collection_or_role_is_indexed_again(self):
        first = document('a')
        for change in ({'digest': 'new'}, {'title': '새 제목'}, {'collection': '다른 묶음'}, {'role': 'always'}):
            changed = document('a', **change)
            self.assertEqual(plan([changed], indexed(first), CURRENT), (False, ['a'], [changed]))

    def test_vectors_from_another_model_or_chunking_are_rebuilt_from_the_catalog(self):
        first, second = document('a'), document('b')
        older = {**indexed(first, second), 'embedding': {'repo': 'model', 'revision': 'r1'}}
        self.assertEqual(plan([first, second], older, CURRENT), (True, [], [first, second]))
        resized = {**indexed(first), 'chunk': {'size': 600, 'overlap': 120}}
        self.assertEqual(plan([first], resized, CURRENT), (True, [], [first]))
        self.assertEqual(plan([first], {'documents': {}}, CURRENT), (True, [], [first]))


class DocumentIdTests(unittest.TestCase):
    def test_ids_that_could_leave_the_materials_folder_are_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'materials').mkdir()
            (root / 'materials/catalog.json').write_text('{"documents": [{"id": "../secret"}]}')
            with self.assertRaises(ValueError):
                sync_materials(root, {}, print)
            with self.assertRaises(ValueError):
                delete_materials(root, {'ids': ["x' OR 1=1 --"]})
            self.assertEqual(delete_materials(root, {'ids': ['12345678-1234-1234-1234-123456789abc']}), {'deleted': 1})
            self.assertFalse((root / 'materials/index').exists())


if __name__ == '__main__':
    unittest.main()
