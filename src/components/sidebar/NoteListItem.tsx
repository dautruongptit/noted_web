import type { MouseEvent } from "react";
import type { Note, NoteSyncStatus } from "../../types";
import { timeAgo, fullTimestamp } from "../../utils/timeAgo";

/** Rut gon noi dung thanh 1 dong xem truoc: bo xuong dong + khoang trang thua */
function excerpt(content: string): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine.length > 90 ? oneLine.slice(0, 90) + "…" : oneLine;
}

type Props = {
  note: Note;
  isActive: boolean;
  selectMode: boolean;
  isSelected: boolean;
  syncStatus?: NoteSyncStatus;
  driveConnected: boolean;
  onClick: () => void;
  onTouchStart: () => void;
  onTouchEnd: () => void;
  onMoreClick: (e: MouseEvent<HTMLButtonElement>) => void;
};

export function NoteListItem({
  note, isActive, selectMode, isSelected, syncStatus, driveConnected,
  onClick, onTouchStart, onTouchEnd, onMoreClick,
}: Props) {
  const syncDot = () => {
    if (!driveConnected) return null;
    if (syncStatus === "syncing") return <span className="sync-dot syncing" title="Đang đồng bộ" />;
    if (syncStatus === "synced") return <span className="sync-dot synced" title="Đã đồng bộ" />;
    return <span className="sync-dot pending" title="Chưa đồng bộ" />;
  };

  return (
    <div
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchEnd}
      className={`file-row ${isActive && !selectMode ? "selected" : ""} ${selectMode && isSelected ? "selecting" : ""}`}
    >
      {selectMode && (
        <span className={`file-checkbox ${isSelected ? "checked" : ""}`}>
          {isSelected ? "☑" : "☐"}
        </span>
      )}
      <span className="doc-icon">▤</span>
      <div className="file-info">
        {/* Ten va thoi gian nam CUNG hang (thiet ke moi) */}
        <div className="file-title-row">
          <b>
            {note.conflictCopy && (
              <span className="conflict-badge" title="Bản được tách riêng do phát hiện xung đột đồng bộ">⚠</span>
            )}
            {note.name}
          </b>
          {/* timeAgo() la ban rut gon co chu y - tooltip giu lai moc chinh xac */}
          <span className="file-time" title={fullTimestamp(note.updated)}>{timeAgo(note.updated)}</span>
        </div>
        {/* Dong trich doan - LUON render du rong, de moi dong cao bang nhau.
            Note chua tung mo thi chua co noi dung (GET /api/notes khong tra ve
            content), luc do dong nay de trong thay vi lam dong bi thap hon. */}
        <small className="file-excerpt">{excerpt(note.content)}</small>
      </div>
      {!selectMode && syncDot()}
      {!selectMode && (
        <button className="more" onClick={onMoreClick}>•••</button>
      )}
    </div>
  );
}
