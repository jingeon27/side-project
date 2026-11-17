"""How retrieved materials reach the writer, without loading a model."""
import unittest

from .text import source_titles, with_materials


class MaterialInputTests(unittest.TestCase):
    def test_input_is_unchanged_when_nothing_was_retrieved(self):
        payload = {'premise': '비 오는 날의 우체국'}
        self.assertIs(with_materials(payload, []), payload)

    def test_passages_join_the_input_and_sources_are_listed_once(self):
        passages = [{'title': '무협 용어집', 'text': '경공은 몸을 가볍게 하는 무공이다.'},
                    {'title': '카라카스 답사', 'text': '알타미라 광장의 저녁.'},
                    {'title': '무협 용어집', 'text': '내공은 단전에 쌓는다.'}]
        payload = with_materials({'premise': '회귀한 맹주'}, passages)
        self.assertEqual(payload['premise'], '회귀한 맹주')
        self.assertEqual(payload['materials'][0], {'source': '무협 용어집', 'text': '경공은 몸을 가볍게 하는 무공이다.'})
        self.assertEqual(len(payload['materials']), 3)
        self.assertEqual(source_titles(passages), ['무협 용어집', '카라카스 답사'])


if __name__ == '__main__':
    unittest.main()
