import type { MouseEvent } from "react";
import type { Note } from "../../types";
import type { SaveStatus } from "../../hooks/useAutoSave";

type Props = {
  dark: boolean;
  onToggleSidebar: () => void;
  tabs: number[];
  notes: Note[];
  activeId: number | null;
  status: SaveStatus;
  onSelectTab: (id: number) => void;
  onCloseTab: (e: MouseEvent, id: number) => void;
  onNewNote: () => void;
  onManualSave: () => void;
  onToggleDark: () => void;
};

export function TopBar({
  dark, onToggleSidebar, tabs, notes, activeId, status,
  onSelectTab, onCloseTab, onNewNote, onManualSave, onToggleDark,
}: Props) {
  return (
    <header className="topbar">
      {/* Logo da chuyen vao trong sidebar (theo thiet ke) - o day chi con nut
          thu gon, tach rieng de van bam duoc khi sidebar dang an. */}
      <button
        className="sidebar-toggle"
        onClick={(e) => { e.stopPropagation(); onToggleSidebar(); }}
        title="Ẩn/hiện danh sách"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M9 3v18" />
        </svg>
      </button>
      <div className="tabs">
        {tabs.map((id) => {
          const note = notes.find((n) => n.id === id);
          if (!note) return null;
          return (
            <button key={id} onClick={() => onSelectTab(id)} className={`tab ${activeId === id ? "active" : ""}`}>
              <span className="file-glyph">▤</span>
              <span className="tab-name">{note.name}</span>
              {(status === "unsaved" || status === "error") && activeId === id && <i className="unsaved" />}
              <span className="close" onClick={(e) => onCloseTab(e, id)}>×</span>
            </button>
          );
        })}
        <button className="new-tab" onClick={onNewNote}>+</button>
      </div>
      <div className="top-actions">
        <button className="save-btn" onClick={onManualSave} title="Lưu (⌘S)">⌘</button>
        <button className="mode" onClick={onToggleDark} title={dark ? "Chuyển sang nền sáng" : "Chuyển sang nền tối"}>
          {dark ? "☀" : "☾"}
        </button>
      </div>
    </header>
  );
}
