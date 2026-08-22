import { useCallback, useMemo, useState } from "react";
import type { Note } from "../types";

export type SortMode = "updated-desc" | "updated-asc" | "name-asc" | "name-desc";

export const SORT_LABELS: Record<SortMode, string> = {
  "updated-desc": "Sửa gần đây nhất",
  "updated-asc": "Sửa lâu nhất",
  "name-asc": "Tên: A → Z",
  "name-desc": "Tên: Z → A",
};

const STORAGE_KEY = "noted-sort-mode";
// "updated-desc" trung voi thu tu backend van tra ve san
// (findByUserIdAndDeletedFalseOrderByUpdatedAtDesc) - de mac dinh nay thi lan
// dau mo app khong co cam giac danh sach bi xao tron so voi truoc.
const DEFAULT_MODE: SortMode = "updated-desc";

function readStored(): SortMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw && raw in SORT_LABELS ? (raw as SortMode) : DEFAULT_MODE;
  } catch {
    // localStorage co the bi chan (che do rieng tu/thiet lap trinh duyet) -
    // khong dang de vo ca sidebar chi vi khong doc duoc 1 tuy chon hien thi.
    return DEFAULT_MODE;
  }
}

// So sanh ten qua Intl.Collator thay vi toan tu "<" tho:
//  - locale "vi": xep dung thu tu bang chu cai tieng Viet (dau/chu co dau).
//  - numeric: "New Note (2)" dung TRUOC "New Note (10)" - so sanh chuoi thuan
//    tuy se cho ra thu tu nguoc lai vi "1" < "2" theo tung ky tu.
//  - sensitivity "base": khong phan biet hoa/thuong khi xep.
const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

export function useNoteSort() {
  const [sortMode, setSortModeState] = useState<SortMode>(readStored);

  const setSortMode = useCallback((mode: SortMode) => {
    setSortModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Khong luu duoc thi thoi - lua chon van co hieu luc trong phien nay.
    }
  }, []);

  const sortNotes = useCallback(
    (notes: Note[]): Note[] => {
      // Luon sap tren BAN SAO: Array.sort() sua truc tiep mang goc, ma mang
      // nay den tu state cua useNotes - sua tai cho se lam React khong nhan ra
      // thay doi (van cung tham chieu) va lam hong ca cac cho khac dung chung.
      const sorted = [...notes];
      switch (sortMode) {
        case "name-asc":
          return sorted.sort((a, b) => collator.compare(a.name, b.name));
        case "name-desc":
          return sorted.sort((a, b) => collator.compare(b.name, a.name));
        case "updated-asc":
          return sorted.sort((a, b) => a.updated.getTime() - b.updated.getTime());
        default:
          return sorted.sort((a, b) => b.updated.getTime() - a.updated.getTime());
      }
    },
    [sortMode],
  );

  return { sortMode, setSortMode, sortNotes };
}

/** Ap dung sortNotes() co ghi nho ket qua - tranh sap lai moi lan App render */
export function useSortedNotes(notes: Note[], sortNotes: (n: Note[]) => Note[]): Note[] {
  return useMemo(() => sortNotes(notes), [notes, sortNotes]);
}
