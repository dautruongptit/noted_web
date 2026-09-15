import { useCallback, useEffect, useRef, useState } from "react";
import { syncApi } from "../api/syncApi";
import type { SyncBatchResultItem } from "../api/types";
import { ApiError } from "../utils/apiClient";
import { getAllPending, pendingCount, removePending, savePending, type PendingChange } from "../utils/offlineQueue";

export type OfflineSyncStatus = "idle" | "syncing" | "pending" | "error";

const RETRY_INTERVAL_MS = 30_000; // luoi an toan du phong - giong pattern @Scheduled ben backend (SEC-03)

/**
 * Dieu phoi luong offline-first o phia client:
 *  - queueChange(): goi moi khi noi dung 1 note thay doi. Ghi ngay vao
 *    IndexedDB (luon thanh cong), roi thu goi API - neu server khong toi
 *    duoc, entry o lai trong hang doi cho retry.
 *  - Tu dong flush hang doi khi: (1) trinh duyet bao 'online' tro lai,
 *    (2) dinh ky moi 30s (phong truong hop bo lo su kien 'online' - vd
 *    server tra 503 nhung mang van "online" theo trinh duyet),
 *    (3) nguoi dung bam nut dong bo thu cong.
 *
 * onSynced: callback nhan ket qua tung item (dac biet quan trong cho case
 * "created" - note tao luc offline chi co clientTempId, can map sang
 * noteId THAT ma server vua cap phat, de UI cap nhat lai state notes/tabs).
 */
export function useOfflineSync(onSynced?: (results: SyncBatchResultItem[]) => void) {
  const [status, setStatus] = useState<OfflineSyncStatus>("idle");
  const [pendingCountState, setPendingCountState] = useState(0);
  const isSyncing = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    const count = await pendingCount();
    setPendingCountState(count);
    if (count > 0 && status === "idle") setStatus("pending");
  }, [status]);

  const queueChange = useCallback(async (change: PendingChange) => {
    await savePending(change);
    await refreshPendingCount();
  }, [refreshPendingCount]);

  const flush = useCallback(async () => {
    if (isSyncing.current) return; // tranh 2 lan flush chay chong cheo
    const items = await getAllPending();
    if (items.length === 0) {
      setStatus("idle");
      return;
    }

    isSyncing.current = true;
    setStatus("syncing");

    try {
      const { results } = await syncApi.batch(items);

      for (const result of results) {
        // "conflict_kept_both" cung XOA khoi hang doi giong "synced"/"created" -
        // KHAC voi "conflict" cu truoc day (da bo, xem SEC-18): server gio
        // KHONG con bo ban local nua ma tach thanh 1 note rieng an toan
        // (conflictCopyId/Name, xem onSynced callback o App.tsx de bao nguoi
        // dung) - du lieu da chac chan duoc luu, khong can giu lai de retry.
        if (result.status === "synced" || result.status === "created"
            || result.status === "synced_overwritten" || result.status === "conflict_kept_both") {
          const match = items.find((i) =>
            (i.noteId !== null && i.noteId === result.noteId) ||
            (i.clientTempId !== null && i.clientTempId === result.clientTempId)
          );
          if (match) await removePending(match);
        }
        // "not_found_on_server" / "error": GIU LAI trong hang doi co tinh -
        // khong tu y xoa du lieu nguoi dung khi chua chac chan server da nhan
        // dung. UI nen hien thi canh bao rieng cho cac case nay (xem onSynced
        // callback) thay vi am tham mat du lieu.
      }

      onSynced?.(results);
      await refreshPendingCount();
      setStatus((await pendingCount()) > 0 ? "pending" : "idle");
    } catch (err) {
      // Server van chua toi duoc - KHONG throw tiep, du lieu van an toan trong
      // IndexedDB, se tu retry o lan flush tiep theo (online event / interval).
      setStatus("error");
      if (!(err instanceof ApiError)) {
        // Loi mang thuan tuy (khong phai loi tra ve tu server) - log de debug,
        // khong can bao nguoi dung vi day la tinh huong da luong truoc.
        console.warn("[offline-sync] flush that bai, se retry sau:", err);
      }
    } finally {
      isSyncing.current = false;
    }
  }, [onSynced, refreshPendingCount]);

  useEffect(() => {
    refreshPendingCount();

    const onOnline = () => { void flush(); };
    window.addEventListener("online", onOnline);

    const interval = window.setInterval(() => { void flush(); }, RETRY_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, pendingCount: pendingCountState, queueChange, flushNow: flush };
}
