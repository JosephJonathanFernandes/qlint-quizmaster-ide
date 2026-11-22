"""Funda Miner & Style-Calibrated Quiz Question Co-Setter.

Takes any topic, entity, or Wikipedia subject:
1. Queries the Federated Truth Hub (Wikipedia REST, Wikidata KG, OpenAlex, OpenLibrary).
2. Checks the SQLite Quiz Archive to flag overused angles vs. genuinely fresh fundae.
3. Uses Dual-Engine LLM (Gemini / Groq) + Truth-Grounded fallback to extract 3 ranked
   quiz-worthy angles and synthesize style-calibrated 3-clue drafts ready for Q-Lint.
"""
from __future__ import annotations

import re
from typing import List, Dict, Any

from backend.truth_hub import truth_hub
from backend.archive_engine import archive_engine, compute_angle_similarity
from backend.llm_router import llm_router


STYLE_GUIDES: Dict[str, str] = {
    "KQA Open": "Narrative 3-sentence deductive funnel: historical/contextual hook -> lateral bridge clue -> crisp 'Identify X' clincher. Zero verbatim Wikipedia phrasing.",
    "BQC Bounce/Pounce": "High-craft pounce-calibrated clue chain where Clue 1 sets up an oblique domain, Clue 2 gives a sharp lateral 'funda' for pouncers, and Clue 3 confirms for bounce.",
    "Tata Crucible Biz": "Corporate/brand/innovation trivia angle linking an unexpected origin story, patent, or leadership anecdote to a business entity or pioneer.",
    "Campus Fest General": "Punchy, pop-culture-friendly deductive question with accessible lateral anchors and rewarding 'aha!' payoff.",
}

