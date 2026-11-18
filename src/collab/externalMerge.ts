import type * as Y from "yjs";
import { diff3Merge, diffPatch } from "node-diff3";

/** Nhan dong mo doan xung dot - phia "dang soan" (tai lieu tren trinh duyet). */
const CURRENT_LABEL = "Đang soạn";

export type MergeOutcome = {
  text: string;
  /** So doan bi sua o CA 2 noi (khac nhau) - da giu ca 2 ban kem dau danh dau */
  conflictCount: number;
};

// Vung xung dot lon hon nguong nay khong thu hop nhat theo ky tu (LCS theo ky tu
// la O(n*m)) - giu ca 2 ban co dau danh dau luon.
const CHAR_MERGE_MAX_CHARS = 20_000;

/**
 * Hop nhat 3 chieu:
 *   current  = noi dung dang soan (Y.Text, co the co chu chua kip luu)
 *   base     = ban goc chung (noi dung truoc khi nguon ngoai sua)
 *   incoming = ban moi tu nguon ngoai (Google Drive, REST...)
 *
 * Buoc 1 theo DONG (giong git): dong chi 1 ben sua -> lay ben sua; 2 ben sua
 * GIONG NHAU -> lay 1 lan.
 * Buoc 2: vung ma theo dong bi coi la xung dot (ke ca 2 ben sua 2 dong LIEN KE
 * nhau - diff3 theo dong gop chung thanh 1 vung) duoc hop nhat lai THEO KY TU;
 * tach duoc thi gop luon.
 * Chi khi 2 ben sua CHONG LEN cung cho -> giu CA HAI, kep giua:
 *   <<<<<<< Đang soạn / ======= / >>>>>>> {incomingLabel}
 * de nguoi dung tu chon - khong mat chu nao, khong tach file.
 */
export function mergeThreeWay(current: string, base: string, incoming: string, incomingLabel: string): MergeOutcome {
  const regions = diff3Merge(current.split("\n"), base.split("\n"), incoming.split("\n"), {
    excludeFalseConflicts: true,
  });
  const lines: string[] = [];
  let conflictCount = 0;
  for (const region of regions) {
    if (region.ok) {
      lines.push(...region.ok);
      continue;
    }
    const { a, o, b } = region.conflict;
    const charMerged = mergeLinesByCharacter(a, o, b);
    if (charMerged !== null) {
      lines.push(...charMerged);
    } else {
      conflictCount++;
      lines.push(`<<<<<<< ${CURRENT_LABEL}`, ...a, "=======", ...b, `>>>>>>> ${incomingLabel}`);
    }
  }
  return { text: lines.join("\n"), conflictCount };
}

/**
 * Hop nhat 3 chieu 1 vung (danh sach dong) theo tung ky tu. null = 2 ben sua
 * chong len nhau that su (hoac vung qua lon).
 *
 * Moi dong duoc noi kem "\n" o cuoi de phan biet "khong co dong nao" ([]) voi
 * "1 dong rong" ([""]) - noi bang join("\n") se lam 2 truong hop nay trung nhau.
 */
function mergeLinesByCharacter(a: string[], o: string[], b: string[]): string[] | null {
  const toText = (ls: string[]) => ls.map((l) => `${l}\n`).join("");
  const aText = toText(a);
  const oText = toText(o);
  const bText = toText(b);
  if (aText.length + oText.length + bText.length > CHAR_MERGE_MAX_CHARS) return null;

  // Array.from tach theo code point: khong cat doi emoji/ky tu ngoai BMP.
  const regions = diff3Merge(Array.from(aText), Array.from(oText), Array.from(bText), {
    excludeFalseConflicts: true,
  });
  let merged = "";
  for (const region of regions) {
    if (!region.ok) return null;
    merged += region.ok.join("");
  }
  if (merged === "") return [];
  if (!merged.endsWith("\n")) return null; // khong the xay ra voi dau vao tren - an toan thi giu dau danh dau
  return merged.slice(0, -1).split("\n");
}

/** Tach giu nguyen ky tu xuong dong o cuoi moi dong: "a\nb" -> ["a\n", "b"]. */
function splitKeepingNewlines(text: string): string[] {
  return text === "" ? [] : text.split(/(?<=\n)/);
}

/**
 * Bien Y.Text tu {@code from} thanh {@code to} bang CAC DOAN THAY DOI NHO NHAT
 * (theo dong), khong xoa-roi-chen ca tai lieu: phan khong doi giu nguyen item
 * Yjs, nen con tro cua thiet bi khac va chu ho dang go dong thoi khong bi xao tron.
 * Phai goi trong 1 transaction; {@code from} phai dung la ytext.toString() luc do.
 */
export function applyTextChange(ytext: Y.Text, from: string, to: string): void {
  if (from === to) return;
  const fromLines = splitKeepingNewlines(from);
  const toLines = splitKeepingNewlines(to);
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of fromLines) {
    lineStarts.push(offset);
    offset += line.length;
  }
  lineStarts.push(offset);

  // Ap tu cuoi len dau de vi tri cac doan phia truoc khong bi lech.
  const patches = diffPatch(fromLines, toLines);
  for (let i = patches.length - 1; i >= 0; i--) {
    const { buffer1, buffer2 } = patches[i];
    const start = lineStarts[buffer1.offset];
    const end = lineStarts[buffer1.offset + buffer1.length];
    if (end > start) ytext.delete(start, end - start);
    const insert = buffer2.chunk.join("");
    if (insert) ytext.insert(start, insert);
  }
}
