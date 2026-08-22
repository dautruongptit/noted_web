import { useEffect } from "react";
import { SORT_LABELS, type SortMode } from "../../hooks/useNoteSort";

type Props = {
  /** Toa do da tinh san tu getBoundingClientRect() cua nut mo menu */
  pos: { top: number; right: number };
  value: SortMode;
  onChange: (mode: SortMode) => void;
  onClose: () => void;
};

const ORDER: SortMode[] = ["updated-desc", "updated-asc", "name-asc", "name-desc"];

export function SortMenu({ pos, value, onChange, onClose }: Props) {
  // Bam ra ngoai thi dong menu. Listener gan o document chu KHONG phai o 1 lop
  // phu trong suot: lop phu se nuot mat cu bam dau tien, nguoi dung phai bam
  // 2 lan moi chon duoc thu khac.
  useEffect(() => {
    document.addEventListener("click", onClose);
    return () => document.removeEventListener("click", onClose);
  }, [onClose]);

  return (
    // position:fixed (khong phai absolute) vi .sidebar co overflow:hidden -
    // menu dinh vi tuong doi ben trong se bi cat mat. Cung ly do voi ContextMenu.
    <div
      className="file-menu sort-menu"
      style={{ position: "fixed", top: pos.top, right: pos.right }}
      onClick={(e) => e.stopPropagation()}
      role="menu"
    >
      {ORDER.map((mode) => (
        <button
          key={mode}
          role="menuitemradio"
          aria-checked={value === mode}
          onClick={() => { onChange(mode); onClose(); }}
        >
          <span className="sort-check">{value === mode ? "✓" : ""}</span>
          <span>{SORT_LABELS[mode]}</span>
        </button>
      ))}
    </div>
  );
}
