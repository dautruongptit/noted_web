import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLineGutter, keymap } from "@codemirror/view";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";

type Props = {
  content: string;
  /** Con nhan de khong phai sua call site; CodeMirror tu tinh so dong */
  lines: string[];
  cursorLine: number;
  /** Van la ref cua vung soan thao - dung de focus() sau khi tao note moi */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onCursorMove: (line: number) => void;
  onChange: (value: string) => void;
};

// Mau lay tu bien --editor-* (xem index.css) de vung soan thao GIU NGUYEN dien
// mao cu sau khi doi tu <textarea> sang CodeMirror. CodeMirror khong doc bien
// CSS cho moi thuoc tinh nen phai khai bao qua theme, nhung gia tri thi van tro
// ve dung bo bien do - doi theme sang/toi van tu chay.
const notedTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    color: "var(--editor-text)",
    backgroundColor: "transparent",
  },
  ".cm-content": {
    fontFamily: '"DM Mono", Consolas, monospace',
    lineHeight: "25px",
    padding: "0 30px 40px 0",
    caretColor: "var(--editor-caret)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--editor-line)",
    fontFamily: '"DM Mono", monospace',
    lineHeight: "25px",
    paddingRight: "18px",
    minWidth: "48px",
    justifyContent: "flex-end",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0", textAlign: "right" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--editor-caret)" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor": { borderLeftColor: "var(--editor-caret)" },
  ".cm-selectionBackground, ::selection": { backgroundColor: "#e85d2440" },
  ".cm-scroller": { overflow: "auto" },
});

/**
 * Vung soan thao. Doi tu <textarea> sang CodeMirror (2026-08-25) de lam duoc
 * TO MAU CU PHAP - <textarea> ve nguyen van ban 1 mau, khong cach nao tô màu
 * duoc. Buoc nay CHUA them mau, chi thay nen tang va giu y nguyen hanh vi cu.
 *
 * Duoc cai gi ngoai mong doi: cot so dong va viec cuon dong bo giua so dong voi
 * noi dung gio do CodeMirror lo - doan tu viet truoc day (dong bo scrollTop
 * bang tay, phai khop padding-bottom 2 ben) da duoc xoa.
 *
 * Va quan trong hon: Ctrl+Z gio HOAT DONG voi cac thay doi do CODE tao ra. Voi
 * <textarea>, gan .value bang JS lam trinh duyet mat lich su hoan tac - can
 * thiet cho nut "Dinh dang lai" sap toi, neu khong nguoi dung dinh dang nham la
 * mat ban goc.
 */
export function EditorPane({ content, lines, cursorLine, textareaRef, onCursorMove, onChange }: Props) {
  void lines;      // CodeMirror tu dem dong
  void cursorLine; // vi tri con tro do chinh CodeMirror quan ly
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Giu callback moi nhat de listener ben duoi khong phai dung lai editor moi
  // lan component render (dung lai se mat vi tri con tro va lich su hoan tac).
  const onChangeRef = useRef(onChange);
  const onCursorMoveRef = useRef(onCursorMove);
  onChangeRef.current = onChange;
  onCursorMoveRef.current = onCursorMove;

  // Tao editor DUNG MOT LAN. Noi dung duoc dong bo o effect rieng ben duoi.
  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping, // giu nguyen hanh vi cu cua <textarea>
          notedTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
            if (u.selectionSet || u.docChanged) {
              onCursorMoveRef.current(u.state.doc.lineAt(u.state.selection.main.head).number);
            }
          }),
        ],
      }),
    });
    viewRef.current = view;

    // useNotes.ts goi textareaRef.current?.focus() sau khi tao note moi. Gan 1
    // doi tuong co dung ham focus() de call site do khong phai biet ben trong
    // la CodeMirror hay <textarea>.
    (textareaRef as { current: unknown }).current = { focus: () => view.focus() };

    return () => {
      view.destroy();
      viewRef.current = null;
      (textareaRef as { current: unknown }).current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dong bo noi dung TU NGOAI vao (doi tab, keo ve tu Drive, migrate...).
  // CHI ghi de khi that su khac - neu khong, moi phim go se bi ghi de lai bang
  // chinh no va con tro nhay ve dau dong.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const dangCo = view.state.doc.toString();
    if (dangCo === content) return;
    view.dispatch({ changes: { from: 0, to: dangCo.length, insert: content } });
  }, [content]);

  return (
    <section className="editor-pane">
      <div className="editor-wrap" ref={hostRef} />
    </section>
  );
}
