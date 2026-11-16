import importlib
import unittest
from unittest.mock import patch


class SetupImportTests(unittest.TestCase):
    def test_importing_the_installer_does_not_install_or_download_anything(self):
        with patch("subprocess.run") as run, patch("venv.EnvBuilder.create") as create:
            module = importlib.import_module("clash_bot.qwen.setup")
            importlib.reload(module)
        run.assert_not_called()
        create.assert_not_called()
