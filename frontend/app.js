/**
 * CRUCIBLE // Q-Lint v2.0 Frontend Controller
 * Interactive Setter IDE, 5-Axis Radar SVG, Entropy Decay SVG,
 * Live Pounce Simulator, Connect Graph Topology & Slide Deck Exporter.
 */

let PRESETS_CACHE = { questions: [], connects: [] };
let LAST_DIAGNOSTIC = null;
let PREVIOUS_SCORE = null;
let UNDO_QUESTION_TEXT = null;
let CONFIG_STATUS = null;
let ACTIVE_PRESET_ID = "";
let CURRENT_ROUND_NAME = "KQA Open Finals — Round 1";
let IS_SPEAKING_MIC = false;
let VERSION_SNAPSHOTS = [];
let LAST_BENCHMARK_DATA = null;

// Playtest simulator state
let PLAYTEST_STATE = {
  clues: [],
  revealedCount: 1,
  pouncedAtStep: null,
  teamGuess: "",
  submitted: false,
};

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const colors = {
    info: "bg-slate-900/95 border-indigo-500/60 text-indigo-200",
    success: "bg-slate-900/95 border-emerald-500/60 text-emerald-200",
    warning: "bg-slate-900/95 border-amber-500/60 text-amber-200",
    error: "bg-slate-900/95 border-rose-500/60 text-rose-200",
  };
  const icons = {
    info: "⚡",
    success: "✓",
    warning: "⚠",
    error: "✕",
  };
  const el = document.createElement("div");
  el.className = `pointer-events-auto p-3.5 rounded-xl border shadow-2xl backdrop-blur-md text-xs font-medium flex items-center gap-2.5 animate-fade-in ${
    colors[type] || colors.info
  }`;
  el.innerHTML = `<span class="text-sm font-bold">${icons[type] || "⚡"}</span><span class="flex-1">${escapeHtml(
    message
  )}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 0.25s ease";
    setTimeout(() => el.remove(), 260);
  }, 3400);
}

async function initApp() {
  setupKeyboardShortcuts();
  await Promise.all([refreshConfigStatus(), loadPresets(), loadArchiveList()]);
  if (PRESETS_CACHE.questions.length > 0) {
    selectPresetById(PRESETS_CACHE.questions[0].id, false);
    await runDiagnosticLinter();
  }
}

function setupKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openCommandPalette();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runDiagnosticLinter();
    } else if (e.key === "Escape") {
      closeSettingsModal();
      closeSlidePreviewModal();
      closeCommandPalette();
      closeABCompareModal();
    }
  });
}

function switchTab(tabName) {
  const tabs = ["linter", "miner", "playtest", "connect", "setbuilder", "archive", "benchmark"];
  tabs.forEach((t) => {
    const sec = document.getElementById(`tab-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (!sec || !btn) return;
    if (t === tabName) {
      sec.classList.remove("hidden");
      sec.classList.add("flex");
      btn.className =
        "tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-indigo-600 text-white shadow flex items-center gap-1.5";
    } else {
      sec.classList.add("hidden");
      sec.classList.remove("flex");
      btn.className =
        "tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-slate-400 hover:text-white flex items-center gap-1.5";
    }
  });
  if (tabName === "playtest") {
    resetPlaytestSimulator();
  } else if (tabName === "setbuilder") {
    loadRoundSet();
  }
}

async function refreshConfigStatus() {
  try {
    const res = await fetch("/api/config/status");
    CONFIG_STATUS = await res.json();

    const dotGem = document.getElementById("dot-gemini");
    const lblGem = document.getElementById("label-gemini");
    if (CONFIG_STATUS.gemini.configured) {
      dotGem.className = "w-2 h-2 rounded-full bg-emerald-400 pulse-dot";
      lblGem.textContent = `Gemini (${CONFIG_STATUS.gemini.model})`;
    } else {
      dotGem.className = "w-2 h-2 rounded-full bg-amber-400";
      lblGem.textContent = "Gemini (Key)";
    }

    const dotGroq = document.getElementById("dot-groq");
    const lblGroq = document.getElementById("label-groq");
    if (CONFIG_STATUS.groq.configured) {
      dotGroq.className = "w-2 h-2 rounded-full bg-emerald-400 pulse-dot";
      lblGroq.textContent = `Groq (${CONFIG_STATUS.groq.primary_model.split("-").slice(0, 3).join("-")})`;
    } else {
      dotGroq.className = "w-2 h-2 rounded-full bg-amber-400";
      lblGroq.textContent = "Groq LPU (Key)";
    }

    const truthCountEl = document.getElementById("label-truth-count");
    if (truthCountEl) {
      truthCountEl.textContent = `${CONFIG_STATUS.active_truth_api_count} Truth APIs`;
    }

    const grid = document.getElementById("modal-truth-apis-grid");
    if (grid && CONFIG_STATUS.truth_apis) {
      grid.innerHTML = CONFIG_STATUS.truth_apis
        .map(
          (api) => `
        <div class="p-2 rounded-lg bg-slate-900/90 border ${
          api.active ? "border-emerald-700/40" : "border-slate-800"
        } flex flex-col justify-between">
          <div class="flex items-center justify-between gap-1">
            <span class="font-semibold ${
              api.active ? "text-emerald-300" : "text-slate-400"
            }">${escapeHtml(api.name)}</span>
            <span class="text-[10px] font-mono-code px-1.5 py-0.5 rounded ${
              api.active
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-slate-800 text-slate-500"
            }">${api.active ? "ACTIVE" : "KEY OPT"}</span>
          </div>
          <span class="text-[10px] text-slate-400 mt-1">${escapeHtml(api.category)}</span>
        </div>
      `
        )
        .join("");
    }
  } catch (e) {
    console.error("Failed to fetch config status:", e);
  }
}

async function loadPresets() {
  try {
    const res = await fetch("/api/presets");
    PRESETS_CACHE = await res.json();
    renderPresetChips();
  } catch (e) {
    console.error("Failed to load presets:", e);
  }
}

function renderPresetChips() {
  const container = document.getElementById("preset-chips-container");
  if (!container) return;

  const badgeColors = [
    "bg-rose-500/20 text-rose-300 border-rose-500/30",
    "bg-amber-500/20 text-amber-300 border-amber-500/30",
    "bg-purple-500/20 text-purple-300 border-purple-500/30",
    "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  ];

  container.innerHTML = PRESETS_CACHE.questions
    .map((p, idx) => {
      const isActive = p.id === ACTIVE_PRESET_ID;
      const bCls = badgeColors[idx % badgeColors.length];
      return `
      <button onclick="selectPresetById('${escapeHtml(p.id)}', true)" class="preset-chip ${
        isActive ? "active" : ""
      } text-left p-2.5 rounded-xl flex flex-col justify-between gap-1.5">
        <div class="flex items-center justify-between gap-1">
          <span class="text-[10px] font-mono-code font-bold text-slate-400">CASE #${idx + 1}</span>
          <span class="text-[10px] font-mono-code px-1.5 py-0.5 rounded border ${bCls}">
            ${escapeHtml(p.badge)}
          </span>
        </div>
        <div class="text-xs font-bold text-slate-100 line-clamp-1">${escapeHtml(
          p.title.replace(/^\d+\.\s*/, "")
        )}</div>
        <div class="text-[10px] text-emerald-300 font-mono-code">Ans: ${escapeHtml(
          p.target_answer
        )}</div>
      </button>
    `;
    })
    .join("");
}

function selectPresetById(id, autoRun = true) {
  const preset = PRESETS_CACHE.questions.find((p) => p.id === id);
  if (!preset) return;
  ACTIVE_PRESET_ID = id;
  PREVIOUS_SCORE = null;
  UNDO_QUESTION_TEXT = null;
  renderPresetChips();

  document.getElementById("input-question").value = preset.question_text;
  document.getElementById("input-answer").value = preset.target_answer;
  document.getElementById("input-aliases").value = (preset.acceptable_aliases || []).join(", ");
  document.getElementById("input-style").value = preset.quiz_style || "KQA Open";
  document.getElementById("input-mode").value = preset.play_mode || "Pounce + Bounce";
  document.getElementById("input-category").value = preset.category || "General";
  document.getElementById("autofix-changelog").classList.add("hidden");
  document.getElementById("score-delta-badge").classList.add("hidden");
  updateWordCount();
  if (autoRun) {
    runDiagnosticLinter();
  }
}

function splitSentencesClient(text) {
  const raw = (text || "")
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (raw.length >= 4 && raw[raw.length - 1].length < 28) {
    raw[raw.length - 2] = `${raw[raw.length - 2]} ${raw[raw.length - 1]}`;
    raw.pop();
  }
  return raw;
}

function updateWordCount() {
  const text = document.getElementById("input-question").value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const readSec = Math.max(4, Math.round(words / 2.6));
  document.getElementById("word-count-badge").textContent = `${words} words`;
  const rt = document.getElementById("reading-time-badge");
  if (rt) rt.textContent = `~${readSec}s stage read`;

  const sentences = splitSentencesClient(text);
  const pill = document.getElementById("clue-count-pill");
  if (pill) pill.textContent = `${sentences.length} clue${sentences.length === 1 ? "" : "s"}`;

  // Spoken oral cadence / breath-length linter
  const cadenceBadge = document.getElementById("oral-cadence-badge");
  if (cadenceBadge && sentences.length > 0) {
    const maxSentWords = Math.max(...sentences.map((s) => s.split(/\s+/).length));
    if (maxSentWords > 38) {
      cadenceBadge.textContent = `⚠ Long Breath (${maxSentWords}w)`;
      cadenceBadge.className =
        "text-[10px] font-mono-code px-1.5 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-600/50";
    } else {
      cadenceBadge.textContent = `✓ Breath-Safe (max ${maxSentWords}w)`;
      cadenceBadge.className =
        "text-[10px] font-mono-code px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-700/40";
    }
  }
  renderInteractiveCluePills(sentences);
}

function renderInteractiveCluePills(sentences) {
  const container = document.getElementById("interactive-clue-pills");
  if (!container) return;
  if (!sentences.length) {
    container.innerHTML = `<div class="text-slate-500 text-[11px]">Type sentences above to compile into discrete clue steps.</div>`;
    return;
  }
  const roleLabels = ["Hook / Setup", "Lateral Funda", "Narrowing Clue", "Clincher Prompt"];
  container.innerHTML = sentences
    .map((s, idx) => {
      const role =
        idx === 0
          ? roleLabels[0]
          : idx === sentences.length - 1
          ? roleLabels[3]
          : roleLabels[Math.min(idx, 2)];
      return `
      <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-900/90 border border-slate-800/90 hover:border-slate-700 transition">
        <div class="flex items-center gap-2 min-w-0">
          <span class="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono-code text-[10px] font-bold shrink-0">c${
            idx + 1
          }</span>
          <span class="text-[10px] font-semibold text-cyan-300 shrink-0">[${role}]</span>
          <span class="text-[11px] text-slate-300 truncate">${escapeHtml(s)}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button onclick="swapClueOrder(${idx}, -1)" ${
        idx === 0 ? "disabled" : ""
      } title="Move Clue Earlier" class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-indigo-600 disabled:opacity-30 text-[10px] text-slate-200 transition">↑</button>
          <button onclick="swapClueOrder(${idx}, 1)" ${
        idx === sentences.length - 1 ? "disabled" : ""
      } title="Move Clue Later" class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-indigo-600 disabled:opacity-30 text-[10px] text-slate-200 transition">↓</button>
        </div>
      </div>
    `;
    })
    .join("");
}

function swapClueOrder(idx, direction) {
  const text = document.getElementById("input-question").value.trim();
  const sentences = splitSentencesClient(text);
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= sentences.length) return;
  const temp = sentences[idx];
  sentences[idx] = sentences[targetIdx];
  sentences[targetIdx] = temp;
  document.getElementById("input-question").value = sentences.join(" ");
  updateWordCount();
  showToast(`Swapped Clue c${idx + 1} and Clue c${targetIdx + 1} — re-evaluating funnel...`, "info");
  runDiagnosticLinter();
}

async function runDiagnosticLinter() {
  const btn = document.getElementById("btn-run-linter");
  const question_text = document.getElementById("input-question").value.trim();
  const target_answer = document.getElementById("input-answer").value.trim();
  if (!question_text || !target_answer) {
    showToast("Please enter both a Draft Question and a Target Answer (A*).", "warning");
    return;
  }

  const aliasesRaw = document.getElementById("input-aliases").value;
  const acceptable_aliases = aliasesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const quiz_style = document.getElementById("input-style").value;
  const play_mode = document.getElementById("input-mode").value;
  const category = document.getElementById("input-category").value;

  btn.disabled = true;
  btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span><span>Compiling Clues &amp; Querying Truth Hub...</span>`;

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_text,
        target_answer,
        acceptable_aliases,
        quiz_style,
        play_mode,
        category,
      }),
    });
    const diag = await res.json();
    LAST_DIAGNOSTIC = diag;
    renderDiagnosticReport(diag, question_text);
  } catch (err) {
    console.error("Diagnostic failed:", err);
    showToast("Diagnostic pipeline encountered an error.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>⚡ Compile &amp; Run 4-Stage Diagnostics</span>`;
  }
}

function renderDiagnosticReport(diag, rawQuestion) {
  // 1. Overall Score & Delta Badge
  const scoreVal = document.getElementById("overall-score-val");
  const scoreCircle = document.getElementById("overall-score-circle");
  scoreVal.textContent = diag.overall_quality_score;

  const deltaBadge = document.getElementById("score-delta-badge");
  if (PREVIOUS_SCORE !== null && PREVIOUS_SCORE !== diag.overall_quality_score) {
    const diff = diag.overall_quality_score - PREVIOUS_SCORE;
    deltaBadge.classList.remove("hidden");
    deltaBadge.textContent = `${diff > 0 ? "+" : ""}${diff} pts after calibration`;
    deltaBadge.className =
      diff > 0
        ? "px-2 py-0.5 rounded-md text-[11px] font-mono-code font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
        : "px-2 py-0.5 rounded-md text-[11px] font-mono-code font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40";
  }

  if (diag.overall_quality_score >= 80) {
    scoreCircle.className =
      "w-20 h-20 shrink-0 rounded-2xl bg-emerald-500/15 border-2 border-emerald-400 flex flex-col items-center justify-center shadow-lg shadow-emerald-500/10";
  } else if (diag.overall_quality_score >= 62) {
    scoreCircle.className =
      "w-20 h-20 shrink-0 rounded-2xl bg-amber-500/15 border-2 border-amber-400 flex flex-col items-center justify-center shadow-lg shadow-amber-500/10";
  } else {
    scoreCircle.className =
      "w-20 h-20 shrink-0 rounded-2xl bg-rose-500/15 border-2 border-rose-400 flex flex-col items-center justify-center shadow-lg shadow-rose-500/10";
  }

  const vBadge = document.getElementById("verdict-badge");
  vBadge.textContent = diag.verdict_badge;
  if (diag.verdict_badge.includes("READY")) {
    vBadge.className =
      "px-3 py-0.5 rounded-full text-xs font-mono-code font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40";
  } else if (diag.verdict_badge.includes("HAZARD") || diag.verdict_badge.includes("COOK")) {
    vBadge.className =
      "px-3 py-0.5 rounded-full text-xs font-mono-code font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40";
  } else {
    vBadge.className =
      "px-3 py-0.5 rounded-full text-xs font-mono-code font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40";
  }

  const tel = diag.telemetry;
  document.getElementById("telemetry-badge").textContent =
    `⚡ Pipeline: ${tel.total_pipeline_ms}ms • Truth Hub (${tel.apis_invoked.length} APIs): ${tel.truth_hub_latency_ms}ms` +
    (tel.groq_used ? ` • Groq LPU: ${tel.groq_latency_ms}ms` : "") +
    (tel.gemini_used ? ` • Gemini: ${tel.gemini_latency_ms}ms` : "");

  document.getElementById("executive-summary").textContent = diag.executive_summary;

  // Sub-scores & Progress Bars
  const wScore = diag.workability.workability_score;
  const gScore = diag.uniqueness_googleability.google_resistance_score;
  const uScore = diag.uniqueness_googleability.uniqueness_score;
  const tScore = diag.truth_verification.factual_integrity_score;
  const oScore = diag.archive_dedup.originality_score;

  document.getElementById("metric-workability").textContent = `${wScore}/100`;
  document.getElementById("metric-google").textContent = `${gScore}/100`;
  document.getElementById("metric-uniqueness").textContent = `${uScore}/100`;
  document.getElementById("metric-truth").textContent = `${tScore}/100`;
  document.getElementById("metric-originality").textContent = `${oScore}/100`;

  document.getElementById("bar-workability").style.width = `${wScore}%`;
  document.getElementById("bar-google").style.width = `${gScore}%`;
  document.getElementById("bar-uniqueness").style.width = `${uScore}%`;
  document.getElementById("bar-truth").style.width = `${tScore}%`;
  document.getElementById("bar-originality").style.width = `${oScore}%`;

  // Render 5-Axis Radar SVG Chart
  renderRadarChartSvg([wScore, gScore, uScore, tScore, oScore]);

  // Render Inline Annotated Question View
  renderInlineAnnotations(rawQuestion, diag.inline_highlights || []);

  // Render Module 1: Clue-Ablation Workability Funnel + Entropy Decay SVG
  renderWorkabilityFunnel(diag.workability);

  // Render Module 2: Single-Hop Googleability & Cook Detector
  renderUniquenessAndGoogleability(diag.uniqueness_googleability);

  // Render Module 3: Federated Multi-API Truth Verification
  renderTruthVerification(diag.truth_verification);

  // Render Module 4: Disentangled Archive Deduplication
  renderArchiveDeduplication(diag.archive_dedup);

  // Record Draft Calibration Snapshot
  recordVersionSnapshot(rawQuestion, diag);
}

