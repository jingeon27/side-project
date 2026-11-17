"""One side's screen over a game, in the terms the live runtime reports.

The simulator knows every public play exactly; the live screen does not. It bounds the opponent's
elixir from our own bar and the opponent plays it recognized, is sure only of the opponent's latest
card, misses and misnames units, and reads no tower hit points. Training inputs and the games
played as deployed are read through this, so the policy is trained and judged on what it will get.
"""

from .context import cycle_rows, decision_context
from .noise import perceive
from .opponent_elixir import OpponentElixir


class Screen:
    """What one side has read since the game began; `watch` it at every decision tick."""

    def __init__(self, noise, rng):
        self.noise, self.rng = noise, rng
        self.tick = -1
        self.elixir = None
        self.recognized = []

    def watch(self, observation):
        """Take this tick's sample of our bar and the opponent plays that became public."""
        state, team = observation["state"], observation["team"]
        own_spent = opponent_spent = 0
        for event in observation["history"]:
            if not self.tick < event["tick"] <= state["tick"]:
                continue
            for play in event["plays"]:
                if play["team"] == team:
                    own_spent += play["cost"]
                elif self.rng.random() >= self.noise.playMissRate:
                    opponent_spent += play["cost"]
                    if play["action"][0] >= 0:
                        self.recognized.append(play["action"][0])
        at, amount = state["tick"] / 20, state["players"][team]["elixir_milli"] / 1000
        if self.elixir is None:
            self.elixir = OpponentElixir(at, amount)
        elif state["tick"] > self.tick:
            self.elixir.sample(at, amount, own_spent, opponent_spent)
        self.tick = state["tick"]

    def read(self, observation, actions, towers=True):
        """The decision context as this screen has it; the live screen passes no `towers`."""
        self.watch(observation)
        context = perceive(decision_context(observation, actions), self.rng, self.noise)
        context["enemyElixir"] = {"min": 0.0, "max": self.elixir.upper}
        context["enemyCycle"] = cycle_rows(self.recognized)
        if not towers:
            del context["towers"]
        return context
