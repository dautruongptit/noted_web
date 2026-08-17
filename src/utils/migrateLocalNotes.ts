import { localNotesStore } from "./localNotesStore";
import { syncApi } from "../api/syncApi";

export type MigrationResult = { migratedCount: number; failedCount: number };

// SEC-15: goi 1 LAN DUY NHAT ngay sau khi dang nhap Google THANH CONG (xem
// App.tsx) - day toan bo note dang o Local Mode (IndexedDB, tao ra luc CHUA
// dang nhap) len server.
//
// TAI SU DUNG CHINH endpoint POST /api/sync/batch da xay dung san cho co che
// offline-first (SEC-05/SEC-07) thay vi viet 1 endpoint moi - vi ban chat 2
// tinh huong GIONG HET NHAU: "co mot so note dang chi nam o client, chua
// tung len duoc server, can day len 1 lan". clientTempId = id local (dang
// string hoa) de backend tra ve dung note nao da tao thanh cong ung voi note
// local nao (xem SyncController.syncBatch, backend SEC-05).
//
// Sau khi day XONG (bat ke thanh cong bao nhieu note), xoa TOAN BO du lieu
// Local Mode - tu gio ve sau server la nguon du lieu DUY NHAT cho tai khoan
// nay (dung theo yeu cau: "khi dang nhap thi dong bo", khong giu 2 ban song
// song gay nham lan noi nao la "ban that").
export async function migrateLocalNotesToServer(): Promise<MigrationResult> {
  const localNotes = await localNotesStore.listWithContent();

  if (localNotes.length === 0) {
    return { migratedCount: 0, failedCount: 0 };
  }

  const items = localNotes.map((n) => ({
    noteId: null,
    clientTempId: String(n.id),
    displayName: n.displayName,
    content: n.content,
    baseVersion: null, // note tao moi hoan toan tren server - khong co gi de so sanh (SEC-19)
  }));

  try {
    const { results } = await syncApi.batch(items);
    const migratedCount = results.filter((r) => r.status === "created").length;
    const failedCount = results.length - migratedCount;

    // Xoa local SAU KHI da co ket qua tu server, KHONG xoa truoc (neu day
    // that bai giua chung, note local van con nguyen, khong mat du lieu).
    await localNotesStore.clearAll();

    return { migratedCount, failedCount };
  } catch {
    // Toan bo request that bai (VD mat mang ngay luc vua dang nhap xong) -
    // KHONG xoa local, giu nguyen de nguoi dung co the thu dong bo lai sau.
    return { migratedCount: 0, failedCount: localNotes.length };
  }
}
