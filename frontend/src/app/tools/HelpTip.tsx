'use client'

import { useRef, useState } from "react";

/**
 * A small "?" icon that shows a hover tooltip. The bubble is fixed-positioned
 * (measured on hover) so it escapes any overflow:auto/hidden scroll container.
 */
export default function HelpTip({ text }: { text: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(r.left + r.width / 2, 130), window.innerWidth - 130);
    setPos({ top: r.bottom + 8, left });
  };
  const hide = () => setPos(null);

  return (
    <span
      ref={ref}
      className="help-tip"
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={(e) => e.stopPropagation()}
      aria-label={typeof text === "string" ? text : "Help"}
    >
      ?
      {pos && (
        <span className="help-tip-bubble" style={{ top: pos.top, left: pos.left }}>
          {text}
        </span>
      )}
    </span>
  );
}
