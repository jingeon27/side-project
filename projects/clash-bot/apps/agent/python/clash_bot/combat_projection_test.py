import json
import unittest

from clash_bot.combat_projection import forecast_effect
from clash_bot.paths import FIXTURES_DIR


class CombatProjectionTest(unittest.TestCase):
    def test_shared_motion_damage_and_kill_cases(self):
        for row in json.loads((FIXTURES_DIR / "combat-cases.json").read_text()):
            with self.subTest(row["name"]):
                data = row["input"]
                output = forecast_effect(
                    data["card"],
                    data["kind"],
                    data["x"],
                    data["y"],
                    data["own"],
                    data["enemy"],
                    data["enemyCycle"],
                    data["enemyMana"],
                )
                for field, value in row["expected"].items():
                    if field == "damageUpperBelow":
                        self.assertLess(output["damage"][1], value)
                    else:
                        self.assertEqual(output[field], value)
