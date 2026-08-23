import { useCallback, useEffect, useRef, useState } from "react";
import type { Note, NoteSyncStatus } from "../types";
import type { SyncState } from "../api/types";
import type { NotesMode } from "../api/notesRepo";
import type { SaveStatus } from "./useAutoSave";
import { driveApi } from "../api/driveApi";
import { ApiError } from "../utils/apiClient";

// Anh xa 4 trang thai that cua backend (SyncState, xem SEC-03) xuong 3 gia
// tri UI hien co (NoteSyncStatus) - NoteListItem.tsx/DrivePanel.tsx deu co
// san nhanh "khac synced/syncing -> pending" nen an toan khi gop DRIVE_FAILED
// va CONFLICT vao "pending" (hien "cho dong bo"), khong can sua UI component.
function mapSyncState(state: SyncState): NoteSyncStatus {
  return state === "SYNCED" ? "synced" : "pending";
}

// SEC-08: viet lai tu ban mock (setTimeout gia lap) sang goi THAT toi
// driveApi (xem src/api/driveApi.ts). noteSyncMap gio duoc TINH TRUC TIEP tu
// field syncState co san trong moi Note (da lay tu server qua notesApi -
// xem useNotes.ts) thay vi tu quan ly rieng 1 vong doi "syncing -> synced".
//
// refreshSyncStates: ham (truyen tu useNotes qua App.tsx) de lam moi lai
// syncState/updatedAt cua toan bo note tu server - goi sau khi "Dong bo ngay"
// hoac vua ket noi Drive xong, vi backend dong bo BAT DONG BO (event +
// job dinh ky, xem SEC-03) nen syncState co the doi TU FROM server MA
// KHONG co push/notify ve client - day la GIOI HAN DA BIET (xem SEC-08 note
// trong section_index.md), khong polling lien tuc de tranh phuc tap ngoai
// pham vi yeu cau.
export function useDriveSync(mode: NotesMode, notes: Note[], status: SaveStatus, activeId: number | null, refreshSyncStates: () => Promise<void>) {
  // activeId khong con duoc dung TRUC TIEP trong hook nay nua (noteSyncMap
  // gio tinh tu toan bo "notes", khong can biet rieng tab dang active) -
  // giu lai trong signature de khong phai sua call site o App.tsx, va vi
  // cac phan mo rong sau nay (VD hien trang thai sync rieng cho tab active
  // tren StatusBar) rat co the se can lai gia tri nay.
  void activeId;

  const [driveConnected, setDriveConnected] = useState(false);
  // Thong tin thu muc THAT tren Drive (id + ten), lay tu /api/drive/status.
  // Truoc day DrivePanel viet cung "/Noted Workspace" - mot cai ten khong ton
  // tai - nen nguoi dung khong the doi chieu duoc voi Drive that cua ho.
  const [driveFolder, setDriveFolder] = useState<{ id: string; name: string } | null>(null);
  // Email cua tai khoan Google MA DRIVE noi toi (co the KHAC email dang nhap Noted)
  const [driveAccountEmail, setDriveAccountEmail] = useState("");
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [showDrivePanel, setShowDrivePanel] = useState(false);
  const [noteSyncMap, setNoteSyncMap] = useState<Record<number, NoteSyncStatus>>({});

  // Tai trang thai ket noi Drive THAT ngay khi app mo - CHI khi da o SERVER
  // MODE (da dang nhap). O LOCAL MODE (SEC-15, chua dang nhap), goi endpoint
  // nay chac chan se nhan 401 vo ich (chua co JWT) - bo qua hoan toan, tranh
  // request thua + log 401 gay nham lan la co loi.
  useEffect(() => {
    if (mode !== "server") {
      setDriveConnected(false);
      setDriveFolder(null);
      setDriveAccountEmail("");
      return;
    }
    driveApi.status()
      .then((s) => {
        setDriveConnected(s.connected);
        setDriveFolder(s.folderId ? { id: s.folderId, name: s.folderName } : null);
        setDriveAccountEmail(s.accountEmail ?? "");
      })
      .catch(() => {}); // loi mang/token het han - giu mac dinh false, khong chan UI khoi doc
  }, [mode]);

  // noteSyncMap luon phan anh DUNG syncState hien co trong "notes" - khong
  // con random gia lap. Cap nhat tuc thi moi khi notes doi (VD sau khi luu
  // xong, useAutoSave.ts da gan syncState=PENDING_DRIVE ngay trong response).
  useEffect(() => {
    const map: Record<number, NoteSyncStatus> = {};
    for (const n of notes) map[n.id] = mapSyncState(n.syncState);
    setNoteSyncMap(map);
  }, [notes]);

  // Chan 2 luot dong bo chay chong nhau. Co TOI 3 duong doc lap cung goi
  // doSync/sync-all (nut "Đồng bộ ngay", auto-sync 2.5s sau khi luu, va flush
  // luc dong tab) - truoc day khong duong nao biet duong kia dang chay. Hai
  // request chong nhau tung lam backend tao ra 2 note y het cho CUNG 1 file
  // Drive (bug thuc te 2026-08-22, xem "pullingUserIds" o DriveSyncServiceImpl).
  // Backend da tu khoa lai, day la lop chan thu hai - tranh gui request vo ich.
  // Dung useRef chu KHONG dung state: can gia tri doc/ghi duoc NGAY lap tuc
  // trong cung 1 luot render, state cap nhat bat dong bo se van lot request.
  const syncInFlight = useRef(false);

  const doSync = useCallback(async () => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncStatus("syncing");
    try {
      await driveApi.syncAll();
      await refreshSyncStates(); // lam moi syncState tu server sau khi trigger dong bo
      // Lam moi ca thong tin thu muc: backend co the vua TU DOI thu muc trong
      // chinh lan sync nay (VD phat hien thu muc dang tro toi khong thuoc so
      // huu cua minh nen tao thu muc rieng) - neu khong lay lai, panel se hien
      // link tro toi thu muc cu.
      driveApi.status()
        .then((s) => { setDriveFolder(s.folderId ? { id: s.folderId, name: s.folderName } : null); setDriveAccountEmail(s.accountEmail ?? ""); })
        .catch(() => {}); // khong quan trong toi muc phai bao sync that bai
      setSyncStatus("synced");
      setLastSynced(new Date());
    } catch (err) {
      setSyncStatus("error");
      if (err instanceof ApiError) console.warn("Đồng bộ Drive thất bại:", err.message);
    } finally {
      syncInFlight.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSyncStates]);

  // Tu dong kich hoat dong bo THU CONG sau khi luu xong (giu nguyen hanh vi
  // UX cu: 2.5s sau khi status chuyen ve "saved" thi tu bam "dong bo ngay"
  // ho nguoi dung, NEU da ket noi Drive). Luu y: day CHI la tien ich UX o
  // FE - viec dong bo THAT SU van chay tu dong o backend (event-based, xem
  // SEC-03) ngay ca khi nguoi dung khong bao gio bam nut nay.
  useEffect(() => {
    if (status !== "saved" || !driveConnected) return;
    const t = window.setTimeout(() => { void doSync(); }, 2500);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // QUAN TRONG: day la DIEU HUONG TRANG THAT (window.location.href), khong
  // phai fetch. Trinh duyet se roi khoi SPA, sang man hinh consent cua
  // Google, roi Google redirect ve /api/drive/callback (backend, SEC-09),
  // cuoi cung backend redirect tiep ve route rieng "/drive/callback" o
  // frontend (CHUA duoc dung o SEC-08 nay - xem "con treo" trong index).
  // driveConnecting=true se KHONG tu tat duoc trong hook nay vi trang se bi
  // huy truoc khi co co hoi chay tiep code sau redirect.
  const connectDrive = async () => {
    setDriveConnecting(true);
    try {
      const { authUrl } = await driveApi.getConnectUrl();
      window.location.href = authUrl;
    } catch (err) {
      // That bai TRUOC KHI kip redirect (VD access token het han, mang loi) -
      // day la truong hop DUY NHAT driveConnecting con co the tu tat lai duoc.
      setDriveConnecting(false);
      if (err instanceof ApiError) console.warn("Không lấy được URL kết nối Drive:", err.message);
    }
  };

  const cancelConnecting = () => {
    setDriveConnecting(false);
    setShowDrivePanel(false);
  };

  const disconnectDrive = async () => {
    try {
      await driveApi.disconnect();
    } catch (err) {
      if (err instanceof ApiError) console.warn("Ngắt kết nối Drive thất bại:", err.message);
      return; // giu nguyen trang thai "connected" neu server tu choi
    }
    setDriveConnected(false);
    setDriveFolder(null);
      setDriveAccountEmail("");
    setSyncStatus("idle");
    setLastSynced(null);
    setNoteSyncMap({});
    setShowDrivePanel(false);
  };

  const driveIcon = () => {
    if (!driveConnected) return "☁";
    if (syncStatus === "syncing") return "↻";
    if (syncStatus === "error") return "⚠";
    if (syncStatus === "synced") return "✓";
    return "☁";
  };

  return {
    driveConnected, driveConnecting, driveFolder, driveAccountEmail, syncStatus, lastSynced, showDrivePanel, setShowDrivePanel,
    noteSyncMap, doSync, connectDrive, cancelConnecting, disconnectDrive, driveIcon,
  };
}
