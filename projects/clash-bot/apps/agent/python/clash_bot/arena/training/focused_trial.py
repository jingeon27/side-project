"""Training-only matched interventions. Choose all arms from the screen before any outcomes."""

import numpy as np

from ..policy.choice import card_choice
from ..policy.network import Policy
from ..sim.rules import CARD_ID, TILE
from .bandits import root_priors
from .focus_opening import WAIT, focus_orders, ready
from .improvement import improved_policy
from .public_value import examples
from .selfplay import play_game
from .storage import seed_for
from .targets import training_rows


class TrialActor(Policy):
    def __init__(self, reference, goal, seed, requested=None):
        super().__init__(weights=reference.weights, metadata=reference.metadata)
        self.kind, name = goal.split(":")
        self.card = CARD_ID[name]
        self.seed, self.requested = seed, requested
        self.root = None
        self.done = False

    def deployed(self, observation, actions, screen):
        if self.done:
            return super().deployed(observation, actions, screen)
        self.done = True
        context = screen.read(observation, actions)
        prior = self.read({k: v for k, v in context.items() if k != "towers"})[0]
        family = -2 if self.kind in ("hero", "champion") else self.card
        indexes = [i for i, a in enumerate(actions) if a.card == family]
        player = observation["state"]["players"][observation["team"]]
        if not indexes or not ready(player, self.card, self.kind):
            return prior
        best = max(indexes, key=lambda i: prior[i])
        # Alternate another plausible, separated tile across independent openings.
        separated = [
            i
            for i in indexes
            if (actions[i].x - actions[best].x) ** 2 + (actions[i].y - actions[best].y) ** 2
            >= (2 * TILE) ** 2
        ]
        other = max(separated, key=lambda i: prior[i], default=best)
        target = best if self.seed % 2 == 0 else other
        deployed = card_choice([a.card for a in actions], prior)
        arms = list(
            dict.fromkeys(
                [target, actions.index(WAIT), deployed, other if target == best else best]
            )
        )
        self.root = (observation, actions, context, prior, arms)
        selected = target if self.requested is None else actions.index(self.requested)
        if selected not in arms:
            raise ValueError("Matched trial action set changed between branches")
        output = np.zeros_like(prior)
        output[selected] = 1
        return output


def focused_game(job, champion, reference):
    setup, seed = job["setup"], job["id"]
    goal, seat = setup["focusGoal"], setup["focusSeat"]
    kind, name = goal.split(":")
    orders = focus_orders(setup, seed)

    def run(requested=None):
        actor = TrialActor(reference, goal, seed_for("focus-placement", seed), requested)
        players = [champion, champion]
        players[seat] = actor
        game = play_game(
            players,
            seed,
            job["rulesID"],
            simulations=0,
            training=True,
            initial_orders=orders,
            setup=setup,
        )
        if not game["completed"] or game["rejectedCommands"]:
            raise ValueError("Focused match has no valid terminal receipt")
        return actor.root, game

    root, played = run()
    evidence = {"goal": goal, "verified": False, "branches": []}
    played["practiceTrial"] = evidence
    if root is None or root[0]["state"]["tick"] != played["trainingStartTick"]:
        return played
    observation, actions, context, prior, arms = root
    at = played["trainingStartTick"]
    tick = at + setup["delays"][seat]
    opening = [event for event in played["publicHistory"] if event["tick"] < at]
    returns = {}
    for i in arms:
        action = actions[i]
        if i == arms[0]:
            game = played
        else:
            branch, game = run(action)
            if (
                branch is None
                or branch[0]["state"]["tick"] != at
                or branch[2] != context
                or [event for event in game["publicHistory"] if event["tick"] < at] != opening
            ):
                raise ValueError("Matched training matches diverged before the chosen action")
        receipt = game["firstReceipt"]
        valid = (
            (receipt is None and game["tick"] > tick)
            if action == WAIT
            else (
                receipt is not None
                and receipt["tick"] == tick
                and receipt["action"] == action.row()
            )
        )
        if valid and i == arms[0] and kind != "card":
            key = "evolvedDeployments" if kind == "evolution" else "abilityUses"
            valid = bool(receipt["forms"][key].get(name))
        result = game["terminalValues"][seat]
        evidence["branches"].append(
            {
                "action": action.row(),
                "executed": valid,
                "receipt": receipt,
                "crowns": game["crowns"],
                **result,
            }
        )
        if valid:
            returns[i] = result["value"]
        elif i == arms[0]:
            return played
    if len(returns) < 2:
        return played
    retained = sorted(returns)
    values = [returns[i] for i in retained]
    mass = root_priors(actions, prior, retained)
    visits = [1] * len(retained)
    result = {
        "actions": [actions[i] for i in retained],
        "visits": visits,
        "values": values,
        **improved_policy(mass, values, visits),
        "prior": mass.tolist(),
        "simulations": 0,
        "source": "matched_training_terminal_returns",
        "attackComparison": None,
        "defenseComparison": None,
        "rootCandidates": len(actions),
    }
    played["samples"] = [
        {
            "gameID": seed,
            "rulesID": job["rulesID"],
            "team": seat,
            "practiceGoal": goal,
            "policyVersion": reference.metadata["version"],
            "referenceVersion": reference.metadata["version"],
            "behavior": "focused_exploration",
            "behaviorAction": actions[arms[0]].row(),
            **training_rows(
                observation, result, None, retained.index(arms[0]), reference, context=context
            ),
            **played["terminalValues"][seat],
        }
    ]
    played["leafExamples"] = examples(played["samples"])
    evidence["verified"] = True
    return played