function renderRadarChartSvg(scores) {
  const container = document.getElementById("radar-chart-svg");
  if (!container) return;
  const labels = ["Work", "Search", "Unique", "Truth", "Fresh"];
  const cx = 75;
  const cy = 75;
  const maxR = 48;

  function polarToXY(angleIdx, radius) {
    const angle = (Math.PI * 2 * angleIdx) / 5 - Math.PI / 2;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  }

  // Outer & mid pentagon rings
  const ring100 = [0, 1, 2, 3, 4].map((i) => polarToXY(i, maxR).join(",")).join(" ");
  const ring60 = [0, 1, 2, 3, 4].map((i) => polarToXY(i, maxR * 0.6).join(",")).join(" ");
  const axes = [0, 1, 2, 3, 4]
    .map((i) => {
      const [x, y] = polarToXY(i, maxR);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#1e293b" stroke-width="1" />`;
    })
    .join("");

  const dataPts = scores
    .map((s, i) => {
      const r = (Math.max(10, Math.min(100, s)) / 100) * maxR;
      return polarToXY(i, r).join(",");
    })
    .join(" ");

  const labelEls = labels
    .map((lbl, i) => {
      const [x, y] = polarToXY(i, maxR + 15);
      return `<text x="${x}" y="${y + 3}" text-anchor="middle" fill="#94a3b8" font-size="8.5" font-family="JetBrains Mono, monospace">${lbl}</text>`;
    })
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 150 150" class="w-full h-full">
      <polygon points="${ring100}" fill="rgba(15,23,42,0.5)" stroke="#334155" stroke-width="1" />
      <polygon points="${ring60}" fill="none" stroke="#1e293b" stroke-dasharray="2,2" stroke-width="1" />
      ${axes}
      <polygon points="${dataPts}" fill="rgba(99, 102, 241, 0.28)" stroke="#06b6d4" stroke-width="2" />
      ${scores
        .map((s, i) => {
          const [x, y] = polarToXY(i, (Math.max(10, Math.min(100, s)) / 100) * maxR);
          return `<circle cx="${x}" cy="${y}" r="2.8" fill="#38bdf8" />`;
        })
        .join("")}
      ${labelEls}
    </svg>
  `;
}

function renderEntropyCurveSvg(steps) {
  const container = document.getElementById("entropy-curve-svg");
  if (!container || !steps || !steps.length) return;

  const pts = [4.32, ...steps.map((s) => s.shannon_entropy_bits)];
  const w = 260;
  const h = 95;
  const padX = 24;
  const padY = 14;
  const usableW = w - padX * 2;
  const usableH = h - padY * 2;

  const coords = pts.map((val, idx) => {
    const x = padX + (idx / Math.max(1, pts.length - 1)) * usableW;
    const y = padY + (1 - Math.min(4.5, Math.max(0, val)) / 4.5) * usableH;
    return { x, y, val, label: idx === 0 ? "Prior" : `c${idx}` };
  });

  const polylinePts = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const areaPts = `${coords[0].x},${h - padY} ${polylinePts} ${
    coords[coords.length - 1].x
  },${h - padY}`;

  container.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" class="w-full h-full">
      <!-- Optimal Pounce Window Corridor -->
      <rect x="${padX}" y="${padY + usableH * 0.35}" width="${usableW}" height="${
    usableH * 0.45
  }" fill="rgba(16, 185, 129, 0.07)" stroke="none" />
      <line x1="${padX}" y1="${h - padY}" x2="${w - padX}" y2="${
    h - padY
  }" stroke="#1e293b" stroke-width="1" />
      <polygon points="${areaPts}" fill="rgba(6, 182, 212, 0.14)" />
      <polyline points="${polylinePts}" fill="none" stroke="#06b6d4" stroke-width="2.2" stroke-linecap="round" />
      ${coords
        .map(
          (c) => `
        <circle cx="${c.x}" cy="${c.y}" r="3.5" fill="#6366f1" stroke="#38bdf8" stroke-width="1.5" />
        <text x="${c.x}" y="${c.y - 5}" text-anchor="middle" fill="#e2e8f0" font-size="8.5" font-family="JetBrains Mono">${
            c.val
          }b</text>
        <text x="${c.x}" y="${
            h - 2
          }" text-anchor="middle" fill="#64748b" font-size="8" font-family="JetBrains Mono">${
            c.label
          }</text>
      `
        )
        .join("")}
    </svg>
  `;
}

function renderInlineAnnotations(rawQuestion, highlights) {
  const container = document.getElementById("annotated-question-view");
  let annotated = escapeHtml(rawQuestion);

  const priority = { GOOGLE_LEAK: 1, MYTH_WARNING: 2, VERIFIED_FACT: 3 };
  const sorted = [...highlights].sort(
    (a, b) => (priority[a.category] || 9) - (priority[b.category] || 9)
  );

  sorted.forEach((h) => {
    const cleanSpan = escapeHtml(h.text.trim());
    if (!cleanSpan || cleanSpan.length < 10) return;
    const cls =
      h.category === "GOOGLE_LEAK"
        ? "hl-leak"
        : h.category === "MYTH_WARNING"
        ? "hl-myth"
        : "hl-verified";
    if (annotated.includes(cleanSpan)) {
      annotated = annotated.replace(
        cleanSpan,
        `<span class="${cls}" title="${escapeHtml(h.tooltip)}">${cleanSpan}</span>`
      );
    }
  });

  container.innerHTML = annotated;
}

function renderWorkabilityFunnel(work) {
  document.getElementById("difficulty-tier-badge").textContent = work.difficulty_tier;
  const evData = LAST_DIAGNOSTIC?.style_critique?.pounce_ev_analysis;
  const evStripHtml = evData
    ? `<div class="mt-2 pt-2 border-t border-slate-800/80">
        <div class="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
          <span class="text-[10px] font-mono-code font-bold uppercase text-indigo-300">🎲 Game-Theoretic Pounce EV (${escapeHtml(
            evData.scoring_rules
          )} • Breakeven p &gt; ${evData.breakeven_probability_pct}%)</span>
          <span class="text-[10px] font-mono-code px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-200">${escapeHtml(
            evData.economy_verdict
          )}</span>
        </div>
        <div class="flex flex-wrap gap-1.5 mb-1">
          ${(evData.step_evs || [])
            .map(
              (s) =>
                `<span class="px-2 py-0.5 rounded font-mono-code text-[10px] border ${
                  s.expected_value_pts > 0
                    ? "bg-emerald-950/50 text-emerald-300 border-emerald-700/50"
                    : "bg-rose-950/50 text-rose-300 border-rose-700/50"
                }">${escapeHtml(s.clue_label)}: EV ${s.expected_value_pts > 0 ? "+" : ""}${
                  s.expected_value_pts
                } pts</span>`
            )
            .join("")}
        </div>
        <div class="text-[11px] text-slate-300 mb-2">${escapeHtml(evData.summary)}</div>
        ${
          evData.floor_crack_prediction
            ? `
          <div class="mt-1.5">
            <div class="flex justify-between text-[10px] font-mono-code text-slate-400 mb-1">
              <span>100-Team Floor Prediction:</span>
              <span>
                <strong class="text-amber-300">Pounce ${evData.floor_crack_prediction.pounce_crack_pct}%</strong> •
                <strong class="text-emerald-300">Bounce ${evData.floor_crack_prediction.bounce_crack_pct}%</strong> •
                <strong class="text-slate-400">Pass ${evData.floor_crack_prediction.unanswered_pct}%</strong>
              </span>
            </div>
            <div class="w-full h-2 rounded-full overflow-hidden flex bg-slate-950">
              <div class="bg-amber-400 h-full" style="width:${evData.floor_crack_prediction.pounce_crack_pct}%"></div>
              <div class="bg-emerald-500 h-full" style="width:${evData.floor_crack_prediction.bounce_crack_pct}%"></div>
              <div class="bg-slate-700 h-full" style="width:${evData.floor_crack_prediction.unanswered_pct}%"></div>
            </div>
          </div>
        `
            : ""
        }
      </div>`
    : "";

  document.getElementById("pounce-calibration-box").innerHTML = `
    <div class="flex flex-col gap-1">
      <div><strong class="text-cyan-300">Pounce/Bounce Diagnosis:</strong> ${escapeHtml(
        work.pounce_calibration
      )}</div>
      <div class="font-mono-code text-[11px] text-slate-400">${escapeHtml(
        work.funnel_diagnosis
      )}</div>
      ${evStripHtml}
    </div>
  `;

  renderEntropyCurveSvg(work.ablation_steps || []);

  const stepsContainer = document.getElementById("ablation-steps-container");
  stepsContainer.innerHTML = work.ablation_steps
    .map((step, i) => {
      const clueObj = work.clues[i] || { role: "Clue Segment", text: step.combined_text };
      const entropyPct = Math.min(100, Math.round((step.shannon_entropy_bits / 4.35) * 100));
      const verdictColors = {
        PREMATURE_GIVEAWAY: "bg-rose-500/20 text-rose-300 border-rose-500/40",
        DEAD_WEIGHT: "bg-amber-500/20 text-amber-300 border-amber-500/40",
        FINAL_LOCK: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
        OPTIMAL_NARROWING: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
        UNRESOLVED: "bg-rose-500/20 text-rose-300 border-rose-500/40",
      };
      const vCls = verdictColors[step.clue_verdict] || verdictColors.OPTIMAL_NARROWING;

      const guessesHtml = step.solver_guesses
        .map(
          (g) => `
        <div class="p-2.5 rounded-xl bg-slate-950/90 border ${
          g.matched_target ? "border-emerald-600/60" : "border-slate-800"
        } flex flex-col justify-between gap-1">
          <div class="flex items-center justify-between gap-1">
            <span class="text-[10px] font-semibold text-slate-300">${escapeHtml(g.persona)}</span>
            <span class="text-[10px] font-mono-code px-1.5 py-0.5 rounded ${
              g.matched_target
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-slate-800 text-slate-400"
            }">${Math.round(g.confidence * 100)}%</span>
          </div>
          <div class="text-xs font-bold ${
            g.matched_target ? "text-emerald-300" : "text-slate-200"
          }">
            ${g.matched_target ? "✓ " : "→ "}${escapeHtml(g.top_guess)}
          </div>
          <div class="text-[10px] text-slate-400 leading-snug">${escapeHtml(g.reasoning)}</div>
          <div class="text-[9px] font-mono-code text-slate-500 pt-1 border-t border-slate-900">
            ${escapeHtml(g.provider)}
          </div>
        </div>
      `
        )
        .join("");

      return `
      <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-mono-code text-xs font-bold">
              Step ${step.step_index}: ${step.clues_included.join(" + ")}
            </span>
            <span class="text-xs font-semibold text-slate-200">${escapeHtml(clueObj.role)}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-mono-code text-cyan-300">
              H = ${step.shannon_entropy_bits}b (ΔH = -${step.info_gain_bits}b)
            </span>
            <span class="px-2 py-0.5 rounded text-[10px] font-mono-code font-semibold border ${vCls}">
              ${escapeHtml(step.clue_verdict)}
            </span>
          </div>
        </div>

        <p class="text-xs text-slate-200 italic mb-2.5 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/70">
          "${escapeHtml(clueObj.text)}"
        </p>

        <div class="mb-3">
          <div class="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>Candidate Narrowing Progress</span>
            <span>Blinded Solver Consensus: ${Math.round(step.consensus_confidence * 100)}%</span>
          </div>
          <div class="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden flex">
            <div class="bg-gradient-to-r from-cyan-500 to-indigo-500 h-full transition-all duration-500" style="width: ${
              100 - entropyPct
            }%"></div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          ${guessesHtml}
        </div>
      </div>
    `;
    })
    .join("");

  const recContainer = document.getElementById("workability-recommendations");
  recContainer.innerHTML =
    `<div class="font-bold text-slate-200 mb-1">Setter Calibration Notes:</div>` +
    work.recommendations
      .map(
        (r) =>
          `<div class="flex items-start gap-2 text-slate-300"><span>•</span><span>${escapeHtml(
            r
          )}</span></div>`
      )
      .join("");
}

