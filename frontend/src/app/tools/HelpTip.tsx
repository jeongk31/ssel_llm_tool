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
    const bubbleWidth = 240;
    const gap = 10;
    const fitsRight = r.right + gap + bubbleWidth <= window.innerWidth - 12;
    const left = fitsRight
      ? r.right + gap
      : Math.max(12, r.left - gap - bubbleWidth);
    setPos({ top: r.top + r.height / 2, left });
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
