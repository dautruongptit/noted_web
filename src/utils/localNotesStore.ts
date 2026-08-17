import type { NoteDetail, NoteSummary } from "../api/types";

// SEC-15 (Local Mode): luu note HOAN TOAN O TRINH DUYET (IndexedDB) khi
// nguoi dung CHUA dang nhap - cho phep dung app day du (tao/sua/xoa/doi ten/
// duplicate/tai xuong) MA KHONG CAN dang nhap Google. Chi khi nguoi dung chu
// dong bam "Dang nhap & Dong bo" moi can toi Google + backend (xem
// migrateLocalNotes.ts va App.tsx).
//
// Khong dung "content_size_bytes/content_hash" nhu backend that (khong can
// thiet o local) - shape don gian hoa nhung VAN KHOP NoteSummary/NoteDetail
// (id, displayName, syncState, updatedAt, [content]) de dung chung 1 kieu
// NotesRepo voi server (xem src/api/notesRepo.ts), khong can if/else rai rac
// khap noi trong UI.

const DB_NAME = "noted-local-notes";
const DB_VERSION = 1;
const STORE_NAME = "notes";

let idCounter = 0;
// Id local: Date.now() (ms) * 1000 + bo dem cuc bo trong phien lam viec hien
// tai -> gan nhu chac chan khong trung trong pham vi 1 trinh duyet, van la
// so nguyen an toan (nho hon Number.MAX_SAFE_INTEGER rat nhieu). Dung SO
// (khong phai chuoi UUID) de giu NGUYEN kieu `Note.id: number` da thong nhat
// tu SEC-08 - tranh phai doi type lan 2 o hang chuc component/hook.
function generateLocalId(): number {
  return Date.now() * 1000 + (idCounter++ % 1000);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllRaw(): Promise<NoteDetail[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as NoteDetail[]);
    req.onerror = () => reject(req.error);
  });
}

async function putRaw(note: NoteDetail): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(note);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteRaw(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function nameTaken(notes: NoteDetail[], name: string, excludeId?: number): boolean {
  return notes.some((n) => n.displayName.toLowerCase() === name.trim().toLowerCase() && n.id !== excludeId);
}

function uniqueLocalName(notes: NoteDetail[], base: string, excludeId?: number): string {
  if (!nameTaken(notes, base, excludeId)) return base;
  const dot = base.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, ""];
  let i = 2;
  while (nameTaken(notes, `${stem} (${i})${ext}`, excludeId)) i++;
  return `${stem} (${i})${ext}`;
}

