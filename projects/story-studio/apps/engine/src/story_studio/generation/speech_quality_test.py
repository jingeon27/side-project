"""Regression coverage for missing sentences and long Korean input."""
import unittest

from .speech_quality import normalized_text, speech_segments, spoken_text, transcript_matches


class SpeechQualityTests(unittest.TestCase):
    def test_dialogue_labels_do_not_delete_the_beginning_of_a_time(self):
        self.assertEqual(spoken_text('해설: 오후 3:30에 다시 만나요.\n고양이: 약속해요.'), '오후 세 시 삼십 분에 다시 만나요.\n약속해요.')
        self.assertEqual(spoken_text('오후 3:30에 다시 만나요.'), '오후 세 시 삼십 분에 다시 만나요.')
        self.assertEqual(spoken_text('3:30 동안 기다렸어요.'), '3:30 동안 기다렸어요.')

    def test_recognition_of_common_abbreviations_numbers_and_times_is_not_an_omission(self):
        for expected, actual in [
            ('AI 목소리 테스트입니다.', '에이아이 목소리 테스트입니다.'),
            ('오후 3:30에 다시 만나요.', '오후 세 시 삼십 분에 다시 만나요.'),
            ('고양이 3마리가 모였어요.', '고양이 세 마리가 모였어요.'),
            ('3.5초 동안 기다려 주세요.', '삼점오 초 동안 기다려 주세요.'),
            ('1,200원을 받았어요.', '천이백 원을 받았어요.'),
        ]:
            with self.subTest(expected=expected):
                self.assertTrue(transcript_matches(expected, actual))

    def test_rejects_the_observed_middle_and_last_sentence_omissions(self):
        expected = '안녕, 오늘은 어떤 이야기를 만들어 볼까? 작은 고양이가 별을 찾으러 간대. 우리도 같이 따라가 보자.'
        self.assertFalse(transcript_matches(expected, '안녕 오늘은 어떤 이야기를 만들어 볼까 작은 고양이가 기억하랬죠'))
        self.assertFalse(transcript_matches(expected, '안녕 오늘은 어떤 이야기를 만들어 볼까 작은 고양이가 별을 찾으러 간대'))
        self.assertTrue(transcript_matches(expected, '안녕 오늘은 어떤 이야기를 만들어볼까 작은 고양이가 별을 찾으러 간대 우리도 같이 따라가보자'))

    def test_checks_a_short_missing_sentence_even_when_the_total_error_is_small(self):
        expected = '오늘은 작은 고양이가 멀리 있는 아름다운 별을 찾아 떠나는 이야기를 들려줄게요. 잘 가.'
        self.assertFalse(transcript_matches(expected, '오늘은 작은 고양이가 멀리 있는 아름다운 별을 찾아 떠나는 이야기를 들려줄게요'))
        self.assertFalse(transcript_matches('안녕하세요.', ''))

    def test_long_input_is_bounded_and_preserves_all_spoken_characters(self):
        text = ('오늘은 새 이야기를 만들어 볼게요. 작은 고양이는 조용한 마을을 떠났어요.\n' * 35) + ('아' * 340) + ' 1.55초가 지났어요.'
        parts = speech_segments(text)
        self.assertTrue(all(0 < len(part) <= 160 for part in parts))
        self.assertEqual(normalized_text(''.join(parts)), normalized_text(text))
        self.assertIn('1.55초', parts[-1])
        self.assertEqual(speech_segments('  \n '), [])


if __name__ == '__main__':
    unittest.main()
