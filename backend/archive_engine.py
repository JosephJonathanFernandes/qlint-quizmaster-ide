"""Disentangled Entity + Canonical Angle Quiz Archive Engine.

Separates:
1. Canonical Target Entity matching (has this answer been asked before?)
2. Latent Funda / Angle similarity (has this SPECIFIC angle/story on that entity been used?)
"""
from __future__ import annotations

import json
import math
import re
import sqlite3
from collections import Counter
from pathlib import Path
from typing import List, Dict, Any, Tuple

from backend.models import ArchiveMatch, ArchiveDeduplicationReport

DB_PATH = Path(__file__).resolve().parent / "quiz_archive.sqlite3"

STOPWORDS = {
    "the", "and", "for", "that", "this", "with", "from", "was", "were", "are",
    "his", "her", "its", "they", "their", "which", "who", "whom", "whose",
    "identify", "name", "person", "known", "famous", "called", "also", "after",
    "before", "during", "while", "when", "where", "into", "over", "under",
    "about", "between", "through", "because", "been", "have", "had", "has",
}

SEED_ARCHIVE_QUESTIONS: List[Dict[str, Any]] = [
    {
        "id": "BQC-2022-014",
        "tournament": "BQC Annual Open Quiz",
        "year": 2022,
        "category": "Literature & History",
        "target_answer": "Mary Shelley",
        "aliases": ["Mary Wollstonecraft Shelley", "Mary Godwin"],
        "canonical_funda": "Kept Percy Bysshe Shelley's calcified heart wrapped in silk and pages of Adonais inside her desk drawer after his 1822 drowning in the Gulf of Spezia",
        "question_excerpt": "After a shipwreck in the Gulf of Spezia in 1822, Edward Trelawny snatched a calcified organ from the funeral pyre. X kept it wrapped in the silk pages of Adonais inside a desk drawer until her death in 1851. Identify X.",
    },
    {
        "id": "KQA-2021-008",
        "tournament": "KQA Asher Memorial Open",
        "year": 2021,
        "category": "Literature & Science",
        "target_answer": "Mary Shelley",
        "aliases": ["Mary Wollstonecraft Shelley"],
        "canonical_funda": "1816 Year Without a Summer caused by Mount Tambora eruption trapped Villa Diodati guests near Lake Geneva reading Fantasmagoriana ghost stories",
        "question_excerpt": "The 1815 eruption of Mount Tambora in Indonesia caused the 'Year Without a Summer' in 1816, forcing a group at Villa Diodati by Lake Geneva indoors to read Fantasmagoriana and hold a ghost-story contest won by 18-year-old X.",
    },
    {
        "id": "QFI-2023-031",
        "tournament": "QFI Landmark Open",
        "year": 2023,
        "category": "Literature",
        "target_answer": "Mary Shelley",
        "aliases": ["Mary Wollstonecraft Shelley"],
        "canonical_funda": "1826 apocalyptic pandemic novel The Last Man set in the late 21st century inspired by the Sibylline leaves found in Cumae",
        "question_excerpt": "Long before modern post-apocalyptic fiction, X published 'The Last Man' in 1826, framing the 21st-century plague narrative as prophetic fragments discovered in the cave of the Cumaean Sibyl near Naples.",
    },
    {
        "id": "KQA-2023-019",
        "tournament": "KQA Mega Open Finals",
        "year": 2023,
        "category": "Science & History",
        "target_answer": "Alan Turing",
        "aliases": ["Alan Mathison Turing"],
        "canonical_funda": "Bought silver ingots during WWII and buried them in Bletchley woods but failed to recover them after forgetting his own encrypted landmark cipher",
        "question_excerpt": "Fearing a Nazi invasion in 1940, this Bletchley Park cryptanalyst converted his savings into two silver bars and buried them in a wood, encoding the location in a cipher so complex he could never recover them after the war.",
    },
    {
        "id": "BQC-2021-042",
        "tournament": "BQC Sci-Tech Open",
        "year": 2021,
        "category": "Science",
        "target_answer": "Alan Turing",
        "aliases": ["Alan Mathison Turing"],
        "canonical_funda": "1952 paper The Chemical Basis of Morphogenesis explaining reaction-diffusion patterns like leopard spots and zebra stripes",
        "question_excerpt": "Two years before his death, X published 'The Chemical Basis of Morphogenesis', mathematically proving how two diffusing morphogens create biological patterns like zebra stripes and leopard spots.",
    },
    {
        "id": "NIH-2022-011",
        "tournament": "Nihilanth Inter-IIT/IIM Finals",
        "year": 2022,
        "category": "Cinema & Space",
        "target_answer": "Stanley Kubrick",
        "aliases": ["Kubrick"],
        "canonical_funda": "Borrowed custom NASA Carl Zeiss Planar 50mm f/0.7 ultra-fast lenses built for Apollo lunar mapping to shoot Barry Lyndon strictly by candlelight",
        "question_excerpt": "To film 18th-century interior scenes lit exclusively by beeswax candles for a 1975 period drama, X acquired three Carl Zeiss Planar 50mm f/0.7 lenses originally commissioned by NASA for Apollo dark-side lunar photography.",
    },
    {
        "id": "KQA-2020-055",
        "tournament": "KQA Open Cinema Quiz",
        "year": 2020,
        "category": "Cinema",
        "target_answer": "Stanley Kubrick",
        "aliases": ["Kubrick"],
        "canonical_funda": "Secured a bespoke Lloyds of London insurance policy against extraterrestrial contact spoiling the premiere of 2001 A Space Odyssey",
        "question_excerpt": "During production of his 1968 sci-fi epic, X attempted to take out a Lloyd's of London insurance policy protecting MGM against financial losses in case extraterrestrial intelligence was discovered before the film's release.",
    },
    {
        "id": "QFI-2022-017",
        "tournament": "QFI General Open",
        "year": 2022,
        "category": "Cinema & Literature",
        "target_answer": "Satyajit Ray",
        "aliases": ["Manik Da"],
        "canonical_funda": "Unproduced 1967 sci-fi screenplay The Alien based on his short story Bankubabur Bandhu circulated in Hollywood via Mike Wilson before Spielberg's E.T.",
        "question_excerpt": "In 1967, X wrote a screenplay titled 'The Alien' based on his Bengali story 'Bankubabur Bandhu'. Mimeographed copies circulated at Columbia Pictures in Hollywood, prompting Arthur C. Clarke to later note striking parallels with E.T.",
    },
    {
        "id": "BQC-2023-009",
        "tournament": "BQC Heritage & Culture Quiz",
        "year": 2023,
        "category": "Design & Typography",
        "target_answer": "Satyajit Ray",
        "aliases": ["Manik Da"],
        "canonical_funda": "Designed four English typefaces including Ray Roman and Ray Bizarre winning the 1971 international typeface competition before directing films",
        "question_excerpt": "Before selling his wife's jewellery to fund Pather Panchali, X worked as a commercial illustrator at D.J. Keymer and designed four Roman typefaces—including Ray Roman and Daphnis— combining calligraphy with Bengali brush strokes.",
    },
    {
        "id": "KQA-2022-027",
        "tournament": "KQA Open Mathematics & Logic",
        "year": 2022,
        "category": "Science & Math",
        "target_answer": "Srinivasa Ramanujan",
        "aliases": ["Ramanujan"],
        "canonical_funda": "Taxicab number 1729 Hardy-Ramanujan conversation at Putney hospital smallest integer expressible as sum of two positive cubes in two ways",
        "question_excerpt": "Visiting a nursing home in Putney, G.H. Hardy remarked that his cab's number, 1729, seemed rather dull. X immediately replied that it is the smallest number expressible as the sum of two positive cubes in two different ways.",
    },
    {
        "id": "QFI-2024-004",
        "tournament": "QFI Centennial Open",
        "year": 2024,
        "category": "Science & Math",
        "target_answer": "Srinivasa Ramanujan",
        "aliases": ["Ramanujan"],
        "canonical_funda": "Lost Notebook discovered by George Andrews in Trinity College Wren Library in 1976 containing mock theta functions later used for black hole entropy",
        "question_excerpt": "In 1976, mathematician George Andrews was sifting through the estate papers of G.N. Watson at Trinity College's Wren Library when he found 138 pages of formulas written in X's final year, introducing mock theta functions now used to calculate black hole entropy.",
    },
    {
        "id": "BQC-2023-033",
        "tournament": "BQC Sci-Tech Finals",
        "year": 2023,
        "category": "Science & Telecom",
        "target_answer": "Hedy Lamarr",
        "aliases": ["Hedwig Eva Maria Kiesler"],
        "canonical_funda": "Co-invented frequency-hopping spread spectrum radio guidance for Allied torpedoes with avant-garde composer George Antheil using 88 piano roll keys",
        "question_excerpt": "Inspired by the 88 keys of a synchronized player piano roll used in George Antheil's Ballet Mécanique, this Hollywood star co-patented a frequency-hopping torpedo guidance system in 1942 that laid the foundation for Bluetooth and Wi-Fi.",
    },
    {
        "id": "KQA-2023-041",
        "tournament": "KQA Open History",
        "year": 2023,
        "category": "History & Espionage",
        "target_answer": "Operation Mincemeat",
        "aliases": ["Major William Martin", "Glyndwr Michael"],
        "canonical_funda": "1943 WWII British deception planted corpse of Glyndwr Michael disguised as Royal Marines Major William Martin off Huelva Spain carrying fake Allied invasion plans for Greece",
        "question_excerpt": "Inspired by the 1939 Trout Memo penned in Ian Fleming's department, British intelligence dressed the corpse of Welsh vagrant Glyndwr Michael as 'Major William Martin' and released him from HMS Seraph off Huelva, Spain with fake invasion plans.",
    },
    {
        "id": "NIH-2023-018",
        "tournament": "Nihilanth Open General",
        "year": 2023,
        "category": "Space & Culture",
        "target_answer": "Voyager Golden Record",
        "aliases": ["Voyager Record"],
        "canonical_funda": "Included Ann Druyan's one-hour EEG brainwave and heartbeat recording taken days after falling in love with Carl Sagan alongside Blind Willie Johnson and Kesarbai Kerkar",
        "question_excerpt": "Alongside Kesarbai Kerkar's rendition of Raga Bhairavi and Blind Willie Johnson's 'Dark Was the Night', this 1977 phonograph disc carries the compressed acoustic brainwaves (EEG) of Ann Druyan, recorded days after she and Carl Sagan declared their love.",
    },
    {
        "id": "KQA-2022-061",
        "tournament": "KQA Literature Open",
        "year": 2022,
        "category": "Literature",
        "target_answer": "Jorge Luis Borges",
        "aliases": ["Borges"],
        "canonical_funda": "Appointed Director of the National Public Library of Argentina in 1955 just as hereditary blindness overtook him echoing his poem of God's irony giving books and night",
        "question_excerpt": "In 1955, X was appointed Director of the National Library in Buenos Aires just as congenital blindness completely took his sight—prompting his famous line praising 'God's splendid irony in granting me at once 800,000 books and the night.'",
    },
    {
        "id": "BQC-2022-049",
        "tournament": "BQC Open General",
        "year": 2022,
        "category": "Science & History",
        "target_answer": "Eratosthenes",
        "aliases": ["Eratosthenes of Cyrene"],
        "canonical_funda": "Nicknamed Beta by contemporaries and calculated Earth's circumference using summer solstice noon shadow angle between Syene deep well and Alexandria obelisk",
        "question_excerpt": "Nicknamed 'Beta' (second-best in every discipline) by his Alexandrian peers, X hired bematists to pace the distance to Syene after learning that on the summer solstice noon, sunlight illuminated the bottom of a deep well without casting a shadow.",
    },
    {
        "id": "QFI-2023-052",
        "tournament": "QFI Arts & Culture Quiz",
        "year": 2023,
        "category": "Art & Craft",
        "target_answer": "Kintsugi",
        "aliases": ["Kintsukuroi"],
        "canonical_funda": "15th-century Japanese ceramic repair technique mixing urushi lacquer with powdered gold originated when Shogun Ashikaga Yoshimasa's Chinese tea bowl returned from China with ugly metal staples",
        "question_excerpt": "In the late 15th century, Shogun Ashikaga Yoshimasa sent a broken celadon tea bowl back to China for repair. Disappointed when it returned fastened with ugly iron staples, Japanese craftsmen devised X—mending fractures with urushi lacquer dusted with powdered gold.",
    },
    {
        "id": "KQA-2024-012",
        "tournament": "KQA Open Science",
        "year": 2024,
        "category": "Science",
        "target_answer": "Rosalind Franklin",
        "aliases": ["Franklin"],
        "canonical_funda": "X-ray diffraction Photograph 51 taken with doctoral student Raymond Gosling at King's College London showing B-form DNA double helix before moving to Birkbeck to study Tobacco Mosaic Virus",
        "question_excerpt": "After capturing the critical 100-hour X-ray diffraction exposure known as 'Photo 51' with doctoral student Raymond Gosling at King's College, X moved to Birkbeck College where she pioneered the structural crystallography of the Tobacco Mosaic Virus and polio.",
    },
    {
        "id": "BQC-2024-003",
        "tournament": "BQC Open Computing",
        "year": 2024,
        "category": "Computing & History",
        "target_answer": "Ada Lovelace",
        "aliases": ["Augusta Ada King", "Countess of Lovelace"],
        "canonical_funda": "Note G in 1843 translation of Luigi Menabrea's French paper on Charles Babbage's Analytical Engine computing Bernoulli numbers and comparing the machine to the Jacquard loom",
        "question_excerpt": "In 1843, X translated an Italian engineer's French lecture on Charles Babbage's Analytical Engine, appending seven lengthy 'Notes'—the last of which ('Note G') detailed an algorithm for Bernoulli numbers and compared the engine to a Jacquard loom weaving algebraic patterns.",
    },
    {
        "id": "KQA-2021-077",
        "tournament": "KQA Open History & Myth",
        "year": 2021,
        "category": "Physics & Education",
        "target_answer": "Albert Einstein",
        "aliases": ["Einstein"],
        "canonical_funda": "1896 Aarau cantonal school report card grade reversal from 1-6 scale where 6 became highest mark leading to the popular myth that he failed mathematics",
        "question_excerpt": "In September 1896, the Aargau Cantonal School in Switzerland inverted its numerical grading scale so that 6 replaced 1 as the top mark. Biographers later misread X's earlier report cards, spawning a century-old urban legend that he had failed high-school mathematics.",
    },
]

