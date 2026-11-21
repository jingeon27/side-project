import unittest

from clash_bot.arena.policy.network import Policy
from clash_bot.arena.policy.samples import TrainingSample
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import CARD_ID, OMIT_OPENING
from clash_bot.arena.training.deck_practice import open_practice
from clash_bot.arena.training.focus_opening import WAIT, focus_orders, goal_decks
from clash_bot.arena.training.focused_trial import focused_game


class FocusedTrialTest(unittest.TestCase):
    def test_native_terminal_arms_supervise_executed_card_evolution_and_both_skill_types(self):
        policy = Policy(metadata={"version": 0, "rulesID": "training"})
        for index, goal in enumerate(
            ("card:Mirror", "evolution:Knight", "hero:IceWizard", "champion:GoldenKnight")
        ):
            kind, name = goal.split(":")
            with self.subTest(goal=goal):
                deck = sorted(goal_decks()[goal])[0]
                seat = index % 2
                setup = {
                    "focusGoal": goal,
                    "focusLane": 3.5,
                    "focusSeat": seat,
                    "phase": 0,
                    "levels": [11, 11],
                    "delays": [22, 22],
                    "decks": [deck, deck],
                    "focusContext": 0,
                }
                game_id = f"train-focus-smoke-{(1, 3, 4, 5)[index]}"
                if name in OMIT_OPENING:
                    self.assertNotIn(CARD_ID[name], focus_orders(setup, game_id)[seat][:4])
                game = focused_game(
                    {"setup": setup, "id": game_id, "rulesID": "training"}, policy, policy
                )
                trial = game["practiceTrial"]
                self.assertTrue(trial["verified"])
                branch = trial["branches"][0]
                receipt = branch["receipt"]
                self.assertEqual(receipt["tick"], game["trainingStartTick"] + 22)
                expected = -2 if kind in ("hero", "champion") else CARD_ID[name]
                self.assertEqual(receipt["action"][0], expected)
                if kind != "card":
                    field = "evolvedDeployments" if kind == "evolution" else "abilityUses"
                    self.assertEqual(receipt["forms"][field], {name: 1})
                wait = next(b for b in trial["branches"] if b["action"] == WAIT.row())
                self.assertTrue(wait["executed"])
                self.assertIsNone(wait["receipt"])
                (row,) = game["samples"]
                TrainingSample.model_validate(row)
                self.assertEqual(row["practiceGoal"], goal)
                self.assertEqual(row["actions"][row["chosen"]], receipt["action"])
                confirmed = {
                    tuple(b["action"]): b["value"] for b in trial["branches"] if b["executed"]
                }
                self.assertEqual(
                    row["search"]["values"], [confirmed[tuple(a)] for a in row["actions"]]
                )
                self.assertEqual(row["search"]["visits"], [1] * len(confirmed))
                self.assertEqual(game["rejectedCommands"], 0)

    def test_holdout_rejects_a_focused_opening(self):
        with self.assertRaisesRegex(ValueError, "training games only"):
            open_practice(Arena(1), {"focusGoal": "card:Knight"}, False)
