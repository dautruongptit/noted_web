import * as Y from "yjs";
import * as decoding from "lib0/decoding";
import type { WebsocketProvider } from "y-websocket";

// y-websocket: loai message sync (0) va buoc step1 (0).
const MESSAGE_SYNC = 0;
const SYNC_STEP1 = 0;

/**
 * Ctrl+Z / Ctrl+Y theo NGUOI DUNG, khong theo thiet bi.
 *
 * Mac dinh Y.UndoManager chi theo doi thay doi do chinh editor nay tao ra, nen
 * chu cung 1 user go o may/tab khac (den qua WebSocket hoac BroadcastChannel,
 * origin = provider) khong hoan tac duoc o day. Ham nay theo doi them origin
 * provider, nhung CHI nhan:
 *
 *  1. Thay doi "song" - den SAU khi tai lieu da nap xong. Du lieu tai luc mo
 *     note (log server phat lai) cung den qua provider; neu nhan, Ctrl+Z tren 1
 *     thiet bi moi se xoa sach note. Moc "nap xong" = luc nhan step1 rong cua
 *     server: server luon gui no NGAY SAU toan bo log (xem
 *     NoteCollabWebSocketHandler). Mat ket noi -> dong moc lai, vi ket noi lai
 *     server se phat lai log.
 *  2. Do CUNG user go: clientID tac gia (client co clock tang trong transaction)
 *     doi chieu voi user.id trong awareness. Chua biet awareness cua client do ->
 *     van nhan, vi backend chi cho chu note vao phong. Thay doi chi gom XOA
 *     khong mang thong tin tac gia trong Yjs -> nhan theo cung ly do. Khi co
 *     chia se note cho nguoi khac, phai siet lai 2 truong hop nay (VD
 *     Y.PermanentUserData).
 *
 * Moi lan nguon thay doi doi (may nay <-> may khac), ngat nhom hoan tac: khong
 * gop chu 2 thiet bi go sat nhau (< 500ms) thanh 1 buoc Ctrl+Z.
 */
export function createCrossDeviceUndoManager(
  ytext: Y.Text,
  provider: WebsocketProvider,
  userId: number,
): { undoManager: Y.UndoManager; dispose: () => void } {
  let documentLoaded = false;
  let lastSource: "local" | "remote" | null = null;

  const isSameUserChange = (tr: Y.Transaction): boolean => {
    const states = provider.awareness.getStates();
    for (const [client, clock] of tr.afterState) {
      if (clock <= (tr.beforeState.get(client) ?? 0)) continue; // client nay khong chen gi
      const user = (states.get(client) as { user?: { id?: unknown } } | undefined)?.user;
      if (user?.id !== undefined && user.id !== userId) return false;
    }
    return true;
  };

  const undoManager: Y.UndoManager = new Y.UndoManager(ytext, {
    captureTransaction: (tr) => {
      const source = tr.origin === provider ? "remote" : "local";
      if (source === "remote" && (!documentLoaded || !isSameUserChange(tr))) return false;
      if (lastSource !== null && lastSource !== source) undoManager.stopCapturing();
      lastSource = source;
      return true;
    },
  });
  undoManager.addTrackedOrigin(provider);

  // Boc handler sync cua y-websocket de biet luc server gui step1 (= da phat
  // xong log). emitSynced = true chi khi message den tu WebSocket; message tu
  // BroadcastChannel (tab khac) di qua cung handler voi emitSynced = false.
  const originalSyncHandler = provider.messageHandlers[MESSAGE_SYNC];
  provider.messageHandlers[MESSAGE_SYNC] = (encoder, decoder, p, emitSynced, messageType) => {
    const syncStep = decoding.readVarUint(decoding.clone(decoder));
    originalSyncHandler(encoder, decoder, p, emitSynced, messageType);
    if (emitSynced && syncStep === SYNC_STEP1) documentLoaded = true;
  };

  const onStatus = ({ status }: { status: string }) => {
    if (status !== "connected") documentLoaded = false;
  };
  provider.on("status", onStatus);

  return {
    undoManager,
    dispose: () => {
      provider.off("status", onStatus);
      provider.messageHandlers[MESSAGE_SYNC] = originalSyncHandler;
      undoManager.destroy();
    },
  };
}
