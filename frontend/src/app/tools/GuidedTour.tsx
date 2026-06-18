'use client'

import { useEffect, useState } from "react";

export interface TourStep {
  /** id of the DOM element to spotlight */
  targetId: string;
  title: string;
  body: React.ReactNode;
  /** optional panel number to open when this step is entered */
  panel?: number;
}

interface Props {
  open: boolean;
  steps: TourStep[];
  onClose: () => void;
  /** called when a step becomes active — use it to open the relevant panel */
  onStepEnter?: (step: TourStep) => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_WIDTH = 360;

export default function GuidedTour({ open, steps, onClose, onStepEnter }: Props) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const step = steps[idx];

  // Reset to first step each time the tour opens
  useEffect(() => {
    if (open) setIdx(0);
  }, [open]);

  // Open the right panel, scroll the target into view, and measure it
  useEffect(() => {
    if (!open || !step) return;

    onStepEnter?.(step);

    let raf = 0;
    const measure = () => {
      const el = document.getElementById(step.targetId);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const el = document.getElementById(step.targetId);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });

    measure();
    // Re-measure after scroll + panel-open animations settle
    const t1 = setTimeout(measure, 140);
    const t2 = setTimeout(measure, 380);

    const onWin = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, idx, step, onStepEnter]);

  // Keyboard: Esc closes, arrows navigate
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, steps.length]);

  if (!open || !step) return null;

  const PAD = 8;
  const spot = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  // Place the card below the spotlight if there's room, otherwise above;
  // fall back to centered when the target can't be found.
  let cardStyle: React.CSSProperties;
  if (spot) {
    const belowSpace = window.innerHeight - (spot.top + spot.height);
    const placeBelow = belowSpace > 240 || belowSpace > spot.top;
    const left = Math.max(16, Math.min(spot.left, window.innerWidth - CARD_WIDTH - 16));
    cardStyle = placeBelow
      ? { top: spot.top + spot.height + 12, left, width: CARD_WIDTH }
      : { bottom: window.innerHeight - spot.top + 12, left, width: CARD_WIDTH };
  } else {
    cardStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: CARD_WIDTH };
  }

  const isLast = idx === steps.length - 1;
  const isFirst = idx === 0;

  return (
    <div className="tour-root">
      {/* transparent layer that blocks interaction with the page behind */}
      <div className="tour-blocker" />
      {spot && (
        <div
          className="tour-spotlight"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      )}
      <div className="tour-card" style={cardStyle}>
        <div className="tour-card-head">
          <span className="tour-step-count">Step {idx + 1} of {steps.length}</span>
          <button className="tour-close" onClick={onClose} aria-label="Close walkthrough">×</button>
        </div>
        <h3 className="tour-card-title">{step.title}</h3>
        <div className="tour-card-body">{step.body}</div>
        <div className="tour-card-actions">
          <button className="btn btn-ghost btn-xs text-muted" onClick={onClose}>Skip</button>
          <div className="tour-card-nav">
            {!isFirst && (
              <button className="btn btn-outline btn-sm" onClick={() => setIdx((i) => i - 1)}>Back</button>
            )}
            {isLast ? (
              <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => setIdx((i) => i + 1)}>Next</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
