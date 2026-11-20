import tempfile
import unittest
from unittest.mock import patch

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
        towers = checks["crownTowerCombat"]
        for name, hp, damage, release, impact, cadence in (
            ("princess_tower", 3052, 109, 800, 1150, 800),
            ("king_tower", 4824, 109, 500, 700, 1000),
        ):
            self.assertEqual(set(towers["byTower"][name]), {str(level) for level in range(1, 17)})
            sample = towers["byTower"][name]["11"]
            self.assertEqual(
                [
                    sample[k]
                    for k in (
                        "maxHp",
                        "damagePerHit",
                        "firstReleaseMs",
                        "firstImpactMs",
                        "releaseIntervalMs",
                    )
                ],
                [hp, [damage, damage], release, impact, cadence],
            )
        wake = towers["kingActivation"]["kingDamaged"]
        self.assertEqual(wake["firstReleaseMs"] - wake["triggerMs"], 4000)
        self.assertEqual(towers["approachingKnight"]["survivesFirstShot"]["towerHpLost"], 202)
        ram = checks["deathChildren"]["byParent"]
        for side in ("blue", "red"):
            self.assertEqual(
                ram["BattleRam"][side]["buildingContact"]["childDeployTicks"], [20, 20]
            )
            self.assertIsNone(ram["BattleRam_EV1"][side]["buildingContact"]["deathTick"])
        control = checks["crowdControl"]
        self.assertEqual(control["motion"]["frozenKnightWalkTiles"], 0)
        self.assertGreater(control["motion"]["frozenTargetKnockedTiles"], 0.5)
        child = checks["unitAttackTiming"]["firstChildOfActiveHut"]
        self.assertEqual(
            [child[k] for k in ("appearedMs", "firstReleaseMs", "firstImpactMs")],
            [1050, 2050, 2350],
        )

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
