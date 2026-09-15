// DTO types khop CHINH XAC voi response cua backend (xem noted-backend,
// package dto/response) - giu 2 phia dong bo, doi ten field o backend thi
// phai sua lai o day.

export type SyncState = "SYNCED" | "PENDING_DRIVE" | "DRIVE_FAILED" | "CONFLICT";

/** Khop com.noted.backend.dto.response.NoteSummaryResponse - dung cho danh sach sidebar */
export type NoteSummary = {
  id: number;
  displayName: string;
  syncState: SyncState;
  updatedAt: string; // ISO datetime string
  /** TRUE neu day la "ban sao xung dot" tach ra tu SyncController.createConflictCopy() (SEC-18) */
  conflictCopy: boolean;
  // So nguyen tang dan moi lan ghi thanh cong - dung lam "baseVersion" cho
  // lan sync/offline-queue tiep theo (Optimistic Concurrency Control, SEC-19).
  // KHONG dung cho so sanh hien thi UI nao - chi la du lieu ky thuat.
  version: number;
  /** Kich thuoc noi dung (byte) - dung hien dung luong tung tep o bang Google Drive */
  // TUY CHON: backend hien KHONG tra truong nay (giu nguyen, khong sua BE).
  // Local Mode tu tinh duoc nen van co gia tri; Server Mode se la undefined ->
  // giao dien tu an phan dung luong thay vi hien "0 B" sai su that.
  contentSizeBytes?: number;
};

/** Khop com.noted.backend.dto.response.NoteDetailResponse - dung khi mo tab, co noi dung */
export type NoteDetail = NoteSummary & {
  content: string;
};

/** Khop com.noted.backend.dto.response.BulkDeleteResponse */
export type BulkDeleteResult = {
  requestedCount: number;
  deletedCount: number;
  deletedIds: number[];
};

/** Khop response cua GET /api/notes/check-name */
export type CheckNameResult = {
  taken: boolean;
  suggestion: string;
};

/** Khop response cua GET /api/drive/status */
export type DriveStatus = {
  connected: boolean;
  /** Rong neu chua tao/chua ket noi - dung de dung link mo thu muc tren Drive */
  folderId: string;
  /** Ten THAT do backend cau hinh (app.drive.app-folder-name), KHONG viet cung o FE */
  folderName: string;
  /** Email tai khoan Google MA DRIVE dang noi toi - co the KHAC email dang nhap Noted */
  // TUY CHON: backend hien KHONG tra truong nay. Thieu thi bang Drive chi an
  // dong email di, moi thu khac van hoat dong binh thuong.
  accountEmail?: string;
};

/** Khop response cua GET /api/auth/me */
export type CurrentUser = {
  id: number;
  email: string;
  fullName: string;
  avatarUrl: string;
  driveConnected: boolean;
};

/** Khop com.noted.backend.dto.request.SyncBatchItem (chieu gui LEN server) */
export type SyncBatchItem = {
  noteId: number | null;
  clientTempId: string | null;
  displayName: string;
  content: string;
  // Version note nay ma client biet GAN NHAT (SEC-19, thay cho
  // "localUpdatedAtEpochMs" cu de bi lech dong ho) - null khi noteId cung
  // null (note tao moi hoan toan luc offline, khong co gi de so sanh).
  baseVersion: number | null;
};

/** Khop 1 phan tu trong mang "results" tra ve tu POST /api/sync/batch */
export type SyncBatchResultItem = {
  noteId?: number;
  clientTempId?: string;
  // "conflict_kept_both": server phat hien baseVersion client gui LECH voi
  // version hien tai - KHONG bo ban local nua, da tach thanh 1 note rieng
  // (conflictCopyId/Name) - xem SyncController.syncBatch(), useOfflineSync.ts.
  // "synced_overwritten": item trong hang doi offline da GHI DE mot ban tren
  // server moi hon (baseVersion lech). Truoc 2026-09-15 truong hop nay tach ra
  // file "(xung dot ...)" rieng; nay ghi de de chi con 1 file goc duy nhat, va
  // client tu keo lai noi dung vi ban trong editor da cu.
  status: "created" | "synced" | "synced_overwritten" | "conflict_kept_both" | "not_found_on_server" | "error";
  serverId?: number;
  serverVersion?: number;
  conflictCopyId?: number;
  conflictCopyName?: string;
  message?: string;
};