CURATED_MINED_ANGLES: Dict[str, List[Dict[str, Any]]] = {
    "alan turing": [
        {
            "angle_title": "Turochamp — The 1948 Paper-Executed Chess Algorithm",
            "hook_summary": "Turing wrote a chess-playing algorithm in 1948 that no computer could run yet, so he acted as the CPU himself—taking 30 minutes per move on paper against colleague Alick Glennie.",
            "workability_potential": 94,
            "draft_question": (
                "In 1948, before any electronic machine had enough memory to compile his code, X co-wrote a two-ply "
                "chess program nicknamed 'Turochamp' with David Champernowne. To play a recorded 1952 match against "
                "colleague Alick Glennie, X acted as the human CPU himself—manually executing each evaluation step "
                "with pencil and paper at roughly thirty minutes per move. Identify X."
            ),
            "target_answer": "Alan Turing",
        },
        {
            "angle_title": "2h 46m Marathoner — Nearly Qualified for the 1948 London Olympics",
            "hook_summary": "Turing ran 40 miles to meetings in London and clocked 2 hours 46 minutes in the 1947 AAA Marathon—just 11 minutes behind the 1948 Olympic silver medalist.",
            "workability_potential": 91,
            "draft_question": (
                "Known for running forty miles from Bletchley to London for wartime committee meetings, this British "
                "polymath finished fifth in the 1947 Amateur Athletic Association Marathon in 2 hours 46 minutes—just "
                "eleven minutes off the silver-medal pace at the 1948 London Olympics. Only a leg injury prevented him "
                "from trying out for Team GB while he was simultaneously designing the ACE computer. Identify X."
            ),
            "target_answer": "Alan Turing",
        },
        {
            "angle_title": "Buried Silver Ingots & Forgotten Bletchley Cipher (Archive Overlap Warning)",
            "hook_summary": "Converted his WWII savings into two silver bars buried in Bletchley woods, then forgot his own cipher and never recovered them.",
            "workability_potential": 86,
            "draft_question": (
                "Fearing a German invasion in 1940, X converted his savings into two silver ingots and buried them in "
                "Buckinghamshire woods, encoding the hiding spot in a cipher so convoluted he could never relocate "
                "the treasure even with a homemade metal detector after the war. Identify X."
            ),
            "target_answer": "Alan Turing",
        },
    ],
    "ada lovelace": [
        {
            "angle_title": "The 1843 Jacquard Loom Analogy & 'Poetical Science'",
            "hook_summary": "Coined the phrase 'poetical science' and predicted machines could compose complex music and manipulate symbols beyond pure arithmetic.",
            "workability_potential": 93,
            "draft_question": (
                "Describing her analytical approach as 'poetical science', this 19th-century mathematician argued that "
                "a mechanical engine could act upon anything expressible by formal rules—even composing elaborate "
                "pieces of music of any degree of complexity. She famously wrote that the Analytical Engine 'weaves "
                "algebraical patterns just as the Jacquard loom weaves flowers and leaves.' Identify X."
            ),
            "target_answer": "Ada Lovelace",
        },
        {
            "angle_title": "Childhood 'Flyology' Treatise (1828 Steam-Powered Flying Horse)",
            "hook_summary": "At age 12, Ada studied bird anatomy and illustrated a guide called 'Flyology' proposing a steam-powered mechanical flying horse.",
            "workability_potential": 92,
            "draft_question": (
                "In 1828, at age twelve, this aristocrat dissected bird wing proportions and compiled an illustrated "
                "notebook titled 'Flyology', proposing a steam-powered mechanical horse equipped with silk wings to "
                "carry a passenger across England. Fifteen years later, her annotated translation of Luigi Menabrea's "
                "lecture would earn her lasting fame in computing history. Identify X."
            ),
            "target_answer": "Ada Lovelace",
        },
        {
            "angle_title": "Note G Bernoulli Numbers Algorithm (Archive Overlap Warning)",
            "hook_summary": "Appended seven Notes to Luigi Menabrea's French lecture on Babbage's Analytical Engine, including Note G for Bernoulli numbers.",
            "workability_potential": 85,
            "draft_question": (
                "In 1843, X translated an Italian military engineer's French lecture on Charles Babbage's Analytical "
                "Engine and appended seven lengthy notes—the final one ('Note G') detailing a step-by-step table to "
                "compute Bernoulli numbers. Identify X."
            ),
            "target_answer": "Ada Lovelace",
        },
    ],
    "mary shelley": [
        {
            "angle_title": "Castle Frankenstein & Alchemist Johann Konrad Dippel (1814 Rhine Journey)",
            "hook_summary": "Passing near Darmstadt in 1814, Mary learned of Castle Frankenstein and eccentric alchemist Johann Konrad Dippel's 'Dippel's Oil' elixir of life.",
            "workability_potential": 94,
            "draft_question": (
                "During an 1814 boat journey down the Rhine, teenager X stopped near Darmstadt—a few miles from a "
                "hilltop fortress where 17th-century alchemist Johann Konrad Dippel had distilled an animal-bone "
                "elixir of life and rumouredly experimented with cadavers. Four years later, the castle's name "
                "became immortalized on the title page of X's debut novel. Identify X."
            ),
            "target_answer": "Mary Shelley",
        },
        {
            "angle_title": "The Sibylline Leaves & 1826 Plague Novel 'The Last Man'",
            "hook_summary": "Framed her 21st-century pandemic novel The Last Man (1826) as prophetic leaves found in the Cave of the Cumaean Sibyl near Naples.",
            "workability_potential": 90,
            "draft_question": (
                "Long before modern dystopian fiction, X published an 1826 novel set in the late 21st century in "
                "which a global plague wipes out humanity, framing the narrative as prophetic Sibylline leaves "
                "unearthed inside a cavern near Naples. Identify X, better known for an 1818 gothic masterpiece."
            ),
            "target_answer": "Mary Shelley",
        },
        {
            "angle_title": "Percy Shelley's Calcified Organ in Desk Drawer (Archive Overlap Warning)",
            "hook_summary": "Kept the unburned organ snatched by Trelawny from the 1822 Viareggio pyre wrapped in silk pages of Adonais.",
            "workability_potential": 82,
            "draft_question": (
                "After an 1822 shipwreck in the Gulf of Spezia, Edward Trelawny snatched a calcified organ from the "
                "beach pyre, which X kept wrapped in silk pages of Adonais inside her desk drawer until 1851. Identify X."
            ),
            "target_answer": "Mary Shelley",
        },
    ],
}


