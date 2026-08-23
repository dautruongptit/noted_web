import { useEffect, useRef } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
};

/**
 * O tim kiem trong sidebar - thanh phan MOI theo file thiet ke (truoc day app
 * khong he co chuc nang tim kiem nao).
 *
 * Loc HOAN TOAN o phia client: danh sach note da nam san trong bo nho, va so
 * luong note cua 1 nguoi dung o quy mo nay khong du lon de phai them endpoint
 * tim kiem rieng - lam vay chi them do tre mang cho moi phim go.
 */
export function SideSearch({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Phim tat Ctrl/Cmd+K - dung nhu goi y hien trong o tim kiem. Gan o document
  // vi nguoi dung co the dang o BAT KY dau (ke ca trong vung soan thao) khi bam.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); // chan phim tat mac dinh cua trinh duyet
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      // Esc trong o tim kiem: xoa noi dung, khong dong ca sidebar
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        onChange("");
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onChange]);

  return (
    <div className="side-search">
      <div className="side-search-box">
        <span className="glyph">⌕</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Tìm ghi chú…"
          aria-label="Tìm ghi chú"
          spellCheck={false}
        />
        
          <button className="side-search-clear" onClick={() => onChange("")} title="Xoá tìm kiếm">×</button>
       
      </div>
    </div>
  );
}