export const localNotesStore = {
  async list(): Promise<NoteSummary[]> {
    const all = await getAllRaw();
    return all
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map(({ content, ...summary }) => summary);
  },

  /** Dung rieng cho migrateLocalNotes.ts - can ca content de day len server */
  async listWithContent(): Promise<NoteDetail[]> {
    return getAllRaw();
  },

  async get(id: number): Promise<NoteDetail> {
    const all = await getAllRaw();
    const note = all.find((n) => n.id === id);
    if (!note) throw new Error("Khong tim thay note (local)");
    return note;
  },

  async create(displayName: string, initialContent: string): Promise<NoteDetail> {
    const all = await getAllRaw();
    const name = displayName.trim();

    // Khop hanh vi voi backend (NoteServiceImpl.createNote): trung ten voi 1
    // note dang co -> GHI DE noi dung note do (giu nguyen id), KHONG tu doi
    // ten. uniqueLocalName() van con dung o cac cho TU SINH ten (newNote()/
    // duplicate()), noi trung ten la do he thong tu dat chu khong phai nguoi
    // dung go, nen tranh ghi de ngoai y muon o do.
    const existing = all.find((n) => n.displayName.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      const overwritten: NoteDetail = {
        ...existing, content: initialContent, updatedAt: new Date().toISOString(),
        version: existing.version + 1, // noi dung note CU thay doi -> tang version (SEC-19)
      };
      await putRaw(overwritten);
      return overwritten;
    }

    const note: NoteDetail = {
      id: generateLocalId(),
      displayName: name,
      content: initialContent,
      // "PENDING_DRIVE" dung tam lam trang thai "chua tung duoc luu len server"
      // o Local Mode - tai su dung enum co san cua backend (SyncState) thay vi
      // them 1 gia tri rieng, vi noteSyncMap (useDriveSync.ts) da xu ly san
      // gia tri nay thanh "pending" tren UI (dung y nghia: "cho dong bo").
      syncState: "PENDING_DRIVE",
      updatedAt: new Date().toISOString(),
      // Local Mode khong co khai niem "xung dot dong bo" (chi phat sinh o
      // SyncController khi thiet bi offline reconnect - xem SEC-18) - luon false.
      conflictCopy: false,
      version: 1, // note MOI hoan toan -> bat dau tu 1 (SEC-19, khop backend)
    };
    await putRaw(note);
    return note;
  },

  async updateContent(id: number, content: string): Promise<NoteDetail> {
    const note = await localNotesStore.get(id);
    const updated: NoteDetail = { ...note, content, updatedAt: new Date().toISOString(), version: note.version + 1 };
    await putRaw(updated);
    return updated;
  },

  async rename(id: number, newDisplayName: string): Promise<NoteSummary> {
    const all = await getAllRaw();
    const source = all.find((n) => n.id === id);
    if (!source) throw new Error("Khong tim thay note (local)");
    const newName = newDisplayName.trim();

    const target = all.find(
      (n) => n.id !== id && n.displayName.trim().toLowerCase() === newName.toLowerCase(),
    );
    if (target) {
      // Khop hanh vi voi backend (NoteServiceImpl.rename): doi ten trung voi
      // 1 note KHAC dang co -> "ghi de file moi" - note DICH (target) duoc
      // ghi de bang noi dung note NGUON (source), giu nguyen id cua target.
      // Note nguon bi xoa (khong con ton tai rieng, da "nhap" vao target).
      // Tra ve id KHAC id truyen vao de bao hieu FE day la 1 lan merge, khong
      // phai doi ten binh thuong (xem useRename.ts).
      const merged: NoteDetail = {
        ...target, content: source.content, updatedAt: new Date().toISOString(),
        version: target.version + 1,
      };
      await putRaw(merged);
      await deleteRaw(id);
      const { content: _mergedContent, ...summary } = merged;
      return summary;
    }

    const updated: NoteDetail = {
      ...source, displayName: newName, updatedAt: new Date().toISOString(),
      version: source.version + 1,
    };
    await putRaw(updated);
    const { content: _content, ...summary } = updated;
    return summary;
  },

  async duplicate(id: number): Promise<NoteDetail> {
    const source = await localNotesStore.get(id);
    const all = await getAllRaw();
    const dot = source.displayName.lastIndexOf(".");
    const base = dot > 0
      ? `${source.displayName.slice(0, dot)} (copy)${source.displayName.slice(dot)}`
      : `${source.displayName} (copy)`;
    const name = uniqueLocalName(all, base);
    const copy: NoteDetail = {
      ...source, id: generateLocalId(), displayName: name, updatedAt: new Date().toISOString(),
      version: 1, // ban sao la note MOI hoan toan (khop backend duplicate())
    };
    await putRaw(copy);
    return copy;
  },

  async remove(id: number): Promise<void> {
    await deleteRaw(id);
  },

  async bulkDelete(ids: number[]): Promise<{ requestedCount: number; deletedCount: number; deletedIds: number[] }> {
    const all = await getAllRaw();
    const existingIds = ids.filter((id) => all.some((n) => n.id === id));
    for (const id of existingIds) await deleteRaw(id);
    return { requestedCount: ids.length, deletedCount: existingIds.length, deletedIds: existingIds };
  },

  async download(id: number, filename: string): Promise<void> {
    const note = await localNotesStore.get(id);
    const blob = new Blob([note.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  /** Xoa TOAN BO local notes - goi sau khi da day thanh cong len server (xem migrateLocalNotes.ts) */
  async clearAll(): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
