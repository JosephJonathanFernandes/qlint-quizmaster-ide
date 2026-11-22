"""FastAPI Entrypoint for Crucible / Q-Lint: The Competitive Quizmaster IDE & Linter."""
from __future__ import annotations

from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.config import config
from backend.models import (
    QuestionAnalyzeRequest,
    QuestionDiagnosticResponse,
    AutofixRequest,
    AutofixResponse,
    ConnectGenerateRequest,
    ConnectGenerateResponse,
)
from backend.linter_pipeline import (
    PRESET_QUESTIONS,
    CONNECT_PRESETS,
    run_full_diagnostic_pipeline,
    autofix_question,
    generate_connect_round,
    run_academic_benchmark,
)
from backend.archive_engine import archive_engine
from backend.set_manager import set_manager
from backend.funda_miner import mine_quiz_angles

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app = FastAPI(
    title="Crucible (Q-Lint) — Competitive Quizmaster Diagnostic IDE",
    description=(
        "Dual-Engine (Groq LPU + Google Gemini) & 9-API Federated Truth-Finding Quality Control "
        "Workbench for Competitive Quiz Setters."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class KeyUpdatePayload(BaseModel):
    gemini_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    tavily_api_key: Optional[str] = None
    serper_api_key: Optional[str] = None
    gemini_model: Optional[str] = None
    groq_model_primary: Optional[str] = None


@app.get("/api/health")
async def health_check() -> Dict[str, Any]:
    return {"status": "ok", "service": "Crucible / Q-Lint", **config.get_status()}


@app.get("/api/config/status")
async def get_config_status() -> Dict[str, Any]:
    return config.get_status()


@app.post("/api/config/keys")
async def update_api_keys(payload: KeyUpdatePayload) -> Dict[str, Any]:
    return config.update_keys(
        gemini_api_key=payload.gemini_api_key,
        groq_api_key=payload.groq_api_key,
        tavily_api_key=payload.tavily_api_key,
        serper_api_key=payload.serper_api_key,
        gemini_model=payload.gemini_model,
        groq_model_primary=payload.groq_model_primary,
    )


@app.get("/api/presets")
async def get_presets() -> Dict[str, Any]:
    return {
        "questions": PRESET_QUESTIONS,
        "connects": CONNECT_PRESETS,
    }


@app.post("/api/analyze", response_model=QuestionDiagnosticResponse)
async def analyze_question(req: QuestionAnalyzeRequest) -> QuestionDiagnosticResponse:
    return await run_full_diagnostic_pipeline(req)


@app.post("/api/autofix", response_model=AutofixResponse)
async def autofix_draft(req: AutofixRequest) -> AutofixResponse:
    return await autofix_question(req)


@app.post("/api/connect/generate", response_model=ConnectGenerateResponse)
async def generate_connect(req: ConnectGenerateRequest) -> ConnectGenerateResponse:
    return await generate_connect_round(req)


@app.post("/api/mine-fundae")
async def mine_fundae_endpoint(payload: Dict[str, Any]) -> Dict[str, Any]:
    return await mine_quiz_angles(
        topic=str(payload.get("topic", "Alan Turing")),
        quiz_style=str(payload.get("quiz_style", "KQA Open")),
    )


@app.get("/api/archive")
async def list_archive(q: str = "", category: str = "") -> Dict[str, Any]:
    items = archive_engine.list_questions(search_query=q, category=category)
    return {"total": len(items), "items": items}


@app.post("/api/archive")
async def add_archive_question(payload: Dict[str, Any]) -> Dict[str, Any]:
    created = archive_engine.add_question(payload)
    return {"status": "added", "item": created}


@app.post("/api/archive/bulk-import")
async def bulk_import_archive(payload: Dict[str, Any]) -> Dict[str, Any]:
    return archive_engine.bulk_import_raw_text(
        raw_text=str(payload.get("raw_text", "")),
        tournament=str(payload.get("tournament", "Imported Quiz Set")),
        year=int(payload.get("year", 2025)),
        category=str(payload.get("category", "General")),
    )


@app.post("/api/benchmark/run")
async def execute_benchmark() -> Dict[str, Any]:
    return await run_academic_benchmark()


@app.get("/api/sets")
async def get_quiz_set(set_name: str = "KQA Open Finals — Round 1") -> Dict[str, Any]:
    return set_manager.analyze_set(set_name=set_name)


@app.post("/api/sets/questions")
async def add_to_quiz_set(payload: Dict[str, Any]) -> Dict[str, Any]:
    created = set_manager.add_question_to_set(payload)
    return {"status": "added", **created}


@app.delete("/api/sets/questions/{item_id}")
async def delete_from_quiz_set(item_id: int) -> Dict[str, Any]:
    ok = set_manager.remove_question(item_id)
    return {"status": "deleted" if ok else "not_found", "id": item_id}


@app.get("/api/sets/export/slides", response_class=HTMLResponse)
async def export_set_slides(set_name: str = "KQA Open Finals — Round 1"):
    html_deck = set_manager.export_standalone_html_deck(set_name=set_name)
    return HTMLResponse(content=html_deck)


if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
async def serve_spa():
    index_file = FRONTEND_DIR / "index.html"
    return FileResponse(str(index_file))
