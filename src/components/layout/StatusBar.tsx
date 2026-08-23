import type { SaveStatus } from "../../hooks/useAutoSave";

type Props = {
  status: SaveStatus;
  statusLabel: string;
  driveConnected: boolean;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  driveIconChar: string;
  onOpenDrivePanel: () => void;
  cursorLine: number;
  linesCount: number;
  charCount: number;
};

export function StatusBar({
  status, statusLabel, driveConnected, syncStatus,
  onOpenDrivePanel, cursorLine, linesCount, charCount,
}: Props) {
  return (
    <footer className="statusbar">
      <div>
        <span className={`save-status ${status}`} />
        <span className={status === "error" ? "status-error-text" : ""}>{statusLabel}</span>
        {/* Nut Drive DAY DU (icon + vien) da chuyen len TopBar, canh tab (xem
            TopBar.tsx) - o day chi giu 1 cham tron nho de tham khao nhanh
            trang thai ma khong chiem cho, bam van mo duoc DrivePanel. */}
        <button
          className="drive-status-dot-btn"
          onClick={(e) => { e.stopPropagation(); onOpenDrivePanel(); }}
          title={driveConnected ? "Google Drive đã kết nối" : "Kết nối Google Drive"}
        >
          <span
            className={`sync-dot ${driveConnected ? (syncStatus === "syncing" ? "syncing" : syncStatus === "error" ? "error" : "synced") : "pending"}`}
          />
        </button>
      </div>
      <div>
        <span>Ln {cursorLine}</span>
        <span>Lines {linesCount}</span>
        <span>{charCount} ký tự</span>
        <span>UTF-8</span>
        <span>Plain Text</span>
      </div>
    </footer>
  );
}
