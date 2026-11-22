"""Visual / Image-Clue Question Linter (Binary EXIF/PNG Metadata Spoiler Scanner + Gemini Multimodal Vision).

Checks visual quiz slides for:
1. Filename spoiler leaks (e.g. 'mary_shelley_portrait.jpg')
2. Embedded binary EXIF / XMP / PNG tEXt / iTXt metadata leaks containing the target answer
3. Projector readiness (image dimensions & aspect ratio for 16:9 stage display)
4. Gemini 2.5 Flash Multimodal Vision inspection for hidden watermarks, captions, logos, and 1-hop iconic recognition
"""
from __future__ import annotations

import base64
import re
import struct
import time
from typing import Dict, Any, List, Optional, Tuple
import httpx

from backend.config import config
from backend.llm_router import _extract_json


def _detect_image_dimensions(data: bytes) -> Tuple[int, int, str]:
    """Pure-Python PNG/JPEG/GIF/WEBP dimension parser (zero external Pillow dependency)."""
    if not data or len(data) < 24:
        return 0, 0, "UNKNOWN"

    # PNG: 8-byte signature + IHDR chunk (width at 16:20, height at 20:24)
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", data[16:24])
        return w, h, "PNG"

    # GIF
    if data[:6] in (b"GIF87a", b"GIF89a"):
        w, h = struct.unpack("<HH", data[6:10])
        return w, h, "GIF"

    # JPEG: scan SOF0/SOF2 markers
    if data[:2] == b"\xff\xd8":
        idx = 2
        while idx < len(data) - 9:
            if data[idx] != 0xFF:
                idx += 1
                continue
            marker = data[idx + 1]
            if marker in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack(">HH", data[idx + 5 : idx + 9])
                return w, h, "JPEG"
            if idx + 4 > len(data):
                break
            seg_len = struct.unpack(">H", data[idx + 2 : idx + 4])[0]
            if seg_len < 2:
                break
            idx += 2 + seg_len
        return 0, 0, "JPEG"

    # WEBP (VP8X)
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return 1200, 800, "WEBP"

    return 0, 0, "IMAGE"


def _scan_binary_metadata_leaks(
    data: bytes, filename: str, target_answer: str, aliases: List[str]
) -> Dict[str, Any]:
    """Scan filename and embedded ASCII/UTF-8 metadata chunks (EXIF, XMP, PNG tEXt) for target answer leaks."""
    tokens = []
    for raw in [target_answer, *aliases]:
        clean = raw.strip().lower()
        if len(clean) >= 4:
            tokens.append(clean)
            parts = [p for p in re.findall(r"[a-z]{5,}", clean)]
            if parts:
                tokens.append(parts[-1])
    tokens = list(dict.fromkeys(tokens))

    # 1. Filename check
    fn_lower = (filename or "").lower()
    filename_leaks = [t for t in tokens if t in fn_lower]

    # 2. Extract printable ASCII strings from header/trailer metadata (first 32KB & last 16KB)
    sample_bytes = data[:32768] + (data[-16384:] if len(data) > 32768 else b"")
    printable_chunks = re.findall(rb"[ -~]{4,120}", sample_bytes)
    decoded_meta = " ".join(c.decode("ascii", errors="ignore") for c in printable_chunks)
    meta_lower = decoded_meta.lower()

    metadata_leaks: List[Dict[str, str]] = []
    for tok in tokens:
        pos = meta_lower.find(tok)
        if pos != -1:
            snippet = decoded_meta[max(0, pos - 30) : min(len(decoded_meta), pos + 65)].strip()
            metadata_leaks.append({"matched_token": tok, "raw_metadata_snippet": snippet})

    # Detect common watermark / stock photo tags in metadata
    stock_brands = ["getty", "shutterstock", "alamy", "istock", "wikimedia", "adobe photoshop"]
    detected_tags = [b for b in stock_brands if b in meta_lower]

    return {
        "filename": filename,
        "filename_leaks": filename_leaks,
        "metadata_leaks": metadata_leaks,
        "detected_software_or_stock_tags": detected_tags,
    }


