import { api, apiFetchBlob } from "../utils/apiClient";
import type { BulkDeleteResult, CheckNameResult, NoteDetail, NoteSummary } from "./types";

// Nhom function goi 1-1 toi tung endpoint cua NoteController (backend).
// KHONG chua business logic UI o day (vd khong tu doi state React) - chi la
// lop "goi API thuan tuy", de useNotes.ts (hoac hook nao khac) tu quyet dinh
// dung ket qua the nao. Tach rieng nhu vay giup test/mock de dang hon, va
// neu sau nay doi tu fetch sang axios/khac chi can sua 1 file apiClient.ts.

export const notesApi = {
  /** GET /api/notes - danh sach note (KHONG kem noi dung, dung cho sidebar) */
  list: (): Promise<NoteSummary[]> => api.get<NoteSummary[]>("/api/notes"),

  /** GET /api/notes/{id} - lay ca noi dung, dung khi mo 1 note vao tab */
  get: (id: number): Promise<NoteDetail> => api.get<NoteDetail>(`/api/notes/${id}`),

  /**
   * POST /api/notes - tao note moi. Neu displayName TRUNG voi 1 note dang co
   * san, backend se GHI DE noi dung note do (giu nguyen id) thay vi tao them
   * ban moi hay tra loi 409 - xem NoteServiceImpl.createNote(). Ben goi (UI)
   * nen tu tranh trung ten TRUOC khi goi (VD uniqueName() cho ten tu sinh)
   * neu khong muon ghi de ngoai y muon.
   */
  create: (displayName: string, initialContent = ""): Promise<NoteDetail> =>
    api.post<NoteDetail>("/api/notes", { displayName, initialContent }),

  /**
   * PATCH /api/notes/{id}/content - dung cho ca auto-save (debounce) va luu
   * thu cong (Ctrl+S). LUON ghi de, KHONG kiem tra conflict o day (SEC-19,
   * "phuong an 2" - phien dang go song duoc uu tien hon, tranh UX phuc tap
   * cho case hiem gap). Response tra ve "version" moi - ben goi (useAutoSave.ts)
   * can cap nhat lai vao note local de dung lam baseVersion cho lan offline-
   * queue tiep theo neu co (xem NoteServiceImpl.updateContent()).
   */
  updateContent: (id: number, content: string): Promise<NoteDetail> =>
    api.patch<NoteDetail>(`/api/notes/${id}/content`, { content }),

  /**
   * PATCH /api/notes/{id}/rename - doi ten hien thi, KHONG dong den file vat
   * ly. Neu newDisplayName trung ten 1 note KHAC dang co san, backend se GHI
   * DE note do bang noi dung cua note dang doi ten, roi xoa mem note nay -
   * response tra ve khi do la cua note BI GHI DE (id KHAC id truyen vao) -
   * xem NoteServiceImpl.rename() va useRename.ts (phan xu ly id thay doi).
   */
  rename: (id: number, newDisplayName: string): Promise<NoteSummary> =>
    api.patch<NoteSummary>(`/api/notes/${id}/rename`, { newDisplayName }),

  /** POST /api/notes/{id}/duplicate - server tu sinh ten "xxx (copy).txt" khong trung */
  duplicate: (id: number): Promise<NoteDetail> => api.post<NoteDetail>(`/api/notes/${id}/duplicate`),

  /** DELETE /api/notes/{id} - soft-delete 1 note */
  remove: (id: number): Promise<void> => api.delete<void>(`/api/notes/${id}`),

  /**
   * POST /api/notes/bulk-delete - chon nhieu de xoa (SEC-04). 1 request duy
   * nhat cho ca danh sach id, backend tu bo qua am tham id nao khong thuoc
   * ve user hien tai. Doc ky ket qua tra ve: neu deletedCount < requestedCount
   * nghia la co it nhat 1 id khong xoa duoc (VD note da bi xoa boi thiet bi
   * khac truoc do) - UI nen bao "Da xoa X/Y file" thay vi gia dinh luon thanh cong het.
   */
  bulkDelete: (noteIds: number[]): Promise<BulkDeleteResult> =>
    api.post<BulkDeleteResult>("/api/notes/bulk-delete", { noteIds }),

  /**
   * GET /api/notes/check-name - validate ten file REAL-TIME luc nguoi dung go
   * (goi kem debounce ~300-500ms o UI, khong goi tren tung ky tu). Neu taken=true,
   * "suggestion" la ten khong trung ma server da tinh san (VD "New Note (2).txt"),
   * UI co the goi y ten nay cho nguoi dung thay vi tu tinh lai o client.
   */
  checkName: (name: string): Promise<CheckNameResult> =>
    api.get<CheckNameResult>(`/api/notes/check-name?name=${encodeURIComponent(name)}`),

  /**
   * GET /api/notes/{id}/download - tai file .txt ve may. Endpoint nay yeu cau
   * Authorization header (JWT) nen KHONG dung <a href> truc tiep duoc - phai
   * fetch bang JS (qua apiFetchBlob, van co auto-refresh token) roi tu tao
   * Blob URL va bam click bang JS.
   */
  download: async (id: number, filename: string): Promise<void> => {
    const blob = await apiFetchBlob(`/api/notes/${id}/download`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};
