"""Inspect the arena control files without loading the training runtime."""

import json
import os

from clash_bot.files import atomic_json

PHASES = {
    "not_started": "시작 전",
    "initializing": "준비 중",
    "selfplay": "자가대국 중",
    "training": "학습 중",
    "trained": "학습 완료",
    "evaluating": "후보 평가 중",
    "evaluated": "평가 완료",
    "opening_audit": "초반 대기 검증 중",
    "benchmarking": "기준 봇과 평가 중",
    "generation_complete": "세대 완료",
    "stopped": "중지됨",
    "failed": "실패",
}


def read_status(control):
    try:
        state = json.loads((control / "status.json").read_text())
    except FileNotFoundError:
        return {"running": False, "phase": "not_started"}
    running = state["phase"] not in ("stopped", "failed")
    if running:
        try:
            os.kill(state["pid"], 0)
        except ProcessLookupError:
            running = False
        except PermissionError:
            pass  # The process exists but belongs to another user.
    return {**state, "running": running}


def request_stop(control):
    state = read_status(control)
    if state["phase"] == "not_started":
        return state
    if state["running"]:
        atomic_json(control / "stop.json", {"id": state["id"]})
    return {
        "stopRequested": state["running"],
        "after": "the current complete game/evaluation pair and training checkpoint",
    }


def format_status(state):
    phase = state["phase"]
    label = PHASES.get(phase, phase)
    if not state["running"] and phase not in ("stopped", "failed", "not_started"):
        label = f"프로세스 종료 (마지막 단계: {label})"
    lines = [f"자가대국  {label}"]
    if "completedGames" in state and "completedGenerations" in state:
        lines.append(f"완료  {state['completedGames']}판 · {state['completedGenerations']}세대")
    if "learner" in state and "champion" in state:
        lines.append(f"모델  학습 v{state['learner']} · 챔피언 v{state['champion']}")
    evaluation = state.get("evaluation")
    if evaluation and evaluation.get("complete"):
        gate = evaluation.get("gate", {})
        versions = (evaluation.get("challenger", {}), evaluation.get("champion", {}))
        if (
            all("version" in model for model in versions)
            and {"passed", "pairs", "score"} <= gate.keys()
        ):
            decision = "채택" if gate["passed"] else "기존 챔피언 유지"
            challenger, champion = versions
            lines.append(
                f"마지막 평가  v{challenger['version']} 대 v{champion['version']}"
                f" · {gate['pairs']}쌍 · 득점률 {gate['score']:.1%} · {decision}"
            )
    if phase == "failed" and state.get("error"):
        lines.append(str(state["error"]))
    return "\n".join(lines)