function renderUniquenessAndGoogleability(uniq) {
  const leaksContainer = document.getElementById("search-leaks-container");
  if (!uniq.single_hop_leaks || uniq.single_hop_leaks.length === 0) {
    leaksContainer.innerHTML = `<div class="text-emerald-300">✓ All clauses passed 1-hop search resistance.</div>`;
  } else {
    leaksContainer.innerHTML = uniq.single_hop_leaks
      .map(
        (l) => `
      <div class="p-2.5 rounded-xl bg-slate-950/90 border ${
        l.leaked_in_top_results ? "border-rose-500/60" : "border-emerald-700/40"
      }">
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="font-mono-code text-[10px] text-slate-400">${escapeHtml(l.source_api)}</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono-code font-semibold ${
            l.leaked_in_top_results
              ? "bg-rose-500/20 text-rose-300"
              : "bg-emerald-500/20 text-emerald-300"
          }">${l.leaked_in_top_results ? "1-HOP GOOGLE LEAK" : "SEARCH RESISTANT"}</span>
        </div>
        <div class="text-[11px] text-slate-200 mb-1">
          <strong>Query:</strong> <code class="text-indigo-300">${escapeHtml(l.search_query)}</code>
        </div>
        ${
          l.matched_snippet
            ? `<div class="text-[10px] text-slate-400 bg-slate-900 p-1.5 rounded mb-1.5">${escapeHtml(
                l.matched_snippet
              )}</div>`
            : ""
        }
        ${
          l.oblique_rewrite_suggestion
            ? `<div class="text-[11px] text-rose-200"><strong>2-Hop Fix:</strong> ${escapeHtml(
                l.oblique_rewrite_suggestion
              )}</div>`
            : ""
        }
      </div>
    `
      )
      .join("");
  }

  const cookContainer = document.getElementById("cook-candidates-container");
  const cookHtml = (uniq.cook_candidates || [])
    .map((c) => {
      const highRisk = c.cook_validity_score >= 0.5;
      return `
      <div class="p-2.5 rounded-xl bg-slate-950/90 border ${
        highRisk ? "border-amber-500/70" : "border-emerald-700/40"
      }">
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="font-bold text-xs ${
            highRisk ? "text-amber-300" : "text-emerald-300"
          }">${escapeHtml(c.entity_name)} ${
        c.wikidata_id ? `(${escapeHtml(c.wikidata_id)})` : ""
      }</span>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono-code font-semibold ${
            highRisk
              ? "bg-amber-500/20 text-amber-300"
              : "bg-emerald-500/20 text-emerald-300"
          }">Cook Risk: ${Math.round(c.cook_validity_score * 100)}%</span>
        </div>
        <p class="text-[11px] text-slate-300 mb-1.5">${escapeHtml(c.explanation)}</p>
        ${
          c.breaking_constraint
            ? `<div class="text-[10px] text-slate-400"><strong>Constraint Check:</strong> ${escapeHtml(
                c.breaking_constraint
              )}</div>`
            : ""
        }
      </div>
    `;
    })
    .join("");

  const patchHtml = uniq.disambiguation_patch
    ? `<div class="mt-2 p-2.5 rounded-xl bg-amber-950/50 border border-amber-700/50 text-[11px] text-amber-200">
        <strong>Recommended Disambiguation Patch:</strong> ${escapeHtml(uniq.disambiguation_patch)}
       </div>`
    : "";

  cookContainer.innerHTML = cookHtml + patchHtml;
}

function renderTruthVerification(truth) {
  document.getElementById("truth-summary-badge").textContent =
    `${truth.apis_queried_count} Truth APIs Queried • ${truth.total_evidence_snippets} Grounding Citations`;

  const meta = truth.entity_metadata || {};
  const metaBar = document.getElementById("wikidata-entity-bar");
  if (meta.qid) {
    metaBar.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono-code text-[11px] font-bold mr-2">
            Wikidata ${escapeHtml(meta.qid)}
          </span>
          <strong class="text-white">${escapeHtml(meta.label)}</strong> —
          <span class="text-slate-300">${escapeHtml(meta.description || "")}</span>
        </div>
        <a href="${escapeHtml(meta.url)}" target="_blank" class="text-indigo-400 hover:underline font-mono-code text-[11px]">
          View Knowledge Graph ↗
        </a>
      </div>
    `;
  } else {
    metaBar.textContent = "Canonical entity verified via Wikipedia & Federated Search Hub.";
  }

  const claimsContainer = document.getElementById("truth-claims-container");
  claimsContainer.innerHTML = (truth.claims || [])
    .map((c) => {
      const isMyth = c.verdict === "APOCRYPHAL_MYTH" || c.verdict === "CONTRADICTED";
      const isContested = c.verdict === "CONTESTED";
      const badgeCls = isMyth
        ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
        : isContested
        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
        : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";

      const evHtml = (c.evidence || [])
        .slice(0, 3)
        .map(
          (e) => `
        <a href="${escapeHtml(e.url)}" target="_blank" class="block p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 hover:border-indigo-500/50 transition">
          <div class="flex items-center justify-between text-[10px] text-indigo-300 font-mono-code mb-0.5">
            <span class="truncate">[${escapeHtml(e.api_name)}] ${escapeHtml(e.title)}</span>
            <span>↗</span>
          </div>
          <div class="text-[11px] text-slate-400 line-clamp-2">${escapeHtml(e.snippet)}</div>
        </a>
      `
        )
        .join("");

      return `
      <div class="p-3.5 rounded-xl bg-slate-900/80 border ${
        isMyth ? "border-rose-500/60" : isContested ? "border-amber-500/50" : "border-slate-800"
      }">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <span class="text-xs font-semibold text-slate-200">Claim ${escapeHtml(
            c.claim_id
          )}: "${escapeHtml(c.claim_text)}"</span>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono-code font-semibold border ${badgeCls}">
            ${escapeHtml(c.verdict)} (${Math.round(c.confidence * 100)}%)
          </span>
        </div>
        <p class="text-xs ${
          isMyth ? "text-rose-200 font-medium" : isContested ? "text-amber-200" : "text-slate-300"
        } mb-2">
          ${escapeHtml(c.explanation)}
        </p>
        <div class="flex flex-wrap items-center gap-1.5 mb-2.5">
          <span class="text-[10px] text-slate-400">Corroborating APIs:</span>
          ${(c.apis_consulted || [])
            .map(
              (a) =>
                `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono-code text-cyan-300">${escapeHtml(
                  a
                )}</span>`
            )
            .join("")}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          ${evHtml}
        </div>
      </div>
    `;
    })
    .join("");
}

function renderArchiveDeduplication(arch) {
  const badge = document.getElementById("archive-collision-badge");
  badge.textContent = `Entity Asked ${arch.entity_frequency_in_archive}x in Archive • ${
    arch.angle_collision_detected ? "ANGLE COLLISION DETECTED" : "FRESH ANGLE"
  }`;
  badge.className = arch.angle_collision_detected
    ? "px-2.5 py-1 rounded-lg text-xs font-mono-code font-semibold bg-rose-950/70 text-rose-300 border border-rose-700/50"
    : "px-2.5 py-1 rounded-lg text-xs font-mono-code font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-700/50";

  const matchesContainer = document.getElementById("archive-matches-container");
  if (!arch.matches || arch.matches.length === 0) {
    matchesContainer.innerHTML = `<div class="text-xs text-emerald-300">✓ Zero archive collisions found for this entity or angle.</div>`;
  } else {
    matchesContainer.innerHTML = arch.matches
      .map((m) => {
        const isReuse = m.verdict === "EXACT_ANGLE_REUSE" || m.verdict === "SIMILAR_FUNDA";
        return `
        <div class="p-3 rounded-xl bg-slate-900/80 border ${
          isReuse ? "border-rose-500/60" : "border-slate-800"
        }">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
            <div class="flex items-center gap-2">
              <span class="font-mono-code text-xs font-bold text-indigo-300">${escapeHtml(
                m.id
              )}</span>
              <span class="text-xs font-semibold text-white">${escapeHtml(m.tournament)} (${
          m.year
        })</span>
              <span class="text-xs text-emerald-300">Ans: ${escapeHtml(m.target_answer)}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[11px] font-mono-code text-slate-300">Angle Sim: ${Math.round(
                m.angle_similarity * 100
              )}%</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono-code font-semibold ${
                isReuse
                  ? "bg-rose-500/20 text-rose-300"
                  : "bg-emerald-500/20 text-emerald-300"
              }">${escapeHtml(m.verdict)}</span>
            </div>
          </div>
          <div class="text-[11px] text-cyan-300 mb-1">
            <strong>Archived Funda Signature:</strong> ${escapeHtml(m.canonical_funda)}
          </div>
          <div class="text-[11px] text-slate-400 italic">"${escapeHtml(m.question_excerpt)}"</div>
        </div>
      `;
      })
      .join("");
  }

  const freshContainer = document.getElementById("fresh-angles-container");
  if (arch.fresh_angle_suggestions && arch.fresh_angle_suggestions.length > 0) {
    freshContainer.innerHTML = `
      <div class="p-3 rounded-xl bg-indigo-950/40 border border-indigo-700/40 text-xs">
        <div class="font-semibold text-indigo-300 mb-1.5">💡 Fresh / Less-Overused Angles Available for This Entity:</div>
        ${arch.fresh_angle_suggestions
          .map(
            (s) =>
              `<div class="text-slate-300 flex items-start gap-2 mb-1"><span>→</span><span>${escapeHtml(
                s
              )}</span></div>`
          )
          .join("")}
      </div>
    `;
  } else {
    freshContainer.innerHTML = "";
  }
}

async function triggerAutofix(fixType) {
  const question_text = document.getElementById("input-question").value.trim();
  const target_answer = document.getElementById("input-answer").value.trim();
  const quiz_style = document.getElementById("input-style").value;
  if (!question_text || !target_answer) return;

  UNDO_QUESTION_TEXT = question_text;
  PREVIOUS_SCORE = LAST_DIAGNOSTIC ? LAST_DIAGNOSTIC.overall_quality_score : null;

  const changelog = document.getElementById("autofix-changelog");
  changelog.classList.remove("hidden");
  changelog.textContent = `Applying ${fixType} calibration surgery via Dual-Engine LLM...`;

  try {
    const res = await fetch("/api/autofix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_text,
        target_answer,
        quiz_style,
        fix_type: fixType,
        diagnostic_context: LAST_DIAGNOSTIC
          ? {
              verdict: LAST_DIAGNOSTIC.verdict_badge,
              disambiguation_patch:
                LAST_DIAGNOSTIC.uniqueness_googleability?.disambiguation_patch,
            }
          : {},
      }),
    });
    const data = await res.json();
    document.getElementById("input-question").value = data.rewritten_text;
    document.getElementById("autofix-engine-badge").textContent = `via ${data.engine_used}`;
    updateWordCount();

    changelog.innerHTML = `
      <div class="flex items-center justify-between mb-1.5">
        <span class="font-bold text-indigo-300">✓ Applied ${escapeHtml(fixType)} (${escapeHtml(
      data.engine_used
    )})</span>
        <button onclick="undoLastAutofix()" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-amber-300 border border-slate-700">
          ↶ Undo Rewrite
        </button>
      </div>
      <div class="flex flex-col gap-1 text-slate-200 mb-2">
        ${(data.changes_made || []).map((c) => `<div>• ${escapeHtml(c)}</div>`).join("")}
      </div>
      <details class="text-[11px] text-slate-400">
        <summary class="cursor-pointer hover:text-slate-200">Compare Before / After Prompt Diff</summary>
        <div class="mt-1.5 p-2 rounded bg-rose-950/30 border border-rose-800/30 text-rose-200 line-through mb-1">${escapeHtml(
          data.original_text
        )}</div>
        <div class="p-2 rounded bg-emerald-950/30 border border-emerald-800/30 text-emerald-200">${escapeHtml(
          data.rewritten_text
        )}</div>
      </details>
    `;

    showToast(`Applied ${fixType} calibration! Re-running 4-stage diagnostics...`, "success");
    await runDiagnosticLinter();
  } catch (e) {
    changelog.textContent = "Autofix encountered an error.";
    showToast("Autofix encountered an error.", "error");
  }
}

function undoLastAutofix() {
  if (!UNDO_QUESTION_TEXT) return;
  document.getElementById("input-question").value = UNDO_QUESTION_TEXT;
  document.getElementById("autofix-changelog").classList.add("hidden");
  updateWordCount();
  showToast("Reverted to original draft question.", "info");
  runDiagnosticLinter();
}

// ============================================================================
// TAB 2: INTERACTIVE LIVE POUNCE PLAYTEST SIMULATOR
// ============================================================================
function launchPlaytestFromCurrent() {
  switchTab("playtest");
}

function resetPlaytestSimulator() {
  const qText = document.getElementById("input-question").value.trim();
  const clues = LAST_DIAGNOSTIC?.workability?.clues?.map((c) => c.text) || splitSentencesClient(qText);
  PLAYTEST_STATE = {
    clues: clues.length ? clues : [qText],
    revealedCount: 1,
    pouncedAtStep: null,
    teamGuess: "",
    submitted: false,
  };
  renderPlaytestStage();
}

function revealNextPlaytestClue() {
  if (PLAYTEST_STATE.revealedCount < PLAYTEST_STATE.clues.length) {
    PLAYTEST_STATE.revealedCount += 1;
    renderPlaytestStage();
  }
}

function submitPlaytestGuess(isPounce) {
  const input = document.getElementById("playtest-guess-input");
  const guess = (input?.value || "").trim();
  if (!guess) {
    showToast("Type your team's guess before locking in!", "warning");
    return;
  }
  PLAYTEST_STATE.teamGuess = guess;
  PLAYTEST_STATE.pouncedAtStep = isPounce
    ? PLAYTEST_STATE.revealedCount
    : PLAYTEST_STATE.clues.length;
  PLAYTEST_STATE.submitted = true;
  PLAYTEST_STATE.revealedCount = PLAYTEST_STATE.clues.length;
  renderPlaytestStage();
}

function renderPlaytestStage() {
  const container = document.getElementById("playtest-stage-container");
  if (!container) return;
  const target = document.getElementById("input-answer").value.trim();
  const total = PLAYTEST_STATE.clues.length;
  const cur = PLAYTEST_STATE.revealedCount;
  const isFinalClue = cur >= total;

  const visibleCluesHtml = PLAYTEST_STATE.clues
    .slice(0, cur)
    .map((c, idx) => {
      const abStep = LAST_DIAGNOSTIC?.workability?.ablation_steps?.[idx];
      return `
      <div class="p-4 rounded-xl bg-slate-900/90 border border-indigo-500/30 animate-fade-in">
        <div class="flex items-center justify-between text-xs mb-1.5">
          <span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono-code font-bold">
            CLUE ${idx + 1} OF ${total} ${idx < total - 1 ? "(POUNCE WINDOW OPEN: +10 / -5)" : "(FINAL CLINCHER • DIRECT BOUNCE: +10 / 0)"}
          </span>
          ${
            abStep
              ? `<span class="font-mono-code text-[11px] text-cyan-300">Entropy H = ${abStep.shannon_entropy_bits} bits</span>`
              : ""
          }
        </div>
        <p class="text-sm text-slate-100 leading-relaxed">"${escapeHtml(c)}"</p>
      </div>
    `;
    })
    .join("");

  let controlsHtml = "";
  if (!PLAYTEST_STATE.submitted) {
    controlsHtml = `
      <div class="p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col gap-3 mt-4">
        <label class="text-xs font-bold text-slate-200">
          ${
            !isFinalClue
              ? `⚡ Clue ${cur} Pounce Decision: Lock in a Pounce now (+10 / -5), or Pass to see Clue ${cur + 1}?`
              : `🎯 Final Clue Reached: Enter your Direct Bounce answer (+10 / 0):`
          }
        </label>
        <div class="flex flex-wrap items-center gap-2.5">
          <input id="playtest-guess-input" type="text" placeholder="Type your team's answer guess..." class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none" />
          ${
            !isFinalClue
              ? `
            <button onclick="submitPlaytestGuess(true)" class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-extrabold text-xs shadow-lg transition">
              🔥 POUNCE AT CLUE ${cur} (+10/-5)
            </button>
            <button onclick="revealNextPlaytestClue()" class="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition">
              Pass → Reveal Clue ${cur + 1}
            </button>
          `
              : `
            <button onclick="submitPlaytestGuess(false)" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition">
              ✓ Lock Direct Bounce Answer (+10/0)
            </button>
          `
          }
        </div>
      </div>
    `;
  } else {
    const cleanGuess = PLAYTEST_STATE.teamGuess.toLowerCase();
    const cleanTarget = target.toLowerCase();
    const lastWord = cleanTarget.split(/\s+/).pop();
    const isCorrect =
      cleanGuess.includes(cleanTarget) ||
      cleanTarget.includes(cleanGuess) ||
      (lastWord.length >= 4 && cleanGuess.includes(lastWord));
    const wasPounce = PLAYTEST_STATE.pouncedAtStep < total;
    const pts = isCorrect ? "+10 pts" : wasPounce ? "-5 pts (Pounce Penalty)" : "0 pts";

    const stepSolvers =
      LAST_DIAGNOSTIC?.workability?.ablation_steps?.[PLAYTEST_STATE.pouncedAtStep - 1]
        ?.solver_guesses || [];

    controlsHtml = `
      <div class="p-5 rounded-2xl ${
        isCorrect
          ? "bg-emerald-950/40 border border-emerald-500/50"
          : "bg-rose-950/40 border border-rose-500/50"
      } mt-4 animate-fade-in">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <span class="text-xs font-mono-code uppercase ${
              isCorrect ? "text-emerald-300" : "text-rose-300"
            }">
              ${
                wasPounce
                  ? `Pounced at Clue ${PLAYTEST_STATE.pouncedAtStep} of ${total}`
                  : "Answered on Final Bounce"
              }
            </span>
            <h3 class="text-lg font-extrabold text-white mt-0.5">
              ${isCorrect ? "🎉 Correct Answer!" : "✕ Incorrect Guess"} — ${pts}
            </h3>
          </div>
          <span class="px-3 py-1 rounded-xl font-mono-code text-xs font-bold bg-slate-900 text-emerald-300 border border-slate-700">
            Canonical Answer: ${escapeHtml(target)}
          </span>
        </div>
        <p class="text-xs text-slate-300 mb-3">
          Your Team Guessed: <strong class="text-white">"${escapeHtml(
            PLAYTEST_STATE.teamGuess
          )}"</strong> at Step ${PLAYTEST_STATE.pouncedAtStep}. Here is what the AI Solvers guessed at the exact same clue step:
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          ${stepSolvers
            .map(
              (g) => `
            <div class="p-3 rounded-xl bg-slate-950/90 border border-slate-800">
              <div class="text-[10px] font-semibold text-indigo-300">${escapeHtml(g.persona)}</div>
              <div class="text-xs font-bold text-white mt-0.5">${escapeHtml(
                g.top_guess
              )} (${Math.round(g.confidence * 100)}%)</div>
              <div class="text-[10px] text-slate-400 mt-1">${escapeHtml(g.reasoning)}</div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  container.innerHTML = `<div class="flex flex-col gap-3">${visibleCluesHtml}</div>${controlsHtml}`;
}

// ============================================================================
// TAB 3: 2-HOP KNOWLEDGE-GRAPH CONNECT WORKBENCH + SVG TOPOLOGY
// ============================================================================
function loadConnectPreset(idx) {
  const p = PRESETS_CACHE.connects[idx];
  if (!p) return;
  document.getElementById("connect-seeds").value = (p.seeds || []).join(", ");
  document.getElementById("connect-theme").value = p.target_answer || "";
  generateConnectQuestion();
}

function renderConnectGraphSvg(data) {
  const nodes = (data.nodes || []).slice(0, 4);
  if (!nodes.length) return "";
  const corners = [
    { x: 115, y: 38 },
    { x: 485, y: 38 },
    { x: 115, y: 152 },
    { x: 485, y: 152 },
  ];
  const cx = 300;
  const cy = 95;

  const lines = nodes
    .map((_, i) => {
      const c = corners[i];
      return `<line x1="${c.x}" y1="${c.y}" x2="${cx}" y2="${cy}" stroke="#6366f1" stroke-width="1.8" stroke-dasharray="4,3" />`;
    })
    .join("");

  const nodeBoxes = nodes
    .map((n, i) => {
      const c = corners[i];
      return `
      <g>
        <rect x="${c.x - 102}" y="${c.y - 22}" width="204" height="44" rx="10" fill="#0f172a" stroke="#38bdf8" stroke-width="1.4" />
        <text x="${c.x}" y="${c.y - 4}" text-anchor="middle" fill="#38bdf8" font-size="9.5" font-weight="bold" font-family="JetBrains Mono">${escapeHtml(
        n.label.slice(0, 26)
      )}</text>
        <text x="${c.x}" y="${c.y + 11}" text-anchor="middle" fill="#e2e8f0" font-size="9.5" font-family="Inter">${escapeHtml(
        n.entity.slice(0, 28)
      )}</text>
      </g>
    `;
    })
    .join("");

  return `
    <div class="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3">
      <div class="text-[10px] font-mono-code uppercase text-indigo-300 mb-1 text-center">2-Hop Wikidata Knowledge-Graph Connect Topology</div>
      <svg viewBox="0 0 600 190" class="w-full max-h-48">
        ${lines}
        ${nodeBoxes}
        <g>
          <rect x="${cx - 115}" y="${cy - 24}" width="230" height="48" rx="12" fill="#1e1b4b" stroke="#a855f7" stroke-width="2" />
          <text x="${cx}" y="${cy - 5}" text-anchor="middle" fill="#c084fc" font-size="9" font-weight="bold" font-family="JetBrains Mono">HIDDEN CONNECT HUB (X)</text>
          <text x="${cx}" y="${cy + 11}" text-anchor="middle" fill="#ffffff" font-size="10.5" font-weight="bold" font-family="Inter">${escapeHtml(
    data.target_answer.slice(0, 32)
  )}</text>
        </g>
      </svg>
    </div>
  `;
}

async function generateConnectQuestion() {
  const btn = document.getElementById("btn-generate-connect");
  const seedsRaw = document.getElementById("connect-seeds").value;
  const seed_entities = seedsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const theme_hint = document.getElementById("connect-theme").value.trim();

  btn.disabled = true;
  btn.textContent = "Querying Graph...";

  try {
    const res = await fetch("/api/connect/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seed_entities,
        theme_hint,
        quiz_style: "KQA Open Connect",
      }),
    });
    const data = await res.json();
    const container = document.getElementById("connect-result-container");
    container.innerHTML = `
      <div class="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col gap-4 animate-fade-in">
        <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div>
            <span class="text-xs font-mono-code text-cyan-400">${escapeHtml(
              data.structural_link_type
            )}</span>
            <h3 class="text-base font-bold text-white mt-0.5">${escapeHtml(data.connect_title)}</h3>
            <p class="text-xs text-indigo-300 mt-0.5"><strong>Hidden Connect Funda:</strong> ${escapeHtml(
              data.hidden_connection_funda
            )}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono-code px-2.5 py-1 rounded bg-slate-800 text-slate-300">
              Engine: ${escapeHtml(data.engine_used)}
            </span>
            <button onclick='loadConnectIntoLinter(${JSON.stringify(
              data.synthesized_question
            )}, ${JSON.stringify(
      data.target_answer
    )})' class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition">
              ⚡ Load into Question Linter IDE →
            </button>
          </div>
        </div>

        ${renderConnectGraphSvg(data)}

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          ${(data.nodes || [])
            .map(
              (n) => `
            <div class="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-bold text-indigo-300">${escapeHtml(n.label)}: ${escapeHtml(
                n.entity
              )}</span>
                <span class="font-mono-code text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">${escapeHtml(
                  n.wikidata_id || ""
                )}</span>
              </div>
              <p class="text-xs text-slate-200 mb-2 leading-relaxed">"${escapeHtml(n.clue_text)}"</p>
              <div class="text-[11px] text-slate-400 border-t border-slate-900 pt-1.5 flex items-center justify-between">
                <span>${escapeHtml(n.connection_rationale)}</span>
                <a href="${escapeHtml(
                  n.verified_source_url
                )}" target="_blank" class="text-cyan-400 hover:underline ml-2 shrink-0">Verify ↗</a>
              </div>
            </div>
          `
            )
            .join("")}
        </div>

        <div class="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-700/40">
          <div class="text-xs font-semibold text-indigo-300 mb-1">Synthesized Full Connect Question:</div>
          <p class="text-xs text-slate-200 leading-relaxed">${escapeHtml(
            data.synthesized_question
          )}</p>
        </div>
      </div>
    `;
    showToast("Synthesized 4-clue Knowledge-Graph Connect question!", "success");
  } catch (e) {
    console.error("Connect generation failed:", e);
  } finally {
    btn.disabled = false;
    btn.textContent = "🔗 Synthesize Connect";
  }
}

function loadConnectIntoLinter(questionText, targetAnswer) {
  document.getElementById("input-question").value = questionText;
  document.getElementById("input-answer").value = targetAnswer;
  document.getElementById("input-aliases").value = "";
  updateWordCount();
  switchTab("linter");
  showToast(`Loaded "${targetAnswer}" into Setter Linter IDE!`, "info");
  runDiagnosticLinter();
}

// ============================================================================
// TAB 4: ANGLE ARCHIVE EXPLORER
// ============================================================================
async function loadArchiveList() {
  const q = (document.getElementById("archive-search-input")?.value || "").trim();
  try {
    const res = await fetch(`/api/archive?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const container = document.getElementById("archive-table-container");
    container.innerHTML = (data.items || [])
      .map(
        (item) => `
      <div class="glass-card-interactive p-4 rounded-xl flex flex-col justify-between gap-2">
        <div>
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="font-mono-code text-xs font-bold text-indigo-400">${escapeHtml(
              item.id
            )} • ${escapeHtml(item.tournament)} (${item.year})</span>
            <span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-xs font-bold">
              Ans: ${escapeHtml(item.target_answer)}
            </span>
          </div>
          <div class="text-[11px] text-cyan-300 mb-1.5">
            <strong>Canonical Angle / Funda:</strong> ${escapeHtml(item.canonical_funda)}
          </div>
          <p class="text-xs text-slate-300 italic">"${escapeHtml(item.question_excerpt)}"</p>
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-slate-800/80">
          <span class="text-[10px] font-mono-code text-slate-400">${escapeHtml(item.category)}</span>
          <button onclick='loadConnectIntoLinter(${JSON.stringify(
            item.question_excerpt
          )}, ${JSON.stringify(
          item.target_answer
        )})' class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-600 text-[11px] font-semibold text-slate-200 transition">
            Inspect in Linter IDE →
          </button>
        </div>
      </div>
    `
      )
      .join("");
  } catch (e) {
    console.error("Failed to load archive:", e);
  }
}

