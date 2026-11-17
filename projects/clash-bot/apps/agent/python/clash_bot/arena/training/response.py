"""A declared reactive opponent for hypothetical futures, never observed future moves."""

from ..sim.rules import Action
from .benchmark import ScriptedPolicy, defender_bot

RESPONSE_POLICY = "public_sampled_world_defender_v1"
RESPONSE_TICKS = 20


def rollout(arena, team, action, horizon, seed):
    """Own side tests one move then waits; the fixed opponent responds every second.

    `arena` must be a public-history-conditioned sample, never the live engine save.
    The opponent reads its OWN public observation/hand in that hypothetical world.
    """
    opponent = ScriptedPolicy("defender", defender_bot, seed)
    begin = arena.state()["tick"]
    for elapsed in range(0, horizon, RESPONSE_TICKS):
        if arena.state()["game_over"]:
            break
        observation = arena.observe(1 - team)
        choices = [Action(*row) for row in observation["legalActions"]]
        probabilities, _value = opponent.predict(observation, choices)
        commands = [Action(-1), Action(-1)]
        commands[team] = action if elapsed == 0 else Action(-1)
        commands[1 - team] = choices[int(probabilities.argmax())]
        outcome = arena.play(commands, min(RESPONSE_TICKS, horizon - elapsed))
        if any(row[1] != 0 for row in outcome):
            raise ValueError("Reactive counterfactual action was not legal")
    deployed = sum(
        play["team"] == 1 - team and play["action"][0] >= 0
        for event in arena.history
        if event["tick"] > begin
        for play in event["plays"]
    )
    return arena.state(), deployed
