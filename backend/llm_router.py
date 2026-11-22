"""Dual-Engine LLM Router (Groq LPU + Google Gemini + Truth-Grounded Heuristic Fallback).

Coordinates parallel calls across:
- Google Gemini (gemini-2.5-flash / gemini-2.5-pro)
- Groq Cloud LPU (llama-3.3-70b-versatile & llama-3.1-8b-instant)
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Dict, Any, Optional, Tuple, List
import httpx

from backend.config import config


def _extract_json(raw_text: str) -> Dict[str, Any]:
    """Robustly parse JSON object from LLM text or markdown code fence."""
    if not raw_text:
        return {}
    cleaned = raw_text.strip()
    # Strip markdown fences if present
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, flags=re.DOTALL)
    if fence_match:
        cleaned = fence_match.group(1)
    else:
        brace_start = cleaned.find("{")
        brace_end = cleaned.rfind("}")
        if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
            cleaned = cleaned[brace_start : brace_end + 1]
    try:
        return json.loads(cleaned)
    except Exception:
        return {}


class DualEngineLLMRouter:
    """Manages calls to Gemini and Groq APIs with automatic fallback and telemetry."""

    def __init__(self, timeout_sec: float = 18.0) -> None:
        self.timeout_sec = timeout_sec

    async def call_gemini_json(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        model_override: Optional[str] = None,
    ) -> Tuple[Dict[str, Any], float, bool]:
        """Call Google Gemini generateContent endpoint and return (parsed_json, latency_ms, ok)."""
        if not config.gemini_api_key:
            return {}, 0.0, False

        model = model_override or config.gemini_model or "gemini-2.5-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        t0 = time.perf_counter()
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "responseMimeType": "application/json",
            },
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                resp = await client.post(
                    url,
                    params={"key": config.gemini_api_key},
                    json=payload,
                )
                latency_ms = round((time.perf_counter() - t0) * 1000, 1)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        text = "".join(p.get("text", "") for p in parts)
                        parsed = _extract_json(text)
                        if parsed:
                            return parsed, latency_ms, True
                return {}, latency_ms, False
        except Exception:
            latency_ms = round((time.perf_counter() - t0) * 1000, 1)
            return {}, latency_ms, False

    async def call_groq_json(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
        model_override: Optional[str] = None,
    ) -> Tuple[Dict[str, Any], float, bool]:
        """Call Groq OpenAI-compatible chat/completions endpoint and return (parsed_json, latency_ms, ok)."""
        if not config.groq_api_key:
            return {}, 0.0, False

        model = model_override or config.groq_model_primary or "llama-3.3-70b-versatile"
        url = "https://api.groq.com/openai/v1/chat/completions"
        t0 = time.perf_counter()
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt + "\nYou MUST respond with valid JSON only.",
                },
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {config.groq_api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                latency_ms = round((time.perf_counter() - t0) * 1000, 1)
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices", [])
                    if choices:
                        text = choices[0].get("message", {}).get("content", "")
                        parsed = _extract_json(text)
                        if parsed:
                            return parsed, latency_ms, True
                return {}, latency_ms, False
        except Exception:
            latency_ms = round((time.perf_counter() - t0) * 1000, 1)
            return {}, latency_ms, False

    async def call_best_available_json(
        self,
        system_prompt: str,
        user_prompt: str,
        prefer: str = "gemini",
        temperature: float = 0.2,
    ) -> Tuple[Dict[str, Any], str, float]:
        """Call preferred engine first, falling back to the secondary engine if unavailable."""
        if prefer == "groq":
            res, lat, ok = await self.call_groq_json(system_prompt, user_prompt, temperature)
            if ok:
                return res, f"Groq ({config.groq_model_primary})", lat
            res, lat, ok = await self.call_gemini_json(system_prompt, user_prompt, temperature)
            if ok:
                return res, f"Gemini ({config.gemini_model})", lat
        else:
            res, lat, ok = await self.call_gemini_json(system_prompt, user_prompt, temperature)
            if ok:
                return res, f"Gemini ({config.gemini_model})", lat
            res, lat, ok = await self.call_groq_json(system_prompt, user_prompt, temperature)
            if ok:
                return res, f"Groq ({config.groq_model_primary})", lat

        return {}, "Truth-Grounded Heuristic Engine", 0.0


llm_router = DualEngineLLMRouter()
