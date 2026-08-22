import type { Note, NoteSyncStatus } from "../../types";

type Props = {
  notes: Note[];
  driveConnected: boolean;
  driveConnecting: boolean;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  lastSynced: Date | null;
  noteSyncMap: Record<number, NoteSyncStatus>;
  /** Thu muc THAT tren Drive (backend tu tao luc ket noi). null = chua co. */
  driveFolder: { id: string; name: string } | null;
  driveIconChar: string;
  onClose: () => void;
  onConnect: () => void;
  onCancelConnecting: () => void;
  onSyncNow: () => void;
  onDisconnect: () => void;
};

export function DrivePanel({
  notes, driveConnected, driveConnecting, syncStatus, lastSynced, noteSyncMap, driveFolder, driveIconChar,
  onClose, onConnect, onCancelConnecting, onSyncNow, onDisconnect,
}: Props) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section className="dialog drive-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-icon drive-icon">☁</div>
        <h2>Google Drive</h2>
        {!driveConnected && !driveConnecting && (
          <>
            <p>Kết nối với Google Drive để tự động sao lưu và đồng bộ tất cả ghi chú của bạn lên đám mây.</p>
            <div>
              <button onClick={onClose}>Huỷ</button>
              <button className="action-confirm" onClick={onConnect}>Kết nối Google Drive</button>
            </div>
          </>
        )}
        {driveConnecting && (
          <>
            <div className="drive-connecting"><span className="spin">↻</span><span>Đang xác thực với Google...</span></div>
            <div><button onClick={onCancelConnecting}>Huỷ</button></div>
          </>
        )}
        {driveConnected && (
          <>
            <div className="drive-status-row">
              <span className={`drive-status-icon ${syncStatus}`}>{driveIconChar}</span>
              <div>
                {/* Nhanh "error" TUNG BI THIEU o day: icon doi thanh ⚠ (xem
                    useDriveSync.driveIcon) nhung chu van ghi "Sẵn sàng" - nguoi
                    dung khong the biet lan dong bo vua roi that bai. */}
                <b>
                  {syncStatus === "syncing" ? "Đang đồng bộ..."
                    : syncStatus === "synced" ? "Đã đồng bộ"
                    : syncStatus === "error" ? "Đồng bộ thất bại"
                    : "Sẵn sàng"}
                </b>
                {syncStatus === "error" && <small>Chưa đồng bộ được lên Drive - thử lại sau ít phút.</small>}
                {lastSynced && <small>Lần cuối: {lastSynced.toLocaleString("vi-VN")}</small>}
              </div>
              <button className="sync-now-btn" onClick={onSyncNow} disabled={syncStatus === "syncing"}>↻ Ngay</button>
            </div>
            <div className="drive-folder-row">
              <span>📁</span>
              <div>
                <b>Thư mục đồng bộ</b>
                {/* Ten LAY TU BACKEND, khong viet cung. Ban cu hien "/Noted
                    Workspace" trong khi ten that la "NotedApp" - nguoi dung tim
                    trong Drive khong thay, tuong app khong tao thu muc. */}
                <small>{driveFolder ? driveFolder.name : "Đang tạo..."}</small>
              </div>
              {/* Backend tu tao thu muc, nen phai cho nguoi dung mo ra xem tan
                  mat - neu khong, "tu dong" chi khac "khong lam gi" o cho no im
                  lang. rel="noreferrer" bat buoc di kem target="_blank". */}
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
            <div className="drive-notes-list">
              {notes.map((note) => {
                const s = noteSyncMap[note.id];
                return (
                  <div key={note.id} className="drive-note-row">
                    <span className="doc-icon">▤</span>
                    <span className="drive-note-name">{note.name}</span>
                    <span className={`sync-label ${s ?? "pending"}`}>
                      {s === "syncing" ? "↻ Đang sync" : s === "synced" ? "✓ Đã sync" : "○ Chờ sync"}
                    </span>
                  </div>
                );
              })}
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
