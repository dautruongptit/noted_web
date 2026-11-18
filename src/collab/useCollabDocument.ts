import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import * as decoding from "lib0/decoding";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import type { Awareness } from "y-protocols/awareness";
import { getAccessToken } from "../utils/authToken";
import { refreshAccessToken } from "../utils/apiClient";
import {
  META_APPLIED_MERGE_ID,
  META_MAP_NAME,
  MESSAGE_PENDING_MERGE,
  encodeMergeApplied,
  CLOSE_DOCUMENT_REPLACED,
  CLOSE_NOTE_DELETED,
  CLOSE_NOTE_NOT_FOUND,
  CLOSE_UNAUTHORIZED,
  MESSAGE_SNAPSHOT_ACK,
  SNAPSHOT_ACK_OK,
  TEXT_ROOT_NAME,
  buildProtocols,
  collabDatabaseName,
  collabServerUrl,
  encodeTextSnapshot,
} from "./collabProtocol";
import { createCrossDeviceUndoManager } from "./crossDeviceUndo";
import { applyTextChange, mergeThreeWay } from "./externalMerge";

export type CollabConnectionStatus = "connecting" | "connected" | "offline";

/** Nhung gi EditorPane can de gan CodeMirror vao tai lieu Yjs. */
export type CollabSession = {
  noteId: number;
  ytext: Y.Text;
  awareness: Awareness;
  undoManager: Y.UndoManager;
};

type Options = {
  noteId: number | null;
  generation: number | null;
  /** false = note Local Mode / chua dang nhap -> khong mo tai lieu Yjs nao */
  enabled: boolean;
  userId: number | null;
  userName: string;
  /** Nguoi dung vua go (thay doi CUC BO, khong phai tu thiet bi khac) */
  onLocalChange: () => void;
  onSnapshotSaved: (noteId: number, version: number) => void;
  onSnapshotRejected: (noteId: number) => void;
  /**
   * Doi tai lieu tren server da doi (4409) - tai lai note de mo theo doi moi.
   * Hien backend khong con duong nao doi tai lieu (noi dung ngoai duoc hop nhat,
   * xem onMergeConflict) - giu de an toan neu sau nay can bo 1 tai lieu hong.
   */
  onDocumentReplaced: (noteId: number) => void;
  /** Hop nhat noi dung tu Drive/REST co doan bi sua o ca 2 noi - da giu ca 2 ban trong file. */
  onMergeConflict: (noteId: number, sourceLabel: string, conflictCount: number) => void;
  onNoteGone: (noteId: number) => void;
};

// Cho nguoi dung ngung go bao lau thi moi gui anh chup text len server (ghi file
// .txt). Dong bo CRDT thi van di TUNG phim qua WebSocket, khong lien quan nguong nay.
const SNAPSHOT_DEBOUNCE_MS = 1500;

const PENDING_SNAPSHOT_KEY_PREFIX = "noted-collab-pending-";

// Mau con tro cua nguoi dung tren cac thiet bi khac. Chon theo clientID nen 2
// tab cua cung 1 nguoi van phan biet duoc.
const CURSOR_COLORS = ["#e85d24", "#2f80ed", "#27ae60", "#9b51e0", "#f2994a", "#eb5757", "#00a3a3"];

function readPendingFlag(noteId: number): boolean {
  try {
    return localStorage.getItem(PENDING_SNAPSHOT_KEY_PREFIX + noteId) === "1";
  } catch {
    return false;
  }
}

function writePendingFlag(noteId: number, pending: boolean): void {
  try {
    if (pending) localStorage.setItem(PENDING_SNAPSHOT_KEY_PREFIX + noteId, "1");
    else localStorage.removeItem(PENDING_SNAPSHOT_KEY_PREFIX + noteId);
  } catch {
    /* localStorage bi chan: chi mat kha nang nho "con thay doi chua ghi file" qua lan tai trang */
  }
}

/**
 * Mo 1 tai lieu Yjs cho note dang active va giu no dong bo:
 *
 *  - y-indexeddb: moi thay doi ghi xuong IndexedDB ngay lap tuc -> mat mang hay
 *    tai lai trang van go/xem binh thuong.
 *  - y-websocket: ket noi /ws/notes/{id}. Khi co mang, trao doi state vector voi
 *    server de gui/nhan bu dung phan con thieu, hop nhat khong xung dot (CRDT).
 *  - Anh chup text (TEXT_SNAPSHOT) gui sau moi dot go, de backend ghi file .txt
 *    va day len Drive. Chua duoc xac nhan thi nho trong localStorage, gui lai
 *    sau khi ket noi va dong bo xong.
 *
 * Moi lan doi note/doi tai lieu se huy toan bo va tao lai tu dau.
 */
