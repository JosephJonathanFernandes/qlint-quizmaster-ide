"""Emergency Stage 'Floor Rescue' 3-Rung Hint Ladder & Round Cultural/Era Diversity Auditor."""
from __future__ import annotations

import re
from typing import Dict, Any, List

from backend.llm_router import llm_router
from backend.truth_hub import LOCAL_ENCYCLOPEDIC_KB


def _word_mask_pattern(answer: str) -> str:
    """Build a classic quizmaster word-length mask, e.g. 'Mary Shelley' -> '2 words: [4] [7] (Initials: M. S.)'."""
    words = [w for w in re.split(r"\s+", (answer or "").strip()) if w]
    if not words:
        return "1 word"
    lengths = " ".join(f"[{len(re.sub(r'[^A-Za-z0-9]', '', w))}]" for w in words)
    initials = " ".join(f"{w[0].upper()}." for w in words if w)
    return f"{len(words)} word{'s' if len(words) != 1 else ''}: {lengths} (Initials: {initials})"


async def generate_floor_rescue_hints(
    question_text: str,
    target_answer: str,
    category: str = "General",
) -> Dict[str, Any]:
    """Generate a 3-Rung Emergency Stage Hint Ladder for rescuing a dead bounce live on stage."""
    clean_ans = (target_answer or "").strip()
    mask_str = _word_mask_pattern(clean_ans)

    sys_prompt = (
        "You are an experienced Competitive Quizmaster preparing 3 emergency progressive hints in case all 6 stage "
        "teams stall on Direct Bounce. NEVER say the target answer itself in any hint. "
        "Return strict JSON: "
        '{"rung_1_nudge": "Subtle era/geography/field nudge", '
        '"rung_2_bridge": "Famous parallel work, collaborator, or etymological clue", '
        '"rung_3_clincher": "High-probability sudden-death giveaway without naming the answer"}'
    )
    user_prompt = (
        f"Question: {question_text}\nTarget Answer (DO NOT REVEAL): {clean_ans}\nCategory: {category}"
    )
    llm_data, engine_used, _ = await llm_router.call_best_available_json(
        sys_prompt, user_prompt, prefer="groq", temperature=0.25
    )

    local = LOCAL_ENCYCLOPEDIC_KB.get(clean_ans.lower(), {})
    desc = local.get("description", f"a landmark subject in {category}")

    rung_1 = str(
        llm_data.get("rung_1_nudge")
        or f"Domain & Era Nudge: Think of {desc.split(';')[0]}."
    )
    rung_2 = str(
        llm_data.get("rung_2_bridge")
        or f"Structural Pattern Hint: Answer format is {mask_str}."
    )
    rung_3 = str(
        llm_data.get("rung_3_clincher")
        or (
            f"Final Bounce Rescue: Combine the opening historical anchor with {mask_str}"
            + (f" (also linked to {local['aliases'][0]})." if local.get("aliases") else ".")
        )
    )

    return {
        "target_answer": clean_ans,
        "answer_pattern": mask_str,
        "engine_used": engine_used,
        "rungs": [
            {"rung": 1, "label": "Rung 1 — Subtle Domain Nudge", "hint": rung_1},
            {"rung": 2, "label": "Rung 2 — Structural / Initials Bridge", "hint": rung_2},
            {"rung": 3, "label": "Rung 3 — Sudden-Death Clincher", "hint": rung_3},
        ],
    }


def audit_cultural_and_era_diversity(questions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Classify round questions across Geographic/Cultural Regions and Historical Eras."""
    if not questions:
        return {
            "diversity_score": 0,
            "regions": {},
            "eras": {},
            "advisory": "Add questions to audit geographic and temporal diversity.",
        }

    region_keywords = {
        "South Asia / India": ["india", "indian", "bengal", "bengali", "ramanujan", "satyajit", "madras", "kolkata", "delhi", "sanskrit", "raga", "kesarbai"],
        "East Asia": ["japan", "japanese", "china", "chinese", "shogun", "kintsugi", "urushi", "celadon", "korea"],
        "Europe": ["british", "england", "london", "france", "french", "swiss", "switzerland", "geneva", "germany", "german", "spain", "huelva", "zeiss", "trinity"],
        "Americas": ["american", "nasa", "apollo", "hollywood", "new jersey", "argentina", "buenos aires", "kubrick"],
    }

    regions: Dict[str, int] = {}
    eras: Dict[str, int] = {}

    for q in questions:
        blob = f"{q.get('question_text', '')} {q.get('target_answer', '')} {q.get('category', '')}".lower()

        matched_reg = "Global / Multinational"
        for reg_name, kws in region_keywords.items():
            if any(k in blob for k in kws):
                matched_reg = reg_name
                break
        regions[matched_reg] = regions.get(matched_reg, 0) + 1

        years = [int(y) for y in re.findall(r"\b(1[4-9]\d\d|20[0-2]\d)\b", blob)]
        if any(k in blob for k in ("15th century", "ancient", "bc", "solstice", "shogun")) or (years and min(years) < 1800):
            era = "Pre-1800 / Classical"
        elif years and min(years) < 1900:
            era = "19th Century"
        elif years and max(years) >= 2000:
            era = "21st Century"
        else:
            era = "20th Century"
        eras[era] = eras.get(era, 0) + 1

    unique_regions = len(regions)
    unique_eras = len(eras)
    max_reg_share = max(regions.values()) / len(questions)

    score = min(98, 55 + unique_regions * 11 + unique_eras * 8 - (15 if max_reg_share > 0.65 and len(questions) >= 3 else 0))

    if max_reg_share > 0.65 and len(questions) >= 3:
        dom_reg = max(regions, key=regions.get)
        advisory = f"Geographic Skew Notice: {int(round(max_reg_share * 100))}% of questions anchor on {dom_reg}. Consider adding South Asian, East Asian, or Classical global angles."
    else:
        advisory = f"Healthy Cultural & Temporal Spread across {unique_regions} region(s) and {unique_eras} historical era(s)."

    return {
        "diversity_score": max(25, score),
        "regions": regions,
        "eras": eras,
        "advisory": advisory,
    }