FRESH_ANGLE_BANK: Dict[str, List[str]] = {
    "mary shelley": [
        "1826 pandemic sci-fi novel 'The Last Man' framed via Sibylline leaves found in Cumae",
        "Her annotation and posthumous smuggling of Percy Shelley's banned political poetry past his father Sir Timothy Shelley's censorship ban",
        "Etymology of 'Frankenstein' linked to Castle Frankenstein in Darmstadt and the alchemist Johann Konrad Dippel's 'Dippel's Oil'",
    ],
    "alan turing": [
        "1952 mathematical biology paper 'The Chemical Basis of Morphogenesis' predicting reaction-diffusion Belousov-Zhabotinsky stripes",
        "His world-class marathon running (2 hours 46 minutes in 1947, nearly qualifying for the 1948 London Olympics)",
        "Turochamp — the 1948 chess algorithm he had to 'execute' manually on paper taking 30 minutes per move because no computer could run it yet",
    ],
    "stanley kubrick": [
        "His early career as a teenage staff photographer for Look magazine and chess hustler in Washington Square Park",
        "His massive archival research card catalog ('The Napoleon Box') of 15,000 index cards tracking every single day of Napoleon Bonaparte's life",
    ],
    "satyajit ray": [
        "His award-winning Roman typefaces (Ray Roman, Ray Bizarre, Daphnis) and calligraphic jacket designs for Signet Press (including Jim Corbett's Man-Eaters of Kumaon in tiger stripes)",
        "His 1967 unproduced sci-fi screenplay 'The Alien' based on 'Bankubabur Bandhu'",
    ],
    "srinivasa ramanujan": [
        "The 1976 rediscovery of his 'Lost Notebook' at Trinity College's Wren Library containing mock theta functions used in modern string theory and black hole entropy",
        "His first 1911 published paper in the Journal of the Indian Mathematical Society on properties of Bernoulli numbers",
    ],
}


