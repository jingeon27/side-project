"""FLUX.2 Klein request planning without loading MLX."""
import unittest

from .image import REFERENCE_INSTRUCTION, SIZES, image_plan


class ImagePlanTests(unittest.TestCase):
    def test_sizes_follow_the_project_ratio_on_the_klein_latent_grid(self):
        for quality, sizes in SIZES.items():
            for ratio, (width, height) in sizes.items():
                with self.subTest(quality=quality, ratio=ratio):
                    self.assertEqual((width % 16, height % 16), (0, 0))
                    self.assertEqual(width > height, ratio == '16:9')

    def test_asks_to_keep_the_people_only_when_a_reference_is_given(self):
        prompt = 'A man in his sixties walks through a market in Caracas'
        self.assertEqual(image_plan({'prompt': prompt})['prompt'], prompt)
        referenced = image_plan({'prompt': prompt, 'reference': '/api/assets/00000000-0000-0000-0000-000000000000.png'})
        self.assertEqual(referenced['prompt'], prompt + REFERENCE_INSTRUCTION)

    def test_keeps_an_explicit_seed_and_draws_one_otherwise(self):
        self.assertEqual(image_plan({'prompt': 'x', 'seed': 42})['seed'], 42)
        self.assertGreaterEqual(image_plan({'prompt': 'x'})['seed'], 0)


if __name__ == '__main__':
    unittest.main()
