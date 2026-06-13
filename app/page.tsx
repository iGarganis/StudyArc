"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeneratedMaterial, Mode } from "@/lib/ai/types";
import { TESTING_MODES, isTestingMode } from "@/lib/ai/types";
import { SummaryView } from "@/components/SummaryView";
import { Eli5View } from "@/components/Eli5View";
import { QuizView } from "@/components/QuizView";
import { TrueFalseView } from "@/components/TrueFalseView";
import { FlashcardsView } from "@/components/FlashcardsView";
import { exportMaterialToPdf } from "@/lib/exportPdf";

const MODES: { id: Mode; label: string }[] = [
  { id: "summary", label: "Σύνοψη" },
  { id: "eli5", label: "Απλή εξήγηση" },
  { id: "quiz", label: "Quiz" },
  { id: "truefalse", label: "Σωστό / Λάθος" },
  { id: "flashcards", label: "Κάρτες" },
];

type Meta = { totalPages: number; charCount: number; title: string | null };
type Result = { material: GeneratedMaterial; meta: Meta; fileName: string };
/** One open panel per mode, so several can be shown side by side. */
type Panels = Partial<Record<Mode, Result>>;

const STORE_KEY = "studybox:panels";
const THEME_KEY = "studybox:theme";
const USAGE_KEY = "studybox:usage";

// Gemini free-tier reference limits (gemini-2.5-flash). Edit if your tier changes.
const REQUEST_LIMIT = 250; // requests per day
const TOKEN_LIMIT = 250_000; // tokens

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** Compact token count, e.g. 940, 12.3k, 1.4M. */
function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Local YYYY-MM-DD, used to reset the daily usage counter. */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Usage = { date: string; requests: number; tokens: number };

function loadUsage(): Usage {
  const today = todayStr();
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw) {
      const u = JSON.parse(raw) as Usage;
      if (u.date === today) return u;
    }
  } catch {
    /* ignore corrupt data */
  }
  return { date: today, requests: 0, tokens: 0 };
}

const SESSIONS_KEY = "studybox:sessions";
const SESSIONS_MAX = 60;

/** One PDF the user studied — holds every panel they generated for it. */
type Session = {
  id: string;
  createdAt: number;
  fileName: string;
  panels: Panels;
};

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        // Keep only entries in the current shape (one session per PDF).
        return arr.filter(
          (s) => s && typeof s === "object" && s.panels && s.fileName,
        ) as Session[];
      }
    }
  } catch {
    /* ignore corrupt history */
  }
  return [];
}

/** Labels of the modes present in a session, e.g. "Σύνοψη · Quiz". */
function sessionModes(panels: Panels): string {
  return MODES.filter((m) => panels[m.id])
    .map((m) => m.label)
    .join(" · ");
}

/**
 * Concepts already covered by the OTHER testing-mode panels for this document,
 * so the model can avoid repeating them. Summary/ELI5 are excluded on purpose.
 */
function extractCovered(panels: Panels, mode: Mode): string[] {
  if (!isTestingMode(mode)) return [];
  const out: string[] = [];
  for (const m of TESTING_MODES) {
    if (m === mode) continue;
    const mat = panels[m]?.material;
    if (!mat) continue;
    if (mat.mode === "quiz") out.push(...mat.questions.map((q) => q.question));
    else if (mat.mode === "truefalse")
      out.push(...mat.questions.map((q) => q.statement));
    else if (mat.mode === "flashcards")
      out.push(...mat.cards.map((c) => c.front));
  }
  return out;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Bucket a timestamp into a sidebar group like Claude's history. */
function dateGroup(ts: number): string {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(ts))) / 86_400_000);
  if (days <= 0) return "Σήμερα";
  if (days === 1) return "Χθες";
  if (days < 7) return "Αυτή την εβδομάδα";
  if (days < 30) return "Αυτόν τον μήνα";
  return "Παλαιότερα";
}