async def mine_quiz_angles(topic: str, quiz_style: str = "KQA Open") -> Dict[str, Any]:
    """Mine 3 ranked quiz-worthy angles for a topic, tagged with Archive Freshness and calibrated drafts."""
    clean_topic = topic.strip()
    evidence, apis_invoked, wikidata_meta, truth_ms = await truth_hub.federated_verify_query(
        query="notable anecdotes trivia origin history",
        target_answer=clean_topic,
    )

    # Check existing archive entries for this topic so we can flag overused angles
    existing_archive = archive_engine.list_questions(search_query=clean_topic)
    archive_angles = [
        f"{item['tournament']} ({item['year']}): {item['canonical_funda']}"
        for item in existing_archive[:5]
    ]

    style_desc = STYLE_GUIDES.get(quiz_style, STYLE_GUIDES["KQA Open"])
    evidence_blob = "\n".join(
        f"[{e.api_name}] {e.title}: {e.snippet}" for e in evidence[:8]
    )

    sys_prompt = (
        f"You are a Master Competitive Quiz Setter ({quiz_style}). "
        f"Style Guide: {style_desc} "
        "Given a target entity/topic, multi-API grounding evidence, and angles ALREADY overused in the quiz archive, "
        "mine 3 distinct, non-obvious, workable quiz angles ('fundae') ranked from freshest/best to most conventional. "
        "For each angle, write a ready-to-lint 3-sentence deductive question using X for the target answer (NEVER reveal the answer in the question). "
        "Return strict JSON: "
        '{"angles": [{"angle_title": "string", "hook_summary": "string", '
        '"workability_potential": 80_to_98, "draft_question": "string", "target_answer": "string"}]}'
    )
    user_prompt = (
        f"Target Topic / Entity: {clean_topic}\n"
        f"Target Circuit Style: {quiz_style}\n"
        f"Already Used in Archive (AVOID repeating these if possible):\n{archive_angles or 'None'}\n\n"
        f"Federated Truth Hub Grounding:\n{evidence_blob or 'Use verified historical/encyclopedic knowledge.'}"
    )

    llm_data, engine_used, llm_lat = await llm_router.call_best_available_json(
        sys_prompt, user_prompt, prefer="gemini", temperature=0.4
    )

    raw_angles = llm_data.get("angles", []) if isinstance(llm_data, dict) else []

    if not raw_angles:
        # Check curated rich angle bank or synthesize directly from live Truth Hub evidence
        curated = CURATED_MINED_ANGLES.get(clean_topic.lower())
        if curated:
            raw_angles = curated
        else:
            wp_snip = evidence[0].snippet if evidence else f"{clean_topic} is a notable subject in {quiz_style} quizzing."
            wd_desc = wikidata_meta.get("description", "canonical historical or cultural entity")
            raw_angles = [
                {
                    "angle_title": f"Lateral Origin & Context Angle on {clean_topic}",
                    "hook_summary": f"Anchors {clean_topic} ({wd_desc}) via its defining historical context without verbatim name leakage.",
                    "workability_potential": 88,
                    "draft_question": (
                        f"Recognized in archival records as {wd_desc}, X's trajectory was shaped by an unexpected "
                        f"turning point documented across historical registries. {re.sub(re.escape(clean_topic), 'X', wp_snip[:200], flags=re.IGNORECASE)}. "
                        f"Identify X."
                    ),
                    "target_answer": clean_topic,
                },
                {
                    "angle_title": f"2-Hop Structural / Etymological Parallel for {clean_topic}",
                    "hook_summary": f"Connects {clean_topic}'s lesser-known secondary work or cultural footprint to a confirming clincher.",
                    "workability_potential": 85,
                    "draft_question": (
                        f"Before achieving widespread recognition as {wd_desc}, X left an intriguing footprint in "
                        f"contemporary records that quizmasters often overlook in favour of textbook summaries. "
                        f"Linking this lesser-known chapter with its defining legacy, identify X."
                    ),
                    "target_answer": clean_topic,
                },
            ]

    # Score every mined angle against the SQLite Archive to tag FRESH vs OVERUSED!
    enriched_angles: List[Dict[str, Any]] = []
    source_urls = [e.url for e in evidence[:3] if e.url]

    for idx, a in enumerate(raw_angles[:3]):
        draft_q = str(a.get("draft_question", "")).strip()
        ans = str(a.get("target_answer", clean_topic)).strip()
        dedup = archive_engine.check_deduplication(
            question_text=draft_q,
            target_answer=ans,
            extracted_funda=f"{a.get('angle_title', '')} {a.get('hook_summary', '')}",
        )
        max_sim = max((m.angle_similarity for m in dedup.matches), default=0.0)
        is_overused = dedup.angle_collision_detected
        enriched_angles.append(
            {
                "rank": idx + 1,
                "angle_title": str(a.get("angle_title", f"Angle #{idx + 1}")),
                "hook_summary": str(a.get("hook_summary", "")),
                "workability_potential": int(a.get("workability_potential", 88)),
                "archive_freshness": "ARCHIVE_OVERUSED" if is_overused else "FRESH_ANGLE",
                "archive_overlap_pct": int(round(max_sim * 100)),
                "draft_question": draft_q,
                "target_answer": ans,
                "quiz_style": quiz_style,
                "source_urls": source_urls,
            }
        )

    # Sort so FRESH angles rank above OVERUSED angles!
    enriched_angles.sort(
        key=lambda x: (0 if x["archive_freshness"] == "FRESH_ANGLE" else 1, -x["workability_potential"])
    )
    for i, item in enumerate(enriched_angles, start=1):
        item["rank"] = i

    return {
        "topic": clean_topic,
        "quiz_style": quiz_style,
        "engine_used": engine_used,
        "truth_hub_latency_ms": truth_ms,
        "llm_latency_ms": llm_lat,
        "apis_consulted": apis_invoked,
        "wikidata_entity": wikidata_meta,
        "existing_archive_count": len(existing_archive),
        "mined_angles": enriched_angles,
    }
