import type { MouseEvent } from "react";
import type { Note, NoteSyncStatus } from "../../types";
import { timeAgo, fullTimestamp } from "../../utils/timeAgo";

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
        <b>
          {note.conflictCopy && (
            <span className="conflict-badge" title="Bản được tách riêng do phát hiện xung đột đồng bộ">⚠</span>
          )}
          {note.name}
        </b>
        {/* timeAgo() la ban rut gon co chu y - tooltip giu lai moc chinh xac */}
        <small title={fullTimestamp(note.updated)}>{timeAgo(note.updated)}</small>
      </div>
      {!selectMode && syncDot()}
      {!selectMode && (
        <button className="more" onClick={onMoreClick}>•••</button>
      )}
    </div>
  );
}
