import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from clash_bot.arena.curriculum import Teacher, scenario, write_batches


class TacticalCurriculumTest(unittest.TestCase):
    def test_measured_defense_preserves_the_root_and_is_not_a_fake_match_win(self):
        teacher = Teacher()
        observed = scenario(1004, 0)
        before = json.dumps(observed, sort_keys=True)
        label = teacher.label(observed, 'test-gy-defense', 'scenario-0')
        self.assertIsNotNone(label)
        self.assertEqual(json.dumps(observed, sort_keys=True), before)
        evidence = label['evidence']
        self.assertEqual(evidence['objective'], 'own_tower_preservation')
        self.assertEqual(evidence['futureEnemyDeployments'], 0)
        self.assertGreaterEqual(evidence['bestImprovement'], 80)
        self.assertNotIn('terminalOutcome', label)
        for gain, probability in zip(evidence['towerImprovement'], label['target']):
            if probability:
                self.assertGreaterEqual(gain, evidence['bestImprovement'] - 35)
        repeated = teacher.label(observed, 'test-gy-defense', 'scenario-0')
        np.testing.assert_allclose(repeated['target'], label['target'])
        shuffled = teacher.label(observed, 'different-id', 'scenario-0')
        self.assertNotEqual(shuffled['actions'], label['actions'])
        with tempfile.TemporaryDirectory() as directory:
            train = write_batches(directory, [label], label['rulesID'])
            held = write_batches(directory, [label], label['rulesID'], split='holdout')
            self.assertNotEqual(train, held)
            self.assertEqual(json.loads(Path(held[0]).read_text())['split'], 'holdout')


if __name__ == '__main__':
    unittest.main()
