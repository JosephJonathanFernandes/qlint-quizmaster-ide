"""Pydantic Data Models for Crucible / Q-Lint."""
from __future__ import annotations

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class QuestionAnalyzeRequest(BaseModel):
    question_text: str = Field(..., description="Draft quiz question text")
    target_answer: str = Field(..., description="Expected canonical answer")
    acceptable_aliases: List[str] = Field(
        default_factory=list, description="Alternate acceptable answers"
    )
    quiz_style: str = Field(
        default="KQA Open",
        description="Target quiz style (KQA Open, BQC Bounce/Pounce, Campus Fest, Tata Crucible Biz, Connect Round)",
    )
    play_mode: str = Field(
        default="Pounce + Bounce",
        description="Play mode (Pounce + Bounce, Direct Written, Buzz-In)",
    )
    category: str = Field(default="General", description="Question domain/category")
    setter_notes: str = Field(default="", description="Optional setter background notes")


class ClueSegment(BaseModel):
    clue_id: str
    index: int
    text: str
    role: str = Field(
        description="E.g. Lead-In Hook, Lateral Funda, Narrowing Constraint, Confirming Giveaway"
    )
    singleton_giveaway_risk: float = Field(
        default=0.0, description="0.0 to 1.0 probability this single clue gives away the answer"
    )


class SolverPersonaGuess(BaseModel):
    provider: str = Field(description="e.g. 'Gemini 2.5 Flash' or 'Groq Llama-3.3-70B'")
    persona: str = Field(description="e.g. 'Veteran Circuit Quizzer' or 'Lateral Generalist'")
    top_guess: str
    candidates: List[str] = Field(default_factory=list)
    confidence: float = Field(description="0.0 to 1.0")
    matched_target: bool
    reasoning: str
    latency_ms: float = 0.0


class AblationStep(BaseModel):
    step_index: int
    clues_included: List[str]
    combined_text: str
    shannon_entropy_bits: float = Field(
        description="Estimated entropy H(A | clues) in bits (4.32 bits = ~20 equally likely candidates, 0.2 bits = near certainty)"
    )
    info_gain_bits: float = Field(
        description="Entropy reduction contributed by adding this clue"
    )
    consensus_confidence: float
    target_cracked: bool
    clue_verdict: str = Field(
        description="OPTIMAL_NARROWING | PREMATURE_GIVEAWAY | DEAD_WEIGHT | FINAL_LOCK | UNRESOLVED"
    )
    solver_guesses: List[SolverPersonaGuess]


class WorkabilityReport(BaseModel):
    workability_score: int = Field(description="0 to 100")
    difficulty_tier: str = Field(
        description="Campus Prelims | Open Finals | KQA Hard | Unworkable / Obscure | Trivial Giveaway"
    )
    pounce_calibration: str
    clues: List[ClueSegment]
    ablation_steps: List[AblationStep]
    funnel_diagnosis: str
    recommendations: List[str]


class SearchLeakProbe(BaseModel):
    extracted_clause: str
    search_query: str
    source_api: str
    leaked_in_top_results: bool
    matched_snippet: str = ""
    source_url: str = ""
    severity: str = Field(description="HIGH_LEAK | MODERATE_LEAK | SAFE")
    oblique_rewrite_suggestion: str = ""


class ExtractedConstraint(BaseModel):
    dimension: str
    requirement: str
    strictness: str = "REQUIRED"


class CookCandidate(BaseModel):
    entity_name: str
    wikidata_id: Optional[str] = None
    matching_constraints: List[str]
    breaking_constraint: Optional[str] = None
    cook_validity_score: float = Field(description="0.0 to 1.0 risk that a team can argue this answer")
    explanation: str
    discovered_by: str = Field(description="Groq Adversarial Solver | Gemini Cook Finder | Wikidata Graph")


class UniquenessAndGoogleabilityReport(BaseModel):
    google_resistance_score: int = Field(description="0 to 100 (100 = completely search-resistant)")
    uniqueness_score: int = Field(description="0 to 100 (100 = zero cook risk)")
    single_hop_leaks: List[SearchLeakProbe]
    extracted_constraints: List[ExtractedConstraint]
    cook_candidates: List[CookCandidate]
    disambiguation_patch: Optional[str] = None


