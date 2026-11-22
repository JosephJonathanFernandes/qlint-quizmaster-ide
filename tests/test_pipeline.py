"""Automated Test Suite for Crucible / Q-Lint 4-Stage Pipeline."""
from __future__ import annotations

import asyncio
from tests.conftest import _SandboxSafeSelectorLoop
from backend.models import QuestionAnalyzeRequest, AutofixRequest, ConnectGenerateRequest
from backend.linter_pipeline import (
    PRESET_QUESTIONS,
    run_full_diagnostic_pipeline,
    autofix_question,
    generate_connect_round,
    run_academic_benchmark,
)
from backend.archive_engine import archive_engine


def _run(coro):
    return asyncio.run(coro, loop_factory=_SandboxSafeSelectorLoop)


def test_archive_disentangled_angle_deduplication():
    """Verify that the archive distinguishes 'same entity, reused angle' from 'same entity, fresh angle'."""
    rep_reused = archive_engine.check_deduplication(
        question_text="After a shipwreck in the Gulf of Spezia, Trelawny snatched a calcified heart from the pyre which X kept in her desk drawer wrapped in Adonais.",
        target_answer="Mary Shelley",
        extracted_funda="Mary Shelley kept Percy Shelley's calcified heart in her desk drawer",
    )
    assert rep_reused.entity_frequency_in_archive >= 3
    assert rep_reused.angle_collision_detected is True
    assert rep_reused.matches[0].verdict in ("EXACT_ANGLE_REUSE", "SIMILAR_FUNDA")

    rep_fresh = archive_engine.check_deduplication(
        question_text="While traveling along the Rhine in 1814, X passed near Darmstadt where alchemist Johann Konrad Dippel had experimented with animal oil and Nitroglycerin prototypes.",
        target_answer="Mary Shelley",
        extracted_funda="Johann Konrad Dippel alchemist at Castle Frankenstein on the Rhine trip",
    )
    assert rep_fresh.entity_frequency_in_archive >= 3
    assert rep_fresh.angle_collision_detected is False


def test_cook_detector_catches_villa_diodati_ambiguity():
    """Verify Stage 2 Adversarial Cook Detector flags John Polidori on under-constrained 1816 Villa Diodati draft."""
    preset = PRESET_QUESTIONS[1]  # preset_diodati_cook
    req = QuestionAnalyzeRequest(**preset)
    diag = _run(run_full_diagnostic_pipeline(req))
    assert any(
        "polidori" in c.entity_name.lower() and c.cook_validity_score >= 0.7
        for c in diag.uniqueness_googleability.cook_candidates
    )
    assert diag.uniqueness_googleability.uniqueness_score < 60


def test_urban_legend_myth_filter_catches_einstein_math_myth():
    """Verify Stage 3 Truth Verification flags the 'Einstein failed high-school math' myth."""
    preset = PRESET_QUESTIONS[2]  # preset_einstein_myth
    req = QuestionAnalyzeRequest(**preset)
    diag = _run(run_full_diagnostic_pipeline(req))
    assert any(
        c.verdict in ("APOCRYPHAL_MYTH", "CONTESTED")
        for c in diag.truth_verification.claims
    )
    assert diag.verdict_badge == "FACTUAL / MYTH HAZARD"


def test_autofix_and_connect_and_benchmark():
    """Verify One-Click Autofix, 2-Hop Connect Builder, and CSE Benchmark Suite."""
    fix_res = _run(
        autofix_question(
            AutofixRequest(
                question_text=PRESET_QUESTIONS[0]["question_text"],
                target_answer="Mary Shelley",
                fix_type="DE_GOOGLEIFY",
            )
        )
    )
    assert "Fantasmagoriana" not in fix_res.rewritten_text

    conn_res = _run(
        generate_connect_round(
            ConnectGenerateRequest(
                seed_entities=["Frankenstein", "The Vampyre", "Karl Drais"],
                theme_hint="1815 Mount Tambora Eruption",
            )
        )
    )
    assert len(conn_res.nodes) == 4

    bench = _run(run_academic_benchmark())
    assert bench["passed_cases"] == bench["total_cases"]
    assert bench["detection_accuracy_pct"] == 100.0


def test_fastapi_routes_and_config_status():
    """Verify FastAPI route handlers and Truth-Finding API directory."""
    from backend.main import (
        health_check,
        get_presets,
        list_archive,
        serve_spa,
    )

    health = _run(health_check())
    assert health["status"] == "ok"
    assert health["active_truth_api_count"] >= 7

    presets = _run(get_presets())
    assert len(presets["questions"]) == 5
    assert len(presets["connects"]) == 2

    arch = _run(list_archive(q="Mary Shelley"))
    assert arch["total"] >= 3

    spa_resp = _run(serve_spa())
    assert spa_resp.path.endswith("index.html")


