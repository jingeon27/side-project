import tempfile
import unittest
from unittest.mock import patch

from clash_bot.arena.league import run
from clash_bot.arena.sim import verification


class SimulatorVerificationTest(unittest.TestCase):
    def test_controlled_native_scenarios_pass_without_claiming_real_client_parity(self):
        with tempfile.TemporaryDirectory() as directory:
            result = verification.verify(directory)
        self.assertTrue(result["passed"], result["checks"])
        self.assertFalse(result["realClientParityVerified"])
        checks = result["checks"]
        self.assertEqual(checks["poolDeploymentsAndElixir"]["deckCardDeployments"], 96)
        self.assertEqual(checks["poolDeploymentsAndElixir"]["distinctCards"], 61)
        self.assertTrue(checks["drillBarrelDeathSpawn"]["natural"]["goblinSeen"])
        self.assertEqual(checks["drillBarrelDeathSpawn"]["barrel"]["goblinsAfterDeathFrame"], 0)

    def test_a_failed_mechanic_is_retained_as_a_failed_verification(self):
        def broken():
            raise ValueError("death spawn changed")

        with (
            tempfile.TemporaryDirectory() as directory,
            patch.dict(verification.CHECKS, {"drillBarrelDeathSpawn": broken}, clear=True),
        ):
            result = verification.verify(directory)
        self.assertFalse(result["passed"])
        self.assertEqual(result["checks"]["drillBarrelDeathSpawn"]["error"], "death spawn changed")

    def test_a_failed_verification_blocks_training_before_any_league_is_initialized(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch("clash_bot.arena.league.verify", return_value={"passed": False}),
            patch("clash_bot.arena.league.initialize") as initialize,
        ):
            with self.assertRaisesRegex(ValueError, "verification failed"):
                run(directory, hours=0, generations=1, games=1, workers=1)
        initialize.assert_not_called()
