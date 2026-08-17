import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Note } from "../types";
import { getNotesRepo, type NotesMode } from "../api/notesRepo";

export function useSelectMode(
  mode: NotesMode,
  notes: Note[],
  setNotes: Dispatch<SetStateAction<Note[]>>,
  tabs: number[],
  setTabs: Dispatch<SetStateAction<number[]>>,
  activeId: number | null,
  setActiveId: (id: number | null) => void,
  closeMenu: () => void,
  newNote: () => void,
) {
  const repo = getNotesRepo(mode);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  const enterSelectMode = (firstId?: number) => {
    setSelectMode(true);
    setSelected(firstId !== undefined ? new Set([firstId]) : new Set());
    closeMenu();
  };
  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()); };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirmBulkDelete = async () => {
    const toDelete = [...selected];
    if (!toDelete.length || bulkDeleting) return;
    setBulkDeleting(true);

    try {
      // Goi qua repo (getNotesRepo(mode)) thay vi notesApi truc tiep - o
      // Local Mode dung localNotesStore.bulkDelete() (IndexedDB), o Server
      // Mode la 1 request DUY NHAT POST /api/notes/bulk-delete (SEC-04),
      // KHONG loop goi tung DELETE /api/notes/{id} rieng le. Truoc day goi
      // thang notesApi.bulkDelete() bat ke mode - lam bulk-delete o Local
      // Mode bi 401 vi chua dang nhap (bug da sua, cung loai voi useRename.ts).
      const result = await repo.bulkDelete(toDelete);
      const deletedSet = new Set(result.deletedIds);

      const remaining = notes.filter((n) => !deletedSet.has(n.id));
      setNotes(remaining);
      const newTabs = tabs.filter((id) => !deletedSet.has(id));
      setTabs(newTabs);
      if (activeId !== null && deletedSet.has(activeId)) {
        setActiveId(newTabs[0] ?? remaining[0]?.id ?? null);
      }
      exitSelectMode();
      setBulkDeleteConfirm(false);
      if (!remaining.length) void newNote();

      // deletedCount < requestedCount nghia la it nhat 1 id khong xoa duoc
      // (VD note do da bi xoa tu thiet bi khac truoc do) - server TU BO QUA
      // AM THAM cac id khong hop le thay vi throw loi (xem NoteServiceImpl.
      // bulkDelete, SEC-04). Bao cho nguoi dung biet neu co chenh lech.
      if (result.deletedCount < result.requestedCount) {
        console.warn(`Chỉ xoá được ${result.deletedCount}/${result.requestedCount} file đã chọn (một số đã bị xoá từ trước).`);
      }
    } catch (err) {
      console.error("Xoá hàng loạt thất bại:", err);
    } finally {
      setBulkDeleting(false);
    }
  };

  // Long-press for mobile select mode
  const handleTouchStart = (noteId: number) => {
    longPressTimer.current = window.setTimeout(() => enterSelectMode(noteId), 600);
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current !== null) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  return {
    selectMode, selected, bulkDeleteConfirm, setBulkDeleteConfirm, bulkDeleting,
    enterSelectMode, exitSelectMode, toggleSelect, confirmBulkDelete,
    handleTouchStart, handleTouchEnd,
  };
}
