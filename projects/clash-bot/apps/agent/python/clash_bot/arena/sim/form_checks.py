"""Prove evolution cycles and ability execution on both seats before scheduling a card form."""

import json

import royalesim

from .rules import SPEC, TILE

FILLERS = (
    "Skeletons",
    "Zap",
    "IceGolemite",
    "Archer",
    "Minions",
    "Knight",
    "Fireball",
    "Musketeer",
)


def form_execution(engine, form, cycles=None, has_skill=True):
    names = list(dict.fromkeys([engine, *FILLERS]))[:8]
    battle = royalesim.Battle(
        card_names=names,
        slot_of_k=[[0, 1, 2]] * 2,
        level=SPEC["level"],
        tower_level=SPEC["level"],
        calibration_overrides={"cards.CARD_TABLE": json.dumps(SPEC["table"])},
    )
    battle.set_command_delay_ticks(1, 1)
    battle.reset(
        seed=173,
        decks=[list(range(8))] * 2,
        shuffle=0,
        start_tick=0,
        elixir_milli=[10000] * 2,
        tower_hp=None,
        spawns=[],
        forms=[[{"champion": 0, "evolution": 1, "hero": 2}[form], *([0] * 7)]] * 2,
    )
    battle.step([], 270)
    settings = [(9 * TILE, 10 * TILE), (9 * TILE, 22 * TILE)]

    def players():
        return json.loads(battle.state_json())["players"]

    def run(slots, ticks, kind, target):
        commands = [(seat, slot, *settings[seat]) for seat, slot in enumerate(slots)]
        battle.step(commands, ticks)
        return {
            seat
            for _, seat, action, what, reason in battle.step_commands_run()
            if action == kind and what == target and reason == 0
        }

    if form != "evolution":
        deployed = run([0, 0], 18, "deploy", 0)
        if deployed != {0, 1}:
            return {"passed": False, "reason": "no_deploy_receipts"}
        if not has_skill:
            return {
                "passed": all(not p["abilities"] for p in players()),
                "activeSkill": False,
                "deployedSides": sorted(deployed),
            }
        # Some carriers arrive after the rolling projectile or need an enemy in range.
        for _ in range(32):
            if all(p["abilities"] and p["abilities"][0][0] for p in players()):
                fired = run([royalesim.HAND_SIZE] * 2, 20, "ability", royalesim.HAND_SIZE)
                if fired == {0, 1}:
                    return {"passed": True, "abilityExecutedSides": sorted(fired)}
            else:
                battle.step([], 12)
        return {"passed": False, "reason": "no_paired_ability_receipts"}

    for _ in range(5 * (cycles + 2)):
        before = players()
        slots = [
            p["hand"].index(0)
            if 0 in p["hand"]
            else min(range(4), key=lambda slot: p["hand_costs"][slot])
            for p in before
        ]
        ready = all(
            p["hand"][slot] == 0 and p["evo"] == [[0, cycles, 1, cycles]]
            for p, slot in zip(before, slots)
        )
        ran = run(slots, 18, "deploy", 0)
        if ready and ran == {0, 1} and all(p["evo"] == [[0, 0, 0, cycles]] for p in players()):
            return {"passed": True, "cycles": cycles, "evolvedDeploySides": sorted(ran)}
        battle.step([], 155)
    return {"passed": False, "reason": "charged_form_did_not_execute"}


def verified_forms(specs):
    results = {}
    for card, entry in specs["cards"].items():
        for form in ("evolution", "hero", "champion"):
            if form not in entry["forms"]:
                continue
            raw = entry["forms"][form]
            try:
                proof = form_execution(
                    entry["engine"], form, raw.get("evo_cycles"), bool(raw.get("ability"))
                )
            except (ValueError, RuntimeError) as exc:
                proof = {"passed": False, "reason": str(exc)}
            results.setdefault(card, {})[form] = proof
    return results


def form_checks():
    from clash_bot.card_specs import engine_specs

    results = verified_forms(engine_specs())
    return {
        "passed": all(r["passed"] for v in results.values() for r in v.values()),
        "byCard": results,
    }
