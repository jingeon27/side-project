"""Wan2.2 TI2V generation budget without loading MLX."""
import unittest

from .video import FPS, PLANS, video_plan


class VideoPlanTests(unittest.TestCase):
    def test_every_size_fits_the_ti2v_latent_grid_and_720p_area(self):
        for quality, plan in PLANS.items():
            for ratio, (width, height) in plan['sizes'].items():
                with self.subTest(quality=quality, ratio=ratio):
                    self.assertEqual((width % 32, height % 32), (0, 0))
                    self.assertLessEqual(width * height, 704 * 1280)

    def test_short_scenes_play_in_real_time_instead_of_slow_motion(self):
        plan = video_plan({'quality': 'standard', 'ratio': '16:9', 'duration': 3})
        self.assertEqual(plan['frames'], 73)
        self.assertAlmostEqual(plan['duration'] * FPS / plan['frames'], 0.99, places=2)

    def test_frames_stay_4n_plus_1_within_the_quality_budget(self):
        for quality in PLANS:
            for duration in range(2, 16):
                with self.subTest(quality=quality, duration=duration):
                    frames = video_plan({'quality': quality, 'duration': duration})['frames']
                    self.assertEqual((frames - 1) % 4, 0)
                    self.assertLessEqual(frames, PLANS[quality]['frames'])

    def test_clamps_requested_duration_like_the_scene_contract(self):
        self.assertEqual(video_plan({'duration': 30})['duration'], 15)
        self.assertEqual(video_plan({'duration': 0})['duration'], 2)


if __name__ == '__main__':
    unittest.main()
