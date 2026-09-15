import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Note } from "../types";
import { getNotesRepo, type NotesMode } from "../api/notesRepo";
import { ApiError } from "../utils/apiClient";
import type { PendingChange } from "../utils/offlineQueue";

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

// SEC-15: them tham so "mode" - Local Mode dung localNotesStore (IndexedDB)
// qua repo.updateContent(), Server Mode dung notesApi that qua CUNG 1 repo
// interface (xem src/api/notesRepo.ts).
//
// QUAN TRONG: o LOCAL MODE, KHONG dung den offline-queue (queueOfflineChange)
// - vi ghi vao IndexedDB LA thao tac local, gan nhu KHONG BAO GIO that bai vi
// ly do "mat mang" (khac voi goi API qua HTTP). Neu ghi IndexedDB that bai
// that su (hiem - VD het dung luong trinh duyet), cung khong co "server" nao
// de retry sau, nen chi bao loi truc tiep thay vi dua vao co che retry von
// danh cho truong hop mat KET NOI MANG.
export function useAutoSave(
  mode: NotesMode,
  notes: Note[],
  setNotes: Dispatch<SetStateAction<Note[]>>,
  activeId: number | null,
  activeContent: string | undefined,
  queueOfflineChange: (change: PendingChange) => Promise<void>,
  offlinePendingCount: number,
) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState(false);
  const autoSaveTimer = useRef<number | null>(null);
  const notesRef = useRef(notes);
  const repo = getNotesRepo(mode);

  useEffect(() => { notesRef.current = notes; }, [notes]);

  const performSave = async (noteId: number | null) => {
    if (noteId === null) return;
    const note = notesRef.current.find((n) => n.id === noteId);
    if (!note) return;

    setStatus("saving");
    setSaveError(false);

    try {
      const updated = await repo.updateContent(noteId, note.content);
      // syncState tra ve NGAY trong response nay (Server Mode: "PENDING_DRIVE"
      // ngay sau moi lan sua, xem backend NoteServiceImpl.updateContent; Local
      // Mode: giu nguyen "PENDING_DRIVE" tam - xem localNotesStore.ts) - cap
      // nhat luon vao local state de sidebar hien dung cham, khong can goi
      // rieng refreshSyncStates(). "version" CUNG phai cap nhat lai (SEC-19) -
      // dung lam baseVersion cho lan offline-queue TIEP THEO neu co, khong
      // duoc de "cu" (se gay conflict gia tao ngay lan sync sau).
      setNotes((items) =>
        items.map((n) => (n.id === noteId
          ? { ...n, updated: new Date(updated.updatedAt), syncState: updated.syncState, version: updated.version,
              // Vua ghi chinh noi dung nay len server -> noi dung trong editor
              // dung la cua phien ban vua tra ve.
              contentVersion: updated.version }
          : n)),
      );
      setSaveError(false);
      setStatus("saved");
    } catch (err) {
      if (mode === "local") {
        // Ghi IndexedDB that bai that su (hiem) - khong co "mang" de retry,
        // chi bao loi truc tiep, KHONG dua vao offline-queue (danh rieng cho
        // mat KET NOI toi server, khong ap dung o day).
        setSaveError(true);
        setStatus("error");
        console.error("Ghi note (local) thất bại:", err);
        return;
      }

      // Server Mode: server khong toi duoc (mat mang / Ubuntu server tam
      // thoi sap) - KHONG MAT NOI DUNG: ghi vao hang doi offline (IndexedDB
      // qua queueOfflineChange), se tu dong retry khi co mang lai hoac khi
      // job dinh ky 30s chay (xem useOfflineSync.ts, SEC-05/SEC-07).
      // baseVersion = version note nay ma client biet GAN NHAT (SEC-19) - de
      // server so sanh o /api/sync/batch, phat hien neu note da bi thiet bi
      // khac sua trong luc item nay con nam cho trong hang doi.
      await queueOfflineChange({
        noteId,
        clientTempId: null,
        displayName: note.name,
        content: note.content,
        baseVersion: note.version,
      });
      setSaveError(true);
      setStatus("error");
      if (err instanceof ApiError) {
        console.warn("Lưu thất bại (lỗi từ server):", err.message);
      }
    }
  };

  const manualSave = () => {
    if (autoSaveTimer.current !== null) {
      window.clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
    if (status === "saved") return;
    void performSave(activeId);
  };

  // Autosave debounce — stores timer ref so manualSave can cancel it
  useEffect(() => {
    if (status !== "unsaved") return;
    autoSaveTimer.current = window.setTimeout(() => {
      autoSaveTimer.current = null;
      void performSave(activeId);
    }, 1300);
    return () => {
      if (autoSaveTimer.current !== null) {
        window.clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContent, activeId, status]);

  // Ctrl/Cmd+S — cancels pending auto-save timer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        manualSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const markUnsaved = () => { setStatus("unsaved"); setSaveError(false); };
  const markSaved = () => setStatus("saved");

  const statusLabel = () => {
    if (status === "saving") return "Đang lưu...";
    if (status === "error") {
      if (mode === "local") return "Lưu thất bại";
      return offlinePendingCount > 0
        ? "Lưu thất bại — đã lưu tạm, đang chờ đồng bộ lại"
        : "Lưu thất bại — đã lưu tạm";
    }
    if (status === "saved") return "Đã lưu";
    return "Chưa lưu";
  };

  return { status, saveError, manualSave, markUnsaved, markSaved, statusLabel };
}
