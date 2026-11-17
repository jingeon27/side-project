"""Passage splitting without model or database dependencies."""
import unittest

from .chunks import split


class SplitTests(unittest.TestCase):
    def test_short_text_stays_one_passage_and_blank_text_gives_none(self):
        self.assertEqual(split('검은 고양이가 우체통 아래에서 울었다.\n\n서우가 달려갔다.'),
                         ['검은 고양이가 우체통 아래에서 울었다.\n서우가 달려갔다.'])
        self.assertEqual(split(' \n\r\n '), [])

    def test_paragraphs_are_packed_up_to_the_size_and_never_cut_inside(self):
        paragraphs = [f'{number}번째 문단입니다. ' + '가' * 40 for number in range(12)]
        passages = split('\n\n'.join(paragraphs), size=200, overlap=0)
        self.assertGreater(len(passages), 1)
        self.assertTrue(all(len(passage) <= 200 for passage in passages))
        self.assertEqual('\n'.join(passages).split('\n'), paragraphs)

    def test_next_passage_repeats_the_end_of_the_previous_one(self):
        paragraphs = [f'{number}번 문단 ' + '나' * 50 for number in range(6)]
        passages = split('\n'.join(paragraphs), size=130, overlap=70)
        self.assertEqual(passages[0].split('\n')[-1], passages[1].split('\n')[0])

    def test_one_long_paragraph_breaks_at_sentences_then_by_length(self):
        sentences = ['비가 내렸다.' + '다' * 60 + '.' for _ in range(5)]
        passages = split(' '.join(sentences), size=100, overlap=0)
        self.assertEqual(passages, sentences)
        unbroken = split('라' * 250, size=100, overlap=0)
        self.assertEqual([len(passage) for passage in unbroken], [100, 100, 50])


if __name__ == '__main__':
    unittest.main()