def _tokenize(text: str) -> List[str]:
    words = re.findall(r"[a-z0-9]{3,}", (text or "").lower())
    return [w for w in words if w not in STOPWORDS]


def _char_ngrams(text: str, n: int = 3) -> Counter:
    clean = re.sub(r"[^a-z0-9 ]", " ", (text or "").lower())
    clean = re.sub(r"\s+", " ", clean).strip()
    if len(clean) < n:
        return Counter([clean])
    return Counter(clean[i : i + n] for i in range(len(clean) - n + 1))


def _cosine_counter(c1: Counter, c2: Counter) -> float:
    if not c1 or not c2:
        return 0.0
    common = set(c1.keys()) & set(c2.keys())
    num = sum(c1[k] * c2[k] for k in common)
    den1 = math.sqrt(sum(v * v for v in c1.values()))
    den2 = math.sqrt(sum(v * v for v in c2.values()))
    if den1 == 0 or den2 == 0:
        return 0.0
    return num / (den1 * den2)


def compute_angle_similarity(text_a: str, text_b: str, entity_name: str = "") -> float:
    """Compute disentangled angle similarity after stripping the target entity tokens."""
    ent_tokens = set(_tokenize(entity_name))
    toks_a = [t for t in _tokenize(text_a) if t not in ent_tokens]
    toks_b = [t for t in _tokenize(text_b) if t not in ent_tokens]

    word_sim = _cosine_counter(Counter(toks_a), Counter(toks_b))

    # Also compute character trigram similarity on entity-stripped strings
    stripped_a = " ".join(toks_a)
    stripped_b = " ".join(toks_b)
    ngram_sim = _cosine_counter(_char_ngrams(stripped_a, 4), _char_ngrams(stripped_b, 4))

    # Jaccard overlap on rare content tokens (>= 6 chars)
    rare_a = {t for t in toks_a if len(t) >= 6}
    rare_b = {t for t in toks_b if len(t) >= 6}
    shared_rare = len(rare_a & rare_b)
    rare_overlap = (
        shared_rare / max(1, min(len(rare_a), len(rare_b)))
        if (rare_a and rare_b)
        else 0.0
    )

    combined = 0.45 * word_sim + 0.25 * ngram_sim + 0.30 * rare_overlap
    if shared_rare >= 4:
        combined = max(combined, 0.72 + min(0.24, shared_rare * 0.03))
    elif shared_rare == 3:
        combined = max(combined, 0.54)
    return round(min(0.99, combined), 2)


