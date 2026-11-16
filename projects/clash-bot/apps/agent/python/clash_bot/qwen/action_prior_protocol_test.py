import json
import subprocess
import sys
import unittest


class ActionPriorProtocolTest(unittest.TestCase):
    def test_cpu_observer_uses_the_same_prior_and_rejects_mismatched_action_counts(self):
        prompt = "mana=2\nA:Uq0 B:W"
        process = subprocess.run(
            [sys.executable, "-m", "clash_bot.qwen.action_prior", "serve"],
            input="\n".join(json.dumps({"prompt": prompt, "count": count}) for count in (2, 3))
            + "\n",
            text=True,
            capture_output=True,
            check=True,
        )
        ready, result, invalid = [json.loads(line) for line in process.stdout.splitlines()]
        self.assertEqual(ready["type"], "ready")
        self.assertLess(result["bias"][0], result["bias"][1] - 8)
        self.assertEqual(invalid["type"], "error")


if __name__ == "__main__":
    unittest.main()
