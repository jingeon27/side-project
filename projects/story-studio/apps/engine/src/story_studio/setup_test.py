"""Model download selection without network access."""
from types import SimpleNamespace
import unittest

from .catalog import model_specs
from .setup import wanted_files


def files(*names):
    return [SimpleNamespace(rfilename=name) for name in names]


class WantedFilesTests(unittest.TestCase):
    def test_klein_skips_the_duplicate_single_file_checkpoint(self):
        siblings = files('flux-2-klein-4b.safetensors', 'model_index.json', 'transformer/config.json',
                         'transformer/diffusion_pytorch_model.safetensors', 'text_encoder/model-00001-of-00002.safetensors',
                         'vae/diffusion_pytorch_model.safetensors', 'tokenizer/tokenizer.json', 'README.md')
        names = [entry.rfilename for entry in wanted_files(siblings, model_specs()['image']['patterns'])]
        self.assertNotIn('flux-2-klein-4b.safetensors', names)
        self.assertIn('transformer/diffusion_pytorch_model.safetensors', names)
        self.assertIn('tokenizer/tokenizer.json', names)

    def test_without_patterns_every_weight_and_config_is_required(self):
        names = [entry.rfilename for entry in wanted_files(files('a.safetensors', 'b.json', 'c.txt'), None)]
        self.assertEqual(names, ['a.safetensors', 'b.json'])


if __name__ == '__main__':
    unittest.main()
