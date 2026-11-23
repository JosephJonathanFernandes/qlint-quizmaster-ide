"""List-It / Bidding Round Verifier & Alias Builder for Competitive Quizzing.

Validates finite-list quiz questions (classic KQA/BQC/Nihilanth List-It format):
- Checks list cardinality, duplicate items, and disputed boundary warnings
- Generates acceptable aliases per item via the Answer Grader / Wikidata KG
- Computes optimal Bidding Par (how many items a sharp team should bid in a List-It auction)
"""
from __future__ import annotations

import asyncio
from typing import List, Dict, Any

from backend.answer_grader import expand_entity_aliases
from backend.llm_router import llm_router

LIST_IT_PRESETS: List[Dict[str, Any]] = [
    {
        "title": "People Who Have Won Two Nobel Prizes",
        "prompt": "Name the individuals who have been awarded the Nobel Prize twice (in any combination of categories).",
        "items": [
            "Marie Curie",
            "Linus Pauling",
            "John Bardeen",
            "Frederick Sanger",
            "Karl Barry Sharpless",
        ],
        "edge_case_note": "Strictly specify 'individuals' (excluding organizations like ICRC [3x] and UNHCR [2x]). Note that Karl Barry Sharpless joined this list in 2022!",
    },
    {
        "title": "Seven Sovereign Countries Ending in '-stan'",
        "prompt": "Name all seven UN-recognized sovereign states whose English names end with the Persian suffix '-stan'.",
        "items": [
            "Afghanistan",
            "Kazakhstan",
            "Kyrgyzstan",
            "Pakistan",
            "Tajikistan",
            "Turkmenistan",
            "Uzbekistan",
        ],
        "edge_case_note": "Clarify 'UN-recognized sovereign states' so teams don't argue sub-national regions like Kurdistan, Balochistan, or Tatarstan.",
    },
]


async def verify_list_it_round(
    prompt: str, items: List[str], quiz_style: str = "KQA Open List-It"
) -> Dict[str, Any]:
    """Verify a List-It / Bidding question's cardinality, edge cases, aliases, and optimal bidding par."""
    clean_items = [i.strip() for i in items if i.strip()]
    # Deduplicate while tracking duplicates
    seen = set()
    duplicates: List[str] = []
    unique_items: List[str] = []
    for it in clean_items:
        low = it.lower()
        if low in seen:
            duplicates.append(it)
        else:
            seen.add(low)
            unique_items.append(it)

    # Expand aliases for each item in parallel
    alias_results = await asyncio.gather(
        *[expand_entity_aliases(it) for it in unique_items[:12]]
    )
    verified_entries = [
        {
            "index": idx + 1,
            "canonical_item": it,
            "acceptable_aliases": res.get("aliases", []),
        }
        for idx, (it, res) in enumerate(zip(unique_items[:12], alias_results))
    ]

    # Check LLM or deterministic boundary warnings
    sys_prompt = (
        "You are a Competitive Quiz List-It Round Arbitrator (KQA / BQC / Nihilanth). "
        "Check if the setter's finite list prompt has any disputed boundary cases, missing recent entries, "
        "or ambiguous wording that teams could argue on stage. "
        'Return strict JSON: {"boundary_warnings": ["string"], "disambiguation_clause": "string"}'
    )
    user_prompt = f"List-It Prompt: {prompt}\nSetter's Answer Key ({len(unique_items)} items): {unique_items}"
    llm_data, engine_used, _ = await llm_router.call_best_available_json(
        sys_prompt, user_prompt, prefer="groq", temperature=0.2
    )

    warnings: List[str] = []
    if duplicates:
        warnings.append(f"Duplicate item(s) detected in answer key: {', '.join(duplicates)}.")
    if len(unique_items) < 4:
        warnings.append("List has fewer than 4 items — too short for a competitive Bidding / List-It auction (aim for 5–10 items).")

    # Match curated boundary notes
    p_low = prompt.lower()
    for pr in LIST_IT_PRESETS:
        if any(k in p_low for k in ("nobel", "twice")) and "nobel" in pr["title"].lower():
            warnings.append(pr["edge_case_note"])
        elif "-stan" in p_low and "-stan" in pr["title"].lower():
            warnings.append(pr["edge_case_note"])

    if llm_data.get("boundary_warnings"):
        for w in llm_data["boundary_warnings"][:3]:
            if str(w) not in warnings:
                warnings.append(str(w))

    disambig = llm_data.get("disambiguation_clause") or (
        "State exact qualifying scope (e.g., 'as of 2026', 'UN-recognized sovereign states', or 'individuals only') in the prompt."
    )

    # Optimal Bidding Par (~65% of list cardinality for Finals)
    bidding_par = max(2, int(round(len(unique_items) * 0.65)))
    safety_score = max(35, 96 - len(duplicates) * 18 - (15 if len(unique_items) < 4 else 0))

    return {
        "prompt": prompt,
        "quiz_style": quiz_style,
        "cardinality": len(unique_items),
        "recommended_bidding_par": f"{bidding_par} / {len(unique_items)} items",
        "list_safety_score": safety_score,
        "duplicates_found": duplicates,
        "boundary_warnings": warnings or ["List cardinality and scope look crisp for live Bidding play."],
        "disambiguation_clause": disambig,
        "verified_items": verified_entries,
        "engine_used": engine_used,
    }