export function useCollabDocument(options: Options) {
  const { noteId, generation, enabled, userId, userName } = options;
  const [session, setSession] = useState<CollabSession | null>(null);
  const [status, setStatus] = useState<CollabConnectionStatus>("offline");

  // Callback moi nhat - tranh phai tao lai ca tai lieu moi lan App render.
  const callbacksRef = useRef(options);
  callbacksRef.current = options;
  const flushRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled || noteId === null || generation === null || userId === null) {
      setSession(null);
      setStatus("offline");
      flushRef.current = () => {};
      return;
    }

    const doc = new Y.Doc();
    const ytext = doc.getText(TEXT_ROOT_NAME);
    const metaMap = doc.getMap<unknown>(META_MAP_NAME);
    const persistence = new IndexeddbPersistence(collabDatabaseName(userId, noteId, generation), doc);
    const provider = new WebsocketProvider(collabServerUrl(), String(noteId), doc, {
      connect: false, // can access token truoc khi mo ket noi (xem connectWithFreshToken)
      params: { generation: String(generation) },
      maxBackoffTime: 10_000,
    });
    // Ctrl+Z/Ctrl+Y hoan tac ca chu CUNG user go o thiet bi/tab khac (xem crossDeviceUndo.ts).
    const { undoManager, dispose: disposeUndoManager } = createCrossDeviceUndoManager(ytext, provider, userId, metaMap);

    let disposed = false;
    let snapshotTimer: number | null = null;
    // Con thay doi cuc bo chua duoc server ghi xuong file (ke ca tu lan mo truoc).
    let pendingSnapshot = readPendingFlag(noteId);

    provider.awareness.setLocalStateField("user", {
      // id: de thiet bi khac biet thay doi nay cua user nao (hoan tac theo user)
      id: userId,
      name: userName,
      color: CURSOR_COLORS[doc.clientID % CURSOR_COLORS.length],
      colorLight: `${CURSOR_COLORS[doc.clientID % CURSOR_COLORS.length]}33`,
    });

    const connectWithFreshToken = async (forceRefresh: boolean) => {
      let token = forceRefresh ? null : getAccessToken();
      if (!token) {
        const refreshed = await refreshAccessToken();
        token = refreshed ? getAccessToken() : null;
      }
      if (disposed) return;
      if (!token) {
        // Phien dang nhap het han han: van go va luu IndexedDB binh thuong, chi
        // khong dong bo duoc cho toi khi nguoi dung dang nhap lai.
        setStatus("offline");
        return;
      }
      provider.protocols = buildProtocols(token);
      provider.connect();
    };

    const sendSnapshot = () => {
      if (snapshotTimer !== null) {
        window.clearTimeout(snapshotTimer);
        snapshotTimer = null;
      }
      if (!pendingSnapshot) return;
      const ws = provider.ws;
      // Chi gui khi DA dong bo xong: gui truoc do co the la text con thieu thay
      // doi cua thiet bi khac, ghi de file .txt bang ban cu.
      if (!provider.wsconnected || !provider.synced || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(encodeTextSnapshot(ytext.toString()));
    };
    flushRef.current = sendSnapshot;

    const scheduleSnapshot = () => {
      if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
      snapshotTimer = window.setTimeout(sendSnapshot, SNAPSHOT_DEBOUNCE_MS);
    };

    doc.on("update", (_update: Uint8Array, origin: unknown) => {
      // Tu server/tab khac (provider) hoac nap tu IndexedDB (persistence) thi
      // khong phai nguoi dung vua go - khong danh dau "chua luu".
      if (origin === provider || origin === persistence) return;
      pendingSnapshot = true;
      writePendingFlag(noteId, true);
      callbacksRef.current.onLocalChange();
      scheduleSnapshot();
    });

    // y-websocket cho phep dang ky handler cho loai message rieng.
    provider.messageHandlers[MESSAGE_SNAPSHOT_ACK] = (_encoder, decoder) => {
      const ackStatus = decoding.readVarUint(decoder);
      const version = decoding.readVarUint(decoder);
      if (ackStatus === SNAPSHOT_ACK_OK) {
        // Co the nguoi dung da go them trong luc cho xac nhan: timer dang chay
        // nghia la con thay doi moi, giu co "chua luu" cho lan gui ke tiep.
        if (snapshotTimer === null) {
          pendingSnapshot = false;
          writePendingFlag(noteId, false);
          callbacksRef.current.onSnapshotSaved(noteId, version);
        }
      } else {
        callbacksRef.current.onSnapshotRejected(noteId);
      }
    };

    // Server giao 1 lan hop nhat (noi dung tu Drive/REST) cho DUNG thiet bi nay.
    // Hop nhat 3 chieu vao Y.Text hien tai -> chi 1 file, giu chu dang go chua
    // luu; doan bi sua o ca 2 noi duoc giu ca 2 ban co dau danh dau.
    const mergeOrigin = { kind: "external-merge" };
    provider.messageHandlers[MESSAGE_PENDING_MERGE] = (_encoder, decoder) => {
      const mergeId = decoding.readVarUint(decoder);
      const base = decoding.readVarString(decoder);
      const incoming = decoding.readVarString(decoder);
      const sourceLabel = decoding.readVarString(decoder);

      const applied = metaMap.get(META_APPLIED_MERGE_ID);
      if (typeof applied !== "number" || applied < mergeId) {
        const current = ytext.toString();
        const outcome = mergeThreeWay(current, base, incoming, sourceLabel);
        doc.transact(() => {
          applyTextChange(ytext, current, outcome.text);
          metaMap.set(META_APPLIED_MERGE_ID, mergeId);
        }, mergeOrigin);
        if (outcome.conflictCount > 0) {
          callbacksRef.current.onMergeConflict(noteId, sourceLabel, outcome.conflictCount);
        }
      }
      const ws = provider.ws;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(encodeMergeApplied(mergeId));
    };

    provider.on("status", ({ status: next }) => {
      setStatus(next === "connected" ? "connected" : next === "connecting" ? "connecting" : "offline");
    });

    // Dong bo xong voi server (sau khi ket noi/ket noi lai): gui not anh chup con no.
    provider.on("sync", (isSynced: boolean) => {
      if (isSynced) sendSnapshot();
    });

    provider.on("closed", ({ code }) => {
      if (disposed) return;
      if (code === CLOSE_UNAUTHORIZED) {
        // Access token het han giua chung (song 1 gio) - lam moi qua cung co che
        // single-flight cua apiClient roi ket noi lai.
        void connectWithFreshToken(true);
      } else if (code === CLOSE_DOCUMENT_REPLACED) {
        writePendingFlag(noteId, false);
        // Tai lieu cu khong bao gio duoc dung lai nua (doi moi = database moi).
        void persistence.clearData();
        callbacksRef.current.onDocumentReplaced(noteId);
      } else if (code === CLOSE_NOTE_DELETED || code === CLOSE_NOTE_NOT_FOUND) {
        writePendingFlag(noteId, false);
        void persistence.clearData();
        callbacksRef.current.onNoteGone(noteId);
      } else {
        console.warn(`Phong soan thao note ${noteId} dong voi ma ${code}`);
      }
    });

    // Co mang lai sau khi het lan thu -> thu ngay thay vi doi backoff.
    const onOnline = () => {
      if (!provider.wsconnected && provider.shouldConnect) provider.connect();
    };
    window.addEventListener("online", onOnline);

    setSession({ noteId, ytext, awareness: provider.awareness, undoManager });
    setStatus("connecting");
    void connectWithFreshToken(false);

    return () => {
      disposed = true;
      window.removeEventListener("online", onOnline);
      // Doi note/dong tab: co gang gui not anh chup (neu dang ket noi) - neu
      // khong kip, co trong localStorage se gui lai o lan mo note nay sau.
      sendSnapshot();
      flushRef.current = () => {};
      provider.destroy();
      void persistence.destroy();
      disposeUndoManager();
      doc.destroy();
    };
    // userName chi dung luc khoi tao awareness, doi ten giua chung khong dang mo lai tai lieu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, noteId, generation, userId]);

  return {
    /** null cho toi khi tai lieu cua dung note dang active san sang */
    session: session && session.noteId === noteId ? session : null,
    status,
    /** Ctrl+S: gui anh chup ngay, khong doi het nguong debounce */
    flushSnapshot: () => flushRef.current(),
  };
}