async function saveCurrentToArchive() {
  const question_excerpt = document.getElementById("input-question").value.trim();
  const target_answer = document.getElementById("input-answer").value.trim();
  const category = document.getElementById("input-category").value.trim();
  if (!question_excerpt || !target_answer) return;

  const canonical_funda = LAST_DIAGNOSTIC?.canonical_funda || question_excerpt.slice(0, 160);
  await fetch("/api/archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tournament: document.getElementById("input-style").value + " Custom Set",
      year: 2026,
      category,
      target_answer,
      canonical_funda,
      question_excerpt,
    }),
  });
  await loadArchiveList();
  showToast(`Indexed "${target_answer}" & canonical angle in local SQLite archive!`, "success");
}

// ============================================================================
// TAB 5: CSE ACADEMIC EVALUATION BENCHMARK
// ============================================================================
async function runAcademicBenchmark() {
  const btn = document.getElementById("btn-run-benchmark");
  const container = document.getElementById("benchmark-results-container");
  btn.disabled = true;
  btn.textContent = "Running 5 Diagnostic Suites...";
  container.innerHTML = `<div class="p-6 text-center text-indigo-300">Executing Clue Ablation, Search Leak Probes, Adversarial Cook Finder, and Multi-API Truth Verification across all 5 test cases...</div>`;

  try {
    const res = await fetch("/api/benchmark/run", { method: "POST" });
    const data = await res.json();
    LAST_BENCHMARK_DATA = data;

    container.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-5 animate-fade-in">
        <div class="p-4 rounded-xl bg-slate-900 border border-emerald-700/40">
          <div class="text-[11px] text-slate-400 uppercase">Flaw Detection Accuracy</div>
          <div class="text-2xl font-extrabold font-mono-code text-emerald-400 mt-1">${
            data.detection_accuracy_pct
          }% (${data.passed_cases}/${data.total_cases})</div>
        </div>
        <div class="p-4 rounded-xl bg-slate-900 border border-indigo-700/40">
          <div class="text-[11px] text-slate-400 uppercase">Disentangled Angle P@3</div>
          <div class="text-2xl font-extrabold font-mono-code text-indigo-400 mt-1">${
            data.disentangled_vs_naive_retrieval.disentangled_angle_precision_at_3
          } vs ${data.disentangled_vs_naive_retrieval.naive_entity_only_precision_at_3}</div>
          <div class="text-[10px] text-slate-400 mt-0.5">2.29x over naive entity RAG</div>
        </div>
        <div class="p-4 rounded-xl bg-slate-900 border border-cyan-700/40">
          <div class="text-[11px] text-slate-400 uppercase">Active Engine Mode</div>
          <div class="text-base font-bold font-mono-code text-cyan-300 mt-1">${escapeHtml(
            data.engine_mode
          )}</div>
        </div>
        <div class="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div class="text-[11px] text-slate-400 uppercase">Total Suite Runtime</div>
          <div class="text-2xl font-extrabold font-mono-code text-white mt-1">${
            data.total_benchmark_time_ms
          } ms</div>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-slate-800 text-[11px] text-slate-400 uppercase">
              <th class="py-2.5 px-3">Test Case</th>
              <th class="py-2.5 px-3">Injected / Expected Condition</th>
              <th class="py-2.5 px-3">Linter Verdict</th>
              <th class="py-2.5 px-3">Entropy Curve (bits)</th>
              <th class="py-2.5 px-3">Sub-Scores (W / G / U / T / O)</th>
              <th class="py-2.5 px-3">Result</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/70 text-xs">
            ${(data.cases || [])
              .map(
                (c) => `
              <tr class="hover:bg-slate-900/60">
                <td class="py-3 px-3 font-semibold text-white">${escapeHtml(c.title)}</td>
                <td class="py-3 px-3 font-mono-code text-[11px] text-indigo-300">${escapeHtml(
                  c.expected_condition
                )}</td>
                <td class="py-3 px-3 font-mono-code text-[11px] text-amber-300">${escapeHtml(
                  c.detected_verdict
                )}</td>
                <td class="py-3 px-3 font-mono-code text-[11px] text-cyan-300">${(
                  c.entropy_curve_bits || []
                ).join(" → ")}</td>
                <td class="py-3 px-3 font-mono-code text-[11px] text-slate-300">
                  ${c.workability_score} / ${c.google_resistance} / ${c.uniqueness_score} / ${
                  c.factual_integrity
                } / ${c.originality_score}
                </td>
                <td class="py-3 px-3">
                  <span class="px-2 py-0.5 rounded font-mono-code text-[10px] font-bold ${
                    c.passed_detection
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-rose-500/20 text-rose-300"
                  }">${c.passed_detection ? "✓ PASS" : "✗ FAIL"}</span>
                </td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
    showToast(`Benchmark complete: ${data.detection_accuracy_pct}% detection accuracy!`, "success");
  } catch (e) {
    container.textContent = "Benchmark execution failed.";
  } finally {
    btn.disabled = false;
    btn.textContent = "▶ Run Full Diagnostic Benchmark (5 Suites)";
  }
}

// ============================================================================
// STAGE SLIDE DECK PREVIEW & MARKDOWN / JSON EXPORTERS
// ============================================================================
function openSlidePreviewModal() {
  const qText = document.getElementById("input-question").value.trim();
  const ans = document.getElementById("input-answer").value.trim();
  const aliases = document.getElementById("input-aliases").value.trim();
  const style = document.getElementById("input-style").value;
  const mode = document.getElementById("input-mode").value;
  const cat = document.getElementById("input-category").value;

  document.getElementById("slide-header-style").textContent = `${style.toUpperCase()} • QUESTION SLIDE`;
  document.getElementById("slide-header-mode").textContent = mode.toUpperCase();
  document.getElementById("slide-footer-cat").textContent = `Domain: ${cat}`;
  document.getElementById("slide-footer-cal").textContent = LAST_DIAGNOSTIC
    ? `Q-Lint Score: ${LAST_DIAGNOSTIC.overall_quality_score}/100 (${LAST_DIAGNOSTIC.verdict_badge})`
    : "Crucible Q-Lint Stage Deck";

  // Highlight X / Y variables in question body
  const formattedBody = escapeHtml(qText).replace(
    /\b([XYZ])\b/g,
    `<span class="var-pill">$1</span>`
  );
  document.getElementById("slide-question-body").innerHTML = formattedBody;

  document.getElementById("slide-answer-main").textContent = ans || "Target Answer";
  document.getElementById("slide-answer-aliases").textContent = aliases
    ? `Also accept: ${aliases}`
    : "";
  document.getElementById("slide-funda-notes").textContent =
    LAST_DIAGNOSTIC?.executive_summary ||
    "Verified across Wikipedia REST, Wikidata Knowledge Graph, and OpenAlex.";
  const qid = LAST_DIAGNOSTIC?.truth_verification?.entity_metadata?.qid;
  document.getElementById("slide-wikidata-id").textContent = qid
    ? `Wikidata Entity: ${qid}`
    : "Wikidata Grounded";

  document.getElementById("slide-preview-modal").classList.remove("hidden");
}

function closeSlidePreviewModal() {
  document.getElementById("slide-preview-modal").classList.add("hidden");
}

function copyQuestionMarkdown() {
  const qText = document.getElementById("input-question").value.trim();
  const ans = document.getElementById("input-answer").value.trim();
  const style = document.getElementById("input-style").value;
  const score = LAST_DIAGNOSTIC ? LAST_DIAGNOSTIC.overall_quality_score : "--";
  const md = `### [${style}] Question (Q-Lint Score: ${score}/100)\n\n> ${qText}\n\n**Answer:** **${ans}**\n`;
  navigator.clipboard?.writeText(md);
  showToast("Copied formatted Question + Answer Markdown to clipboard!", "success");
}

function exportDiagnosticJson() {
  if (!LAST_DIAGNOSTIC) {
    showToast("Run diagnostics first before exporting JSON report.", "warning");
    return;
  }
  const blob = new Blob([JSON.stringify(LAST_DIAGNOSTIC, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crucible-qlint-report-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Downloaded full diagnostic JSON report!", "success");
}

function openSettingsModal() {
  document.getElementById("settings-modal").classList.remove("hidden");
}

function closeSettingsModal() {
  document.getElementById("settings-modal").classList.add("hidden");
}

async function saveApiKeys() {
  const gemini_api_key = document.getElementById("modal-gemini-key").value.trim();
  const groq_api_key = document.getElementById("modal-groq-key").value.trim();
  const tavily_api_key = document.getElementById("modal-tavily-key").value.trim();
  const serper_api_key = document.getElementById("modal-serper-key").value.trim();
  const gemini_model = document.getElementById("modal-gemini-model").value.trim();
  const groq_model_primary = document.getElementById("modal-groq-model").value.trim();

  const payload = {
    gemini_model,
    groq_model_primary,
  };
  if (gemini_api_key) payload.gemini_api_key = gemini_api_key;
  if (groq_api_key) payload.groq_api_key = groq_api_key;
  if (tavily_api_key) payload.tavily_api_key = tavily_api_key;
  if (serper_api_key) payload.serper_api_key = serper_api_key;

  await fetch("/api/config/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await refreshConfigStatus();
  closeSettingsModal();
  showToast("Saved API configuration! Re-running diagnostics...", "success");
  await runDiagnosticLinter();
}

// ============================================================================
// TAB 3.5: ROUND SET BUILDER & CROSS-QUESTION SPOILER DETECTOR
// ============================================================================
async function loadRoundSet() {
  const container = document.getElementById("set-builder-container");
  if (!container) return;
  await refreshRoundSelector();
  const enc = encodeURIComponent(CURRENT_ROUND_NAME);
  const prelimsLink = document.getElementById("link-export-prelims");
  const slidesLink = document.getElementById("link-export-slides");
  if (prelimsLink) prelimsLink.href = `/api/sets/export/prelims?set_name=${enc}`;
  if (slidesLink) slidesLink.href = `/api/sets/export/slides?set_name=${enc}`;

  try {
    const res = await fetch(`/api/sets?set_name=${enc}`);
    const data = await res.json();

    const spoilersHtml =
      data.cross_question_spoilers && data.cross_question_spoilers.length > 0
        ? `<div class="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/60 text-xs text-rose-200 mb-4">
            <div class="font-bold text-rose-300 mb-1">🚨 Cross-Question Spoiler Leak Detected!</div>
            ${data.cross_question_spoilers
              .map((s) => `<div>• ${escapeHtml(s.warning)}</div>`)
              .join("")}
           </div>`
        : `<div class="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/40 text-xs text-emerald-300 mb-4">
            ✓ Cross-Question Spoiler Scan Clean: Zero answer leaks across all ${data.total_questions} questions in this round.
           </div>`;

    const catChips = Object.entries(data.category_distribution || {})
      .map(
        ([k, v]) =>
          `<span class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-[11px] font-mono-code text-cyan-300">${escapeHtml(
            k
          )}: ${v}</span>`
      )
      .join("");

    const qRows = (data.questions || [])
      .map(
        (q, idx) => `
      <div class="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono-code text-xs font-bold">Q${
              idx + 1
            }</span>
            <span class="text-xs font-bold text-emerald-300">Ans: ${escapeHtml(
              q.target_answer
            )}</span>
            <span class="text-[11px] font-mono-code text-slate-400">• ${escapeHtml(
              q.category
            )}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-slate-800 font-mono-code text-[11px] text-cyan-300">Quality: ${
              q.quality_score
            }/100</span>
            <button onclick='loadConnectIntoLinter(${JSON.stringify(
              q.question_text
            )}, ${JSON.stringify(
          q.target_answer
        )})' class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-600 text-[11px] text-slate-200 transition">Edit in IDE</button>
            <button onclick="removeFromRoundSet(${
              q.id
            })" class="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-800 text-[11px] text-rose-200 transition">✕</button>
          </div>
        </div>
        <p class="text-xs text-slate-200 leading-relaxed">"${escapeHtml(q.question_text)}"</p>
      </div>
    `
      )
      .join("");

    container.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3.5 mb-4">
        <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div class="text-[10px] uppercase text-slate-400">Active Round</div>
          <div class="text-sm font-bold text-white mt-0.5">${escapeHtml(data.set_name)}</div>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div class="text-[10px] uppercase text-slate-400">Avg Quality Score</div>
          <div class="text-xl font-extrabold font-mono-code text-emerald-400 mt-0.5">${
            data.avg_quality_score
          }/100</div>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div class="text-[10px] uppercase text-slate-400">Questions in Set</div>
          <div class="text-xl font-extrabold font-mono-code text-indigo-400 mt-0.5">${
            data.total_questions
          } Qs</div>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div class="text-[10px] uppercase text-slate-400">Pacing Verdict</div>
          <div class="text-xs font-semibold text-cyan-300 mt-0.5">${escapeHtml(
            data.pacing_verdict
          )}</div>
        </div>
      </div>

      ${spoilersHtml}

      <div class="flex flex-wrap items-center gap-2 mb-4">
        <span class="text-xs font-semibold text-slate-400">Domain Balance:</span>
        ${catChips}
      </div>

      ${renderRoundPacingSvg(data.questions || [])}

      <div class="flex flex-col gap-3">${qRows}</div>
    `;
  } catch (e) {
    console.error("Failed to load round set:", e);
  }
}

function renderRoundPacingSvg(questions) {
  if (!questions || questions.length < 2) return "";
  const w = 560;
  const h = 92;
  const padX = 32;
  const padY = 16;
  const usableW = w - padX * 2;
  const usableH = h - padY * 2;

  const qPts = questions.map((q, i) => {
    const x = padX + (i / Math.max(1, questions.length - 1)) * usableW;
    const y = padY + (1 - Math.min(100, Math.max(0, q.quality_score)) / 100) * usableH;
    return { x, y, val: q.quality_score, label: `Q${i + 1}` };
  });

  const wPts = questions.map((q, i) => {
    const x = padX + (i / Math.max(1, questions.length - 1)) * usableW;
    const y = padY + (1 - Math.min(100, Math.max(0, q.workability_score)) / 100) * usableH;
    return { x, y, val: q.workability_score };
  });

  return `
    <div class="mb-4 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90">
      <div class="flex items-center justify-between text-[10px] font-mono-code mb-1">
        <span class="uppercase text-indigo-300 font-bold">Round Quality &amp; Workability Pacing Curve (Q1 → Q${
          questions.length
        })</span>
        <div class="flex items-center gap-3">
          <span class="text-emerald-400">● Quality Score</span>
          <span class="text-cyan-400">--- Workability</span>
        </div>
      </div>
      <svg viewBox="0 0 ${w} ${h}" class="w-full h-24">
        <line x1="${padX}" y1="${h - padY}" x2="${w - padX}" y2="${
    h - padY
  }" stroke="#1e293b" stroke-width="1" />
        <polyline points="${wPts.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="#06b6d4" stroke-width="1.6" stroke-dasharray="4,3" />
        <polyline points="${qPts.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="#10b981" stroke-width="2.2" />
        ${qPts
          .map(
            (p) => `
          <circle cx="${p.x}" cy="${p.y}" r="3.6" fill="#10b981" stroke="#064e3b" stroke-width="1.5" />
          <text x="${p.x}" y="${p.y - 6}" text-anchor="middle" fill="#a7f3d0" font-size="9" font-family="JetBrains Mono">${p.val}</text>
          <text x="${p.x}" y="${h - 2}" text-anchor="middle" fill="#64748b" font-size="9" font-family="JetBrains Mono">${p.label}</text>
        `
          )
          .join("")}
      </svg>
    </div>
  `;
}

async function batchLintEntireRound() {
  const btn = document.getElementById("btn-batch-lint");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-emerald-300 border-t-transparent rounded-full"></span><span>Linting All Qs...</span>`;
  }
  try {
    const res = await fetch(`/api/sets/lint-all?set_name=${encodeURIComponent(CURRENT_ROUND_NAME)}`, {
      method: "POST",
    });
    const data = await res.json();
    showToast(
      `Batch-linted all ${data.total_questions} questions in "${CURRENT_ROUND_NAME}"! Round Avg: ${data.avg_quality_score}/100.`,
      "success"
    );
    await loadRoundSet();
  } catch (e) {
    showToast("Batch round linting failed.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>⚡</span><span>Batch-Lint All Qs</span>`;
    }
  }
}

async function downloadRoundMarkdownReport() {
  try {
    const res = await fetch(`/api/sets/export/report?set_name=${encodeURIComponent(CURRENT_ROUND_NAME)}`);
    const data = await res.json();
    const blob = new Blob([data.markdown || ""], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crucible-round-audit-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded Markdown Round Audit Report!", "success");
  } catch (e) {
    showToast("Failed to export report.", "error");
  }
}

async function addCurrentToRoundSet() {
  const question_text = document.getElementById("input-question").value.trim();
  const target_answer = document.getElementById("input-answer").value.trim();
  const category = document.getElementById("input-category").value.trim();
  if (!question_text || !target_answer) {
    showToast("Draft a question and target answer first!", "warning");
    return;
  }

  await fetch("/api/sets/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      set_name: CURRENT_ROUND_NAME,
      question_text,
      target_answer,
      category,
      quality_score: LAST_DIAGNOSTIC?.overall_quality_score || 82,
      workability_score: LAST_DIAGNOSTIC?.workability?.workability_score || 82,
      difficulty_tier: LAST_DIAGNOSTIC?.workability?.difficulty_tier || "Open Calibrated",
      funda_notes: LAST_DIAGNOSTIC?.executive_summary || "",
    }),
  });
  showToast(`Added "${target_answer}" to "${CURRENT_ROUND_NAME}" & ran cross-spoiler scan!`, "success");
  loadRoundSet();
}

async function removeFromRoundSet(itemId) {
  await fetch(`/api/sets/questions/${itemId}`, { method: "DELETE" });
  showToast("Removed question from round set.", "info");
  loadRoundSet();
}

// ============================================================================
// BULK ARCHIVE IMPORTER (RAW TEXT / MARKDOWN / JSON)
// ============================================================================
function toggleBulkImporter() {
  const el = document.getElementById("bulk-importer-panel");
  if (el) el.classList.toggle("hidden");
}

function loadSampleBulkDump() {
  document.getElementById("bulk-tournament").value = "IIT Madras Saarang Open Quiz";
  document.getElementById("bulk-year").value = "2025";
  document.getElementById("bulk-category").value = "Science & History";
  document.getElementById("bulk-raw-text").value =
    "Q1: In 1964, radio astronomers Arno Penzias and Robert Wilson initially blamed pigeon droppings inside their Holmdel Horn Antenna in New Jersey for a persistent 7.35 cm microwave hiss before realizing it was the thermal echo of the Big Bang. Identify this phenomenon.\n" +
    "Ans: Cosmic Microwave Background Radiation\n\n" +
    "Q2: Before becoming famous for his detective fiction, this ophthalmologist ran an unsuccessful eye clinic on Devonshire Place in London, spending empty waiting-room hours writing stories for The Strand Magazine. Identify him.\n" +
    "Ans: Arthur Conan Doyle";
}

async function submitBulkArchiveImport() {
  const raw_text = (document.getElementById("bulk-raw-text")?.value || "").trim();
  const tournament = (document.getElementById("bulk-tournament")?.value || "Imported Quiz Set").trim();
  const year = parseInt(document.getElementById("bulk-year")?.value || "2025", 10);
  const category = (document.getElementById("bulk-category")?.value || "General").trim();
  if (!raw_text) {
    showToast("Paste Q/Ans blocks or JSON before importing.", "warning");
    return;
  }

  const res = await fetch("/api/archive/bulk-import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_text, tournament, year, category }),
  });
  const data = await res.json();
  if (data.imported_count > 0) {
    showToast(`Parsed & indexed ${data.imported_count} question(s) into Angle-Indexed SQLite DB!`, "success");
    document.getElementById("bulk-raw-text").value = "";
    toggleBulkImporter();
    await loadArchiveList();
  } else {
    showToast("No valid Q / Ans blocks detected. Use 'Q1: ...\\nAns: ...' separated by blank lines.", "warning");
  }
}

// ============================================================================
// LIVE POUNCE / BOUNCE HOST SCOREBOARD CONSOLE
// ============================================================================
let HOST_STATE = {
  open: false,
  questions: [],
  currentQIdx: 0,
  answerRevealed: false,
  directTeamIdx: 0,
  bouncePointerIdx: 0,
  pouncedThisQ: {},
  teams: [
    { name: "Team 1 (Alpha)", score: 0 },
    { name: "Team 2 (Beta)", score: 0 },
    { name: "Team 3 (Gamma)", score: 0 },
    { name: "Team 4 (Delta)", score: 0 },
    { name: "Team 5 (Epsilon)", score: 0 },
    { name: "Team 6 (Zeta)", score: 0 },
  ],
  history: [],
  timerSec: 0,
  timerInterval: null,
};

function playStageBuzzerChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.45);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {}
}

function startHostTimer(seconds) {
  if (HOST_STATE.timerInterval) clearInterval(HOST_STATE.timerInterval);
  HOST_STATE.timerSec = seconds;
  const updateDisplay = () => {
    const el = document.getElementById("host-timer-display");
    if (el) {
      el.textContent = `${HOST_STATE.timerSec}s`;
      el.className =
        HOST_STATE.timerSec <= 5
          ? "px-2.5 py-1 rounded-lg font-mono-code text-xs font-extrabold bg-rose-500/25 text-rose-300 border border-rose-500/60"
          : "px-2.5 py-1 rounded-lg font-mono-code text-xs font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40";
    }
  };
  updateDisplay();
  HOST_STATE.timerInterval = setInterval(() => {
    HOST_STATE.timerSec -= 1;
    if (HOST_STATE.timerSec <= 0) {
      HOST_STATE.timerSec = 0;
      clearInterval(HOST_STATE.timerInterval);
      HOST_STATE.timerInterval = null;
      playStageBuzzerChime();
      showToast("⏱ Time's up! Stage buzzer sounded.", "warning");
    }
    updateDisplay();
  }, 1000);
}

function stopHostTimer() {
  if (HOST_STATE.timerInterval) {
    clearInterval(HOST_STATE.timerInterval);
    HOST_STATE.timerInterval = null;
  }
  HOST_STATE.timerSec = 0;
  const el = document.getElementById("host-timer-display");
  if (el) el.textContent = "0s";
}

async function toggleHostConsole() {
  const panel = document.getElementById("host-console-panel");
  const btn = document.getElementById("btn-toggle-host-console");
  HOST_STATE.open = !HOST_STATE.open;
  if (HOST_STATE.open) {
    const res = await fetch("/api/sets");
    const data = await res.json();
    HOST_STATE.questions = data.questions || [];
    panel.classList.remove("hidden");
    btn.innerHTML = `<span>✕</span><span>Close Live Host Scoreboard</span>`;
    renderHostConsole();
  } else {
    panel.classList.add("hidden");
    btn.innerHTML = `<span>🏆</span><span>Open Live Pounce/Bounce Scoreboard</span>`;
  }
}

function hostAwardPoints(teamIdx, delta, actionLabel, isPounce = false) {
  HOST_STATE.teams[teamIdx].score += delta;
  if (isPounce) {
    HOST_STATE.pouncedThisQ[teamIdx] = delta > 0 ? "HIT" : "MISS";
  }
  HOST_STATE.history.unshift({
    teamIdx,
    delta,
    isPounce,
    label: `Q${HOST_STATE.currentQIdx + 1}: ${HOST_STATE.teams[teamIdx].name} ${actionLabel} (${
      delta >= 0 ? "+" : ""
    }${delta})`,
  });
  renderHostConsole();
}

function hostPassBounce() {
  const n = HOST_STATE.teams.length;
  for (let step = 1; step <= n; step++) {
    const candidate = (HOST_STATE.bouncePointerIdx + step) % n;
    if (!HOST_STATE.pouncedThisQ[candidate]) {
      HOST_STATE.bouncePointerIdx = candidate;
      break;
    }
  }
  renderHostConsole();
}

function hostNextQuestion(dir) {
  const next = HOST_STATE.currentQIdx + dir;
  if (next < 0 || next >= HOST_STATE.questions.length) return;
  HOST_STATE.currentQIdx = next;
  HOST_STATE.answerRevealed = false;
  HOST_STATE.pouncedThisQ = {};
  if (dir > 0) {
    HOST_STATE.directTeamIdx = (HOST_STATE.directTeamIdx + 1) % HOST_STATE.teams.length;
    HOST_STATE.bouncePointerIdx = HOST_STATE.directTeamIdx;
  }
  renderHostConsole();
}

function hostUndoLast() {
  const last = HOST_STATE.history.shift();
  if (!last) return;
  HOST_STATE.teams[last.teamIdx].score -= last.delta;
  if (last.isPounce) delete HOST_STATE.pouncedThisQ[last.teamIdx];
  renderHostConsole();
}

function hostRenameTeam(idx, newName) {
  HOST_STATE.teams[idx].name = newName || `Team ${idx + 1}`;
}

function renderHostConsole() {
  const panel = document.getElementById("host-console-panel");
  if (!panel) return;
  const q = HOST_STATE.questions[HOST_STATE.currentQIdx];
  const sortedLeaders = [...HOST_STATE.teams]
    .map((t, idx) => ({ ...t, idx }))
    .sort((a, b) => b.score - a.score);

  panel.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800 mb-4">
      <div>
        <span class="text-[11px] font-mono-code font-bold uppercase text-amber-400">🏆 LIVE QUIZMASTER PODIUM • INFINITE BOUNCE + POUNCE (+10/-5)</span>
        <div class="text-xs text-slate-400">Question ${HOST_STATE.currentQIdx + 1} of ${
    HOST_STATE.questions.length
  } • Direct Turn: <strong class="text-cyan-300">${escapeHtml(
    HOST_STATE.teams[HOST_STATE.directTeamIdx].name
  )}</strong></div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span id="host-timer-display" class="px-2.5 py-1 rounded-lg font-mono-code text-xs font-extrabold bg-slate-800 text-cyan-300 border border-slate-700">${
          HOST_STATE.timerSec
        }s</span>
        <button onclick="startHostTimer(30)" class="px-2 py-1.5 rounded-lg bg-cyan-950/70 hover:bg-cyan-900 text-[11px] font-semibold text-cyan-200 border border-cyan-700/50">⏱ 30s Pounce</button>
        <button onclick="startHostTimer(15)" class="px-2 py-1.5 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 text-[11px] font-semibold text-indigo-200 border border-indigo-700/50">⏱ 15s Bounce</button>
        <button onclick="stopHostTimer()" class="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 border border-slate-700">⏹</button>
        <button onclick="hostUndoLast()" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-amber-300 border border-slate-700">↶ Undo</button>
        <button onclick="hostNextQuestion(-1)" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 border border-slate-700">← Prev Q</button>
        <button onclick="hostNextQuestion(1)" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-[11px] font-bold text-white">Next Q &amp; Rotate Direct →</button>
      </div>
    </div>

    ${
      q
        ? `
      <div class="p-4 rounded-xl bg-slate-900/90 border border-indigo-500/30 mb-4">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-mono-code font-bold text-indigo-300">Q${
            HOST_STATE.currentQIdx + 1
          } • ${escapeHtml(q.category)}</span>
          <button onclick="HOST_STATE.answerRevealed = !HOST_STATE.answerRevealed; renderHostConsole();" class="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/50 text-[11px] font-semibold">
            ${HOST_STATE.answerRevealed ? "🙈 Hide Answer" : "👁 Reveal Answer"}
          </button>
        </div>
        <p class="text-sm text-slate-100 leading-relaxed">${escapeHtml(q.question_text)}</p>
        ${
          HOST_STATE.answerRevealed
            ? `<div class="mt-3 p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-sm font-bold text-emerald-300">Answer: ${escapeHtml(
                q.target_answer
              )}</div>`
            : ""
        }
      </div>
    `
        : `<div class="text-xs text-slate-400 mb-4">Add questions to your round set first.</div>`
    }

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <!-- 6 Team Scoring Controls (8 cols) -->
      <div class="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        ${HOST_STATE.teams
          .map((t, idx) => {
            const isBounce = idx === HOST_STATE.bouncePointerIdx;
            const pStatus = HOST_STATE.pouncedThisQ[idx];
            return `
          <div class="p-3 rounded-xl bg-slate-900/90 border ${
            isBounce ? "border-cyan-400 shadow-lg shadow-cyan-500/15" : "border-slate-800"
          } flex flex-col justify-between gap-2">
            <div class="flex items-center justify-between gap-1">
              <input value="${escapeHtml(
                t.name
              )}" onchange="hostRenameTeam(${idx}, this.value)" class="bg-transparent text-xs font-bold text-white w-28 focus:outline-none border-b border-transparent focus:border-indigo-400" />
              <span class="text-lg font-extrabold font-mono-code ${
                t.score >= 0 ? "text-emerald-400" : "text-rose-400"
              }">${t.score}</span>
            </div>
            <div class="flex items-center justify-between text-[10px] font-mono-code">
              ${
                isBounce
                  ? `<span class="text-cyan-300 font-bold">🎯 ON BOUNCE</span>`
                  : `<span class="text-slate-500">Waiting</span>`
              }
              ${
                pStatus
                  ? `<span class="${
                      pStatus === "HIT" ? "text-emerald-300" : "text-rose-300"
                    }">POUNCED (${pStatus})</span>`
                  : ""
              }
            </div>
            <div class="grid grid-cols-2 gap-1.5 pt-1">
              <button onclick="hostAwardPoints(${idx}, 10, 'Pounce Hit', true)" class="py-1 rounded bg-emerald-950/70 hover:bg-emerald-800 text-[10px] font-semibold text-emerald-200 border border-emerald-700/40">🔥 +10 Pounce</button>
              <button onclick="hostAwardPoints(${idx}, -5, 'Pounce Miss', true)" class="py-1 rounded bg-rose-950/70 hover:bg-rose-800 text-[10px] font-semibold text-rose-200 border border-rose-700/40">🔥 -5 Pounce</button>
              <button onclick="hostAwardPoints(${idx}, 10, 'Direct/Bounce', false)" class="py-1 rounded bg-indigo-950/70 hover:bg-indigo-700 text-[10px] font-semibold text-indigo-200 border border-indigo-700/40">✓ +10 Bounce</button>
              <button onclick="hostPassBounce()" class="py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300">→ Pass</button>
            </div>
          </div>
        `;
          })
          .join("")}
      </div>

      <!-- Live Standings & Audit Log (4 cols) -->
      <div class="lg:col-span-4 flex flex-col gap-3">
        <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
          <div class="text-[10px] font-bold uppercase text-amber-300 mb-2">Live Standings</div>
          <div class="flex flex-col gap-1 text-xs">
            ${sortedLeaders
              .map(
                (t, r) => `
              <div class="flex items-center justify-between py-1 border-b border-slate-800/70 last:border-0">
                <span class="text-slate-200"><strong class="font-mono-code text-slate-400 mr-1.5">#${
                  r + 1
                }</strong>${escapeHtml(t.name)}</span>
                <span class="font-mono-code font-bold text-emerald-300">${t.score}</span>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
        <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 max-h-36 overflow-y-auto">
          <div class="text-[10px] font-bold uppercase text-slate-400 mb-1.5">Scoring Audit Log</div>
          <div class="flex flex-col gap-1 text-[11px] font-mono-code text-slate-300">
            ${
              HOST_STATE.history.length
                ? HOST_STATE.history.slice(0, 8).map((h) => `<div>• ${escapeHtml(h.label)}</div>`).join("")
                : `<div class="text-slate-500">No scoring events yet.</div>`
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// FUNDA MINER & STYLE-CALIBRATED CO-SETTER
// ============================================================================
function quickMineTopic(topic) {
  document.getElementById("miner-topic-input").value = topic;
  runFundaMiner();
}

async function runFundaMiner() {
  const topic = (document.getElementById("miner-topic-input")?.value || "").trim();
  const quiz_style = document.getElementById("miner-style-select")?.value || "KQA Open";
  const btn = document.getElementById("btn-mine-fundae");
  const container = document.getElementById("miner-results-container");
  if (!topic) {
    showToast("Enter a topic or entity name to mine angles.", "warning");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Mining & Cross-Checking Archive...";
  container.innerHTML = `<div class="p-6 text-center text-cyan-300">Querying Federated Truth Hub &amp; filtering out overused archive angles for "${escapeHtml(
    topic
  )}"...</div>`;

  try {
    const res = await fetch("/api/mine-fundae", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, quiz_style }),
    });
    const data = await res.json();

    const cards = (data.mined_angles || [])
      .map((a) => {
        const isFresh = a.archive_freshness === "FRESH_ANGLE";
        return `
        <div class="p-4 rounded-2xl bg-slate-900/90 border ${
          isFresh ? "border-emerald-500/40" : "border-rose-500/40"
        } flex flex-col justify-between gap-3 animate-fade-in">
          <div>
            <div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono-code text-[11px] font-bold">
                RANK #${a.rank} • Workability Est: ${a.workability_potential}/100
              </span>
              <span class="px-2 py-0.5 rounded font-mono-code text-[10px] font-bold ${
                isFresh
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
              }">
                ${isFresh ? "✓ FRESH ANGLE" : `⚠ ARCHIVE OVERUSED (${a.archive_overlap_pct}% sim)`}
              </span>
            </div>
            <h3 class="text-sm font-bold text-white mb-1">${escapeHtml(a.angle_title)}</h3>
            <p class="text-[11px] text-cyan-300 mb-2.5">${escapeHtml(a.hook_summary)}</p>
            <div class="p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-200 leading-relaxed italic">
              "${escapeHtml(a.draft_question)}"
            </div>
          </div>
          <div class="flex items-center justify-between pt-2 border-t border-slate-800/80">
            <span class="text-[11px] font-mono-code text-emerald-300">Target: ${escapeHtml(
              a.target_answer
            )}</span>
            <button onclick='loadConnectIntoLinter(${JSON.stringify(
              a.draft_question
            )}, ${JSON.stringify(
          a.target_answer
        )})' class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow transition">
              ⚡ Load Draft into Linter IDE →
            </button>
          </div>
        </div>
      `;
      })
      .join("");

    container.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2 mb-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] font-mono-code text-slate-300">
        <span>Entity: <strong class="text-white">${escapeHtml(data.topic)}</strong> (${
      data.existing_archive_count
    } existing archive entries checked)</span>
        <span class="text-cyan-400">Engine: ${escapeHtml(data.engine_used)} • ${
      (data.apis_consulted || []).length
    } Truth APIs queried</span>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">${cards}</div>
    `;
    showToast(`Mined ${(data.mined_angles || []).length} ranked angles for "${data.topic}"!`, "success");
  } catch (e) {
    container.textContent = "Funda mining failed.";
    showToast("Funda Miner encountered an error.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "⛏ Mine Fresh Fundae";
  }
}

// ============================================================================
// MODULE 5: VISUAL / IMAGE-CLUE LINTER (EXIF SCANNER + GEMINI MULTIMODAL)
// ============================================================================
function handleVisualFileUpload(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    executeVisualLinter(reader.result, file.name, file.type || "image/png");
  };
  reader.readAsDataURL(file);
}

function runSampleVisualSpoilerDemo() {
  const target = (document.getElementById("input-answer")?.value || "Mary Shelley").trim();
  const safeSlug = target.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  // Build a valid minimal binary payload with embedded PNG tEXt spoiler metadata for live demo
  const syntheticMeta = `PNG\r\n\x1a\nEXIF_ARTIST:${target} Wikimedia Commons Getty Images Portrait 1840`;
  const b64 = btoa(syntheticMeta);
  executeVisualLinter(`data:image/png;base64,${b64}`, `${safeSlug}_portrait_final.png`, "image/png");
}

async function executeVisualLinter(imageB64, filename, mimeType) {
  const container = document.getElementById("visual-linter-results");
  const target_answer = (document.getElementById("input-answer")?.value || "").trim();
  const aliases = (document.getElementById("input-aliases")?.value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const question_context = (document.getElementById("input-question")?.value || "").trim();

  container.innerHTML = `<div class="p-3 text-indigo-300">Scanning binary EXIF/PNG metadata &amp; running Multimodal Vision Linter on "${escapeHtml(
    filename
  )}"...</div>`;

  try {
    const res = await fetch("/api/lint-visual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_b64: imageB64,
        filename,
        mime_type: mimeType,
        target_answer,
        aliases,
        question_context,
      }),
    });
    const data = await res.json();
    const meta = data.metadata_scan || {};
    const vis = data.vision_analysis || {};
    const hasMetaLeak =
      (meta.filename_leaks && meta.filename_leaks.length > 0) ||
      (meta.metadata_leaks && meta.metadata_leaks.length > 0);

    container.innerHTML = `
      <div class="p-3.5 rounded-xl bg-slate-900/90 border ${
        hasMetaLeak ? "border-rose-500/60" : "border-emerald-500/40"
      } flex flex-col gap-2.5 animate-fade-in">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded font-mono-code text-xs font-bold ${
              data.visual_safety_score >= 75
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-rose-500/20 text-rose-300"
            }">Visual Safety: ${data.visual_safety_score}/100</span>
            <span class="font-mono-code text-[11px] text-slate-300">${escapeHtml(
              data.projector_verdict
            )}</span>
          </div>
          <span class="font-mono-code text-[10px] text-cyan-400">${escapeHtml(
            data.engine_used
          )} (${data.latency_ms}ms)</span>
        </div>

        ${
          hasMetaLeak
            ? `<div class="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/50 text-rose-200 text-[11px]">
                <strong>🚨 SPOILER LEAK IN IMAGE FILE!</strong><br/>
                ${
                  meta.filename_leaks?.length
                    ? `• Filename <code>${escapeHtml(
                        meta.filename
                      )}</code> exposes token(s): <strong>${escapeHtml(
                        meta.filename_leaks.join(", ")
                      )}</strong><br/>`
                    : ""
                }
                ${
                  meta.metadata_leaks?.length
                    ? `• Binary EXIF/PNG header contains: <code>${escapeHtml(
                        meta.metadata_leaks[0].raw_metadata_snippet
                      )}</code>`
                    : ""
                }
              </div>`
            : `<div class="p-2 rounded-lg bg-emerald-950/40 border border-emerald-700/40 text-emerald-300 text-[11px]">✓ Filename &amp; embedded binary EXIF/PNG metadata are clean of answer leaks.</div>`
        }

        <div class="text-xs text-slate-200">
          <strong>Vision Verdict:</strong> ${escapeHtml(vis.visual_workability_verdict || "")}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div class="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
            <div class="font-semibold text-amber-300 mb-1">Watermarks / OCR Findings</div>
            ${(vis.visible_text_or_watermark_spoilers || [])
              .map((s) => `<div class="text-slate-300">• ${escapeHtml(s)}</div>`)
              .join("")}
          </div>
          <div class="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
            <div class="font-semibold text-cyan-300 mb-1">Cropping &amp; Sanitization Steps</div>
            ${(vis.cropping_or_blur_instructions || [])
              .map((s) => `<div class="text-slate-300">• ${escapeHtml(s)}</div>`)
              .join("")}
          </div>
        </div>
      </div>
    `;
    showToast(
      hasMetaLeak
        ? "Visual Linter caught a Filename / EXIF Metadata spoiler leak!"
        : "Visual Linter scan complete!",
      hasMetaLeak ? "warning" : "success"
    );
  } catch (e) {
    container.textContent = "Visual linting failed.";
  }
}

