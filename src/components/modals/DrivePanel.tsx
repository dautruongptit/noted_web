import { useState } from "react";
import type { Note, NoteSyncStatus } from "../../types";
import { timeAgo, fullTimestamp } from "../../utils/timeAgo";

type Props = {
  notes: Note[];
  driveConnected: boolean;
  driveConnecting: boolean;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  lastSynced: Date | null;
  noteSyncMap: Record<number, NoteSyncStatus>;
  /** Thu muc THAT tren Drive (backend tu tao luc ket noi). null = chua co. */
  driveFolder: { id: string; name: string } | null;
  /** Email tai khoan Google MA DRIVE noi toi - co the KHAC email dang nhap Noted */
  driveAccountEmail: string;
  driveIconChar: string;
  onClose: () => void;
  onConnect: () => void;
  onCancelConnecting: () => void;
  onSyncNow: () => void;
  onDisconnect: () => void;
};

type Filter = "all" | "synced" | "pending";

/** Dung luong doc duoc cho nguoi - lam tron 1 chu so nhu trong thiet ke */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function DrivePanel({
  notes, driveConnected, driveConnecting, syncStatus, lastSynced, noteSyncMap, driveFolder,
  driveAccountEmail, driveIconChar, onClose, onConnect, onCancelConnecting, onSyncNow, onDisconnect,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  // Tong hop tu chinh danh sach note dang co - khong can endpoint thong ke rieng
  const totalBytes = notes.reduce((sum, n) => sum + n.sizeBytes, 0);
  const syncedCount = notes.filter((n) => noteSyncMap[n.id] === "synced").length;

  const visible = notes.filter((n) => {
    if (filter === "synced") return noteSyncMap[n.id] === "synced";
    if (filter === "pending") return noteSyncMap[n.id] !== "synced";
    return true;
  });

  const statusText =
    syncStatus === "syncing" ? "Đang đồng bộ..."
    : syncStatus === "error" ? "Đồng bộ thất bại"
    : syncStatus === "synced" ? "Đã đồng bộ"
    : "Sẵn sàng đồng bộ";

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section className="dialog drive-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="drive-head">
          <div className="dialog-icon drive-icon">☁</div>
          <div className="drive-head-text">
            <h2>Google Drive</h2>
            {/* Email cua tai khoan DRIVE, khong phai email dang nhap Noted -
                hai cai co the khac nhau, va viec khong hien no chinh la thu
                khien su co ghi nham sang Drive tai khoan khac (2026-08-22)
                mat rat lau moi bi phat hien. */}
            {driveConnected && driveAccountEmail && <small>{driveAccountEmail}</small>}
          </div>
          <button className="drive-close" onClick={onClose} title="Đóng">×</button>
        </header>

        {!driveConnected && !driveConnecting && (
          <>
            <p>Kết nối với Google Drive để tự động sao lưu và đồng bộ tất cả ghi chú của bạn lên đám mây.</p>
            <div className="drive-actions">
              <button onClick={onClose}>Huỷ</button>
              <button className="action-confirm" onClick={onConnect}>Kết nối Google Drive</button>
            </div>
          </>
        )}

        {driveConnecting && (
          <>
            <div className="drive-connecting"><span className="spin">↻</span><span>Đang xác thực với Google...</span></div>
            <div className="drive-actions"><button onClick={onCancelConnecting}>Huỷ</button></div>
          </>
        )}

        {driveConnected && (
          <>
            <div className="drive-status-row">
              <span className={`drive-status-icon ${syncStatus}`}>{driveIconChar}</span>
              <div className="drive-status-text">
                <b>{statusText}</b>
                <small>
                  {notes.length} tệp
                  {lastSynced && ` · lần cuối ${lastSynced.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`}
                </small>
              </div>
              <button className="sync-now-btn" onClick={onSyncNow} disabled={syncStatus === "syncing"}>
                ⟳ Đồng bộ ngay
              </button>
            </div>

            {/* Thanh tien trinh: ty le note DA sync tren tong so. Khi dang dong bo
                thi chay vach khong xac dinh vi backend khong bao tien do tung tep. */}
            <div className={`drive-progress ${syncStatus === "syncing" ? "indeterminate" : ""}`}>
              <span style={{ width: notes.length ? `${(syncedCount / notes.length) * 100}%` : "0%" }} />
            </div>

            <div className="drive-folder-row">
              <span>📁</span>
              <div>
                {/* Ten LAY TU BACKEND, khong viet cung */}
                <b>{driveFolder ? driveFolder.name : "Đang tạo..."}</b>
                <small>Thư mục đồng bộ · {notes.length} tệp{totalBytes > 0 ? ` · ${formatBytes(totalBytes)}` : ""}</small>
              </div>
              {driveFolder && (
                <a
                  className="link-btn"
                  href={`https://drive.google.com/drive/folders/${driveFolder.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mở trong Drive ↗
                </a>
              )}
            </div>

            <div className="drive-list-head">
              <span className="drive-list-label">TỆP</span>
              <div className="drive-filter" role="tablist">
                {([["all", "Tất cả"], ["synced", "Đã sync"], ["pending", "Đang chờ"]] as [Filter, string][]).map(
                  ([key, label]) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={filter === key}
                      className={filter === key ? "active" : ""}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="drive-notes-list">
              {visible.length === 0 ? (
                <div className="drive-notes-empty">Không có tệp nào</div>
              ) : (
                visible.map((note) => {
                  const s = noteSyncMap[note.id];
                  return (
                    <div key={note.id} className="drive-note-row">
                      <span className="doc-icon">▤</span>
                      <div className="drive-note-info">
                        <b className="drive-note-name">{note.name}</b>
                        <small title={fullTimestamp(note.updated)}>
                          {note.sizeBytes > 0 ? `${formatBytes(note.sizeBytes)} · ` : ""}{timeAgo(note.updated)}
                        </small>
                      </div>
                      <span className={`sync-label ${s ?? "pending"}`}>
                        {s === "syncing" ? "↻ Đang sync" : s === "synced" ? "✓ Đã sync" : "○ Chờ sync"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="drive-actions">
              <button className="disconnect-btn" onClick={onDisconnect}>Ngắt kết nối</button>
              <button className="action-confirm" onClick={onClose}>Xong</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
