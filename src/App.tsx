import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNotes } from "./hooks/useNotes";
import { useRename } from "./hooks/useRename";
import { useAutoSave } from "./hooks/useAutoSave";
import { useDriveSync } from "./hooks/useDriveSync";
import { useSidebarResize } from "./hooks/useSidebarResize";
import { useSelectMode } from "./hooks/useSelectMode";
import { useNoteSort, useSortedNotes } from "./hooks/useNoteSort";
import { useOfflineSync } from "./hooks/useOfflineSync";
import { useAuth, type AuthStatus } from "./hooks/useAuth";
import { authApi } from "./api/authApi";
import { driveApi } from "./api/driveApi";
import type { NotesMode } from "./api/notesRepo";
import type { SyncBatchResultItem } from "./api/types";
import { migrateLocalNotesToServer } from "./utils/migrateLocalNotes";
import { DriveCallbackScreen } from "./components/auth/DriveCallbackScreen";
import { TopBar } from "./components/layout/TopBar";
import { StatusBar } from "./components/layout/StatusBar";
import { EditorPane } from "./components/layout/EditorPane";
import { Sidebar } from "./components/sidebar/Sidebar";
import { SidebarResizer } from "./components/sidebar/SidebarResizer";
import { ContextMenu } from "./components/ContextMenu";
import { DeleteConfirmModal } from "./components/modals/DeleteConfirmModal";
import { BulkDeleteConfirmModal } from "./components/modals/BulkDeleteConfirmModal";
import { RenameModal } from "./components/modals/RenameModal";
import { DrivePanel } from "./components/modals/DrivePanel";

// SEC-15: BO cong chan cung (khong con "chua dang nhap thi khong cho dung
// app" nhu SEC-10) - dung theo yeu cau moi: "chi khi nguoi dung DONG BO moi
// yeu cau dang nhap Google". App gio la LOCAL-FIRST:
//
//  - Mo app lan dau (chua dang nhap) -> "Local Mode": note luu HOAN TOAN
//    trong IndexedDB cua trinh duyet (xem localNotesStore.ts), dung day du
//    moi tinh nang (tao/sua/xoa/doi ten/duplicate/tai xuong), KHONG can mang,
//    KHONG can dang nhap.
//  - Bam nut "Dang nhap & Dong bo" -> dieu huong sang Google (giong SEC-01/06)
//    -> dang nhap xong quay ve app -> TU DONG day toan bo note dang co trong
//    Local Mode len server (migrateLocalNotesToServer, tai su dung endpoint
//    /api/sync/batch da co san tu SEC-05) -> chuyen sang "Server Mode".
//  - Server Mode: dung CHINH XAC nhu SEC-08/SEC-10 truoc day - note nam tren
//    backend (MySQL + disk Ubuntu ca nhan), nen mo app tren MAY THU HAI (cung
//    dang nhap 1 tai khoan) se thay LAI dung phien lam viec, KE CA KHI CHUA
//    tung ket noi Google Drive rieng (Drive la lop backup KHAC, tach biet -
//    xem DrivePanel/useDriveSync, khong lien quan gi den viec nay).
export default function App() {
  // "/drive/callback": backend (DriveController.callback(), SEC-09) redirect
  // trinh duyet ve day sau khi hoan tat luong ket noi Google Drive (KHAC voi
  // luong dang nhap thong thuong). Repo khong dung router library nen tu
  // kiem tra pathname truc tiep - an toan vi App() khong goi hook nao truoc do.
  if (window.location.pathname === "/drive/callback") {
    // Ket noi THANH CONG (2026-08-23): khong giu man hinh callback rieng
    // (truoc day nguoi dung phai tu bam "Ve Noted") - chuyen VE THANG man
    // hinh chinh, kem 1 co hieu qua query param de Workspace tu hien thong
    // bao goc tren-phai roi tu an. That BAI thi VAN giu man hinh day du nhu
    // cu - loi can nguoi dung chu dong doc, khong nen tu bien mat.
    if (new URLSearchParams(window.location.search).get("connected") === "true") {
      window.location.replace("/?driveConnected=1");
      return null;
    }
    return <DriveCallbackScreen />;
  }
  return <AuthGate />;
}