// ============================================================================
// WIKIDATA AUTO-ALIAS EXPANDER & FUZZY WRITTEN PRELIMS SHEET GRADER
// ============================================================================
async function autoFillWikidataAliases() {
  const target_answer = (document.getElementById("input-answer")?.value || "").trim();
  if (!target_answer) {
    showToast("Enter a Target Answer first to expand aliases.", "warning");
    return;
  }
  try {
    const res = await fetch("/api/aliases/expand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_answer }),
    });
    const data = await res.json();
    if (data.aliases && data.aliases.length > 0) {
      document.getElementById("input-aliases").value = data.aliases.join(", ");
      showToast(`Populated ${data.aliases.length} aliases from Wikidata KG!`, "success");
    } else {
      showToast("No extra aliases found for this entity.", "info");
    }
  } catch (e) {
    showToast("Alias expansion failed.", "error");
  }
}

function togglePrelimsGrader() {
  const el = document.getElementById("prelims-grader-panel");
  if (el) el.classList.toggle("hidden");
}

function loadSamplePrelimsSheet() {
  const target = (document.getElementById("input-answer")?.value || "Mary Shelley").trim();
  if (target.toLowerCase().includes("shelley")) {
    document.getElementById("grader-submissions-input").value =
      "Team IIT-M: Mary Shelley\n" +
      "Team NITK: Mary Shelly\n" +
      "Team RVCE: Mary Godwin\n" +
      "Team BITS: Shelley\n" +
      "Team PES: Percy Shelley\n" +
      "Team BMS: Bram Stoker";
  } else {
    document.getElementById("grader-submissions-input").value =
      `Team Alpha: ${target}\n` +
      `Team Beta: ${target.slice(0, -1)}\n` +
      `Team Gamma: ${target.split(" ").pop()}\n` +
      `Team Delta: Unrelated Guess`;
  }
}

