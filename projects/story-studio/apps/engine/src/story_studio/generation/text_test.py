"""How retrieved materials reach the writer, without loading a model."""
import unittest

from .text import source_titles, with_materials


class MaterialInputTests(unittest.TestCase):
    def test_input_is_unchanged_when_nothing_was_retrieved(self):
        payload = {'premise': '비 오는 날의 우체국'}
        self.assertIs(with_materials(payload, {'materials': [], 'style': []}), payload)

    def test_facts_and_style_samples_join_the_input_separately_and_sources_are_listed_once(self):
        found = {'materials': [{'title': '무협 용어집', 'text': '경공은 몸을 가볍게 하는 무공이다.'},
                               {'title': '카라카스 답사', 'text': '알타미라 광장의 저녁.'},
                               {'title': '무협 용어집', 'text': '내공은 단전에 쌓는다.'}],
                 'style': [{'title': '문체 견본', 'text': '칼이 울었다.'}]}
        payload = with_materials({'premise': '회귀한 맹주'}, found)
        self.assertEqual(payload['premise'], '회귀한 맹주')
        self.assertEqual(payload['materials'][0], {'source': '무협 용어집', 'text': '경공은 몸을 가볍게 하는 무공이다.'})
        self.assertEqual(len(payload['materials']), 3)
        self.assertEqual(payload['style_samples'], [{'source': '문체 견본', 'text': '칼이 울었다.'}])
        self.assertEqual(source_titles(found), ['무협 용어집', '카라카스 답사', '문체 견본'])
        self.assertNotIn('style_samples', with_materials({}, {'materials': found['materials'], 'style': []}))


if __name__ == '__main__':
    unittest.main()
