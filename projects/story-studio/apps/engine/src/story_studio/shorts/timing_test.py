import unittest

from .timing import FINAL_TAIL, FPS, FRAMES, LEAD, TAIL, plan_cuts, score_cues


class ReadingTimelineTest(unittest.TestCase):
    def test_seven_second_reading_moves_a_five_second_picture_cut(self):
        shots = [{'seconds': n} for n in (5, 6, 5, 7, 7)]
        readings = [3, 5, 7.5, 4, 5]
        cuts = plan_cuts(shots, readings)
        self.assertEqual(sum(cut.frames for cut in cuts), FRAMES)
        self.assertEqual(cuts[0].first, 0)
        for i, cut in enumerate(cuts):
            self.assertEqual(cut.speech_seconds, readings[i])
            margin = FINAL_TAIL if i == len(cuts)-1 else TAIL
            self.assertGreaterEqual(cut.frames/FPS - LEAD - readings[i] + 1e-10, margin)
        for a, b in zip(cuts, cuts[1:]):
            self.assertEqual(a.first + a.frames, b.first)
        self.assertGreater(cuts[2].frames, 7.5 * FPS)
        episode = {'shots': shots, 'music': [{'at': 11}, {'at': 13.5}, {'at': 16}]}
        actual = [cue['at'] for cue in score_cues(episode, cuts)]
        for at, expected in zip(actual, [cuts[2].start, (cuts[2].start+cuts[2].end)/2, cuts[3].start]):
            self.assertAlmostEqual(at, expected, places=4)

    def test_an_overfull_reading_requires_a_shorter_script(self):
        with self.assertRaisesRegex(ValueError, '대사를 줄여'):
            plan_cuts([{'seconds': 15}, {'seconds': 15}], [14.9, 14.8])