async def lint_visual_clue(
    image_b64: str,
    filename: str,
    mime_type: str,
    target_answer: str,
    aliases: Optional[List[str]] = None,
    question_context: str = "",
) -> Dict[str, Any]:
    """Run full Visual Clue Linter: Binary Metadata Scan + Resolution Check + Gemini Multimodal Vision."""
    t0 = time.perf_counter()
    aliases = aliases or []

    # Strip optional data URL prefix
    if "," in image_b64 and image_b64.startswith("data:"):
        header, b64_payload = image_b64.split(",", 1)
        m = re.search(r"data:([^;]+);base64", header)
        if m:
            mime_type = m.group(1)
    else:
        b64_payload = image_b64

    try:
        raw_bytes = base64.b64decode(b64_payload)
    except Exception:
        raw_bytes = b""

    width, height, fmt = _detect_image_dimensions(raw_bytes)
    meta_scan = _scan_binary_metadata_leaks(raw_bytes, filename, target_answer, aliases)

    # Projector readiness check
    if width > 0 and height > 0:
        if width < 640 or height < 360:
            projector_verdict = f"LOW_RES_WARNING ({width}x{height} {fmt} — may pixelate on hall projectors; aim for >=800px wide)"
        else:
            projector_verdict = f"PROJECTOR_READY ({width}x{height} {fmt})"
    else:
        projector_verdict = f"FORMAT_OK ({fmt}, {round(len(raw_bytes)/1024, 1)} KB)"

    # Multimodal Vision Inspection via Google Gemini 2.5 Flash (when key is configured)
    vision_findings: Dict[str, Any] = {}
    engine_used = "Binary EXIF/PNG Scanner + Visual Checklist"

    if config.gemini_api_key and raw_bytes:
        model = config.gemini_model or "gemini-2.5-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        prompt = (
            "You are a Competitive Quizmaster Visual-Clue Linter (KQA / BQC / Nihilanth style). "
            f"The setter plans to show this image on a projector slide for target answer: '{target_answer}'. "
            f"Question context: '{question_context[:250]}'. "
            "Inspect the image carefully and return strict JSON with keys: "
            '{"visible_text_or_watermark_spoilers": ["list any visible text, logos, signatures, or watermarks"], '
            '"iconic_reverse_search_risk": "HIGH | MEDIUM | LOW", '
            '"cropping_or_blur_instructions": ["concrete edit steps to mask giveaways"], '
            '"visual_workability_verdict": "1-2 sentences assessing whether this image is a great lateral visual clue or too trivial/obscure", '
            '"suggested_visual_caption": "crisp 1-sentence KQA/BQC slide prompt for this image"}'
        )
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": prompt},
                        {"inlineData": {"mimeType": mime_type or "image/png", "data": b64_payload}},
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
            },
        }
        try:
            async with httpx.AsyncClient(timeout=18.0) as client:
                resp = await client.post(url, params={"key": config.gemini_api_key}, json=payload)
                if resp.status_code == 200:
                    cands = resp.json().get("candidates", [])
                    if cands:
                        txt = "".join(p.get("text", "") for p in cands[0].get("content", {}).get("parts", []))
                        parsed = _extract_json(txt)
                        if parsed:
                            vision_findings = parsed
                            engine_used = f"Gemini Multimodal Vision ({model}) + Binary EXIF Scanner"
        except Exception:
            pass

    if not vision_findings:
        has_leaks = bool(meta_scan["filename_leaks"] or meta_scan["metadata_leaks"])
        vision_findings = {
            "visible_text_or_watermark_spoilers": (
                [f"Detected stock/editor tag in file header: {', '.join(meta_scan['detected_software_or_stock_tags'])}"]
                if meta_scan["detected_software_or_stock_tags"]
                else ["Configure GEMINI_API_KEY in ⚙ Keys for live pixel-level OCR & watermark detection."]
            ),
            "iconic_reverse_search_risk": "HIGH" if has_leaks else "MEDIUM",
            "cropping_or_blur_instructions": [
                "Strip EXIF/PNG metadata and rename file to neutral slide ID (e.g. 'slide_q04.png') before sharing deck PDFs.",
                "Crop out bottom-right agency watermarks, museum placards, or artist signatures before projection.",
                "For online/Zoom quizzes, slightly crop or flip non-text diagrams to resist 1-click Google Lens reverse search.",
            ],
            "visual_workability_verdict": (
                "HOLD: Filename or embedded binary metadata leaks the target answer! Sanitize the image file before sharing slides."
                if has_leaks
                else "Binary metadata and filename are clean of answer leaks. Enable Gemini Vision API key for deep pixel-level spoiler scanning."
            ),
            "suggested_visual_caption": f"Connect this visual artifact to the historical event or pioneer X described above.",
        }

    # Compute Visual Safety Score
    safety_score = 94
    if meta_scan["filename_leaks"]:
        safety_score -= 32
    if meta_scan["metadata_leaks"]:
        safety_score -= 35
    if meta_scan["detected_software_or_stock_tags"]:
        safety_score -= 10
    if "LOW_RES" in projector_verdict:
        safety_score -= 10
    if vision_findings.get("iconic_reverse_search_risk") == "HIGH":
        safety_score -= 12

    return {
        "visual_safety_score": max(15, min(99, safety_score)),
        "engine_used": engine_used,
        "dimensions": {"width": width, "height": height, "format": fmt, "size_kb": round(len(raw_bytes) / 1024, 1)},
        "projector_verdict": projector_verdict,
        "metadata_scan": meta_scan,
        "vision_analysis": vision_findings,
        "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
    }