class TruthEvidenceItem(BaseModel):
    api_id: str
    api_name: str
    title: str
    snippet: str
    url: str
    relevance_score: float = 0.85


class FactClaimVerification(BaseModel):
    claim_id: str
    claim_text: str
    source_span: str
    verdict: str = Field(
        description="VERIFIED | APOCRYPHAL_MYTH | CONTESTED | CONTRADICTED | UNVERIFIED"
    )
    confidence: float
    explanation: str
    myth_warning: Optional[str] = None
    apis_consulted: List[str]
    evidence: List[TruthEvidenceItem]


class TruthVerificationReport(BaseModel):
    factual_integrity_score: int = Field(description="0 to 100")
    apis_queried_count: int
    total_evidence_snippets: int
    claims: List[FactClaimVerification]
    entity_metadata: Dict[str, Any] = Field(default_factory=dict)


class ArchiveMatch(BaseModel):
    id: str
    tournament: str
    year: int
    category: str
    target_answer: str
    question_excerpt: str
    canonical_funda: str
    entity_match: bool
    angle_similarity: float = Field(description="0.0 to 1.0 similarity of the specific funda/angle")
    lexical_overlap: float
    verdict: str = Field(
        description="EXACT_ANGLE_REUSE | SIMILAR_FUNDA | SAME_ENTITY_FRESH_ANGLE | DISTINCT"
    )


class ArchiveDeduplicationReport(BaseModel):
    originality_score: int = Field(description="0 to 100")
    canonical_funda_extracted: str
    entity_frequency_in_archive: int
    angle_collision_detected: bool
    matches: List[ArchiveMatch]
    fresh_angle_suggestions: List[str] = Field(default_factory=list)


class InlineSpanHighlight(BaseModel):
    text: str
    category: str = Field(
        description="GOOGLE_LEAK | VERIFIED_FACT | MYTH_WARNING | GIVEAWAY_CLUE | LATERAL_FUNDA"
    )
    tooltip: str


class EngineTelemetry(BaseModel):
    mode: str
    gemini_used: bool
    groq_used: bool
    gemini_latency_ms: float
    groq_latency_ms: float
    truth_hub_latency_ms: float
    total_pipeline_ms: float
    apis_invoked: List[str]


class QuestionDiagnosticResponse(BaseModel):
    overall_quality_score: int
    verdict_badge: str
    executive_summary: str
    canonical_funda: str
    workability: WorkabilityReport
    uniqueness_googleability: UniquenessAndGoogleabilityReport
    truth_verification: TruthVerificationReport
    archive_dedup: ArchiveDeduplicationReport
    inline_highlights: List[InlineSpanHighlight]
    style_critique: Dict[str, Any]
    telemetry: EngineTelemetry


class AutofixRequest(BaseModel):
    question_text: str
    target_answer: str
    quiz_style: str = "KQA Open"
    fix_type: str = Field(
        description="DE_GOOGLEIFY | BLOCK_COOK | FIX_MYTH | CALIBRATE_FUNNEL | FULL_POLISH"
    )
    diagnostic_context: Dict[str, Any] = Field(default_factory=dict)


class AutofixResponse(BaseModel):
    original_text: str
    rewritten_text: str
    changes_made: List[str]
    engine_used: str


class ConnectGenerateRequest(BaseModel):
    seed_entities: List[str] = Field(
        default_factory=list, description="2 to 4 entities or answers to connect"
    )
    theme_hint: str = Field(
        default="", description="Optional theme or domain hint"
    )
    quiz_style: str = Field(default="KQA Open Connect")


class ConnectElementNode(BaseModel):
    label: str
    entity: str
    wikidata_id: Optional[str] = None
    clue_text: str
    connection_rationale: str
    verified_source_url: str = ""
    verified_by_api: str = "Wikipedia / Wikidata"


class ConnectGenerateResponse(BaseModel):
    connect_title: str
    hidden_connection_funda: str
    structural_link_type: str
    nodes: List[ConnectElementNode]
    synthesized_question: str
    target_answer: str
    engine_used: str
    graph_evidence: List[Dict[str, Any]] = Field(default_factory=list)