def test_round_set_compiler_and_cross_spoiler_detector():
    """Verify Round Set Compiler, Cross-Question Spoiler Leak detection & HTML Slide Deck export."""
    from backend.set_manager import set_manager

    analysis = set_manager.analyze_set()
    assert analysis["total_questions"] >= 3
    assert isinstance(analysis["cross_question_spoilers"], list)

    # Inject a temporary question that spoils Q1's answer ("Stanley Kubrick")
    added = set_manager.add_question_to_set(
        {
            "set_name": "KQA Open Finals — Round 1",
            "question_text": "Unlike Stanley Kubrick, this director shot the entire film in a single continuous take.",
            "target_answer": "Alfred Hitchcock",
            "category": "Cinema",
        }
    )
    try:
        spoiled_analysis = set_manager.analyze_set()
        assert len(spoiled_analysis["cross_question_spoilers"]) >= 1
        assert "kubrick" in spoiled_analysis["cross_question_spoilers"][0]["matched_term"].lower()
    finally:
        set_manager.remove_question(added["id"])

    deck_html = set_manager.export_standalone_html_deck()
    assert "CRUCIBLE // STAGE DECK" in deck_html
    assert "Stanley Kubrick" in deck_html


def test_bulk_archive_importer_parses_raw_text():
    """Verify Bulk Archive Importer parses Q/Ans blocks into disentangled SQLite archive entries."""
    sample = (
        "Q1: In 1964, Arno Penzias and Robert Wilson blamed pigeon droppings inside the Holmdel Horn Antenna "
        "before discovering the thermal echo of the Big Bang. Identify X.\n"
        "Ans: Cosmic Microwave Background Radiation\n\n"
        "Q2: This ophthalmologist spent empty waiting-room hours on Devonshire Place writing detective fiction.\n"
        "Ans: Arthur Conan Doyle"
    )
    res = archive_engine.bulk_import_raw_text(
        raw_text=sample, tournament="Unit Test Open", year=2025, category="Science"
    )
    assert res["imported_count"] == 2
    assert any(i["target_answer"] == "Arthur Conan Doyle" for i in res["items"])


def test_funda_miner_ranks_fresh_angles_above_archive_overused():
    """Verify Funda Miner extracts 3 angles and ranks FRESH angles ahead of ARCHIVE_OVERUSED ones."""
    from backend.funda_miner import mine_quiz_angles

    res = _run(mine_quiz_angles("Mary Shelley", "KQA Open"))
    angles = res["mined_angles"]
    assert len(angles) == 3
    # Fresh angle (Castle Frankenstein / Dippel) must rank #1 ahead of overused Calcified Heart angle
    assert angles[0]["archive_freshness"] == "FRESH_ANGLE"
    assert any(a["archive_freshness"] == "ARCHIVE_OVERUSED" for a in angles)


def test_visual_clue_linter_catches_filename_and_exif_leaks():
    """Verify Module 5 Visual Linter detects both filename and binary EXIF/PNG metadata answer leaks."""
    import base64
    from backend.visual_linter import lint_visual_clue

    raw_bytes = b"\x89PNG\r\n\x1a\nEXIF_ARTIST:Mary Shelley Portrait Getty Images 1840"
    b64 = base64.b64encode(raw_bytes).decode("ascii")
    res = _run(
        lint_visual_clue(
            image_b64=b64,
            filename="mary_shelley_portrait.png",
            mime_type="image/png",
            target_answer="Mary Shelley",
        )
    )
    assert len(res["metadata_scan"]["filename_leaks"]) >= 1
    assert len(res["metadata_scan"]["metadata_leaks"]) >= 1
    assert "getty" in res["metadata_scan"]["detected_software_or_stock_tags"]
    assert res["visual_safety_score"] < 50


def test_batch_round_linting_and_markdown_audit_export():
    """Verify Batch Round Linting and Markdown Audit Report generation."""
    from backend.main import batch_lint_quiz_set, export_set_markdown_report

    batch_res = _run(batch_lint_quiz_set())
    assert batch_res["total_questions"] >= 3
    assert len(batch_res["batch_lint_results"]) == batch_res["total_questions"]

    report = _run(export_set_markdown_report())
    assert "Crucible // Q-Lint Audit Report" in report["markdown"]
    assert "| Q1 |" in report["markdown"]


