"""Adversarial Stress-Test Suite: Leave-One-Clue-Out (LOCO) Keystone Analysis & Implicit Linguistic Leak Audit."""
from __future__ import annotations

import re
import time
from typing import Dict, Any, List

from backend.models import QuestionAnalyzeRequest
from backend.linter_pipeline import segment_question_into_clues, analyze_workability


def audit_implicit_linguistic_leaks(question_text: str) -> Dict[str, Any]:
    """Detect subtle linguistic giveaways: gendered pronouns, exact year clustering, and quoted verbatim phrases."""
    leaks: List[Dict[str, str]] = []

    # 1. Gendered pronoun leak detection
    female_pronouns = re.findall(r"\b(she|her|hers|herself|woman|actress|queen)\b", question_text, flags=re.IGNORECASE)
    male_pronouns = re.findall(r"\b(he|him|his|himself|man|actor|king)\b", question_text, flags=re.IGNORECASE)
    if female_pronouns and not male_pronouns:
        leaks.append(
            {
                "type": "GENDER_PRONOUN_LEAK",
                "severity": "MODERATE",
                "detail": f"Uses gendered cue(s) ({', '.join(set(p.lower() for p in female_pronouns[:3]))}), narrowing candidate pool before the lateral clue lands.",
                "fix": "Use gender-neutral 'X' or 'this pioneer/author' in Clue 1 to preserve pounce tension.",
            }
        )
    elif male_pronouns and not female_pronouns:
        leaks.append(
            {
                "type": "GENDER_PRONOUN_LEAK",
                "severity": "LOW",
                "detail": f"Uses masculine pronoun(s) ({', '.join(set(p.lower() for p in male_pronouns[:3]))}).",
                "fix": "Replace with neutral 'X' if you want to keep gender concealed until Clue 2.",
            }
        )

    # 2. Exact year clustering
    years = re.findall(r"\b(?:1[4-9]\d\d|20[0-2]\d)\b", question_text)
    if len(set(years)) >= 3:
        leaks.append(
            {
                "type": "TEMPORAL_OVER_PINNING",
                "severity": "MODERATE",
                "detail": f"Contains {len(set(years))} distinct exact years ({', '.join(list(dict.fromkeys(years))[:4])}), making timeline triangulation trivial.",
                "fix": "Replace at least one exact year with a relative anchor (e.g., 'six years later' or 'in the early 1820s').",
            }
        )

    # 3. Verbatim quoted phrases (> 2 words)
    quotes = re.findall(r"['\"]([^'\"]{12,80})['\"]", question_text)
    if quotes:
        leaks.append(
            {
                "type": "VERBATIM_QUOTE_SEARCH_RISK",
                "severity": "HIGH",
                "detail": f"Exact quoted phrase(s) detected: \"{quotes[0]}\" — high 1-hop exact-match search risk in online/Zoom quizzes.",
                "fix": "Paraphrase the quoted title or line unless it is intentionally the confirming clincher.",
            }
        )

    # 4. Wordplay / parenthetical clutter
    parens = re.findall(r"\([^)]{8,}\)", question_text)
    if len(parens) >= 2:
        leaks.append(
            {
                "type": "ORAL_PARENTHETICAL_CLUTTER",
                "severity": "LOW",
                "detail": f"Contains {len(parens)} long parenthetical asides that disrupt spoken rhythm on a stage mic.",
                "fix": "Promote essential context into a clean sentence or cut redundant asides.",
            }
        )

    return {
        "implicit_leak_count": len(leaks),
        "leaks": leaks,
        "status": "CLEAN" if not leaks else "WARNINGS_DETECTED",
    }


async def run_question_stress_test(req: QuestionAnalyzeRequest) -> Dict[str, Any]:
    """Run Leave-One-Clue-Out (LOCO) Keystone Ablation + Implicit Linguistic Leak Audit."""
    t0 = time.perf_counter()
    clues = segment_question_into_clues(req.question_text)
    linguistic_audit = audit_implicit_linguistic_leaks(req.question_text)

    loco_results: List[Dict[str, Any]] = []
    keystone_clue_id = "c1"
    max_drop = -1.0

    if len(clues) >= 2:
        baseline_work, _, _ = await analyze_workability(req, clues)
        baseline_final_conf = (
            baseline_work.ablation_steps[-1].consensus_confidence
            if baseline_work.ablation_steps
            else 0.5
        )

        for drop_idx, dropped in enumerate(clues[:4]):
            remaining = [c for i, c in enumerate(clues) if i != drop_idx]
            rem_text = " ".join(c.text for c in remaining)
            sub_req = req.model_copy(update={"question_text": rem_text})
            sub_clues = segment_question_into_clues(rem_text)
            sub_work, _, _ = await analyze_workability(sub_req, sub_clues)
            final_step = sub_work.ablation_steps[-1] if sub_work.ablation_steps else None
            sub_conf = final_step.consensus_confidence if final_step else 0.0
            cracked = final_step.target_cracked if final_step else False
            conf_drop = round(max(0.0, baseline_final_conf - sub_conf), 2)

            if conf_drop > max_drop:
                max_drop = conf_drop
                keystone_clue_id = dropped.clue_id

            loco_results.append(
                {
                    "dropped_clue_id": dropped.clue_id,
                    "dropped_role": dropped.role,
                    "dropped_excerpt": dropped.text[:90] + ("..." if len(dropped.text) > 90 else ""),
                    "still_solvable_without_clue": cracked,
                    "confidence_without_clue": sub_conf,
                    "confidence_drop": conf_drop,
                    "clue_importance": (
                        "KEYSTONE_LOAD_BEARING"
                        if (not cracked or conf_drop >= 0.25)
                        else ("SUPPORTING" if conf_drop >= 0.08 else "REDUNDANT_SAFE_TO_TRIM")
                    ),
                }
            )

    return {
        "target_answer": req.target_answer,
        "clue_count": len(clues),
        "keystone_clue_id": keystone_clue_id,
        "loco_ablation": loco_results,
        "linguistic_audit": linguistic_audit,
        "summary": (
            f"Leave-One-Clue-Out (LOCO) analysis identified {keystone_clue_id} as the primary load-bearing clue; "
            f"linguistic audit found {linguistic_audit['implicit_leak_count']} subtle cue(s)."
        ),
        "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
    }
