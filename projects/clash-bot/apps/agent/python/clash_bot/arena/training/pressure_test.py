import unittest

from ..sim.rules import CARD_ID
from .benchmark import ScriptedPolicy
from .pressure import ATTACKS, opening_orders, pressure_policy, schedule_pressure
from .selfplay import live_setup, play_game


class PressureCurriculumTest(unittest.TestCase):
    def test_each_attacker_executes_the_intended_threat_with_normal_delays(self):
        for index, (name, (_deck, threat, _point)) in enumerate(ATTACKS.items()):
            with self.subTest(name=name):
                seat = index % 2
                setup = schedule_pressure(live_setup(index), index, seat, index % 2 == 1)
                identity = f"pressure-regression-{name}"
                policies = [pressure_policy(setup, identity)] * 2
                policies[seat] = ScriptedPolicy("waiting", lambda *_: 0, 1)
                game = play_game(
                    policies,
                    identity,
                    "unit-test",
                    simulations=0,
                    training=False,
                    max_ticks=500,
                    setup=setup,
                    initial_orders=opening_orders(setup, seat, identity),
                )
                cards = [
                    play["action"][0]
                    for event in game["publicHistory"]
                    for play in event["plays"]
                    if play["team"] == 1 - seat
                ]
                self.assertEqual(game["rejectedCommands"], 0)
                self.assertEqual(cards[0], CARD_ID[threat])
                if name == "graveyard_poison":
                    self.assertEqual(cards[1], CARD_ID["Poison"])
