"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Mode } from "@/lib/ai/types";
import { AppHeader } from "@/components/AppHeader";
import { HistorySheet } from "@/components/HistorySheet";
import { LandingFeatures, LandingIntro, SampleLink } from "@/components/Landing";
import { ModeTabs } from "@/components/ModeTabs";
import { UploadArea } from "@/components/UploadArea";
import {
  MODE_LIST,
  extractCovered,
  todayStr,
  type Panels,
  type Result,
  type Session,
  type Usage,
} from "@/lib/study";
import {
  GENERIC_ERROR,
  NOT_PDF_ERROR,
  SAMPLE_ERROR,
  errorFromApi,
  type UiError,
} from "@/lib/uiErrors";

const STORE_KEY = "studybox:panels";
const ACTIVE_KEY = "studybox:active";
const THEME_KEY = "studybox:theme";
const USAGE_KEY = "studybox:usage";
const SESSIONS_KEY = "studybox:sessions";
const SESSIONS_MAX = 60;

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

function saveSessions(next: Session[]) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
  } catch {
    /* storage full — non-fatal */
  }
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loadingMode, setLoadingMode] = useState<Mode | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [panels, setPanels] = useState<Panels>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage>({
    date: todayStr(),
    requests: 0,
    tokens: 0,
  });
  const [sessions, setSessions] = useState<Session[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<Mode | null>(null);
  const [scoreSlot, setScoreSlot] = useState<HTMLDivElement | null>(null);

  // Always the latest panels, so a slow generation can't restore removed ones.
  const panelsRef = useRef<Panels>({});
  // Bumped when the open study changes, so a late response is ignored.
  const generationRef = useRef(0);
  const historyButtonRef = useRef<HTMLButtonElement>(null);

  // Restore the current material + daily usage + history.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        panelsRef.current = JSON.parse(raw) as Panels;
        setPanels(panelsRef.current);
      }
      setActiveId(localStorage.getItem(ACTIVE_KEY));
    } catch {
      /* ignore corrupt cache */
    }
    setUsage(loadUsage());
    setSessions(loadSessions());
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

  /** Set and persist the open study's material and its history id. */
  const setStudy = useCallback((next: Panels, id: string | null) => {
    panelsRef.current = next;
    setPanels(next);
    setActiveId(id);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
      if (id) localStorage.setItem(ACTIVE_KEY, id);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* storage full — non-fatal */
    }
  }, []);

  const cancelGeneration = () => {
    generationRef.current += 1;
    setLoadingMode(null);
  };

  // Create or update the one session for the current document, keeping all
  // its panels together and moving it to the top of the history list.
  const upsertSession = useCallback(
    (id: string, fileName: string, next: Panels) => {
      setSessions((prev) => {
        const existing = prev.find((s) => s.id === id);
        const session: Session = {
          id,
          createdAt: existing ? existing.createdAt : Date.now(),
          fileName,
          panels: next,
        };
        const list = [session, ...prev.filter((s) => s.id !== id)].slice(
          0,
          SESSIONS_MAX,
        );
        saveSessions(list);
        return list;
      });
    },
    [],
  );

  // Delete one mode's material, from the open study and from its history entry.
  const removePanel = (mode: Mode) => {
    const next = { ...panelsRef.current };
    delete next[mode];
    const stillOpen = Boolean(file) || Object.keys(next).length > 0;
    setStudy(next, stillOpen ? activeId : null);
    if (!activeId) return;
    setSessions((prev) => {
      const list =
        Object.keys(next).length === 0
          ? prev.filter((s) => s.id !== activeId)
          : prev.map((s) => (s.id === activeId ? { ...s, panels: next } : s));
      saveSessions(list);
      return list;
    });
  };

  // Reopen a past session with every panel the user made for that PDF.
  const openSession = (s: Session) => {
    cancelGeneration();
    setStudy(s.panels, s.id);
    setFile(null);
    setError(null);
    setSelectedTab(null);
    setHistoryOpen(false);
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSessions(next);
      return next;
    });
    if (id === activeId) {
      cancelGeneration();
      setStudy({}, null);
      setFile(null);
      setError(null);
      setSelectedTab(null);
    }
  };

  // Start a clean upload, leaving history untouched.
  const newStudy = () => {
    cancelGeneration();
    setStudy({}, null);
    setFile(null);
    setError(null);
    setSelectedTab(null);
  };

  // Close the results; a selected file stays selected.
  const closeResults = () => {
    setStudy({}, file ? activeId : null);
    setSelectedTab(null);
  };

  const toggleTheme = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* non-fatal */
    }
  };

  const choose = (f: File | undefined) => {
    if (!f) return;
    const isPdf =
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError(NOT_PDF_ERROR);
      return;
    }
    cancelGeneration();
    setError(null);
    // New document → fresh session id and empty panels.
    setStudy({}, newId());
    setFile(f);
    setSelectedTab(null);
  };

  const clearFile = () => {
    setFile(null);
    setStudy({}, null);
    setError(null);
    setSelectedTab(null);
  };

  // Open the ready-made study. It stays out of the history: nothing was generated.
  const openSample = async () => {
    try {
      const { sampleStudy } = await import("@/lib/sampleStudy");
      setStudy(sampleStudy, null);
      setError(null);
      setSelectedTab(null);
    } catch {
      setError(SAMPLE_ERROR);
    }
  };

  const generate = async (mode: Mode) => {
    if (!file || loadingMode) return;
    const generation = ++generationRef.current;
    setError(null);
    setLoadingMode(mode);
    setSelectedTab(mode);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      // Tell the model what the other testing modes already cover, so it
      // picks fresh concepts (unless the document has nothing left).
      const covered = extractCovered(panelsRef.current, mode);
      if (covered.length > 0) fd.append("covered", JSON.stringify(covered));
      const res = await fetch("/api/generate", { method: "POST", body: fd });
      const data = await res.json();
      recordUsage(data.usage?.totalTokens ?? 0);
      if (generation !== generationRef.current) return;
      if (!res.ok) {
        setError(errorFromApi(data?.code, data?.error, file.size));
        return;
      }
      const r: Result = {
        material: data.material,
        meta: data.meta,
        fileName: file.name,
      };
      // Add (or refresh) this mode's panel, keeping the others in place,
      // and fold it into this document's single session.
      const id = activeId ?? newId();
      const next: Panels = { ...panelsRef.current, [mode]: r };
      setStudy(next, id);
      upsertSession(id, file.name, next);
    } catch {
      if (generation === generationRef.current) setError(GENERIC_ERROR);
    } finally {
      if (generation === generationRef.current) setLoadingMode(null);
    }
  };

  const shownModes = MODE_LIST.filter((m) => panels[m.id]);
  const hasPanels = shownModes.length > 0;
  const isLanding = !file && !hasPanels;
  const activeTab: Mode = selectedTab ?? shownModes[0]?.id ?? "summary";

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        usage={usage}
        historyButtonRef={historyButtonRef}
        onBrand={closeResults}
        onHistory={() => setHistoryOpen(true)}
        onToggleTheme={toggleTheme}
        onNewStudy={newStudy}
      />
      {/* The quiz and true/false score bars render here while their tab is open. */}
      <div ref={setScoreSlot} className="sticky top-14 z-10" />

      <main
        className={
          "flex-1 overflow-x-clip px-4 sm:px-6 " +
          (isLanding
            ? "pt-6 pb-10 sm:pt-12 sm:pb-16"
            : "pt-4 pb-10 sm:pt-8 sm:pb-16")
        }
      >
        <div
          className={
            "mx-auto flex w-full max-w-[768px] flex-col gap-6 " +
            (isLanding ? "sm:gap-8" : "")
          }
        >
          {isLanding && <LandingIntro />}

          <UploadArea
            file={file}
            studyName={shownModes[0] ? (panels[shownModes[0].id]?.fileName ?? null) : null}
            busy={loadingMode !== null}
            error={error}
            onChoose={choose}
            onClear={clearFile}
          />

          {isLanding ? (
            <>
              <SampleLink onOpen={openSample} />
              <LandingFeatures />
            </>
          ) : (
            <ModeTabs
              panels={panels}
              hasFile={Boolean(file)}
              loadingMode={loadingMode}
              activeTab={activeTab}
              scoreSlot={scoreSlot}
              onTabChange={setSelectedTab}
              onGenerate={generate}
              onRemove={removePanel}
            />
          )}
        </div>
      </main>

      <HistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        sessions={sessions}
        activeId={activeId}
        usage={usage}
        returnFocusRef={historyButtonRef}
        onOpenSession={openSession}
        onDeleteSession={deleteSession}
      />
    </div>
  );
}