function AuthGate() {
  const auth = useAuth();

  useEffect(() => {
    // Doc "?token=..." tu URL NEU trang vua duoc backend redirect ve sau
    // luong dang nhap Google (authApi.loginWithGoogle, backend SEC-01/06).
    if (authApi.handleOAuthCallback()) {
      void auth.checkAuth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // KHONG con "if (checking) return blank" / "if (!authenticated) return
  // LoginScreen" nua - Workspace LUON duoc render NGAY LAP TUC (Local Mode),
  // "auth" chi anh huong "mode" ben trong Workspace (xem useEffect trong do).
  return <Workspace authStatus={auth.status} />;
}

function Workspace({ authStatus }: { authStatus: AuthStatus }) {
  // Mac dinh NEN TOI - theo prototype moi nhat (DOC/Design, 2026-08-23). Lua
  // chon cua nguoi dung van DUOC LUU LAI: neu ai thich nen sang thi bam 1 lan
  // la xong, khong phai bam lai moi lan mo app - chi nguoi CHUA TUNG bam mac
  // dinh moi ra nen toi.
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("noted-theme");
      return saved === null ? true : saved === "dark";
    } catch {
      return true; // localStorage bi chan - khong dang de vo ca app vi 1 tuy chon hien thi
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("noted-theme", dark ? "dark" : "light");
    } catch { /* khong luu duoc thi thoi, van co hieu luc trong phien nay */ }
  }, [dark]);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [cursorLine, setCursorLine] = useState(1);
  const [mode, setMode] = useState<NotesMode>("local");
  const [migrating, setMigrating] = useState(false);
  const [conflictBanner, setConflictBanner] = useState<string | null>(null);
  const migratedRef = useRef(false); // chan migrate chay lai nhieu lan (StrictMode/re-render)

  // Toast "da ket noi Google Drive" goc tren-phai (xem App() phia tren) - tu
  // doc co "?driveConnected=1" tren URL roi XOA NGAY (giong authApi.
  // handleOAuthCallback) de refresh trang khong hien lai, va tu an sau vai
  // giay vi day chi la thong bao XAC NHAN thanh cong, khong phai canh bao
  // can nguoi dung chu dong doc nhu conflictBanner ben duoi.
  const [driveConnectedToast, setDriveConnectedToast] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("driveConnected") !== "1") return;
    setDriveConnectedToast(true);
    window.history.replaceState({}, "", window.location.pathname);
    const t = setTimeout(() => setDriveConnectedToast(false), 4000);
    return () => clearTimeout(t);
  }, []);

  // Ngay khi phat hien DA dang nhap (auth.status === "authenticated") - du la
  // do vua bam "Dang nhap & Dong bo" HAY do trinh duyet con phien cu (cookie
  // refresh_token con hieu luc, xem useAuth.ts) - day toan bo note Local Mode
  // len server 1 LAN, ROI MOI chuyen mode sang "server" (thu tu quan trong:
  // phai migrate XONG truoc khi useNotes() doi sang server list(), neu khong
  // note vua day len se khong xuat hien ngay).
  useEffect(() => {
    if (authStatus !== "authenticated" || migratedRef.current) return;
    migratedRef.current = true;

    (async () => {
      setMigrating(true);
      try {
        await migrateLocalNotesToServer();
      } finally {
        setMigrating(false);
        setMode("server");
      }
    })();
  }, [authStatus]);

  // Kenh thu 3 cua "Debounce Sync": flush dong bo NGAY khi nguoi dung dong
  // tab/roi trang (chi co tac dung o Server Mode - Local Mode khong co gi de
  // flush len Drive). Dung ca 'pagehide' LAN 'visibilitychange' (kiem tra
  // document.visibilityState === "hidden") de bao phu nhieu tinh huong nhat:
  // 'pagehide' bat duoc dong tab/dong trinh duyet, 'visibilitychange' con bat
  // duoc them ca truong hop chuyen sang tab/app khac (mobile OS hay tam dung
  // tab an, khong phai luc nao cung bat 'pagehide' kip truoc khi bi kill).
  useEffect(() => {
    if (mode !== "server") return;

    const flush = () => driveApi.flushOnUnload();

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [mode]);

  // Ket qua "conflict_kept_both" tu offline-sync (SEC-18, xem useOfflineSync.ts/
  // SyncController.syncBatch): khong con am tham bo ban local nua, ma tach
  // thanh 1 note rieng - can (1) lam moi danh sach de note do hien ra ngay
  // trong sidebar, (2) bao cho nguoi dung biet qua banner, tranh ho khong hay
  // biet gi da xay ra. notesApi duoc khai bao PHIA DUOI closure nay - an toan
  // vi closure chi thuc su chay SAU khi render xong (giong pattern markSaved()
  // ngay ben duoi), luc do notesApi da chac chan duoc gan gia tri.
  const handleOfflineSynced = (results: SyncBatchResultItem[]) => {
    const conflicts = results.filter((r) => r.status === "conflict_kept_both");
    if (conflicts.length === 0) return;
    void notesApi.refreshSyncStates();
    const names = conflicts.map((c) => c.conflictCopyName).filter(Boolean).join(", ");
    setConflictBanner(
      conflicts.length === 1
        ? `Phát hiện xung đột đồng bộ — bản của bạn đã được lưu riêng thành "${names}"`
        : `Phát hiện ${conflicts.length} xung đột đồng bộ — các bản đã được lưu riêng: ${names}`,
    );
  };

  // DUY NHAT 1 instance useOfflineSync o cap cao nhat nay - xem giai thich
  // trong useAutoSave.ts ve ly do khong duoc goi hook nay o nhieu noi.
  const offlineSync = useOfflineSync(handleOfflineSynced);

  // notesApi.newNote() calls markSaved() once autosave is initialized below.
  // Safe: this closure only runs on user interaction, well after render.
  const notesApi = useNotes(mode, () => autosave.markSaved());
  const autosave = useAutoSave(
    mode, notesApi.notes, notesApi.setNotes, notesApi.activeId, notesApi.active?.content,
    offlineSync.queueChange, offlineSync.pendingCount,
  );
  const drive = useDriveSync(mode, notesApi.notes, autosave.status, notesApi.activeId, notesApi.refreshSyncStates);

  // Canh bao truoc khi THOAT (dong tab/dong trinh duyet/tai lai trang) neu
  // con ghi chu CHUA dong bo len Drive. Trinh duyet KHONG cho phep dialog
  // "beforeunload" tuy chinh nut/hanh dong (VD nut "Dong bo ngay" rieng) vi
  // ly do bao mat - chi hien duoc hop thoai co san cua trinh duyet ("Roi
  // trang? Thay doi co the chua duoc luu" + Huy/Roi trang), nen day la cach
  // gan nhat voi yeu cau "hien thong bao va hoi co dong bo khong": bam Huy se
  // o lai trang de tu bam dong bo, bam Roi trang thi flush am tham (xem effect
  // 'pagehide'/'visibilitychange' o tren) van chay truoc khi trang dong.
  useEffect(() => {
    if (!drive.driveConnected) return;
    const hasPending = notesApi.notes.some((n) => drive.noteSyncMap[n.id] !== "synced");
    if (!hasPending) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // can gan de trinh duyet hien dialog - noi dung hien thi la text mac dinh, khong tuy bien duoc
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [drive.driveConnected, drive.noteSyncMap, notesApi.notes]);

  const sidebarResize = useSidebarResize();
  // Sap xep CHI la lop hien thi cua sidebar - notesApi.notes giu nguyen thu tu
  // goc tu server, nen tab/quan he id o cac cho khac khong bi anh huong.
  const noteSort = useNoteSort();
  const sortedNotes = useSortedNotes(notesApi.notes, noteSort.sortNotes);
  const selectModeApi = useSelectMode(
    mode,
    notesApi.notes, notesApi.setNotes,
    notesApi.tabs, notesApi.setTabs,
    notesApi.activeId, notesApi.setActiveId,
    () => notesApi.setMenuId(null),
    notesApi.newNote,
  );
  const renameApi = useRename(
    mode, notesApi.notes, notesApi.setNotes,
    notesApi.tabs, notesApi.setTabs,
    notesApi.activeId, notesApi.setActiveId,
    () => notesApi.setMenuId(null),
  );

  const handleChangeContent = (value: string) => {
    notesApi.setNotes((items) =>
      items.map((note) => (note.id === notesApi.activeId ? { ...note, content: value } : note))
    );
    autosave.markUnsaved();
  };

  const menuNote = notesApi.menuId !== null ? notesApi.notes.find((n) => n.id === notesApi.menuId) : null;
  const deleteNote = notesApi.deleteId !== null ? notesApi.notes.find((n) => n.id === notesApi.deleteId) : null;

  return (
    <main className={dark ? "app dark" : "app"} onClick={() => notesApi.setMenuId(null)}>
      {/* Bo cuc theo THIET KE: SIDEBAR cao het man hinh (logo nam ben trong no),
          con thanh tab + vung soan thao + thanh trang thai gop thanh MOT COT ben
          phai. Truoc day topbar/statusbar keo ngang toan bo va cat ngang sidebar. */}
      <section className="workspace">
        <Sidebar
          visible={sidebarVisible}
          width={sidebarResize.sidebarWidth}
          notes={sortedNotes}
          activeId={notesApi.activeId}
          sortMode={noteSort.sortMode}
          onSortChange={noteSort.setSortMode}
          onOpenDrivePanel={() => drive.setShowDrivePanel(true)}
          showLoginCta={mode === "local" && authStatus !== "checking"}
          onLoginSync={() => authApi.loginWithGoogle()}
          selectMode={selectModeApi.selectMode}
          selected={selectModeApi.selected}
          driveConnected={drive.driveConnected}
          syncStatus={drive.syncStatus}
          lastSynced={drive.lastSynced}
          noteSyncMap={drive.noteSyncMap}
          onOpenNote={(id) => notesApi.openNote(id, selectModeApi.selectMode)}
          onNewNote={notesApi.newNote}
          onEnterSelectMode={() => selectModeApi.enterSelectMode()}
          onExitSelectMode={selectModeApi.exitSelectMode}
          onToggleSelect={selectModeApi.toggleSelect}
          onBulkDeleteRequest={() => selectModeApi.setBulkDeleteConfirm(true)}
          onTouchStart={selectModeApi.handleTouchStart}
          onTouchEnd={selectModeApi.handleTouchEnd}
          onMoreClick={notesApi.handleMoreClick}
        />

        {sidebarVisible && (
          <SidebarResizer onMouseDown={sidebarResize.startResize} onDoubleClick={sidebarResize.resetWidth} />
        )}

        <div className="main-col">
          <TopBar
            dark={dark}
            onToggleSidebar={() => setSidebarVisible((v) => !v)}
            tabs={notesApi.tabs}
            notes={notesApi.notes}
            activeId={notesApi.activeId}
            status={autosave.status}
            onSelectTab={notesApi.setActiveId}
            onCloseTab={notesApi.closeTab}
            onNewNote={notesApi.newNote}
            onManualSave={autosave.manualSave}
            onToggleDark={() => setDark((d) => !d)}
          />

          {notesApi.active && (
            <EditorPane
              content={notesApi.active.content}
              lines={notesApi.lines}
              cursorLine={cursorLine}
              textareaRef={notesApi.textarea}
              onCursorMove={setCursorLine}
              onChange={handleChangeContent}
            />
          )}

          <StatusBar
            status={autosave.status}
            statusLabel={autosave.statusLabel()}
            driveConnected={drive.driveConnected}
            syncStatus={drive.syncStatus}
            driveIconChar={drive.driveIcon()}
            onOpenDrivePanel={() => drive.setShowDrivePanel(true)}
            cursorLine={cursorLine}
            linesCount={notesApi.lines.length}
            charCount={notesApi.active?.content.length ?? 0}
          />
        </div>
      </section>

      {/* Fixed-position dropdown — escapes all overflow containers */}
      {menuNote && (
        <ContextMenu
          pos={notesApi.menuPos}
          onDuplicate={() => notesApi.duplicate(menuNote.id)}
          onRename={() => renameApi.openRename(menuNote.id)}
          onDownload={() => notesApi.download(menuNote.id)}
          onDeleteRequest={() => { notesApi.setDeleteId(menuNote.id); notesApi.setMenuId(null); }}
        />
      )}

      {deleteNote && (
        <DeleteConfirmModal
          noteName={deleteNote.name}
          onCancel={() => notesApi.setDeleteId(null)}
          onConfirm={notesApi.deleteNote}
        />
      )}

      {selectModeApi.bulkDeleteConfirm && (
        <BulkDeleteConfirmModal
          count={selectModeApi.selected.size}
          onCancel={() => selectModeApi.setBulkDeleteConfirm(false)}
          onConfirm={selectModeApi.confirmBulkDelete}
        />
      )}

      {renameApi.renameId && (
        <RenameModal
          name={renameApi.renameName}
          error={renameApi.renameError}
          warning={renameApi.renameWarning}
          confirmingOverwrite={renameApi.confirmOverwrite}
          inputRef={renameApi.renameInput}
          onChange={renameApi.onRenameChange}
          onCancel={() => renameApi.setRenameId(null)}
          onCommit={renameApi.commitRename}
        />
      )}

      {drive.showDrivePanel && (
        <DrivePanel
          notes={notesApi.notes}
          driveConnected={drive.driveConnected}
          driveConnecting={drive.driveConnecting}
          syncStatus={drive.syncStatus}
          lastSynced={drive.lastSynced}
          noteSyncMap={drive.noteSyncMap}
          driveFolder={drive.driveFolder}
          driveAccountEmail={drive.driveAccountEmail}
          driveIconChar={drive.driveIcon()}
          onClose={() => drive.setShowDrivePanel(false)}
          onConnect={drive.connectDrive}
          onCancelConnecting={drive.cancelConnecting}
          onSyncNow={drive.doSync}
          onDisconnect={drive.disconnectDrive}
        />
      )}

      {migrating && (
        <div style={migratingOverlayStyle}>Đang đồng bộ ghi chú lên tài khoản của bạn...</div>
      )}

      {/* Thong bao "da ket noi Google Drive" goc tren-phai, tu an sau vai giay
          - xem effect doc "?driveConnected=1" o tren. */}
      {driveConnectedToast && (
        <div style={driveConnectedToastStyle}>
          <span style={driveConnectedToastMark}>✓</span>
          <span>Đã kết nối Google Drive</span>
        </div>
      )}

      {/* Banner canh bao "giu ca 2 ban khi conflict" (SEC-18) - KHONG tu dong
          an sau vai giay nhu toast thong thuong, vi day la thong bao ve DU LIEU
          (co 1 ban ghi chua duoc gop), nguoi dung can chu dong bam tat sau khi
          da doc, tranh bo lo. */}
      {conflictBanner && (
        <div style={conflictBannerStyle}>
          <span>⚠ {conflictBanner}</span>
          <button style={conflictBannerCloseStyle} onClick={() => setConflictBanner(null)}>×</button>
        </div>
      )}
    </main>
  );
}

const migratingOverlayStyle: CSSProperties = {
  position: "fixed", bottom: 16, right: 16, zIndex: 50,
  padding: "10px 16px", borderRadius: 8, border: "1px solid #26262a",
  background: "#141416", color: "#f2f2f3", fontSize: 13,
};

const driveConnectedToastStyle: CSSProperties = {
  position: "fixed", top: 16, right: 16, zIndex: 60,
  display: "flex", alignItems: "center", gap: 10,
  padding: "10px 16px", borderRadius: 8, border: "1px solid #2a5a3a",
  background: "#141416", color: "#f2f2f3", fontSize: 13,
  boxShadow: "0 10px 30px #0006",
};

const driveConnectedToastMark: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 18, height: 18, borderRadius: "50%",
  background: "#1f7a3f", color: "#fff", fontSize: 11, flexShrink: 0,
};

const conflictBannerStyle: CSSProperties = {
  position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 60,
  display: "flex", alignItems: "center", gap: 12, maxWidth: "min(560px, calc(100vw - 32px))",
  padding: "10px 12px 10px 16px", borderRadius: 8, border: "1px solid #c98a1f",
  background: "#3a2c0f", color: "#f2f2f3", fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
};

const conflictBannerCloseStyle: CSSProperties = {
  background: "transparent", border: "none", color: "#f2f2f3", fontSize: 18,
  lineHeight: 1, cursor: "pointer", padding: "0 2px",
};
