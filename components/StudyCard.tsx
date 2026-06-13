"use client";

import { useState, type ReactNode } from "react";

/**
 * The white panel that wraps every study view. Its title row doubles as a
 * dropdown: clicking it collapses the card body while keeping the title (and
 * caret) visible.
 */
export function StudyCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="sb-card">
      <button
        type="button"
        className="sb-card-head"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        title={collapsed ? "Άνοιγμα" : "Σύμπτυξη"}
      >
        <span className={"sb-caret" + (collapsed ? "" : " open")}>▸</span>
        <span className="sb-h2 sb-card-title">{title}</span>
      </button>
      {!collapsed && <div className="sb-card-body">{children}</div>}
    </div>
  );
}
