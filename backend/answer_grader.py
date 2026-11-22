"""Smart Quiz Answer Grader (Levenshtein / Token-Set Fuzzy Matching) & Wikidata Auto-Alias Expander."""
from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import List, Dict, Any, Optional

from backend.truth_hub import truth_hub, LOCAL_ENCYCLOPEDIC_KB


def _normalize(text: str) -> str:
    cleaned = re.sub(r"[^a-z0-9\s]", " ", (text or "").lower())
    cleaned = re.sub(r"\b(the|a|an|of|operation|dr|sir|prof|lord)\b", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def grade_single_answer(
    submitted: str,
    target_answer: str,
    acceptable_aliases: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Grade a single team's written prelims answer against canonical target + aliases."""
    aliases = acceptable_aliases or []
    sub_raw = (submitted or "").strip()
    if not sub_raw:
        return {
            "submitted": sub_raw,
            "verdict": "BLANK",
            "score_awarded": 0.0,
            "similarity": 0.0,
            "reason": "No answer submitted.",
        }

    sub_norm = _normalize(sub_raw)
    valid_forms = [target_answer, *aliases]
    best_sim = 0.0
    matched_form = target_answer

    for form in valid_forms:
        f_norm = _normalize(form)
        if not f_norm:
            continue
        if sub_norm == f_norm:
            return {
                "submitted": sub_raw,
                "verdict": "ACCEPT",
                "score_awarded": 1.0,
                "similarity": 1.0,
                "reason": f"Exact canonical match with '{form}'.",
            }
        # Check surname / distinguishing last token (>=5 chars)
        f_parts = f_norm.split()
        if len(f_parts) >= 2 and len(f_parts[-1]) >= 5 and sub_norm == f_parts[-1]:
            return {
                "submitted": sub_raw,
                "verdict": "ACCEPT",
                "score_awarded": 1.0,
                "similarity": 0.94,
                "reason": f"Accepted distinguishing surname/key token '{f_parts[-1]}' of '{form}'.",
            }

        seq_ratio = SequenceMatcher(None, sub_norm, f_norm).ratio()
        # Token overlap ratio
        sub_toks = set(sub_norm.split())
        f_toks = set(f_norm.split())
        tok_ratio = len(sub_toks & f_toks) / max(1, len(f_toks)) if f_toks else 0.0
        combined = max(seq_ratio, 0.55 * seq_ratio + 0.45 * tok_ratio)
        if combined > best_sim:
            best_sim = combined
            matched_form = form

    best_sim = round(best_sim, 2)
    if best_sim >= 0.82:
        return {
            "submitted": sub_raw,
            "verdict": "ACCEPT_FUZZY",
            "score_awarded": 1.0,
            "similarity": best_sim,
            "reason": f"Minor spelling/phonetic variance of '{matched_form}' ({int(best_sim * 100)}% match).",
        }
    elif best_sim >= 0.58:
        return {
            "submitted": sub_raw,
            "verdict": "QM_REVIEW",
            "score_awarded": 0.5,
            "similarity": best_sim,
            "reason": f"Partial match with '{matched_form}' ({int(best_sim * 100)}%) — Quizmaster discretion recommended.",
        }
    return {
        "submitted": sub_raw,
        "verdict": "REJECT",
        "score_awarded": 0.0,
        "similarity": best_sim,
        "reason": f"Does not match '{target_answer}' ({int(best_sim * 100)}% similarity).",
    }


def batch_grade_prelims_answers(
    target_answer: str,
    acceptable_aliases: List[str],
    submissions_text: str,
) -> Dict[str, Any]:
    """Grade lines of 'Team Name: Submitted Answer' against target + aliases."""
    lines = [ln.strip() for ln in (submissions_text or "").splitlines() if ln.strip()]
    results: List[Dict[str, Any]] = []
    for idx, line in enumerate(lines, start=1):
        if ":" in line:
            team, ans = line.split(":", 1)
        elif "-" in line:
            team, ans = line.split("-", 1)
        else:
            team, ans = f"Team {idx}", line
        graded = grade_single_answer(ans.strip(), target_answer, acceptable_aliases)
        results.append({"team": team.strip(), **graded})

    accepted = sum(1 for r in results if r["verdict"] in ("ACCEPT", "ACCEPT_FUZZY"))
    review = sum(1 for r in results if r["verdict"] == "QM_REVIEW")
    return {
        "target_answer": target_answer,
        "total_submissions": len(results),
        "accepted_count": accepted,
        "qm_review_count": review,
        "pass_rate_pct": round((accepted / max(1, len(results))) * 100, 1) if results else 0.0,
        "results": results,
    }


async def expand_entity_aliases(target_answer: str) -> Dict[str, Any]:
    """Auto-expand acceptable quiz aliases from Wikidata Knowledge Graph + surname heuristics."""
    clean = (target_answer or "").strip()
    if not clean:
        return {"target_answer": "", "aliases": []}

    aliases: List[str] = []
    local = LOCAL_ENCYCLOPEDIC_KB.get(clean.lower())
    if local:
        aliases.extend(local.get("aliases", []))

    if truth_hub.is_network_available():
        import httpx
        async with httpx.AsyncClient(timeout=truth_hub.timeout_sec) as client:
            wd = await truth_hub.search_wikidata_entity(client, clean)
            if wd and wd.get("aliases"):
                aliases.extend(wd["aliases"])

    # Add distinguishing surname if multi-word person/entity name
    parts = [p for p in clean.split() if len(p) >= 5]
    if len(clean.split()) >= 2 and parts:
        aliases.append(parts[-1])

    # Deduplicate case-insensitively excluding exact target_answer
    seen = {clean.lower()}
    unique_aliases: List[str] = []
    for a in aliases:
        a_clean = str(a).strip()
        if a_clean and a_clean.lower() not in seen:
            seen.add(a_clean.lower())
            unique_aliases.append(a_clean)

    return {"target_answer": clean, "aliases": unique_aliases[:6]}
