import type { SyncState } from "./api/types";

// Note.id doi tu string (UUID client tu sinh) sang number - khop CHINH XAC
// voi id do BACKEND cap phat (Long id, xem NoteSummaryResponse/NoteDetailResponse).
// Day la thay doi cau truc chinh cua SEC-08: khong con note nao duoc tao ra
// ma khong co id THAT tu server.
export type Note = {
  id: number;
  name: string;
  content: string;
  updated: Date;
  // true sau khi da goi GET /api/notes/{id} it nhat 1 lan (danh sach tu
  // GET /api/notes KHONG kem noi dung - xem notesApi.list). Dung de biet
  // co can fetch content truoc khi mo tab hay khong, tranh goi API thua.
  contentLoaded: boolean;
  // Trang thai dong bo Drive THAT lay tu backend (SEC-03), KHONG con la
  // random/mock nhu ban truoc - xem useDriveSync.ts de biet cach anh xa
  // xuong 3 gia tri UI hien co (NoteSyncStatus).
  syncState: SyncState;
  // TRUE neu day la "ban sao xung dot" tach ra khi dong bo offline phat hien
  // 2 ban khac nhau cua cung 1 noi dung (SEC-18) - dung de hien badge canh
  // bao trong sidebar, xem NoteListItem.tsx.
  conflictCopy: boolean;
  // So nguyen tang dan moi lan ghi thanh cong - dung lam baseVersion khi day
  // vao hang doi offline (SEC-19, Optimistic Concurrency Control), KHONG
  // hien thi tren UI.
  version: number;
  // Kich thuoc noi dung (byte) - hien o bang Google Drive. Lay tu server nen
  // CO GIA TRI ngay ca voi note chua tung mo (khac voi "content").
  sizeBytes: number;
  // Noi dung dang nam trong editor thuoc PHIEN BAN nao.
  //
  // KHONG dung chung voi "version": refreshSyncStates() nang "version" theo
  // server o moi lan lam moi danh sach NHUNG co y khong tai noi dung ve. Nen
  // "version" chi noi "server dang o phien ban nay", con noi dung hien thi thi
  // co the da cu tu doi nao. Dung "version" de phat hien "co ai vua sua o noi
  // khac khong" se LUON tra loi sai la khong.
  contentVersion: number;
};

export type NoteSyncStatus = "synced" | "pending" | "syncing";
export type MenuPos = { top?: number; bottom?: number; right: number };
