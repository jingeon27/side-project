"""Model download selection without network access."""
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from .catalog import PREPARED_DIRECTORIES, model_specs
from .setup import PREPARE, install_models, prepared, wanted_files


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
        names = [entry.rfilename for entry in wanted_files(files('a.safetensors', 'b.json', 'chat_template.jinja', 'c.txt'), None)]
        self.assertEqual(names, ['a.safetensors', 'b.json', 'chat_template.jinja'])


class PreparedTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.specs = model_specs()

    def tearDown(self):
        self.folder.cleanup()

    def mark(self, name, spec):
        directory = self.root / 'models' / PREPARED_DIRECTORIES[name]
        directory.mkdir(parents=True)
        (directory / 'ready.json').write_text(json.dumps(spec))

    def test_a_removed_source_is_not_downloaded_again_once_its_model_is_ready(self):
        for name in PREPARED_DIRECTORIES:
            with self.subTest(name=name):
                self.assertFalse(prepared(self.root, name, self.specs[name]))
                self.mark(name, self.specs[name])
                self.assertTrue(prepared(self.root, name, self.specs[name]))

    def test_a_new_pinned_revision_prepares_the_model_again(self):
        self.mark('video-source', {**self.specs['video-source'], 'revision': 'older'})
        self.assertFalse(prepared(self.root, 'video-source', self.specs['video-source']))

    def test_models_used_as_downloaded_are_always_verified(self):
        self.assertFalse(prepared(self.root, 'text', self.specs['text']))

    def test_image_install_downloads_only_gemma_and_klein_and_reuses_them_on_retry(self):
        hub = Mock()
        def metadata(repo, **kwargs):
            filename = 'config.json' if repo == self.specs['text']['repo'] else 'model_index.json'
            return SimpleNamespace(siblings=[SimpleNamespace(rfilename=filename, size=2, lfs=None)])
        def download(repo, *, local_dir, **kwargs):
            local_dir.mkdir(parents=True)
            (local_dir / metadata(repo).siblings[0].rfilename).write_text('{}')
        hub.model_info.side_effect = metadata
        hub.snapshot_download.side_effect = download
        (self.root / 'ready.json').write_text('existing full installation')
        with patch.dict('sys.modules', {'huggingface_hub': hub}), patch.dict(PREPARE, {'image': lambda root, source, spec: self.mark('image', spec)}):
            install_models(self.root, 'image')
            install_models(self.root, 'image')
        self.assertEqual([call.args[0] for call in hub.snapshot_download.call_args_list],
                         [self.specs['text']['repo'], self.specs['image']['repo']])
        self.assertEqual((self.root / 'ready.json').read_text(), 'existing full installation')
        self.assertTrue(prepared(self.root, 'image', self.specs['image']))


if __name__ == '__main__':
    unittest.main()
