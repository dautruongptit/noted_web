import { useCallback, useState, type MouseEvent } from "react";
import type { Note, NoteSyncStatus } from "../../types";
import { SORT_LABELS, type SortMode } from "../../hooks/useNoteSort";
import { SelectModeHeader } from "./SelectModeHeader";
import { NoteList } from "./NoteList";
import { SortMenu } from "./SortMenu";

type Props = {
  visible: boolean;
  width: number;
  notes: Note[];
  activeId: number | null;
  selectMode: boolean;
  selected: Set<number>;
  driveConnected: boolean;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  lastSynced: Date | null;
  noteSyncMap: Record<number, NoteSyncStatus>;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  onOpenNote: (id: number) => void;
  onNewNote: () => void;
  onEnterSelectMode: () => void;
  onExitSelectMode: () => void;
  onToggleSelect: (id: number) => void;
  onBulkDeleteRequest: () => void;
  onTouchStart: (id: number) => void;
  onTouchEnd: () => void;
  onMoreClick: (e: MouseEvent<HTMLButtonElement>, id: number) => void;
};

export function Sidebar({
  visible, width, notes, activeId, selectMode, selected, driveConnected, syncStatus, lastSynced,
  noteSyncMap, sortMode, onSortChange, onOpenNote, onNewNote, onEnterSelectMode, onExitSelectMode,
  onToggleSelect, onBulkDeleteRequest, onTouchStart, onTouchEnd, onMoreClick,
}: Props) {
  // null = dang dong. Luu san toa do luc bam thay vi do lai luc render: menu
  // dung position:fixed nen can toa do tuyet doi cua nut tren man hinh.
  const [sortMenuPos, setSortMenuPos] = useState<{ top: number; right: number } | null>(null);

  const openSortMenu = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation(); // neu de noi len document, listener dong menu trong SortMenu se dong ngay lap tuc
    const r = e.currentTarget.getBoundingClientRect();
    setSortMenuPos({ top: r.bottom + 5, right: window.innerWidth - r.right });
  };

  const closeSortMenu = useCallback(() => setSortMenuPos(null), []);

  return (
    <aside className={`sidebar ${visible ? "" : "collapsed"}`} style={visible ? { width } : undefined}>
      {selectMode ? (
        <SelectModeHeader selectedCount={selected.size} onDelete={onBulkDeleteRequest} onCancel={onExitSelectMode} />
      ) : (
        <div className="side-head">
          <span>FILE CỦA BẠN</span>
          <div className="side-head-actions">
            <button
              className={`sort-btn ${sortMenuPos ? "open" : ""}`}
              onClick={openSortMenu}
              title={`Sắp xếp: ${SORT_LABELS[sortMode]}`}
              aria-haspopup="menu"
              aria-expanded={sortMenuPos !== null}
            >
              ⇅
            </button>
            <button className="select-mode-btn" onClick={onEnterSelectMode} title="Chọn nhiều file">☑</button>
            <button onClick={onNewNote}>+</button>
          </div>
        </div>
      )}

      <NoteList
        notes={notes}
        activeId={activeId}
        selectMode={selectMode}
        selected={selected}
        driveConnected={driveConnected}
        noteSyncMap={noteSyncMap}
        onOpen={onOpenNote}
        onToggleSelect={onToggleSelect}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMoreClick={onMoreClick}
      />

      <div className="side-foot">
        <span className={`cloud-foot ${syncStatus === "syncing" && driveConnected ? "spin" : ""}`}>
          {driveConnected ? (syncStatus === "syncing" ? "↻" : syncStatus === "synced" ? "✓" : "☁") : "☁"}
        </span>
        <div>
          <b>{driveConnected ? "Google Drive" : "Đồng bộ hoá"}</b>
          <small>
            {!driveConnected && "Chưa kết nối"}
            {driveConnected && syncStatus === "syncing" && "Đang đồng bộ..."}
            {driveConnected && syncStatus === "synced" && lastSynced && `Lưu lúc ${lastSynced.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`}
            {driveConnected && syncStatus === "idle" && "Đã kết nối"}
          </small>
        </div>
      </div>

      {sortMenuPos && (
        <SortMenu pos={sortMenuPos} value={sortMode} onChange={onSortChange} onClose={closeSortMenu} />
      )}
    </aside>
  );
}
