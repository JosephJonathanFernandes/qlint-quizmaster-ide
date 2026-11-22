"""Quiz Set / Round Compiler, Cross-Question Spoiler Detector & Standalone Slide Deck Exporter."""
from __future__ import annotations

import html
import json
import re
import sqlite3
from pathlib import Path
from typing import List, Dict, Any

DB_PATH = Path(__file__).resolve().parent / "quiz_archive.sqlite3"

SEED_SET_QUESTIONS: List[Dict[str, Any]] = [
    {
        "position": 1,
        "question_text": (
            "In the early 1970s, optical manufacturer Carl Zeiss engineered a batch of ultra-fast 50mm f/0.7 "
            "Planar lenses for NASA to photograph the far side of the Moon during the Apollo program. "
            "Acquiring three of these lenses and milling down a Mitchell BNC camera mount to fit them, "
            "director X used them to shoot indoor tables lit strictly by beeswax candles without artificial lighting. Identify X."
        ),
        "target_answer": "Stanley Kubrick",
        "category": "Cinema & Tech",
        "quality_score": 89,
        "workability_score": 88,
        "difficulty_tier": "KQA / BQC Open Calibrated",
        "funda_notes": "Used for Barry Lyndon (1975) with cinematographer John Alcott.",
    },
    {
        "position": 2,
        "question_text": (
            "In 1976, mathematician George Andrews was sifting through the estate papers of G.N. Watson at "
            "Trinity College's Wren Library when he found 138 pages of formulas written in X's final year, "
            "introducing mock theta functions now used to calculate black hole entropy. Identify X."
        ),
        "target_answer": "Srinivasa Ramanujan",
        "category": "Science & Math",
        "quality_score": 86,
        "workability_score": 84,
        "difficulty_tier": "Open Finals / Campus Main",
        "funda_notes": "Ramanujan's Lost Notebook, rediscovered in 1976.",
    },
    {
        "position": 3,
        "question_text": (
            "In the late 15th century, Shogun Ashikaga Yoshimasa sent a broken celadon tea bowl back to China "
            "for repair. Disappointed when it returned fastened with ugly iron staples, Japanese craftsmen "
            "devised X—mending fractures with urushi lacquer dusted with powdered gold. Identify X."
        ),
        "target_answer": "Kintsugi",
        "category": "Art & Culture",
        "quality_score": 91,
        "workability_score": 90,
        "difficulty_tier": "KQA / BQC Open Calibrated",
        "funda_notes": "Embodies the wabi-sabi philosophy of embracing imperfection.",
    },
]