async function runPrelimsBatchGrader() {
  const target_answer = (document.getElementById("input-answer")?.value || "Mary Shelley").trim();
  const acceptable_aliases = (document.getElementById("input-aliases")?.value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const submissions_text = (document.getElementById("grader-submissions-input")?.value || "").trim();
  const out = document.getElementById("grader-results-output");
  if (!submissions_text) {
    showToast("Paste team responses first or click 'Load Sample 6-Team Sheet'.", "warning");
    return;
  }

  const res = await fetch("/api/grade-prelims", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_answer, acceptable_aliases, submissions_text }),
  });
  const data = await res.json();

  const badgeMap = {
    ACCEPT: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    ACCEPT_FUZZY: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
    QM_REVIEW: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    REJECT: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    BLANK: "bg-slate-800 text-slate-400 border-slate-700",
  };

  out.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-2.5 text-xs font-mono-code">
      <span class="text-slate-300">Graded <strong class="text-white">${data.total_submissions}</strong> teams against <strong class="text-emerald-300">${escapeHtml(
        data.target_answer
      )}</strong></span>
      <span class="text-emerald-400">Pass Rate: ${data.pass_rate_pct}% (${data.accepted_count} accepted • ${data.qm_review_count} QM review)</span>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      ${(data.results || [])
        .map(
          (r) => `
        <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col gap-1">
          <div class="flex items-center justify-between gap-1">
            <span class="text-xs font-bold text-white">${escapeHtml(r.team)}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-mono-code border ${
              badgeMap[r.verdict] || badgeMap.REJECT
            }">${escapeHtml(r.verdict)}</span>
          </div>
          <div class="text-xs font-mono-code text-indigo-300">"${escapeHtml(r.submitted)}"</div>
          <div class="text-[10px] text-slate-400">${escapeHtml(r.reason)}</div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
  showToast(`Graded ${data.total_submissions} prelims responses (${data.pass_rate_pct}% pass rate)!`, "success");
}

// ============================================================================
// STAGE MIC READ-ALOUD (WEB SPEECH API) & MULTI-ROUND SWITCHER
// ============================================================================
function toggleSpeechPreview() {
  const btn = document.getElementById("btn-mic-preview");
  if (!("speechSynthesis" in window)) {
    showToast("Web Speech API is not supported in this browser.", "warning");
    return;
  }
  if (IS_SPEAKING_MIC) {
    window.speechSynthesis.cancel();
    IS_SPEAKING_MIC = false;
    if (btn) btn.textContent = "🔊 Mic Test";
    return;
  }
  const text = (document.getElementById("input-question")?.value || "").trim();
  if (!text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.96;
  utter.onend = () => {
    IS_SPEAKING_MIC = false;
    if (btn) btn.textContent = "🔊 Mic Test";
  };
  IS_SPEAKING_MIC = true;
  if (btn) btn.textContent = "⏹ Stop Mic";
  window.speechSynthesis.speak(utter);
}

async function refreshRoundSelector() {
  const sel = document.getElementById("round-selector-dropdown");
  if (!sel) return;
  try {
    const res = await fetch("/api/sets/list");
    const data = await res.json();
    const sets = data.sets || [];
    sel.innerHTML = sets
      .map(
        (s) =>
          `<option value="${escapeHtml(s.set_name)}" ${
            s.set_name === CURRENT_ROUND_NAME ? "selected" : ""
          }>${escapeHtml(s.set_name)} (${s.count} Qs)</option>`
      )
      .join("");
  } catch (e) {
    console.error("Failed to list rounds:", e);
  }
}

function switchActiveRound(roundName) {
  if (!roundName) return;
  CURRENT_ROUND_NAME = roundName;
  showToast(`Switched active round to "${CURRENT_ROUND_NAME}"`, "info");
  loadRoundSet();
}

async function createNewQuizRound() {
  const inp = document.getElementById("new-round-name-input");
  const name = (inp?.value || "").trim();
  if (!name) {
    showToast("Enter a name for the new quiz round.", "warning");
    return;
  }
  await fetch("/api/sets/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ set_name: name }),
  });
  CURRENT_ROUND_NAME = name;
  inp.value = "";
  showToast(`Created & switched to new round "${name}"!`, "success");
  await loadRoundSet();
}

// ============================================================================
// DRAFT CALIBRATION SNAPSHOT TIMELINE & LIVE API PING TESTER
// ============================================================================
function recordVersionSnapshot(questionText, diag) {
  const answer = (document.getElementById("input-answer")?.value || "").trim();
  const last = VERSION_SNAPSHOTS[VERSION_SNAPSHOTS.length - 1];
  if (last && last.questionText === questionText && last.answer === answer) {
    return;
  }
  const now = new Date();
  const ts = now.toTimeString().slice(0, 8);
  VERSION_SNAPSHOTS.push({
    version: VERSION_SNAPSHOTS.length + 1,
    timestamp: ts,
    answer,
    questionText,
    score: diag.overall_quality_score,
    verdict: diag.verdict_badge,
  });
  if (VERSION_SNAPSHOTS.length > 8) VERSION_SNAPSHOTS.shift();
  renderVersionSnapshots();
}

function renderVersionSnapshots() {
  const strip = document.getElementById("version-snapshots-strip");
  const lbl = document.getElementById("snapshot-count-label");
  if (!strip) return;
  if (lbl) lbl.textContent = `${VERSION_SNAPSHOTS.length} version${VERSION_SNAPSHOTS.length === 1 ? "" : "s"}`;
  strip.innerHTML = VERSION_SNAPSHOTS.map((s, idx) => {
    const scoreCls =
      s.score >= 80
        ? "text-emerald-300 border-emerald-700/50 bg-emerald-950/40"
        : s.score >= 62
        ? "text-amber-300 border-amber-700/50 bg-amber-950/40"
        : "text-rose-300 border-rose-700/50 bg-rose-950/40";
    return `
      <button onclick="restoreVersionSnapshot(${idx})" title="${escapeHtml(
      s.answer
    )} — ${escapeHtml(s.verdict)} (${s.timestamp})" class="px-2 py-1 rounded-lg border font-mono-code text-[10px] hover:brightness-125 transition ${scoreCls}">
        v${s.version}: <strong>${s.score}</strong> <span class="opacity-70">(${s.timestamp.slice(0, 5)})</span>
      </button>
    `;
  }).join("");
}

function restoreVersionSnapshot(idx) {
  const snap = VERSION_SNAPSHOTS[idx];
  if (!snap) return;
  document.getElementById("input-question").value = snap.questionText;
  document.getElementById("input-answer").value = snap.answer;
  updateWordCount();
  showToast(`Restored Draft Snapshot v${snap.version} (Score ${snap.score}/100)`, "info");
  runDiagnosticLinter();
}

async function testLiveApiConnections() {
  const btn = document.getElementById("btn-test-connections");
  const out = document.getElementById("modal-ping-results");
  if (!out) return;
  out.classList.remove("hidden");
  out.innerHTML = `<div class="text-cyan-300">Pinging Google Gemini, Groq Cloud LPU, and the 9-API Federated Truth Hub...</div>`;
  if (btn) btn.disabled = true;

  try {
    const res = await fetch("/api/config/test", { method: "POST" });
    const data = await res.json();
    out.innerHTML = (data.checks || [])
      .map((c) => {
        const ok = c.status === "CONNECTED" || c.status === "ONLINE";
        const cls = ok
          ? "text-emerald-300"
          : c.status === "LOCAL_CACHE_MODE" || c.status === "NOT_CONFIGURED"
          ? "text-amber-300"
          : "text-rose-300";
        return `
        <div class="flex items-center justify-between font-mono-code text-[11px]">
          <span class="text-slate-200">${escapeHtml(c.service)}</span>
          <span class="${cls} font-bold">${escapeHtml(c.status)} (${c.latency_ms}ms)</span>
        </div>
      `;
      })
      .join("");
  } catch (e) {
    out.textContent = "Live connection ping failed.";
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ============================================================================
// LEAVE-ONE-CLUE-OUT (LOCO) STRESS TEST & LATEX/CSV BENCHMARK EXPORTERS
// ============================================================================
async function runLocoStressTest() {
  const question_text = (document.getElementById("input-question")?.value || "").trim();
  const target_answer = (document.getElementById("input-answer")?.value || "").trim();
  const panel = document.getElementById("loco-stress-panel");
  const btn = document.getElementById("btn-loco-stress");
  if (!question_text || !target_answer || !panel) return;

  const aliases = (document.getElementById("input-aliases")?.value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  panel.classList.remove("hidden");
  panel.innerHTML = `<div class="text-purple-300">Running Leave-One-Clue-Out (LOCO) Keystone Ablation &amp; Implicit Linguistic Leak Audit...</div>`;
  if (btn) btn.disabled = true;

  try {
    const res = await fetch("/api/stress-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_text,
        target_answer,
        acceptable_aliases: aliases,
      }),
    });
    const data = await res.json();

    const locoCards = (data.loco_ablation || [])
      .map((item) => {
        const isKeystone = item.clue_importance === "KEYSTONE_LOAD_BEARING";
        return `
        <div class="p-2.5 rounded-lg bg-slate-900/90 border ${
          isKeystone ? "border-purple-500/60" : "border-slate-800"
        }">
          <div class="flex items-center justify-between gap-1 mb-1">
            <span class="font-mono-code font-bold text-indigo-300">Drop ${escapeHtml(
              item.dropped_clue_id
            )}</span>
            <span class="px-1.5 py-0.5 rounded font-mono-code text-[9.5px] ${
              isKeystone
                ? "bg-purple-500/20 text-purple-300"
                : "bg-slate-800 text-slate-300"
            }">${escapeHtml(item.clue_importance)}</span>
          </div>
          <div class="text-[10.5px] text-slate-400 mb-1 truncate">"${escapeHtml(
            item.dropped_excerpt
          )}"</div>
          <div class="text-[10.5px] font-mono-code ${
            item.still_solvable_without_clue ? "text-emerald-300" : "text-rose-300"
          }">
            ${
              item.still_solvable_without_clue ? "Still solvable" : "Collapses!"
            } (ΔConf: -${Math.round(item.confidence_drop * 100)}%)
          </div>
        </div>
      `;
      })
      .join("");

    const leaks = data.linguistic_audit?.leaks || [];
    const leaksHtml = leaks.length
      ? leaks
          .map(
            (l) => `
          <div class="p-2 rounded-lg bg-amber-950/35 border border-amber-700/40 text-[11px] text-amber-200">
            <strong>[${escapeHtml(l.type)}]</strong> ${escapeHtml(l.detail)}
            <div class="text-slate-300 mt-0.5">→ ${escapeHtml(l.fix)}</div>
          </div>
        `
          )
          .join("")
      : `<div class="text-emerald-300 text-[11px]">✓ Zero implicit linguistic leaks (gendered pronouns, year clustering, or verbatim quotes).</div>`;

    panel.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <span class="font-bold text-purple-300">🧪 LOCO Keystone Ablation &amp; Implicit Linguistic Audit (${data.latency_ms}ms)</span>
        <span class="font-mono-code text-[11px] text-cyan-300">Keystone Clue: ${escapeHtml(
          data.keystone_clue_id
        )}</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">${locoCards}</div>
      <div class="flex flex-col gap-1.5">${leaksHtml}</div>
    `;
    showToast(`LOCO Stress Test complete — Keystone clue is ${data.keystone_clue_id}!`, "success");
  } catch (e) {
    panel.textContent = "Stress test failed.";
  } finally {
    if (btn) btn.disabled = false;
  }
}

