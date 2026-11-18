"""A declared reactive opponent for hypothetical futures, never observed future moves."""

from ..sim.clock import advance_window
from ..sim.rules import Action
from .benchmark import ScriptedPolicy, defender_bot

RESPONSE_POLICY = "public_sampled_world_defender_v1"


def rollout(arena, team, action, horizon, seed, enemy_offset):
    """Own side tests one move then waits; the fixed opponent follows its decision clock.

    `arena` must be a public-history-conditioned sample, never the live engine save.
    The opponent reads its OWN public observation/hand in that hypothetical world.
    """
    opponent = ScriptedPolicy("defender", defender_bot, seed)
    begin = len(arena.history)

    def respond(world, enemy):
        observation = world.observe(enemy)
        choices = [Action(*row) for row in observation["legalActions"]]
        probabilities, _value = opponent.predict(observation, choices)
        return choices[int(probabilities.argmax())]

    advance_window(arena, team, action, horizon, enemy_offset, respond)
    deployed = sum(
        play["team"] == 1 - team and play["action"][0] >= 0
        for event in arena.history[begin:]
        for play in event["plays"]
    )
    return arena.state(), deployed
