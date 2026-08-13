import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Note } from "../types";
import { nameTaken } from "../utils/uniqueName";
import { getNotesRepo, type NotesMode } from "../api/notesRepo";
import { ApiError } from "../utils/apiClient";

// Trung ten khi doi ten KHONG CON bi backend/local tu choi (409) - repo se
// GHI DE note dang co san ten do (xem NoteServiceImpl.rename() / localNotesStore.rename()).
// Vi ghi de la MAT DU LIEU vinh vien cua note bi ghi de, hook nay dung co che
// "canh bao truoc, xac nhan lan 2 moi thuc su ghi de" (renameWarning +
// confirmOverwrite) thay vi chan hoan toan nhu renameError (loi thuc su, VD ten rong).
export function useRename(
  mode: NotesMode,
  notes: Note[],
  setNotes: Dispatch<SetStateAction<Note[]>>,
  tabs: number[],
  setTabs: Dispatch<SetStateAction<number[]>>,
  activeId: number | null,
  setActiveId: Dispatch<SetStateAction<number | null>>,
  closeMenu: () => void,
) {
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState("");
  const [renameWarning, setRenameWarning] = useState("");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const renameInput = useRef<HTMLInputElement>(null);
  const repo = getNotesRepo(mode);

  const openRename = (id: number) => {
    const note = notes.find((n) => n.id === id)!;
    setRenameId(id);
    setRenameName(note.name);
    setRenameError("");
    setRenameWarning("");
    setConfirmOverwrite(false);
    closeMenu();
    setTimeout(() => renameInput.current?.select(), 60);
  };

  const onRenameChange = (val: string) => {
    setRenameName(val);
    setConfirmOverwrite(false); // doi ten sau khi da canh bao -> huy "cho xac nhan", tranh ghi de nham ten khac
    if (!val.trim()) {
      setRenameError("Tên file không được để trống");
      setRenameWarning("");
      return;
    }
    setRenameError("");
    // Trung ten CHI la canh bao (khong chan Luu) - server/local se GHI DE
    // note trung ten do, xem commitRename() ve buoc xac nhan lan 2.
    setRenameWarning(
      nameTaken(notes, val, renameId ?? undefined)
        ? `Đã có ghi chú tên "${val.trim()}" — lưu sẽ GHI ĐÈ nội dung ghi chú đó.`
        : "",
    );
  };

  const commitRename = async () => {
    if (!renameId || renameError || !renameName.trim() || renaming) return;

    // Con dang canh bao trung ten VA chua xac nhan lan 2 - dung lai o day,
    // doi nguoi dung bam Luu/Enter THEM 1 LAN NUA moi thuc su goi API ghi de.
    if (renameWarning && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }

    setRenaming(true);
    try {
      const source = notes.find((n) => n.id === renameId);
      const result = await repo.rename(renameId, renameName.trim());

      if (result.id === renameId) {
        // Doi ten binh thuong - khong trung ai
        setNotes((n) => n.map((x) => (x.id === renameId ? { ...x, name: result.displayName } : x)));
      } else {
        // id tra ve KHAC id goi len -> da GHI DE 1 note khac (merge). Note
        // nguon (renameId) khong con ton tai rieng nua - loai khoi notes, cap
        // nhat note dich (result.id) voi noi dung cua note nguon (da co san o
        // client, khong can goi lai get()), va sua tabs/activeId dang tro toi
        // renameId sang tro toi result.id.
        setNotes((n) =>
          n
            .filter((x) => x.id !== renameId)
            .map((x) =>
              x.id === result.id
                ? {
                    ...x,
                    name: result.displayName,
                    content: source?.content ?? x.content,
                    contentLoaded: true,
                    syncState: result.syncState,
                    updated: new Date(result.updatedAt),
                  }
                : x,
            ),
        );
        setTabs((t) => {
          const swapped = t.map((id) => (id === renameId ? result.id : id));
          return swapped.filter((id, i) => swapped.indexOf(id) === i); // dedupe neu note dich da co tab mo san
        });
        if (activeId === renameId) setActiveId(result.id);
      }
      setRenameId(null);
    } catch (err) {
      // Server/local tu choi vi ly do khac (VD mat mang, hoac race condition
      // hiem gap) - hien loi NGAY TRONG modal, KHONG dong modal, de nguoi dung
      // chon ten khac ma khong mat lai thao tac dang lam.
      setRenameError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Đổi tên thất bại, vui lòng thử lại",
      );
      setConfirmOverwrite(false);
    } finally {
      setRenaming(false);
    }
  };

  return {
    renameId,
    setRenameId,
    renameName,
    renameError,
    renameWarning,
    confirmOverwrite,
    renaming,
    renameInput,
    openRename,
    onRenameChange,
    commitRename,
  };
}
