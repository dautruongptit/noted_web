import { useCallback, useState, type MouseEvent } from "react";
import type { Note, NoteSyncStatus } from "../../types";
import { SORT_LABELS, type SortMode } from "../../hooks/useNoteSort";
import { SelectModeHeader } from "./SelectModeHeader";
import { SideSearch } from "./SideSearch";
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
  /** Hien nut "Dang nhap & Dong bo" o chan sidebar (chi khi CHUA dang nhap) */
  showLoginCta: boolean;
  onLoginSync: () => void;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  onSyncNow: () => void;
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
  noteSyncMap, sortMode, onSortChange, onSyncNow, showLoginCta, onLoginSync, onOpenNote, onNewNote, onEnterSelectMode, onExitSelectMode,
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

  // Tim kiem chi anh huong DANH SACH HIEN THI o sidebar - khong dung toi tab
  // dang mo hay note dang soan. Loc theo ten VA noi dung (noi dung chi co voi
  // note da tung mo - xem ghi chu o .file-excerpt).
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visibleNotes = q
    ? notes.filter((n) => n.name.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    : notes;

  return (
    <aside className={`sidebar ${visible ? "" : "collapsed"}`} style={visible ? { width } : undefined}>
      {/* Hang logo - theo thiet ke thi no thuoc SIDEBAR chu khong phai thanh tren
          cung, nho vay sidebar cao het man hinh va khong bi cat ngang. */}
      <div className="side-brand">
        <span className="brand-mark">N</span>
        <span className="brand-name">noted</span>
        <button className="side-new-btn" onClick={onNewNote} title="Ghi chú mới">+</button>
      </div>

      {!selectMode && <SideSearch value={query} onChange={setQuery} />}

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
          </div>
        </div>
      )}

      {q && visibleNotes.length === 0 ? (
        <div className="file-list"><div className="side-empty">Không tìm thấy ghi chú nào</div></div>
      ) : (
      <NoteList
        notes={visibleNotes}
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
      )}

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
        {/* Dong bo nhanh ngay tai chan sidebar, khong phai mo bang Drive.
            Chi hien khi DA ket noi - chua ket noi thi bam cung khong lam gi. */}
        {driveConnected && (
          <button
            className={`side-sync-btn ${syncStatus === "syncing" ? "spin" : ""}`}
            onClick={onSyncNow}
            disabled={syncStatus === "syncing"}
            title="Đồng bộ ngay"
          >⟳</button>
        )}
      </div>

      {/* CTA dang nhap: theo thiet ke no nam TRONG chan sidebar va rong het
          chieu ngang. Truoc day la 1 banner NOI o goc man hinh, de che mat
          noi dung va khong an nhap voi phan con lai cua sidebar. */}
      {showLoginCta && (
        <button className="side-login-btn" onClick={onLoginSync}>☁ Đăng nhập &amp; Đồng bộ</button>
      )}

      {sortMenuPos && (
        <SortMenu pos={sortMenuPos} value={sortMode} onChange={onSortChange} onClose={closeSortMenu} />
      )}
    </aside>
  );
}
