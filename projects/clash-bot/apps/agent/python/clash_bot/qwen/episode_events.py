"""Evidence rows of events.jsonl, judged without MLX so CI checks the contract with TypeScript.

The TypeScript writer is src/counterpush/runtime/episode-events.ts; both sides read
test-fixtures/counterpush/episode-events.json.
"""

from clash_bot.qwen.qualification import RESULT_LABEL


def verified_result(row):
    if row.get("type") != "result" or row.get("source") != "counterpush_result_dom_verified2":
        return False
    readings = row.get("readings", [])
    if len(readings) != 2 or readings[0] != readings[1] or not isinstance(readings[0], str):
        return False
    match = RESULT_LABEL.fullmatch(readings[0])
    return match is not None and [int(match[1]), int(match[2])] == [row.get("blue"), row.get("red")]


def confirmed_input(row):
    if row.get("type") == "ability_check":
        return (
            row.get("confirmed") is True
            and row.get("changed") is True
            and row.get("handUnchanged") is True
            and row.get("expectedCost") == 2
            and row.get("action", {}).get("kind") == "ability"
            and row.get("action", {}).get("card") == "ice_wizard"
        )
    # Counterpush records explicit confirmation after the spend animation has settled.
    return (
        row.get("type") == "input_check"
        and row.get("confirmed") is True
        and row.get("changed") is True
    )


def confirmed_wait(row):
    return row.get("type") == "wait_check" and row.get("valid") is True
