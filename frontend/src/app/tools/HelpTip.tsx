'use client'

import { useRef, useState } from "react";

// Keep in sync with .help-tip-bubble-top in globals.css.
const TOP_BUBBLE_WIDTH = 340;

/**
 * A small "?" icon that shows a hover tooltip. The bubble is fixed-positioned
 * (measured on hover) so it escapes any overflow:auto/hidden scroll container.
 *
 * `placement="top"` puts the bubble above the trigger instead of beside it, for
 * triggers near the bottom of the window where a side bubble would be cut off.
 * Either way the bubble is clamped to stay inside the viewport.
 */
export default function HelpTip({
  text,
  label,
  placement = "side",
}: {
  text: React.ReactNode;
  label?: string;
  placement?: "side" | "top";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 10;
    if (placement === "top") {
      const half = TOP_BUBBLE_WIDTH / 2;
      const centre = r.left + r.width / 2;
      const limit = Math.max(12 + half, window.innerWidth - 12 - half);
      setPos({ top: r.top - gap, left: Math.min(Math.max(centre, 12 + half), limit) });
      return;
    }
    const bubbleWidth = 240;
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
      className={`help-tip${label ? " help-tip-labelled" : ""}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={(e) => e.stopPropagation()}
      aria-label={typeof text === "string" ? text : "Help"}
    >
      {label ?? "?"}
      {pos && (
        <span
          className={`help-tip-bubble${placement === "top" ? " help-tip-bubble-top" : ""}`}
          style={{ top: pos.top, left: pos.left }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
