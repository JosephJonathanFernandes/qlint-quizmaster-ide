"""Configuration & API Key Manager for Crucible / Q-Lint."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Any
from dotenv import load_dotenv, set_key

ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT_DIR / ".env"

if ENV_PATH.exists():
    load_dotenv(ENV_PATH, override=True)
else:
    load_dotenv()


class AppConfig:
    """Dynamic configuration manager supporting both .env and live UI updates."""

    def __init__(self) -> None:
        self.reload()

    def reload(self) -> None:
        if ENV_PATH.exists():
            load_dotenv(ENV_PATH, override=True)
        self.gemini_api_key: str = os.getenv("GEMINI_API_KEY", "").strip()
        self.groq_api_key: str = os.getenv("GROQ_API_KEY", "").strip()
        self.tavily_api_key: str = os.getenv("TAVILY_API_KEY", "").strip()
        self.serper_api_key: str = os.getenv("SERPER_API_KEY", "").strip()

        self.gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
        self.groq_model_primary: str = os.getenv(
            "GROQ_MODEL_PRIMARY", "llama-3.3-70b-versatile"
        ).strip()
        self.groq_model_fast: str = os.getenv(
            "GROQ_MODEL_FAST", "llama-3.1-8b-instant"
        ).strip()

    def update_keys(
        self,
        gemini_api_key: str | None = None,
        groq_api_key: str | None = None,
        tavily_api_key: str | None = None,
        serper_api_key: str | None = None,
        gemini_model: str | None = None,
        groq_model_primary: str | None = None,
    ) -> Dict[str, Any]:
        """Update keys in memory and persist to local .env file."""
        if not ENV_PATH.exists():
            ENV_PATH.write_text("# Crucible / Q-Lint Local Configuration\n", encoding="utf-8")

        updates = {
            "GEMINI_API_KEY": gemini_api_key,
            "GROQ_API_KEY": groq_api_key,
            "TAVILY_API_KEY": tavily_api_key,
            "SERPER_API_KEY": serper_api_key,
            "GEMINI_MODEL": gemini_model,
            "GROQ_MODEL_PRIMARY": groq_model_primary,
        }
        for env_key, val in updates.items():
            if val is not None:
                clean_val = val.strip()
                os.environ[env_key] = clean_val
                try:
                    set_key(str(ENV_PATH), env_key, clean_val)
                except Exception:
                    pass

        self.reload()
        return self.get_status()

    @staticmethod
    def _mask(key: str) -> str:
        if not key:
            return ""
        if len(key) <= 8:
            return "****"
        return f"{key[:4]}...{key[-4:]}"

    def get_status(self) -> Dict[str, Any]:
        has_gemini = bool(self.gemini_api_key)
        has_groq = bool(self.groq_api_key)
        has_tavily = bool(self.tavily_api_key)
        has_serper = bool(self.serper_api_key)

        mode = "dual_llm" if (has_gemini and has_groq) else (
            "single_llm_gemini" if has_gemini else (
                "single_llm_groq" if has_groq else "heuristic_hybrid"
            )
        )

        truth_apis = [
            {
                "id": "wikipedia",
                "name": "Wikipedia REST & Search API",
                "category": "Encyclopedic Fact & Verbatim Phrase Probe",
                "requires_key": False,
                "active": True,
            },
            {
                "id": "wikidata",
                "name": "Wikidata Knowledge Graph & SPARQL",
                "category": "Structured Entity Graph, Dates & 2-Hop Connects",
                "requires_key": False,
                "active": True,
            },
            {
                "id": "duckduckgo",
                "name": "DuckDuckGo Web & Instant Answer API",
                "category": "Live Web Search & 1-Hop Googleability Probe",
                "requires_key": False,
                "active": True,
            },
            {
                "id": "openalex",
                "name": "OpenAlex Scholarly Knowledge Graph",
                "category": "Scientific Discoveries, Papers & Academic Facts",
                "requires_key": False,
                "active": True,
            },
            {
                "id": "openlibrary",
                "name": "OpenLibrary Literary & Author API",
                "category": "Books, First Editions, Authors & Characters",
                "requires_key": False,
                "active": True,
            },
            {
                "id": "crossref",
                "name": "CrossRef DOI & Historical Publication API",
                "category": "Citation Verification & Publication Timelines",
                "requires_key": False,
                "active": True,
            },
            {
                "id": "dictionaryapi",
                "name": "Free Dictionary & Etymology API",
                "category": "Lexical Definitions, Wordplay & Phonetics",
                "requires_key": False,
                "active": True,
            },
            {
                "id": "tavily",
                "name": "Tavily AI Research Search",
                "category": "Deep Web Fact Verification (Optional Key)",
                "requires_key": True,
                "active": has_tavily,
            },
            {
                "id": "serper",
                "name": "Serper Google SERP API",
                "category": "Exact Google SERP Rank Probe (Optional Key)",
                "requires_key": True,
                "active": has_serper,
            },
        ]

        return {
            "mode": mode,
            "gemini": {
                "configured": has_gemini,
                "masked_key": self._mask(self.gemini_api_key),
                "model": self.gemini_model,
            },
            "groq": {
                "configured": has_groq,
                "masked_key": self._mask(self.groq_api_key),
                "primary_model": self.groq_model_primary,
                "fast_model": self.groq_model_fast,
            },
            "optional_search": {
                "tavily_configured": has_tavily,
                "tavily_masked": self._mask(self.tavily_api_key),
                "serper_configured": has_serper,
                "serper_masked": self._mask(self.serper_api_key),
            },
            "truth_apis": truth_apis,
            "active_truth_api_count": sum(1 for a in truth_apis if a["active"]),
        }


config = AppConfig()
