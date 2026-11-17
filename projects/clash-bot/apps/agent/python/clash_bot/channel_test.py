"""Only replies reach the Node client: Python and native output go to the error stream."""

import subprocess
import sys
import unittest


class ReplyChannelTest(unittest.TestCase):
    def test_keeps_python_and_native_output_off_the_reply_channel(self):
        script = "\n".join(
            [
                "import os",
                "from clash_bot.channel import protocol_channel",
                "emit = protocol_channel()",
                "print('python warning', flush=True)",
                "os.write(1, b'native warning\\n')",
                "emit({'type': 'ready'})",
            ]
        )
        result = subprocess.run(
            [sys.executable, "-c", script], capture_output=True, text=True, check=True
        )
        self.assertEqual(result.stdout.splitlines(), ['{"type": "ready"}'])
        self.assertIn("python warning", result.stderr)
        self.assertIn("native warning", result.stderr)


if __name__ == "__main__":
    unittest.main()
