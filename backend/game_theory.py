"""Game-Theoretic Pounce vs. Bounce Expected-Value (EV) Analyzer for Competitive Quizzing.

Under standard Indian Open Quiz rules (+10 / -5 Pounce, +10 / 0 Direct Bounce):
  EV_pounce(p) = 10 * p - 5 * (1 - p) = 15 * p - 5
  Rational Pounce Breakeven Threshold: p* = 5 / 15 = 33.3%
"""
from __future__ import annotations

from typing import List, Dict, Any
from backend.models import AblationStep


def compute_pounce_ev_profile(
    ablation_steps: List[AblationStep],
    pounce_hit_pts: float = 10.0,
    pounce_miss_penalty: float = 5.0,
) -> Dict[str, Any]:
    """Compute per-step rational Pounce EV and classify the question's pounce economy."""
    breakeven_p = round(pounce_miss_penalty / (pounce_hit_pts + pounce_miss_penalty), 3)
    step_evs: List[Dict[str, Any]] = []
    first_positive_step = None

    for step in ablation_steps:
        p = max(0.0, min(1.0, step.consensus_confidence))
        ev = round(pounce_hit_pts * p - pounce_miss_penalty * (1.0 - p), 2)
        is_rational = p > breakeven_p
        if is_rational and first_positive_step is None:
            first_positive_step = step.step_index
        step_evs.append(
            {
                "step_index": step.step_index,
                "clue_label": f"c{step.step_index}",
                "win_probability": round(p, 2),
                "expected_value_pts": ev,
                "rational_to_pounce": is_rational,
            }
        )

    total = len(ablation_steps)
    if not step_evs:
        verdict = "NO_STEPS"
        summary = "Add clues to evaluate pounce expected value."
    elif first_positive_step == 1 and step_evs[0]["expected_value_pts"] >= 4.0:
        verdict = "BROKEN_ECONOMY_CLUE1_POUNCE"
        summary = (
            f"Clue 1 already yields EV = +{step_evs[0]['expected_value_pts']} pts (>33.3% breakeven). "
            f"All sharp teams will pounce on Clue 1, killing the Bounce."
        )
    elif first_positive_step is None:
        verdict = "NEGATIVE_EV_POUNCE_TRAP"
        summary = (
            f"Negative Pounce EV across all {total} clues (max EV = {max(s['expected_value_pts'] for s in step_evs)} pts). "
            f"Rational teams will pass and wait for Bounce."
        )
    elif first_positive_step == total and total >= 3:
        verdict = "LATE_POUNCE_BOUNCE_HEAVY"
        summary = (
            f"Rational Pounce threshold (p > 33.3%) only crosses at final clue c{total} "
            f"(EV = +{step_evs[-1]['expected_value_pts']} pts). Ideal for tough Open Finals."
        )
    else:
        verdict = "OPTIMAL_POUNCE_BOUNCE_SEPARATION"
        summary = (
            f"Optimal Game-Theoretic Calibration: Clue 1 keeps EV negative/borderline, while Clue c{first_positive_step} "
            f"crosses the +10/-5 breakeven (EV = +{step_evs[first_positive_step - 1]['expected_value_pts']} pts) rewarding sharp pouncers."
        )

    return {
        "scoring_rules": f"+{int(pounce_hit_pts)} / -{int(pounce_miss_penalty)} Pounce",
        "breakeven_probability_pct": round(breakeven_p * 100, 1),
        "first_rational_pounce_step": first_positive_step,
        "economy_verdict": verdict,
        "summary": summary,
        "step_evs": step_evs,
        "floor_crack_prediction": simulate_floor_crack_distribution(ablation_steps),
    }


def simulate_floor_crack_distribution(ablation_steps: List[AblationStep]) -> Dict[str, Any]:
    """Predict expected 100-team tournament floor outcome (Pounce %, Bounce %, Unanswered %)."""
    if not ablation_steps:
        return {"pounce_crack_pct": 0, "bounce_crack_pct": 0, "unanswered_pct": 100}

    # Pre-final clue consensus drives Pounce crack rate; final clue consensus drives total crack rate
    pre_final_p = (
        max(s.consensus_confidence for s in ablation_steps[:-1])
        if len(ablation_steps) >= 2
        else ablation_steps[0].consensus_confidence * 0.6
    )
    final_p = ablation_steps[-1].consensus_confidence

    pounce_pct = int(round(min(92, max(4, pre_final_p * 82))))
    total_crack_pct = int(round(min(97, max(pounce_pct + 5, final_p * 95))))
    bounce_pct = max(0, total_crack_pct - pounce_pct)
    unanswered_pct = max(0, 100 - pounce_pct - bounce_pct)

    return {
        "pounce_crack_pct": pounce_pct,
        "bounce_crack_pct": bounce_pct,
        "unanswered_pct": unanswered_pct,
    }