/** Group already-newest-first sessions, preserving group order of appearance. */
function groupSessions(sessions: Session[]): [string, Session[]][] {
  const groups: [string, Session[]][] = [];
  for (const s of sessions) {
    const g = dateGroup(s.createdAt);
    const last = groups[groups.length - 1];
    if (last && last[0] === g) last[1].push(s);
    else groups.push([g, [s]]);
  }
  return groups;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loadingMode, setLoadingMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panels, setPanels] = useState<Panels>({});
  const [dark, setDark] = useState(false);
  const [usage, setUsage] = useState<Usage>({
    date: todayStr(),
    requests: 0,
    tokens: 0,
  });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore the last generated material + theme + daily usage + history.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setPanels(JSON.parse(raw) as Panels);
    } catch {
      /* ignore corrupt cache */
    }
    setDark(document.documentElement.dataset.theme === "dark");
    setUsage(loadUsage());
    setSessions(loadSessions());
    // Open the sidebar by default on wide screens, collapsed on phones.
    setSidebarOpen(window.innerWidth > 880);
  }, []);

  // Add this generation's cost to today's running total (cache hits report 0).
  const recordUsage = (tokens: number) => {
    if (tokens <= 0) return;
    setUsage((prev) => {
      const today = todayStr();
      const base = prev.date === today ? prev : { date: today, requests: 0, tokens: 0 };
      const next: Usage = {
        date: today,
        requests: base.requests + 1,
        tokens: base.tokens + tokens,
      };
      try {
        localStorage.setItem(USAGE_KEY, JSON.stringify(next));
      } catch {
        /* non-fatal */
      }
      return next;
    });
  };

  const saveSessions = (next: Session[]) => {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
    } catch {
      /* storage full — non-fatal */
    }
  };

  const savePanels = (next: Panels) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
    } catch {
      /* storage full — non-fatal */
    }
  };

  // Remove a single open panel without touching the rest.
  const closePanel = (mode: Mode) => {
    setPanels((prev) => {
      const next = { ...prev };
      delete next[mode];
      savePanels(next);
      return next;
    });
  };

  // Create or update the one session for the current document, keeping all
  // its panels together and moving it to the top of the history list.
  const upsertSession = useCallback(
    (id: string, fileName: string, panels: Panels) => {
      setSessions((prev) => {
        const existing = prev.find((s) => s.id === id);
        const session: Session = {
          id,
          createdAt: existing ? existing.createdAt : Date.now(),
          fileName,
          panels,
        };
        const next = [session, ...prev.filter((s) => s.id !== id)].slice(
          0,
          SESSIONS_MAX,
        );
        saveSessions(next);
        return next;
      });
    },
    [],
  );

  // Reopen a past session with every panel the user made for that PDF.
  const openSession = (s: Session) => {
    setPanels(s.panels);
    savePanels(s.panels);
    setActiveId(s.id);
    setFile(null);
    setError(null);
    setLoadingMode(null);
    if (window.innerWidth <= 880) setSidebarOpen(false);
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSessions(next);
      return next;
    });
    if (id === activeId) {
      setActiveId(null);
      setPanels({});
      savePanels({});
    }
  };

  // Start a clean upload, leaving history untouched.
  const newStudy = () => {
    setPanels({});
    savePanels({});
    setActiveId(null);
    setError(null);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    if (window.innerWidth <= 880) setSidebarOpen(false);
  };

  const toggleTheme = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.dataset.theme = next ? "dark" : "light";
      try {
        localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      } catch {
        /* non-fatal */
      }
      return next;
    });
  };

  const choose = (f: File | null | undefined) => {
    if (!f) return;
    const isPdf =
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError("Δώσε ένα αρχείο PDF.");
      return;
    }
    setError(null);
    // New document → fresh session id and empty panels.
    setPanels({});
    savePanels({});
    setActiveId(newId());
    setFile(f);
  };

  const clearFile = () => {
    setFile(null);
    setPanels({});
    savePanels({});
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const generate = useCallback(
    async (mode: Mode) => {
      if (!file) return;
      setError(null);
      setLoadingMode(mode);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("mode", mode);
        // Tell the model what the other testing modes already cover, so it
        // picks fresh concepts (unless the document has nothing left).
        const covered = extractCovered(panels, mode);
        if (covered.length > 0) fd.append("covered", JSON.stringify(covered));
        const res = await fetch("/api/generate", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Παρουσιάστηκε σφάλμα.");
        recordUsage(data.usage?.totalTokens ?? 0);
        const r: Result = {
          material: data.material,
          meta: data.meta,
          fileName: file.name,
        };
        // Add (or refresh) this mode's panel, keeping the others in place,
        // and fold it into this document's single session.
        const id = activeId ?? newId();
        if (id !== activeId) setActiveId(id);
        const nextPanels: Panels = { ...panels, [mode]: r };
        setPanels(nextPanels);
        savePanels(nextPanels);
        upsertSession(id, file.name, nextPanels);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Κάτι πήγε στραβά.");
      } finally {
        setLoadingMode(null);
      }
    },
    [file, panels, activeId, upsertSession],
  );

  // Panels to show, always in canonical order: Σύνοψη, Απλή εξήγηση, Quiz, Σ/Λ.
  const shownModes = MODES.filter((m) => panels[m.id]);
  const hasPanels = shownModes.length > 0;

  const renderPanel = (m: { id: Mode; label: string }) => {
    const r = panels[m.id]!;
    return (
      <section className="sb-result" key={m.id}>
        <div className="sb-result-bar">
          <div className="sb-result-from">
            {m.label} · {r.fileName}
            {r.meta?.totalPages ? ` · ${r.meta.totalPages} σελ.` : ""}
          </div>
          <div className="sb-result-actions">
            <button
              className="sb-result-dl"
              title="Λήψη ως PDF"
              onClick={() => exportMaterialToPdf(r.material, r.fileName)}
            >
              ↓ PDF
            </button>
            <button
              className="sb-result-close"
              title="Κλείσιμο"
              aria-label={`Κλείσιμο ${m.label}`}
              onClick={() => closePanel(m.id)}
            >
              ×
            </button>
          </div>
        </div>
        {r.material.mode === "summary" ? (
          <SummaryView data={r.material} />
        ) : r.material.mode === "eli5" ? (
          <Eli5View data={r.material} />
        ) : r.material.mode === "quiz" ? (
          <QuizView data={r.material} />
        ) : r.material.mode === "truefalse" ? (
          <TrueFalseView data={r.material} />
        ) : (
          <FlashcardsView data={r.material} />
        )}
      </section>
    );
  };

  return (
    <div className={"sb-shell" + (sidebarOpen ? " sidebar-open" : "")}>
      {/* ===== History sidebar ===== */}
      <aside className="sb-sidebar">
        <div className="sb-side-head">
          <button className="sb-newbtn" onClick={newStudy}>
            <span className="sb-newbtn-plus">+</span> Νέα μελέτη
          </button>
        </div>
        <div className="sb-side-list">
          {sessions.length === 0 ? (
            <p className="sb-side-empty">
              Δεν υπάρχει ιστορικό ακόμη. Ανέβασε ένα PDF και το υλικό που
              φτιάχνεις θα εμφανίζεται εδώ.
            </p>
          ) : (
            groupSessions(sessions).map(([group, items]) => (
              <div className="sb-side-group" key={group}>
                <div className="sb-side-group-label">{group}</div>
                {items.map((s) => (
                  <div
                    key={s.id}
                    className={
                      "sb-side-item" + (s.id === activeId ? " active" : "")
                    }
                    onClick={() => openSession(s)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") openSession(s);
                    }}
                  >
                    <span className="sb-side-item-main">
                      <span className="sb-side-item-title">{s.fileName}</span>
                      <span className="sb-side-item-sub">
                        {sessionModes(s.panels) || "—"}
                      </span>
                    </span>
                    <span
                      className="sb-side-del"
                      title="Διαγραφή"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(s.id);
                      }}
                    >
                      ×
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Backdrop for the mobile slide-over */}
      <div className="sb-backdrop" onClick={() => setSidebarOpen(false)} />

      <div className="sb-app">
        {/* ===== Top nav ===== */}
        <header className="sb-nav">
          <div className="sb-nav-left">
            <button
              className="sb-icon-btn"
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? "Απόκρυψη ιστορικού" : "Εμφάνιση ιστορικού"}
              aria-label="Εναλλαγή ιστορικού"
            >
              ☰
            </button>
            <button
              className="sb-brand"
              onClick={() => {
                setPanels({});
                savePanels({});
              }}
            >
              <span className="sb-logo">
                <span />
              </span>
              <span className="sb-wordmark sb-display">StudyBox</span>
            </button>
          </div>
          <div className="sb-nav-actions">
          <button className="sb-pill" onClick={toggleTheme}>
            <span className="sb-theme-dot" />
            {dark ? "Light" : "Dark"}
          </button>
          <div
            className="sb-usage"
            title="Χρήση σήμερα (μηδενίζει καθημερινά) σε σχέση με τα ημερήσια όρια του Gemini"
          >
            <strong>
              {usage.requests}/{REQUEST_LIMIT}
            </strong>{" "}
            Req
            <span className="sb-usage-sep">·</span>
            <strong>
              {formatTokens(usage.tokens)}/{formatTokens(TOKEN_LIMIT)}
            </strong>{" "}
            Tokens
          </div>
        </div>
      </header>

      <main className="sb-main">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => choose(e.target.files?.[0])}
        />

        {/* ===== Hero (only on the empty landing) ===== */}
        {!file && !hasPanels && (
          <div className="sb-hero">
            <h1 className="sb-h1 sb-display">
              Από PDF σε διάβασμα, σε δευτερόλεπτα.
            </h1>
            <p className="sb-lead">
              Ανέβασε τις σημειώσεις της διάλεξης και πάρε σύνοψη, απλή εξήγηση
              και quiz — στα ελληνικά.
            </p>
          </div>
        )}

        {/* ===== Upload zone — always kept in its spot ===== */}
        <div className="sb-upload">
              <div
                className={"sb-drop" + (dragging ? " drag" : "")}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  choose(e.dataTransfer.files?.[0]);
                }}
              >
                {file ? (
                  <div className="sb-selected">
                    <div className="sb-file-row">
                      <div className="sb-file-chip sb-display">PDF</div>
                      <div className="sb-file-info">
                        <div className="sb-file-name">{file.name}</div>
                        <div className="sb-file-meta">
                          {humanSize(file.size)} · έτοιμο
                        </div>
                      </div>
                      <button
                        className="sb-link-btn"
                        onClick={clearFile}
                        disabled={loadingMode !== null}
                      >
                        Άλλαξε
                      </button>
                    </div>

                    <div className="sb-modes">
                      {MODES.map((m) => {
                        const done = Boolean(panels[m.id]);
                        const loading = loadingMode === m.id;
                        const primary = !done || loading;
                        return (
                          <button
                            key={m.id}
                            className={
                              "sb-btn" +
                              (primary ? " sb-btn-primary" : "") +
                              (done ? " sb-mode-done" : "")
                            }
                            disabled={loadingMode !== null}
                            aria-pressed={done}
                            onClick={() => generate(m.id)}
                          >
                            {loading ? (
                              <>
                                <span className="sb-spin" /> {m.label}…
                              </>
                            ) : done ? (
                              <>✓ {m.label}</>
                            ) : (
                              m.label
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div
                    className="sb-drop-default"
                    onClick={() => inputRef.current?.click()}
                  >
                    <div className="sb-drop-icon">↑</div>
                    <div>
                      <div className="sb-drop-title sb-display">
                        Σύρε εδώ το PDF σου
                      </div>
                      <div className="sb-drop-sub">
                        ή επίλεξε ένα αρχείο από τον υπολογιστή σου
                      </div>
                    </div>
                    <button
                      className="sb-btn sb-btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        inputRef.current?.click();
                      }}
                    >
                      Επίλεξε αρχείο
                    </button>
                    <div className="sb-fineprint">PDF · έως 20 MB</div>
                  </div>
                )}

                {dragging && (
                  <div className="sb-drag-overlay sb-display">
                    Άσε το αρχείο εδώ
                  </div>
                )}
              </div>

              {error && <div className="sb-error">{error}</div>}

              {loadingMode && (
                <div className="sb-loading">
                  <span className="sb-spin" /> Δημιουργία υλικού… μπορεί να πάρει
                  λίγα δευτερόλεπτα.
                </div>
              )}
            </div>

        {/* ===== Results — masonry columns that pack vertically ===== */}
        {hasPanels && (
          <div className="sb-results">
            <div className="sb-results-col">
              {shownModes.filter((_, i) => i % 2 === 0).map(renderPanel)}
            </div>
            <div className="sb-results-col">
              {shownModes.filter((_, i) => i % 2 === 1).map(renderPanel)}
            </div>
          </div>
        )}

            {/* ===== What you'll get ===== */}
            {!file && !hasPanels && (
              <div className="sb-features">
                <div className="sb-features-head">
                  <span className="sb-features-label sb-display">
                    Τι θα πάρεις
                  </span>
                  <span className="sb-rule" />
                </div>
                <div className="sb-feat-grid">
                  <div className="sb-feat">
                    <div className="sb-feat-head sb-display">
                      <span className="sb-feat-dot" />
                      Σύνοψη
                    </div>
                    <p>Τα βασικά σημεία οργανωμένα. Οι τύποι ξεχωρίζουν.</p>
                  </div>
                  <div className="sb-feat">
                    <div className="sb-feat-head sb-display">
                      <span className="sb-feat-dot accent" />
                      Απλή εξήγηση
                    </div>
                    <p>Η ύλη με απλά λόγια, σαν να σου τη λέει ένας φίλος.</p>
                  </div>
                  <div className="sb-feat">
                    <div className="sb-feat-head sb-display">
                      <span className="sb-feat-dot round" />
                      Quiz · 20 ερωτήσεις
                    </div>
                    <p>Πολλαπλή επιλογή με άμεση εξήγηση σε κάθε απάντηση.</p>
                  </div>
                  <div className="sb-feat">
                    <div className="sb-feat-head sb-display">
                      <span className="sb-feat-dot accent round" />
                      Σωστό / Λάθος · 20 δηλώσεις
                    </div>
                    <p>Έλεγξε τη γνώση σου γρήγορα, με εξήγηση σε κάθε δήλωση.</p>
                  </div>
                  <div className="sb-feat">
                    <div className="sb-feat-head sb-display">
                      <span className="sb-feat-dot" />
                      Κάρτες · 20 κάρτες
                    </div>
                    <p>Ενεργή ανάκληση με κάρτες· επανάληψη σε όσες δυσκολεύτηκες.</p>
                  </div>
                </div>
              </div>
            )}
        </main>
      </div>
    </div>
  );
}
