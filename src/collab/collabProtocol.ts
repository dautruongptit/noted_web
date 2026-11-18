import * as encoding from "lib0/encoding";
import { env } from "../config/env";

// Giao thuc mo rong cua Noted tren nen y-websocket. Phai KHOP backend
// (com.noted.backend.websocket.YjsProtocol / CollabCloseStatus).
//
// Loai 0-3 la cua y-websocket chuan (sync, awareness...). Hai loai duoi day la
// rieng cua Noted - KHONG tham gia dong bo CRDT, chi de backend ghi file .txt
// (tai xuong, day len Google Drive):
//   100 TEXT_SNAPSHOT (client -> server): varString(toan bo text hien tai)
//   101 SNAPSHOT_ACK  (server -> client): varUint(trang thai) + varUint(version note)
export const MESSAGE_TEXT_SNAPSHOT = 100;
export const MESSAGE_SNAPSHOT_ACK = 101;
//   102 PENDING_MERGE (server -> 1 client): varUint(mergeId) varString(ban goc)
//       varString(ban moi) varString(nhan nguon) - noi dung tu Drive/REST can hop
//       nhat 3 chieu vao Y.Text (xem externalMerge.ts)
//   103 MERGE_APPLIED (client -> server): varUint(mergeId) - da hop nhat xong
export const MESSAGE_PENDING_MERGE = 102;
export const MESSAGE_MERGE_APPLIED = 103;
export const SNAPSHOT_ACK_OK = 0;

/**
 * Y.Map phu trong Y.Doc: luu mergeId da hop nhat. Nam TRONG tai lieu nen moi
 * thiet bi deu thay sau khi dong bo -> server giao lai cung 1 lan hop nhat (VD
 * ack bi mat) thi khong ap lan 2.
 */
export const META_MAP_NAME = "noted-meta";
export const META_APPLIED_MERGE_ID = "appliedMergeId";

export function encodeMergeApplied(mergeId: number): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_MERGE_APPLIED);
  encoding.writeVarUint(encoder, mergeId);
  return encoding.toUint8Array(encoder);
}

/** Ten Y.Text goc trong Y.Doc - backend khoi tao tai lieu tu file .txt vao dung ten nay. */
export const TEXT_ROOT_NAME = "content";

// Ma dong ket noi tu backend. y-websocket coi 4400-4499 la "dut khoat" (khong tu
// ket noi lai) va phat su kien 'closed' de minh tu xu ly.
export const CLOSE_BAD_REQUEST = 4400;
export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_NOTE_NOT_FOUND = 4404;
export const CLOSE_DOCUMENT_REPLACED = 4409;
export const CLOSE_NOTE_DELETED = 4410;

const SUB_PROTOCOL = "noted.collab.v1";

export function encodeTextSnapshot(text: string): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_TEXT_SNAPSHOT);
  encoding.writeVarString(encoder, text);
  return encoding.toUint8Array(encoder);
}

/**
 * Access token gui qua Sec-WebSocket-Protocol thay vi query string: URL ket noi
 * hay bi ghi vao access log cua nginx/Cloudflare, header nay thi khong. JWT chi
 * gom ky tu hop le cua header (base64url + dau cham).
 */
export function buildProtocols(accessToken: string): string[] {
  return [SUB_PROTOCOL, `auth.${accessToken}`];
}

/**
 * URL goc WebSocket, suy tu VITE_API_BASE_URL (http -> ws, https -> wss). Rong =
 * cung origin voi trang (deploy qua nginx proxy /ws/).
 * y-websocket tu noi them "/{roomname}?{params}" -> /ws/notes/{noteId}?generation=N.
 */
export function collabServerUrl(): string {
  const base = env.apiBaseUrl || window.location.origin;
  return `${base.replace(/^http/, "ws")}/ws/notes`;
}

/** Ten database IndexedDB cua 1 tai lieu - tach theo user va doi tai lieu. */
export function collabDatabaseName(userId: number, noteId: number, generation: number): string {
  return `noted-yjs-u${userId}-n${noteId}-g${generation}`;
}