class QuizSetManager:
    """Manages full quiz rounds, set-level pacing, cross-question spoiler checks & slide exports."""

    def __init__(self, db_path: Path = DB_PATH) -> None:
        self.db_path = db_path
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS set_questions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    set_name TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    question_text TEXT NOT NULL,
                    target_answer TEXT NOT NULL,
                    category TEXT DEFAULT 'General',
                    quality_score INTEGER DEFAULT 80,
                    workability_score INTEGER DEFAULT 80,
                    difficulty_tier TEXT DEFAULT 'Open Calibrated',
                    funda_notes TEXT DEFAULT ''
                )
                """
            )
            cur = conn.execute("SELECT COUNT(*) FROM set_questions")
            if cur.fetchone()[0] == 0:
                for q in SEED_SET_QUESTIONS:
                    conn.execute(
                        """
                        INSERT INTO set_questions
                        (set_name, position, question_text, target_answer, category, quality_score, workability_score, difficulty_tier, funda_notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            "KQA Open Finals — Round 1",
                            q["position"],
                            q["question_text"],
                            q["target_answer"],
                            q["category"],
                            q["quality_score"],
                            q["workability_score"],
                            q["difficulty_tier"],
                            q["funda_notes"],
                        ),
                    )
            conn.commit()

    def get_set_questions(self, set_name: str = "KQA Open Finals — Round 1") -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM set_questions WHERE set_name = ? ORDER BY position ASC, id ASC",
                (set_name,),
            ).fetchall()
        return [dict(r) for r in rows]

    def add_question_to_set(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        set_name = payload.get("set_name") or "KQA Open Finals — Round 1"
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.execute(
                "SELECT COALESCE(MAX(position), 0) FROM set_questions WHERE set_name = ?",
                (set_name,),
            )
            next_pos = cur.fetchone()[0] + 1
            cur = conn.execute(
                """
                INSERT INTO set_questions
                (set_name, position, question_text, target_answer, category, quality_score, workability_score, difficulty_tier, funda_notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    set_name,
                    next_pos,
                    payload.get("question_text", ""),
                    payload.get("target_answer", ""),
                    payload.get("category", "General"),
                    int(payload.get("quality_score", 80)),
                    int(payload.get("workability_score", 80)),
                    payload.get("difficulty_tier", "Open Calibrated"),
                    payload.get("funda_notes", ""),
                ),
            )
            new_id = cur.lastrowid
            conn.commit()
        return {"id": new_id, "set_name": set_name, "position": next_pos}

    def remove_question(self, item_id: int) -> bool:
        with sqlite3.connect(self.db_path) as conn:
            cur = conn.execute("DELETE FROM set_questions WHERE id = ?", (item_id,))
            conn.commit()
            return cur.rowcount > 0

    def analyze_set(self, set_name: str = "KQA Open Finals — Round 1") -> Dict[str, Any]:
        """Compute round-level analytics: pacing curve, domain balance, and cross-question spoiler leaks."""
        items = self.get_set_questions(set_name)
        if not items:
            return {
                "set_name": set_name,
                "total_questions": 0,
                "avg_quality_score": 0,
                "category_distribution": {},
                "cross_question_spoilers": [],
                "pacing_verdict": "Empty set — add questions from the Setter Linter IDE.",
                "questions": [],
            }

        # 1. Domain balance
        cat_counts: Dict[str, int] = {}
        for item in items:
            cat = item["category"] or "General"
            cat_counts[cat] = cat_counts.get(cat, 0) + 1

        # 2. Cross-Question Spoiler Leak Detector
        spoilers: List[Dict[str, Any]] = []
        for idx_a, qa in enumerate(items):
            ans_a = qa["target_answer"].strip().lower()
            if len(ans_a) < 4:
                continue
            # Also check distinguishing surname / core token (>= 6 chars)
            tokens_to_check = [ans_a]
            parts = [p for p in re.findall(r"[a-z]{6,}", ans_a)]
            if parts:
                tokens_to_check.append(parts[-1])

            for idx_b, qb in enumerate(items):
                if idx_a == idx_b:
                    continue
                text_b = qb["question_text"].lower()
                for tok in tokens_to_check:
                    if re.search(rf"\b{re.escape(tok)}\b", text_b):
                        spoilers.append(
                            {
                                "leaking_question_pos": idx_b + 1,
                                "spoiled_question_pos": idx_a + 1,
                                "spoiled_answer": qa["target_answer"],
                                "matched_term": tok,
                                "warning": f"Q{idx_b + 1}'s prompt mentions '{tok}', which may spoil Q{idx_a + 1}'s answer ({qa['target_answer']})!",
                            }
                        )
                        break

        avg_q = round(sum(i["quality_score"] for i in items) / len(items), 1)
        avg_w = round(sum(i["workability_score"] for i in items) / len(items), 1)

        # 3. Pacing diagnosis
        max_cat_share = max(cat_counts.values()) / len(items)
        if spoilers:
            pacing = f"SPOILER HAZARD: {len(spoilers)} cross-question answer leak(s) detected inside this round."
        elif len(items) >= 4 and max_cat_share > 0.5:
            dom = max(cat_counts, key=cat_counts.get)
            pacing = f"Domain Skew Warning: '{dom}' accounts for >50% of this round. Mix in an orthogonal topic."
        elif avg_q >= 82:
            pacing = f"Well-Balanced Round ({len(items)} Qs, avg quality {avg_q}/100, zero cross-question spoilers)."
        else:
            pacing = f"Needs Calibration: Average quality is {avg_q}/100. Polish lower-scoring questions in the Linter IDE."

        return {
            "set_name": set_name,
            "total_questions": len(items),
            "avg_quality_score": avg_q,
            "avg_workability_score": avg_w,
            "category_distribution": cat_counts,
            "cross_question_spoilers": spoilers,
            "pacing_verdict": pacing,
            "questions": items,
        }

    def export_standalone_html_deck(self, set_name: str = "KQA Open Finals — Round 1") -> str:
        """Generate a self-contained projector-ready HTML Slide Deck with keyboard navigation."""
        items = self.get_set_questions(set_name)
        slides_data = [
            {
                "type": "title",
                "heading": set_name,
                "sub": f"{len(items)} Questions • Compiled & Fact-Checked with Crucible // Q-Lint",
            }
        ]
        for idx, q in enumerate(items, start=1):
            slides_data.append(
                {
                    "type": "question",
                    "num": idx,
                    "category": q["category"],
                    "text": q["question_text"],
                    "tier": q["difficulty_tier"],
                }
            )
            slides_data.append(
                {
                    "type": "answer",
                    "num": idx,
                    "answer": q["target_answer"],
                    "notes": q["funda_notes"] or f"Q-Lint Calibration Score: {q['quality_score']}/100",
                }
            )

        slides_json = json.dumps(slides_data)
        safe_title = html.escape(set_name)
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>{safe_title} — Crucible Stage Deck</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: radial-gradient(circle at top right, #1e1b4b, #060911 70%);
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 48px 72px;
      user-select: none;
    }}
    .top-bar {{ display: flex; justify-content: space-between; color: #94a3b8; font-family: monospace; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; }}
    .slide-body {{ max-width: 1100px; margin: auto 0; }}
    .q-text {{ font-size: 32px; line-height: 1.5; font-weight: 500; color: #f1f5f9; }}
    .var-pill {{ background: linear-gradient(135deg, #6366f1, #06b6d4); color: #fff; padding: 2px 12px; border-radius: 8px; font-weight: 800; font-family: monospace; }}
    .ans-label {{ font-size: 16px; color: #34d399; text-transform: uppercase; letter-spacing: 0.14em; font-family: monospace; margin-bottom: 12px; }}
    .ans-text {{ font-size: 56px; font-weight: 800; color: #6ee7b7; margin-bottom: 24px; }}
    .notes {{ font-size: 20px; color: #cbd5e1; background: rgba(15,23,42,0.8); border: 1px solid rgba(148,163,184,0.2); padding: 20px 24px; border-radius: 14px; line-height: 1.5; }}
    .title-main {{ font-size: 54px; font-weight: 800; background: linear-gradient(90deg, #818cf8, #22d3ee); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 18px; }}
    .title-sub {{ font-size: 22px; color: #94a3b8; }}
    .footer {{ display: flex; justify-content: space-between; align-items: center; color: #64748b; font-size: 13px; font-family: monospace; }}
    button {{ background: #1e293b; color: #e2e8f0; border: 1px solid #334155; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; }}
    button:hover {{ background: #334155; }}
  </style>
</head>
<body>
  <div class="top-bar">
    <span id="slide-tag">CRUCIBLE // STAGE DECK</span>
    <span id="slide-counter">1 / {len(slides_data)}</span>
  </div>
  <div class="slide-body" id="slide-content"></div>
  <div class="footer">
    <span>Use ← / → Arrow Keys or Spacebar to advance slides</span>
    <div>
      <button onclick="prev()">← Prev</button>
      <button onclick="next()">Next →</button>
    </div>
  </div>
  <script>
    const SLIDES = {slides_json};
    let idx = 0;
    function esc(s) {{ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }}
    function render() {{
      const s = SLIDES[idx];
      document.getElementById('slide-counter').textContent = (idx + 1) + ' / ' + SLIDES.length;
      const body = document.getElementById('slide-content');
      if (s.type === 'title') {{
        document.getElementById('slide-tag').textContent = 'CRUCIBLE // Q-LINT STAGE PRESENTATION';
        body.innerHTML = '<div class="title-main">' + esc(s.heading) + '</div><div class="title-sub">' + esc(s.sub) + '</div>';
      }} else if (s.type === 'question') {{
        document.getElementById('slide-tag').textContent = 'QUESTION ' + s.num + '  •  ' + s.category.toUpperCase();
        const formatted = esc(s.text).replace(/\\b([XYZ])\\b/g, '<span class="var-pill">$1</span>');
        body.innerHTML = '<div class="q-text">' + formatted + '</div>';
      }} else {{
        document.getElementById('slide-tag').textContent = 'QUESTION ' + s.num + '  •  ANSWER REVEAL';
        body.innerHTML = '<div class="ans-label">Canonical Answer</div><div class="ans-text">' + esc(s.answer) + '</div><div class="notes">' + esc(s.notes) + '</div>';
      }}
    }}
    function next() {{ if (idx < SLIDES.length - 1) {{ idx++; render(); }} }}
    function prev() {{ if (idx > 0) {{ idx--; render(); }} }}
    window.addEventListener('keydown', (e) => {{
      if (e.key === 'ArrowRight' || e.key === ' ') {{ e.preventDefault(); next(); }}
      if (e.key === 'ArrowLeft') {{ e.preventDefault(); prev(); }}
    }});
    render();
  </script>
</body>
</html>"""


set_manager = QuizSetManager()