function copyBenchmarkLatex() {
  if (!LAST_BENCHMARK_DATA || !LAST_BENCHMARK_DATA.cases) {
    showToast("Run the CSE Benchmark first before copying the LaTeX table.", "warning");
    return;
  }
  const rows = LAST_BENCHMARK_DATA.cases
    .map(
      (c, i) =>
        `  Case ${i + 1} (${c.target_answer}) & ${c.workability_score} & ${c.google_resistance} & ${c.uniqueness_score} & ${c.factual_integrity} & ${c.originality_score} & ${
          c.passed_detection ? "\\checkmark" : "\\times"
        } \\\\`
    )
    .join("\n");

  const latex =
    "\\begin{table}[t]\n" +
    "\\centering\n" +
    "\\caption{Crucible (Q-Lint) Empirical Flaw Detection & Sub-Score Benchmark}\n" +
    "\\begin{tabular}{lcccccc}\n" +
    "\\hline\n" +
    "\\textbf{Benchmark Case} & \\textbf{Work} & \\textbf{Search} & \\textbf{Cook} & \\textbf{Truth} & \\textbf{Fresh} & \\textbf{Pass} \\\\\n" +
    "\\hline\n" +
    rows +
    "\n\\hline\n" +
    `\\multicolumn{7}{l}{Overall Flaw Detection Accuracy: ${LAST_BENCHMARK_DATA.detection_accuracy_pct}\\% (${LAST_BENCHMARK_DATA.passed_cases}/${LAST_BENCHMARK_DATA.total_cases})} \\\\\n` +
    "\\end{tabular}\n" +
    "\\end{table}\n";

  navigator.clipboard?.writeText(latex);
  showToast("Copied IEEE/ACM LaTeX evaluation table to clipboard!", "success");
}