def test_printable_prelims_and_multi_round_listing():
    """Verify Multi-Round Set listing and Printable Prelims PDF/Master Key HTML export."""
    from backend.main import list_quiz_sets, export_set_prelims

    sets_res = _run(list_quiz_sets())
    assert len(sets_res["sets"]) >= 1

    teams_paper = _run(export_set_prelims(answers=False))
    assert "WRITTEN PRELIMS QUESTION PAPER" in teams_paper.body.decode("utf-8")
    assert "★ TIE-BREAKER" in teams_paper.body.decode("utf-8")

    qm_key = _run(export_set_prelims(answers=True))
    assert "QUIZMASTER MASTER KEY" in qm_key.body.decode("utf-8")
    assert "Stanley Kubrick" in qm_key.body.decode("utf-8")


def test_fuzzy_prelims_grader_and_wikidata_alias_expander():
    """Verify Wikidata Auto-Alias Expansion and Fuzzy Written Prelims Sheet Grading."""
    from backend.answer_grader import expand_entity_aliases, batch_grade_prelims_answers

    alias_res = _run(expand_entity_aliases("Mary Shelley"))
    assert any("Mary Godwin" in a for a in alias_res["aliases"])

    sheet = (
        "Team A: Mary Shelley\n"
        "Team B: Mary Shelly\n"
        "Team C: Mary Godwin\n"
        "Team D: Bram Stoker"
    )
    graded = batch_grade_prelims_answers(
        target_answer="Mary Shelley",
        acceptable_aliases=alias_res["aliases"],
        submissions_text=sheet,
    )
    assert graded["total_submissions"] == 4
    assert graded["accepted_count"] == 3
    verdicts = {r["team"]: r["verdict"] for r in graded["results"]}
    assert verdicts["Team A"] == "ACCEPT"
    assert verdicts["Team B"] == "ACCEPT_FUZZY"
    assert verdicts["Team C"] == "ACCEPT"
    assert verdicts["Team D"] == "REJECT"


def test_multi_round_creation_and_persistence():
    """Verify creating a new named quiz round persists cleanly in SQLite."""
    from backend.main import create_quiz_round, list_quiz_sets

    created = _run(create_quiz_round({"set_name": "Written Prelims Set A"}))
    assert created["status"] == "created"

    sets_res = _run(list_quiz_sets())
    names = [s["set_name"] for s in sets_res["sets"]]
    assert "Written Prelims Set A" in names


def test_api_connection_ping_endpoint():
    """Verify live API connection diagnostics endpoint returns all 3 service checks."""
    from backend.main import test_api_connections

    res = _run(test_api_connections())
    assert len(res["checks"]) == 3
    services = [c["service"] for c in res["checks"]]
    assert any("Gemini" in s for s in services)
    assert any("Groq" in s for s in services)
    assert any("Truth Hub" in s for s in services)


def test_loco_stress_test_and_implicit_linguistic_leak_audit():
    """Verify Leave-One-Clue-Out (LOCO) Keystone Ablation and Implicit Linguistic Leak detection."""
    from backend.stress_tester import run_question_stress_test

    preset = PRESET_QUESTIONS[0]  # Mary Shelley (has 'her' gendered pronoun + 3 years + 3 clues)
    req = QuestionAnalyzeRequest(**preset)
    res = _run(run_question_stress_test(req))
    assert res["clue_count"] >= 2
    assert len(res["loco_ablation"]) >= 2
    assert res["linguistic_audit"]["implicit_leak_count"] >= 1
    leak_types = [l["type"] for l in res["linguistic_audit"]["leaks"]]
    assert "GENDER_PRONOUN_LEAK" in leak_types


def test_game_theoretic_pounce_ev_analysis():
    """Verify Game-Theoretic Pounce EV (+10/-5) breakeven analysis is attached to diagnostics."""
    preset = PRESET_QUESTIONS[3]  # Well-calibrated Stanley Kubrick question
    req = QuestionAnalyzeRequest(**preset)
    diag = _run(run_full_diagnostic_pipeline(req))
    ev = diag.style_critique.get("pounce_ev_analysis")
    assert ev is not None
    assert ev["breakeven_probability_pct"] == 33.3
    assert len(ev["step_evs"]) == len(diag.workability.ablation_steps)
    assert any(s["rational_to_pounce"] for s in ev["step_evs"])
    floor = ev["floor_crack_prediction"]
    assert floor["pounce_crack_pct"] + floor["bounce_crack_pct"] + floor["unanswered_pct"] == 100












