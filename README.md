# CRUCIBLE // Q-Lint — Competitive Quizmaster Diagnostic IDE

> **AI-Assisted Question Quality Control, Clue-Ablation Workability Linter & Multi-API Federated Truth Engine**  
> Built for competitive quiz circuits (**KQA**, **BQC**, **QFI**, **Nihilanth**, **Campus Open Quizzes**) and engineered as a rigorous CSE system combining **Groq LPU** (`llama-3.3-70b-versatile` & `llama-3.1-8b-instant`), **Google Gemini** (`gemini-2.5-flash`), and **9 Federated Truth-Finding APIs**.

---

## 1. System Architecture & 4 Core Diagnostic Modules

### Module 1: Clue-Ablation "Workability" Funnel & Cross-Model Blinded Solver
Instead of single-shot difficulty guessing, **Q-Lint** decomposes a draft question into ordered atomic clues $C = \{c_1, c_2, \dots, c_k\}$ and runs progressive prefix ablations:
- Pits **three blinded solver personas** across two distinct model families (**Google Gemini 2.5 Flash** as *Veteran Circuit Quizzer*, **Groq Llama-3.3-70B** as *Lateral Open Generalist*, and **Groq Llama-3.1-8B** as *Campus Prelim Surface Solver*).
- Computes **Shannon Entropy decay** $H(A \mid c_{1..i})$ in bits and **Information Gain** $\Delta H(c_i)$ per clue:
  - Flags **`PREMATURE_GIVEAWAY`** when $c_1$ collapses uncertainty immediately (ruining Pounce/Bounce tension).
  - Flags **`DEAD_WEIGHT`** when adding $c_i$ yields $\Delta H < 0.22\text{ bits}$.
  - Flags **`OPTIMAL_NARROWING`** / **`FINAL_LOCK`** when entropy decays smoothly across clues.

### Module 2: Single-Hop Googleability Probe & Adversarial "Cook" Detector
- **Live Single-Hop Search Probe:** Extracts masked surface clauses from the question and fires live queries against **Wikipedia Search**, **DuckDuckGo Web Search**, and optional **Serper Google SERP**. If a single clause leaks the target answer in the top snippets, it highlights the leaking span in red and suggests a **2-Hop Oblique Periphrasis**.
- **Adversarial "Cook" Detector:** Extracts formal entity constraints and tasks an adversarial solver (backed by **Wikidata Knowledge Graph** + **Groq/Gemini**) to find any unintended competing answer $A' \neq A^*$ that satisfies every constraint in the draft (e.g. catching **John Polidori / *The Vampyre*** on an under-constrained 1816 Villa Diodati prompt intended for **Mary Shelley / *Frankenstein***).

### Module 3: Federated Multi-API Truth-Finding & Urban Legend Filter
Fans out parallel async verification queries across **7 zero-key public knowledge APIs + 2 optional search APIs**:
1. **Wikipedia REST v1 Summary API** (`en.wikipedia.org/api/rest_v1/page/summary`)
2. **Wikipedia Action Full-Text Search API** (`en.wikipedia.org/w/api.php`)
3. **Wikidata Knowledge Graph & Entity Claims API** (`www.wikidata.org/w/api.php`)
4. **DuckDuckGo Instant Answer & Web Search API** (`api.duckduckgo.com` & `html.duckduckgo.com`)
5. **OpenAlex Academic & Scientific Knowledge Graph** (`api.openalex.org/works`)
6. **OpenLibrary Books & First Editions API** (`openlibrary.org/search.json`)
7. **CrossRef Historical Publication & DOI Registry** (`api.crossref.org/works`)
8. **Free Dictionary & Etymology API** (`api.dictionaryapi.dev`)
9. **Tavily AI Research Search & Serper Google SERP** *(optional key plug-ins)*

Includes an explicit **Apocryphal Trivia & Urban Legend Filter** that flags notorious quizmaster myths (e.g., *"Einstein failed high-school mathematics"*, *"Percy Shelley's calcified heart vs. liver biographical debate"*, *"Napoleon's height"*, *"Vikings' horned helmets"*).

### Module 4: Disentangled "Angle-Aware" Archive Deduplication & 2-Hop Connect Workbench
- **Disentangled Entity + Funda Retrieval (SQLite):** Separates `target_entity` frequency (*"Mary Shelley appears 3 times in archive"*) from `canonical_funda` angle similarity (*"89% match with BQC 2022 calcified heart question"*), while recommending fresh unused angles on the same entity.
- **2-Hop Knowledge-Graph Connect Workbench:** Takes 2–4 seed entities or a theme, queries Wikidata Q-IDs and Wikipedia summaries, and synthesizes a verified 4-clue progressive Connect question.

---

## 2. Quickstart

```powershell
# 1. Activate virtual environment
.venv\Scripts\activate

# 2. (Optional) Configure GEMINI_API_KEY and GROQ_API_KEY in .env
#    You can also paste them live inside the UI via the "⚙ API Keys & Hub" modal!
copy .env.example .env

# 3. Start the Full-Stack Server
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Then open **http://127.0.0.1:8000** in your browser.

---

## 3. Running Tests & CSE Evaluation Benchmark

```powershell
.venv\Scripts\python.exe -m pytest -v
```