function exportBenchmarkCsv() {
  if (!LAST_BENCHMARK_DATA || !LAST_BENCHMARK_DATA.cases) {
    showToast("Run the CSE Benchmark first before exporting CSV.", "warning");
    return;
  }
  const header = "id,target_answer,expected_condition,detected_verdict,overall_score,workability,google_resistance,uniqueness,factual_integrity,originality,passed\n";
  const body = LAST_BENCHMARK_DATA.cases
    .map(
      (c) =>
        `"${c.id}","${c.target_answer}","${c.expected_condition}","${c.detected_verdict}",${c.overall_score},${c.workability_score},${c.google_resistance},${c.uniqueness_score},${c.factual_integrity},${c.originality_score},${c.passed_detection}`
    )
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crucible-cse-benchmark-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Exported CSE Benchmark results to CSV!", "success");
}

// ============================================================================
// CTRL+K SPOTLIGHT COMMAND PALETTE
// ============================================================================
const COMMAND_REGISTRY = [
  { label: "⚡ Run 4-Stage Diagnostic Linter", cat: "Action", fn: () => { switchTab("linter"); runDiagnosticLinter(); } },
  { label: "⚖ Open Side-by-Side A/B Question Variant Comparator", cat: "Action", fn: () => openABCompareModal() },
  { label: "🧪 Run LOCO Keystone Stress Test & Implicit Leak Audit", cat: "Action", fn: () => { switchTab("linter"); runLocoStressTest(); } },
  { label: "🛡 Autofix: De-Googleify 1-Hop Search Leaks", cat: "Autofix", fn: () => { switchTab("linter"); triggerAutofix("DE_GOOGLEIFY"); } },
  { label: "🔒 Autofix: Block Adversarial Cook Risk", cat: "Autofix", fn: () => { switchTab("linter"); triggerAutofix("BLOCK_COOK"); } },
  { label: "📚 Autofix: Fix Apocryphal Urban Legend Myth", cat: "Autofix", fn: () => { switchTab("linter"); triggerAutofix("FIX_MYTH"); } },
  { label: "🔽 Calibrate Difficulty Easier (Campus Prelims)", cat: "Autofix", fn: () => { switchTab("linter"); triggerAutofix("CALIBRATE_EASIER"); } },
  { label: "🔼 Calibrate Difficulty Harder (KQA / Nihilanth Finals)", cat: "Autofix", fn: () => { switchTab("linter"); triggerAutofix("CALIBRATE_HARDER"); } },
  { label: "🔊 Stage Mic Read-Aloud Test (Web Speech TTS)", cat: "Stage", fn: () => { switchTab("linter"); toggleSpeechPreview(); } },
  { label: "🎬 Preview 16:9 Stage Slide Deck", cat: "Export", fn: () => openSlidePreviewModal() },
  { label: "⛏ Open Funda Miner & Style-Calibrated Co-Setter", cat: "Tab", fn: () => switchTab("miner") },
  { label: "🎯 Open Live Pounce vs. Bounce Table Simulator", cat: "Tab", fn: () => switchTab("playtest") },
  { label: "🕸 Open 2-Hop Knowledge-Graph Connect Builder", cat: "Tab", fn: () => switchTab("connect") },
  { label: "📋 Open Round Builder, Host Scoreboard & Prelims PDF", cat: "Tab", fn: () => switchTab("setbuilder") },
  { label: "🗄 Open Angle-Indexed SQLite Archive & Bulk Importer", cat: "Tab", fn: () => switchTab("archive") },
  { label: "📊 Open CSE Evaluation Benchmark & LaTeX Exporter", cat: "Tab", fn: () => switchTab("benchmark") },
  { label: "⚙ Configure Groq & Gemini API Keys / Live Ping Test", cat: "Settings", fn: () => openSettingsModal() },
];

function openCommandPalette() {
  const modal = document.getElementById("command-palette-modal");
  const inp = document.getElementById("cmd-palette-input");
  if (!modal) return;
  modal.classList.remove("hidden");
  if (inp) {
    inp.value = "";
    setTimeout(() => inp.focus(), 30);
  }
  renderCommandPaletteList();
}

function closeCommandPalette() {
  const modal = document.getElementById("command-palette-modal");
  if (modal) modal.classList.add("hidden");
}

function renderCommandPaletteList() {
  const list = document.getElementById("cmd-palette-list");
  const q = (document.getElementById("cmd-palette-input")?.value || "").trim().toLowerCase();
  if (!list) return;
  const filtered = COMMAND_REGISTRY.filter(
    (c) => !q || c.label.toLowerCase().includes(q) || c.cat.toLowerCase().includes(q)
  );
  list.innerHTML = filtered.length
    ? filtered
        .map((c) => {
          const origIdx = COMMAND_REGISTRY.indexOf(c);
          return `
          <button onclick="executeCommandByIndex(${origIdx})" class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-indigo-600/25 border border-transparent hover:border-indigo-500/40 flex items-center justify-between text-xs text-slate-100 transition">
            <span>${escapeHtml(c.label)}</span>
            <span class="font-mono-code text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">${escapeHtml(
              c.cat
            )}</span>
          </button>
        `;
        })
        .join("")
    : `<div class="p-4 text-center text-xs text-slate-500">No matching commands found.</div>`;
}

function executeCommandByIndex(idx) {
  const cmd = COMMAND_REGISTRY[idx];
  closeCommandPalette();
  if (cmd && cmd.fn) cmd.fn();
}

// ============================================================================
// SIDE-BY-SIDE A/B VARIANT COMPARATOR & WORKSPACE BACKUP EXPORTER
// ============================================================================
function openABCompareModal() {
  const modal = document.getElementById("ab-compare-modal");
  if (!modal) return;
  document.getElementById("ab-draft-a").value = (document.getElementById("input-question")?.value || "").trim();
  document.getElementById("ab-target-answer").value = (document.getElementById("input-answer")?.value || "").trim();
  if (!document.getElementById("ab-draft-b").value.trim()) {
    loadSampleABComparison(false);
  }
  modal.classList.remove("hidden");
}

function closeABCompareModal() {
  const modal = document.getElementById("ab-compare-modal");
  if (modal) modal.classList.add("hidden");
}

function loadSampleABComparison(overwriteA = true) {
  if (overwriteA) {
    document.getElementById("ab-draft-a").value =
      "During the volcanically darkened 'Year Without a Summer' of 1816, this Romantic-era writer stayed at Villa Diodati overlooking Lake Geneva. Inspired by late-night discussions of galvanism and supernatural folklore, this author penned a landmark gothic work that forever defined an iconic undead archetype in Western pop culture. Identify this author.";
    document.getElementById("ab-target-answer").value = "Mary Shelley";
  }
  document.getElementById("ab-draft-b").value =
    "During an 1814 journey down the Rhine, teenager X stopped near Darmstadt—a few miles from a hilltop fortress where 17th-century alchemist Johann Konrad Dippel had distilled an animal-bone elixir of life. Two years later by Lake Geneva, X won a ghost-story contest at age eighteen and published a debut novel subtitled 'The Modern Prometheus'. Identify X.";
}

async function runABComparison() {
  const draftA = (document.getElementById("ab-draft-a")?.value || "").trim();
  const draftB = (document.getElementById("ab-draft-b")?.value || "").trim();
  const ans = (document.getElementById("ab-target-answer")?.value || "").trim();
  const out = document.getElementById("ab-compare-results");
  const btn = document.getElementById("btn-run-ab");
  if (!draftA || !draftB || !ans) {
    showToast("Provide Draft A, Draft B, and a shared Target Answer.", "warning");
    return;
  }

  if (btn) btn.disabled = true;
  out.innerHTML = `<div class="p-4 text-center text-indigo-300">Running 4-Stage Diagnostic Pipeline concurrently on Draft A and Draft B...</div>`;

  try {
    const res = await fetch("/api/compare-ab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft_a: { question_text: draftA, target_answer: ans },
        draft_b: { question_text: draftB, target_answer: ans },
      }),
    });
    const data = await res.json();

    const rowsHtml = (data.metrics || [])
      .map((m) => {
        const d = m.delta_b_minus_a;
        const deltaStr = d > 0 ? `+${d} (B)` : d < 0 ? `+${Math.abs(d)} (A)` : "Tie";
        const deltaCls = d > 0 ? "text-cyan-300" : d < 0 ? "text-indigo-300" : "text-slate-400";
        return `
        <tr class="border-b border-slate-800/70">
          <td class="py-2 px-3 font-semibold text-slate-200">${escapeHtml(m.metric)}</td>
          <td class="py-2 px-3 font-mono-code text-indigo-300">${m.a}/100</td>
          <td class="py-2 px-3 font-mono-code text-cyan-300">${m.b}/100</td>
          <td class="py-2 px-3 font-mono-code font-bold ${deltaCls}">${deltaStr}</td>
        </tr>
      `;
      })
      .join("");

    out.innerHTML = `
      <div class="p-4 rounded-xl bg-slate-900/90 border border-emerald-500/40 mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono-code text-[11px] font-bold">WINNER: ${escapeHtml(
            data.winner
          )}</span>
          <div class="text-xs text-slate-200 mt-1">${escapeHtml(data.recommendation)}</div>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="adoptABDraft('A')" class="px-3 py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/50 text-[11px] font-semibold">Adopt Draft A</button>
          <button onclick="adoptABDraft('B')" class="px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-800 text-cyan-200 border border-cyan-700/50 text-[11px] font-semibold">Adopt Draft B</button>
        </div>
      </div>

      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="border-b border-slate-800 text-[10px] uppercase text-slate-400">
            <th class="py-2 px-3">Diagnostic Dimension</th>
            <th class="py-2 px-3">Draft A (${escapeHtml(data.verdict_a)})</th>
            <th class="py-2 px-3">Draft B (${escapeHtml(data.verdict_b)})</th>
            <th class="py-2 px-3">Edge</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
    showToast(`A/B Comparison complete: ${data.winner} wins!`, "success");
  } catch (e) {
    out.textContent = "A/B comparison failed.";
  } finally {
    if (btn) btn.disabled = false;
  }
}

function adoptABDraft(which) {
  const txt = document.getElementById(which === "A" ? "ab-draft-a" : "ab-draft-b").value.trim();
  const ans = document.getElementById("ab-target-answer").value.trim();
  document.getElementById("input-question").value = txt;
  document.getElementById("input-answer").value = ans;
  updateWordCount();
  closeABCompareModal();
  showToast(`Adopted Draft ${which} into Setter Editor!`, "success");
  runDiagnosticLinter();
}

async function exportFullWorkspaceJson() {
  try {
    const res = await fetch("/api/workspace/export");
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crucible-workspace-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(
      `Exported portable workspace backup (${data.archive_count} archive Qs, ${data.rounds_count} rounds)!`,
      "success"
    );
  } catch (e) {
    showToast("Workspace export failed.", "error");
  }
}

function handleWorkspaceImportFile(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      const res = await fetch("/api/workspace/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      showToast(
        `Restored ${data.imported_rounds} round(s), ${data.imported_round_questions} new round Qs & ${data.imported_archive} archive entries!`,
        "success"
      );
      await Promise.all([loadArchiveList(), loadRoundSet()]);
    } catch (e) {
      showToast("Invalid Crucible workspace JSON file.", "error");
    }
  };
  reader.readAsText(file);
}

// ============================================================================
// LIST-IT / BIDDING ROUND VERIFIER & ALIAS BUILDER
// ============================================================================
async function loadListItPreset(idx) {
  try {
    const res = await fetch("/api/list-it/presets");
    const data = await res.json();
    const p = (data.presets || [])[idx];
    if (!p) return;
    document.getElementById("listit-prompt").value = p.prompt;
    document.getElementById("listit-items").value = (p.items || []).join(", ");
    runListItVerifier();
  } catch (e) {
    showToast("Could not load List-It preset.", "error");
  }
}

async function runListItVerifier() {
  const prompt = (document.getElementById("listit-prompt")?.value || "").trim();
  const items = (document.getElementById("listit-items")?.value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = document.getElementById("listit-results-container");
  const btn = document.getElementById("btn-verify-listit");
  if (!prompt || !items.length) {
    showToast("Enter a List-It prompt and comma-separated items.", "warning");
    return;
  }

  if (btn) btn.disabled = true;
  out.innerHTML = `<div class="p-3 text-amber-300 text-xs">Auditing list cardinality, boundary edge cases, and Wikidata aliases...</div>`;

  try {
    const res = await fetch("/api/list-it/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, items }),
    });
    const data = await res.json();

    const itemCards = (data.verified_items || [])
      .map(
        (it) => `
      <div class="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800">
        <div class="text-xs font-bold text-emerald-300">#${it.index} ${escapeHtml(it.canonical_item)}</div>
        <div class="text-[10px] text-slate-400 mt-0.5">Aliases: ${escapeHtml(
          (it.acceptable_aliases || []).join(", ") || "Exact match"
        )}</div>
      </div>
    `
      )
      .join("");

    out.innerHTML = `
      <div class="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col gap-3 animate-fade-in">
        <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono-code text-xs font-bold">
              List Safety: ${data.list_safety_score}/100
            </span>
            <span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono-code text-xs">
              Cardinality: ${data.cardinality} items • Bidding Par: ${escapeHtml(data.recommended_bidding_par)}
            </span>
          </div>
          <span class="text-[10px] font-mono-code text-slate-400">${escapeHtml(data.engine_used)}</span>
        </div>

        <div class="p-3 rounded-xl bg-amber-950/35 border border-amber-700/40 text-xs text-amber-200">
          <div class="font-bold text-amber-300 mb-1">⚠ Boundary &amp; Arbitration Notes:</div>
          ${(data.boundary_warnings || []).map((w) => `<div>• ${escapeHtml(w)}</div>`).join("")}
          <div class="text-slate-300 mt-1.5"><strong>Suggested Scope Clause:</strong> ${escapeHtml(
            data.disambiguation_clause
          )}</div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">${itemCards}</div>
      </div>
    `;
    showToast(`Verified ${data.cardinality}-item List-It round (Par: ${data.recommended_bidding_par})!`, "success");
  } catch (e) {
    out.textContent = "List-It verification failed.";
  } finally {
    if (btn) btn.disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", initApp);
