import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Note, MenuPos } from "../types";
import type { NoteDetail, NoteSummary } from "../api/types";
import { getNotesRepo, type NotesMode } from "../api/notesRepo";
import { ApiError } from "../utils/apiClient";
import { uniqueName } from "../utils/uniqueName";
import { loadTabSession, saveTabSession } from "../utils/session";

const MENU_EST_H = 160;

function toLocalNote(source: NoteSummary | NoteDetail, content = "", contentLoaded = false): Note {
  return {
    id: source.id,
    name: source.displayName,
    content,
    updated: new Date(source.updatedAt),
    contentLoaded,
    syncState: source.syncState,
    conflictCopy: source.conflictCopy,
    version: source.version,
    // Chi coi la "dang giu noi dung cua phien ban nay" khi that su co tai noi
    // dung ve. Voi ban tom tat (chua mo note) thi de 0 - chua co gi de so sanh.
    contentVersion: contentLoaded ? source.version : 0,
    sizeBytes: source.contentSizeBytes ?? 0, // 0 = khong biet (backend khong tra) -> UI tu an
  };
}

// SEC-15: them tham so "mode" ("local" | "server") - quyet dinh dung
// localNotesStore (IndexedDB, chua dang nhap) hay notesApi (backend, da
// dang nhap) qua getNotesRepo(mode) (xem src/api/notesRepo.ts). TOAN BO
// logic ben duoi (tab/menu/CRUD) GIU NGUYEN 100% tu SEC-08, chi thay
// "notesApi.xxx()" bang "repo.xxx()".
//
// QUAN TRONG ve Rules of Hooks: "mode" la 1 GIA TRI truyen vao (khong phai
// dieu kien goi hook khac nhau) - useNotes() luon goi CUNG MOT chuoi hook
// moi lan render, chi LOGIC BEN TRONG cac ham thay doi theo gia tri mode.
// Khi App.tsx doi mode tu "local" sang "server" (ngay sau khi dang nhap +
// migrate xong, xem migrateLocalNotes.ts), effect init ben duoi se TU CHAY
// LAI (vi "mode" nam trong dependency array), tai lai toan bo danh sach tu
// server - dung nhu yeu cau "dang nhap xong thi lay du lieu that".
//
// markSaved: goi sau khi tao note moi thanh cong (qua newNote, hoac fallback
// rong trong closeTab/deleteNote) de save-status hook reset ve "saved" cho
// note vua tao, chua co chinh sua gi.
export function useNotes(mode: NotesMode, markSaved: () => void) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tabs, setTabs] = useState<number[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos>({ top: 0, right: 0 });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  // Luu lai mode DA init lan gan nhat - chan effect chay trung o React
  // StrictMode (goi effect 2 lan luc dev) NHUNG van cho phep chay lai khi
  // "mode" THAT SU doi gia tri (local -> server sau khi dang nhap).
  const initedModeRef = useRef<NotesMode | null>(null);

  const repo = getNotesRepo(mode);
  const active = notes.find((n) => n.id === activeId) ?? null;
  const lines = (active?.content ?? "").split("\n");

  // ---- Tai du lieu: lay danh sach tu repo hien tai (local hoac server),
  // khoi phuc lai cac tab da mo lan truoc (session.ts), roi tai NOI DUNG
  // THAT cho tung tab do. Chay lai MOI KHI "mode" doi gia tri. ----
  useEffect(() => {
    if (initedModeRef.current === mode) return; // da init dung mode nay roi (chan StrictMode goi trung)
    initedModeRef.current = mode;

    setLoading(true);
    (async () => {
      try {
        const summaries = await repo.list();

        if (summaries.length === 0) {
          // Chi tu tao "New Note.txt" mac dinh o SERVER MODE (tai khoan moi
          // hoan toan) - o LOCAL MODE, de trong hoan toan neu chua co gi ca,
          // KHONG tu tao note rong (tranh tao rac trong IndexedDB moi lan
          // nguoi dung ghe app ma chua bao gio go gi).
          if (mode === "server") {
            const created = await repo.create(uniqueName([], "New Note.txt"), "");
            const note = toLocalNote(created, created.content, true);
            setNotes([note]);
            setTabs([note.id]);
            setActiveId(note.id);
            markSaved();
          } else {
            setNotes([]);
            setTabs([]);
            setActiveId(null);
          }
          return;
        }

        const baseNotes = summaries.map((s) => toLocalNote(s));
        setNotes(baseNotes);

        const restored = loadTabSession();
        const validIds = new Set(baseNotes.map((n) => n.id));
        const restoredTabs = (restored?.tabs ?? []).filter((id) => validIds.has(id));
        const initialTabs = restoredTabs.length ? restoredTabs : [baseNotes[0].id];
        const initialActive =
          restored?.activeId !== null && restored?.activeId !== undefined && validIds.has(restored.activeId)
            ? restored.activeId
            : initialTabs[0];

        setTabs(initialTabs);
        setActiveId(initialActive);

        // Tai noi dung THAT cho tung tab dang mo (song song), KHONG tai het
        // toan bo danh sach note - giu lan mo app dau tien nhanh.
        const details = await Promise.all(
          initialTabs.map((id) => repo.get(id).catch(() => null)),
        );

        setNotes((prev) => {
          const byId = new Map(prev.map((n) => [n.id, n] as const));
          details.forEach((detail) => {
            if (detail) byId.set(detail.id, toLocalNote(detail, detail.content, true));
          });
          return Array.from(byId.values());
        });

        // Note nao load that bai (VD 404 - da bi xoa tu thiet bi khac giua
        // luc list() va get()) thi tu dong bo khoi tabs, khong de tab "chet".
        const failedIds = new Set(initialTabs.filter((id, i) => details[i] === null));
        if (failedIds.size > 0) {
          setTabs((t) => t.filter((id) => !failedIds.has(id)));
          if (failedIds.has(initialActive)) {
            const fallback = initialTabs.find((id) => !failedIds.has(id)) ?? baseNotes[0]?.id ?? null;
            setActiveId(fallback);
          }
        }
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : "Không tải được danh sách ghi chú, kiểm tra kết nối mạng");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Luu lai "dang mo tab nao / tab nao active" moi khi thay doi - CHI luu
  // id (so nguyen), khong con luu noi dung nhu ban truoc (xem session.ts).
  // Luu chung 1 key cho ca 2 mode - vi id local va id server KHAC NHAU hoan
  // toan (xem localNotesStore.ts), session cua mode cu se tu nhien "khong
  // khop id nao" khi doi sang mode moi (da co logic loc validIds o tren xu ly).
  useEffect(() => {
    if (loading) return; // tranh ghi de session that bang state rong trong luc dang tai
    saveTabSession(tabs, activeId);
  }, [tabs, activeId, loading]);

  const openNote = async (id: number, selectMode: boolean) => {
    if (selectMode) return;
    if (!tabs.includes(id)) setTabs((t) => [...t, id]);
    setActiveId(id);
    setMenuId(null);

    const note = notes.find((n) => n.id === id);
    if (note && !note.contentLoaded) {
      try {
        const detail = await repo.get(id);
        setNotes((prev) => prev.map((n) => (n.id === id ? toLocalNote(detail, detail.content, true) : n)));
      } catch {
        // Note bi xoa o thiet bi khac giua luc con hien trong sidebar va luc
        // bam mo - loai khoi danh sach + dong tab, tranh tab "chet" khong co noi dung.
        setNotes((prev) => prev.filter((n) => n.id !== id));
        setTabs((t) => t.filter((t2) => t2 !== id));
      }
    }
  };

  // Chan goi chong cheo (bam nut "+" lien tuc truoc khi request truoc resolve) -
  // neu khong co guard nay, 2 lan bam gan nhau se cung tinh uniqueName() tren
  // CUNG 1 state "notes" cu (chua kip cap nhat note vua tao), sinh ra cung 1
  // ten -> lan 2 luon bi backend tu choi 409 DUPLICATE_FILE_NAME.
  /**
   * Keo LAI noi dung cua 1 note tu server va ghi de ban dang co trong editor.
   *
   * KHAC refreshSyncStates(): ham do co y KHONG dung toi content de khong ghi
   * de len chu nguoi dung dang go. Ham nay thi nguoc lai - chi duoc goi khi da
   * chac chan la an toan (khong co sua doi chua luu), hoac khi nguoi dung chu
   * dong bam "Tai lai ban moi".
   */
  const reloadNoteContent = async (id: number) => {
    try {
      const detail = await repo.get(id);
      setNotes((prev) => prev.map((n) => (n.id === id ? toLocalNote(detail, detail.content, true) : n)));
      return true;
    } catch {
      return false;
    }
  };

  /** Version cua cac note theo SERVER, dung de biet co ai vua sua o noi khac khong */
  const fetchServerVersions = async (): Promise<Map<number, number> | null> => {
    try {
      const summaries = await repo.list();
      return new Map(summaries.map((s) => [s.id, s.version] as const));
    } catch {
      return null;
    }
  };

  const creatingNoteRef = useRef(false);

  const newNote = async () => {
    if (creatingNoteRef.current) return;
    creatingNoteRef.current = true;
    try {
      // "New Note.txt" la ten TU SINH, khong phai nguoi dung go - van chu
      // dong tranh trung ten o day (uniqueName) de KHONG vo tinh ghi de 1 note
      // "New Note.txt" khac dang co san. repo.create() gio khong con nem loi
      // DUPLICATE_FILE_NAME nua (backend/local se ghi de neu that su trung,
      // xem NoteServiceImpl.createNote/localNotesStore.create) - truong hop
      // hiem gap do danh sach client bi lech van co the xay ra, nhung khong
      // con can retry rieng, chi la note bi ghi de thay vi tao them ban moi.
      const name = uniqueName(notes, "New Note.txt");
      const created = await repo.create(name, "");
      const note = toLocalNote(created, created.content, true);
      setNotes((n) => [...n, note]);
      setTabs((t) => [...t, note.id]);
      setActiveId(note.id);
      markSaved();
      setTimeout(() => textarea.current?.focus(), 0);
    } catch (err) {
      // Loi mang hoac trung ten lan 2 lien tiep (rat hiem). KHONG tu tao 1
      // note "gia" tren client neu bi tu choi - se lam UI lech voi du lieu that.
      console.error("Tạo note mới thất bại:", err instanceof ApiError ? err.message : err);
    } finally {
      creatingNoteRef.current = false;
    }
  };

  const closeTab = (e: MouseEvent, id: number) => {
    e.stopPropagation();
    const next = tabs.filter((t) => t !== id);
    setTabs(next);
    if (id === activeId && next.length) setActiveId(next[next.length - 1]);
    if (!next.length) void newNote();
  };

  const duplicate = async (id: number) => {
    try {
      const copy = await repo.duplicate(id);
      const note = toLocalNote(copy, copy.content, true);
      setNotes((n) => [...n, note]);
      setTabs((t) => [...t, note.id]);
      setActiveId(note.id);
    } catch (err) {
      console.error("Duplicate thất bại:", err instanceof ApiError ? err.message : err);
    } finally {
      setMenuId(null);
    }
  };

  const download = async (id: number) => {
    const note = notes.find((n) => n.id === id);
    setMenuId(null);
    if (!note) return;
    try {
      await repo.download(id, note.name);
    } catch (err) {
      console.error("Tải file thất bại:", err instanceof ApiError ? err.message : err);
    }
  };

  const deleteNote = async () => {
    if (deleteId === null) return;
    const idToDelete = deleteId;
    setDeleteId(null);

    try {
      await repo.remove(idToDelete);
    } catch (err) {
      console.error("Xoá thất bại:", err instanceof ApiError ? err.message : err);
      return; // giu nguyen state local neu bi tu choi - tranh UI/du lieu that lech nhau
    }

    const remaining = notes.filter((n) => n.id !== idToDelete);
    setNotes(remaining);
    const newTabs = tabs.filter((id) => id !== idToDelete);
    setTabs(newTabs);
    if (activeId === idToDelete) setActiveId(newTabs[0] ?? remaining[0]?.id ?? null);
    if (!newTabs.length && !remaining.length) void newNote();
  };

  // Lay lai syncState/updatedAt moi nhat tu repo cho TOAN BO note dang co,
  // KHONG dong den content/contentLoaded local (tranh ghi de noi dung dang go
  // do nguoi dung chua kip luu). Dung sau khi bam "Dong bo ngay" hoac vua ket
  // noi Drive xong (xem useDriveSync.ts) de cap nhat lai cham dong bo tren sidebar.
  //
  // Ngoai ra CON tu them vao danh sach note nao MOI xuat hien tu server ma
  // "prev" chua co (VD note "ban xung dot" vua duoc tach rieng sau 1 lan
  // offline-sync conflict - xem SEC-18/useOfflineSync.ts, hoac file moi pull
  // ve tu Drive) - content note moi se duoc tai lazy khi nguoi dung mo tab,
  // giong y het luc load danh sach lan dau.
  const refreshSyncStates = async () => {
    try {
      const summaries = await repo.list();
      setNotes((prev) => {
        const byId = new Map(summaries.map((s) => [s.id, s] as const));
        const updated = prev.map((n) => {
          const fresh = byId.get(n.id);
          return fresh
            ? { ...n, syncState: fresh.syncState, updated: new Date(fresh.updatedAt), conflictCopy: fresh.conflictCopy, version: fresh.version, sizeBytes: fresh.contentSizeBytes ?? n.sizeBytes }
            : n;
        });
        const existingIds = new Set(prev.map((n) => n.id));
        const newOnes = summaries.filter((s) => !existingIds.has(s.id)).map((s) => toLocalNote(s));
        return newOnes.length ? [...updated, ...newOnes] : updated;
      });
    } catch {
      // best-effort - lam moi cham trang thai khong dang de bao loi rieng cho nguoi dung
    }
  };

  // Smart dropdown positioning
  const handleMoreClick = (e: MouseEvent<HTMLButtonElement>, noteId: number) => {
    e.stopPropagation();
    if (menuId === noteId) { setMenuId(null); return; }
    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < MENU_EST_H) {
      setMenuPos({ bottom: window.innerHeight - rect.top + 2, right: window.innerWidth - rect.right });
    } else {
      setMenuPos({ top: rect.bottom + 2, right: window.innerWidth - rect.right });
    }
    setMenuId(noteId);
  };

  return {
    notes, setNotes, tabs, setTabs, activeId, setActiveId, active, lines,
    menuId, setMenuId, menuPos, deleteId, setDeleteId, textarea,
    loading, loadError,
    openNote, newNote, closeTab, duplicate, download, deleteNote, handleMoreClick, refreshSyncStates,
    reloadNoteContent, fetchServerVersions,
  };
}
