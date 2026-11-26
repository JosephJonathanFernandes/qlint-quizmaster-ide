"""Compiler-Style Static Variable Binding & Multi-Part Prompt Linter (X / Y / Z Referential Integrity)."""
from __future__ import annotations

import re
from typing import Dict, Any, List, Set


def _extract_quiz_vars(text: str) -> List[str]:
    """Extract standalone quiz placeholder variables (X, Y, Z) while ignoring terms like 'X-ray' or 'Malcolm X'."""
    if not text:
        return []
    # Scrub common non-variable idioms before scanning
    scrubbed = re.sub(r"\b(?:Malcolm|Generation| Space|Project|Model|Factor|Vitamin|Chromosome)\s+[XYZ]\b", " ", text)
    scrubbed = re.sub(r"\b[XYZ]\s*-\s*[a-zA-Z]+", " ", scrubbed)
    hits = re.findall(r"(?<![A-Za-z0-9\-])\b([XYZ])(?:'s)?\b(?![\-])", scrubbed)
    return list(dict.fromkeys(hits))


def audit_variable_bindings(question_text: str, target_answer: str) -> Dict[str, Any]:
    """Check referential integrity between clue placeholders (X/Y/Z), final prompt directive, and target_answer."""
    sentences = [
        s.strip()
        for s in re.split(r"(?<=[.?!])\s+", (question_text or "").strip())
        if s.strip()
    ]
    if not sentences:
        return {
            "status": "CLEAN_BINDING",
            "clue_vars": [],
            "prompt_vars": [],
            "issues": [],
        }

    if len(sentences) >= 2 and re.search(
        r"\b(identify|name|who|what|connect|give)\b", sentences[-1], flags=re.IGNORECASE
    ):
        clue_body = " ".join(sentences[:-1])
        prompt_clause = sentences[-1]
    else:
        clue_body = question_text
        prompt_clause = sentences[-1]

    clue_vars = _extract_quiz_vars(clue_body)
    prompt_vars = _extract_quiz_vars(prompt_clause)
    clue_set: Set[str] = set(clue_vars)
    prompt_set: Set[str] = set(prompt_vars)

    issues: List[Dict[str, str]] = []

    # 1. Orphan variable in prompt (asked to identify Y, when Y was never in the clues)
    if len(sentences) >= 2:
        orphan_vars = sorted(prompt_set - clue_set)
        if orphan_vars:
            issues.append(
                {
                    "code": "ORPHAN_PROMPT_VAR",
                    "severity": "HIGH",
                    "message": f"Prompt asks to identify {', '.join(orphan_vars)}, which never appeared in the preceding clues!",
                }
            )

        # 2. Unresolved variable in clues (clues mask X and Y, prompt only asks for X)
        if prompt_set and (clue_set - prompt_set):
            unasked = sorted(clue_set - prompt_set)
            issues.append(
                {
                    "code": "UNRESOLVED_CLUE_VAR",
                    "severity": "MODERATE",
                    "message": f"Clue text masks {', '.join(unasked)}, while the final prompt only asks for {', '.join(prompt_vars)}—clarify whether teams must name {', '.join(unasked)} too.",
                }
            )

    # 3. Multi-part answer cardinality check (e.g. "Identify X and Y" requires 2 parts in target_answer)
    requested_count = len(prompt_vars) if prompt_vars else len(clue_vars)
    if requested_count >= 2:
        ans_parts = [
            p.strip()
            for p in re.split(r"\s*(?:,|/|;|&|\band\b)\s*", (target_answer or "").strip(), flags=re.IGNORECASE)
            if p.strip()
        ]
        if len(ans_parts) < requested_count:
            issues.append(
                {
                    "code": "ANSWER_CARDINALITY_MISMATCH",
                    "severity": "HIGH",
                    "message": f"Question masks {requested_count} variables ({', '.join(prompt_vars or clue_vars)}), whereas Target Answer ('{target_answer}') only lists {len(ans_parts)} part(s). Separate multi-part answers with '/' or ','.",
                }
            )

    return {
        "status": "CLEAN_BINDING" if not issues else "BINDING_MISMATCH",
        "clue_vars": clue_vars,
        "prompt_vars": prompt_vars,
        "expected_parts": max(1, requested_count),
        "issues": issues,
    }