class QuizArchiveEngine:
    """SQLite-backed Disentangled Entity + Funda Angle Quiz Archive."""

    def __init__(self, db_path: Path = DB_PATH) -> None:
        self.db_path = db_path
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS archive_questions (
                    id TEXT PRIMARY KEY,
                    tournament TEXT,
                    year INTEGER,
                    category TEXT,
                    target_answer TEXT,
                    aliases_json TEXT,
                    canonical_funda TEXT,
                    question_excerpt TEXT
                )
                """
            )
            cur = conn.execute("SELECT COUNT(*) FROM archive_questions")
            count = cur.fetchone()[0]
            if count == 0:
                for q in SEED_ARCHIVE_QUESTIONS:
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO archive_questions
                        (id, tournament, year, category, target_answer, aliases_json, canonical_funda, question_excerpt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            q["id"],
                            q["tournament"],
                            q["year"],
                            q["category"],
                            q["target_answer"],
                            json.dumps(q.get("aliases", [])),
                            q["canonical_funda"],
                            q["question_excerpt"],
                        ),
                    )
            conn.commit()

    def list_questions(
        self, search_query: str = "", category: str = ""
    ) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM archive_questions ORDER BY year DESC, id ASC"
            ).fetchall()

        items: List[Dict[str, Any]] = []
        q_lower = search_query.strip().lower()
        cat_lower = category.strip().lower()
        for r in rows:
            item = {
                "id": r["id"],
                "tournament": r["tournament"],
                "year": r["year"],
                "category": r["category"],
                "target_answer": r["target_answer"],
                "aliases": json.loads(r["aliases_json"] or "[]"),
                "canonical_funda": r["canonical_funda"],
                "question_excerpt": r["question_excerpt"],
            }
            if cat_lower and cat_lower != "all" and cat_lower not in item["category"].lower():
                continue
            if q_lower:
                blob = f"{item['target_answer']} {item['canonical_funda']} {item['question_excerpt']} {item['tournament']}".lower()
                if q_lower not in blob and compute_angle_similarity(q_lower, blob) < 0.18:
                    continue
            items.append(item)
        return items

    def add_question(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        q_id = payload.get("id") or f"USR-2026-{int(math.fabs(hash(payload.get('question_excerpt', ''))) % 900 + 100)}"
        item = {
            "id": q_id,
            "tournament": payload.get("tournament", "Setter Custom Set"),
            "year": int(payload.get("year", 2026)),
            "category": payload.get("category", "General"),
            "target_answer": payload.get("target_answer", "Unknown"),
            "aliases": payload.get("aliases", []),
            "canonical_funda": payload.get("canonical_funda", payload.get("question_excerpt", "")[:160]),
            "question_excerpt": payload.get("question_excerpt", ""),
        }
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO archive_questions
                (id, tournament, year, category, target_answer, aliases_json, canonical_funda, question_excerpt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item["id"],
                    item["tournament"],
                    item["year"],
                    item["category"],
                    item["target_answer"],
                    json.dumps(item["aliases"]),
                    item["canonical_funda"],
                    item["question_excerpt"],
                ),
            )
            conn.commit()
        return item

    def bulk_import_raw_text(
        self,
        raw_text: str,
        tournament: str = "Imported Quiz Archive",
        year: int = 2025,
        category: str = "General",
    ) -> Dict[str, Any]:
        """Parse raw pasted quiz transcripts (Q/Ans blocks or JSON) and index into SQLite."""
        raw_text = (raw_text or "").strip()
        if not raw_text:
            return {"imported_count": 0, "items": []}

        parsed_entries: List[Dict[str, Any]] = []

        # 1. Try JSON array first
        if raw_text.startswith("["):
            try:
                arr = json.loads(raw_text)
                if isinstance(arr, list):
                    for obj in arr:
                        if isinstance(obj, dict) and obj.get("question_excerpt") and obj.get("target_answer"):
                            parsed_entries.append(
                                {
                                    "tournament": obj.get("tournament", tournament),
                                    "year": int(obj.get("year", year)),
                                    "category": obj.get("category", category),
                                    "target_answer": str(obj["target_answer"]).strip(),
                                    "question_excerpt": str(obj["question_excerpt"]).strip(),
                                    "canonical_funda": obj.get("canonical_funda")
                                    or self._extract_canonical_funda(
                                        str(obj["question_excerpt"]), str(obj["target_answer"])
                                    ),
                                }
                            )
            except Exception:
                pass

        # 2. Parse Q / Ans plain-text blocks (e.g. "Q1: ...\nAns: ...")
        if not parsed_entries:
            blocks = re.split(r"\n\s*\n+", raw_text)
            for blk in blocks:
                ans_match = re.search(
                    r"(?:^|\n)\s*(?:Ans(?:wer)?|A)\s*[:\-]\s*(.+)$",
                    blk.strip(),
                    flags=re.IGNORECASE | re.MULTILINE,
                )
                if ans_match:
                    ans = ans_match.group(1).strip()
                    q_part = blk[: ans_match.start()].strip()
                    q_part = re.sub(r"^(?:Q(?:uestion)?\s*\d*\s*[:.\-]\s*|\d+[.)]\s*)", "", q_part, flags=re.IGNORECASE).strip()
                    if q_part and ans:
                        parsed_entries.append(
                            {
                                "tournament": tournament,
                                "year": year,
                                "category": category,
                                "target_answer": ans,
                                "question_excerpt": q_part,
                                "canonical_funda": self._extract_canonical_funda(q_part, ans),
                            }
                        )

        created_items = [self.add_question(entry) for entry in parsed_entries]
        return {"imported_count": len(created_items), "items": created_items}

    @staticmethod
    def _extract_canonical_funda(question_text: str, target_answer: str) -> str:
        """Create a compact disentangled angle signature by removing boilerplate prompts."""
        cleaned = re.sub(
            r"\b(?:Identify|Name|Who is|What is|Connect|Funda)\s+[XYZ]\b\.?",
            "",
            question_text,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned[:175]

    def check_deduplication(
        self,
        question_text: str,
        target_answer: str,
        extracted_funda: str,
        aliases: List[str] | None = None,
    ) -> ArchiveDeduplicationReport:
        """Compare draft question against archive using disentangled Entity + Angle scoring."""
        all_rows = self.list_questions()
        target_norm = target_answer.strip().lower()
        alias_norms = {a.strip().lower() for a in (aliases or []) if a.strip()}
        alias_norms.add(target_norm)

        entity_freq = 0
        matches: List[ArchiveMatch] = []
        combined_draft_funda = f"{extracted_funda} {question_text}"

        for row in all_rows:
            row_ans = row["target_answer"].strip().lower()
            row_aliases = {a.strip().lower() for a in row.get("aliases", [])}
            row_aliases.add(row_ans)

            is_entity_match = bool(alias_norms & row_aliases) or (
                len(target_norm) >= 5 and (target_norm in row_ans or row_ans in target_norm)
            )
            if is_entity_match:
                entity_freq += 1

            angle_sim = compute_angle_similarity(
                combined_draft_funda,
                f"{row['canonical_funda']} {row['question_excerpt']}",
                entity_name=target_answer,
            )
            lex_sim = _cosine_counter(
                Counter(_tokenize(question_text)),
                Counter(_tokenize(row["question_excerpt"])),
            )

            if is_entity_match or angle_sim >= 0.25:
                if is_entity_match and angle_sim >= 0.36:
                    verdict = "EXACT_ANGLE_REUSE"
                elif angle_sim >= 0.32:
                    verdict = "SIMILAR_FUNDA"
                elif is_entity_match:
                    verdict = "SAME_ENTITY_FRESH_ANGLE"
                else:
                    verdict = "DISTINCT"

                matches.append(
                    ArchiveMatch(
                        id=row["id"],
                        tournament=row["tournament"],
                        year=row["year"],
                        category=row["category"],
                        target_answer=row["target_answer"],
                        question_excerpt=row["question_excerpt"],
                        canonical_funda=row["canonical_funda"],
                        entity_match=is_entity_match,
                        angle_similarity=round(min(0.98, angle_sim * 1.25 if verdict == "EXACT_ANGLE_REUSE" else angle_sim), 2),
                        lexical_overlap=round(lex_sim, 2),
                        verdict=verdict,
                    )
                )

        matches.sort(
            key=lambda m: (1 if m.entity_match else 0, m.angle_similarity),
            reverse=True,
        )
        top_matches = matches[:5]
        collision = any(
            m.verdict in ("EXACT_ANGLE_REUSE", "SIMILAR_FUNDA") and m.angle_similarity >= 0.36
            for m in top_matches
        )

        max_angle_sim = max((m.angle_similarity for m in top_matches), default=0.0)
        if collision:
            orig_score = max(18, int(100 - max_angle_sim * 82))
        elif entity_freq > 0:
            orig_score = max(72, int(94 - max_angle_sim * 35))
        else:
            orig_score = 96

        fresh_suggestions = FRESH_ANGLE_BANK.get(target_norm, [])
        if not fresh_suggestions:
            # Look for other archive entries on same entity with low angle similarity
            fresh_suggestions = [
                f"Alternate archival angle ({m.tournament} {m.year}): {m.canonical_funda}"
                for m in top_matches
                if m.entity_match and m.angle_similarity < 0.35
            ]

        return ArchiveDeduplicationReport(
            originality_score=orig_score,
            canonical_funda_extracted=extracted_funda,
            entity_frequency_in_archive=entity_freq,
            angle_collision_detected=collision,
            matches=top_matches,
            fresh_angle_suggestions=fresh_suggestions[:3],
        )


archive_engine = QuizArchiveEngine()
