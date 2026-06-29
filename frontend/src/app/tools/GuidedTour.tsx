'use client'

import { useEffect, useMemo, useState } from "react";

export interface TourStep {
  /** id of the section/panel to brighten (dim everything else) */
  sectionId: string;
  /** id of the sub-element to ring within the section (optional) */
  targetId?: string;
  /** short eyebrow label naming the section */
  section?: string;
  title: string;
  body: React.ReactNode;
  /** optional panel number to open when this step is entered */
  panel?: number;
  /** screenshot or demo video (path under /public), shown in the floating panel */
  media?: string;
  /** region of the media to highlight (percent of the image), matching this sub-part */
  mediaBox?: { x: number; y: number; w: number; h: number };
}

interface Props {
  open: boolean;
  steps: TourStep[];
  onClose: () => void;
  onStepEnter?: (step: TourStep) => void;
}

interface Rect { top: number; left: number; width: number; height: number; }
const toRect = (r: DOMRect): Rect => ({ top: r.top, left: r.left, width: r.width, height: r.height });

function TourMedia({ src }: { src: string }) {
  const [err, setErr] = useState(false);
  const isVideo = /\.(mp4|webm|mov)$/i.test(src);
  if (err) return <div className="tour-media tour-media-missing"><span>Demo</span><code>{src}</code></div>;
  return isVideo ? (
    <video className="tour-media" src={src} autoPlay loop muted playsInline onError={() => setErr(true)} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="tour-media" src={src} alt="" onError={() => setErr(true)} />
  );
}

export default function GuidedTour({ open, steps, onClose, onStepEnter }: Props) {
  // Group consecutive steps that share a sectionId into sections.
  const sections = useMemo(() => {
    const out: TourStep[][] = [];
    for (const s of steps) {
      const last = out[out.length - 1];
      if (last && last[0].sectionId === s.sectionId) last.push(s);
      else out.push([s]);
    }
    return out;
  }, [steps]);

  const [idx, setIdx] = useState(0);
  const [sectionRect, setSectionRect] = useState<Rect | null>(null);
  const [subRect, setSubRect] = useState<Rect | null>(null);

  const step = steps[idx];

  // Locate this flat step within its section (for the part-dots).
  let acc = 0, secIdx = 0, subIdx = 0, sectionStart = 0;
  for (let s = 0; s < sections.length; s++) {
    if (idx < acc + sections[s].length) { secIdx = s; subIdx = idx - acc; sectionStart = acc; break; }
    acc += sections[s].length;
  }
  const subs = sections[secIdx] ?? [];

  useEffect(() => { if (open) setIdx(0); }, [open]);

  // Open the panel, scroll the target into view, and measure both rects
  useEffect(() => {
    if (!open || !step) return;
    onStepEnter?.(step);

    let raf = 0;
    const measure = () => {
      const secEl = document.getElementById(step.sectionId);
      setSectionRect(secEl ? toRect(secEl.getBoundingClientRect()) : null);
      const subEl = step.targetId ? document.getElementById(step.targetId) : null;
      setSubRect(subEl ? toRect(subEl.getBoundingClientRect()) : null);
    };

    const scrollT = setTimeout(() => {
      document.getElementById(step.targetId || step.sectionId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 120);

    measure();
    const ts = [setTimeout(measure, 180), setTimeout(measure, 440), setTimeout(measure, 720)];
    const onWin = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      clearTimeout(scrollT); ts.forEach(clearTimeout); cancelAnimationFrame(raf);
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idx, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, steps.length]);

  if (!open || !step) return null;

  const SPAD = 8;
  const sec = sectionRect ? {
    top: sectionRect.top - SPAD, left: sectionRect.left - SPAD,
    width: sectionRect.width + SPAD * 2, height: sectionRect.height + SPAD * 2,
  } : null;
  const hasSub = !!subRect && step.targetId && step.targetId !== step.sectionId;
  const sub = hasSub ? {
    top: subRect!.top - 4, left: subRect!.left - 4,
    width: subRect!.width + 8, height: subRect!.height + 8,
  } : null;

  const isLast = idx === steps.length - 1;
  const isFirst = idx === 0;

  return (
    <div className="tour-root">
      {sec
        ? <div className="tour-section-spot" style={{ top: sec.top, left: sec.left, width: sec.width, height: sec.height }} />
        : <div className="tour-dim-full" />}

      {sub && (
        <div className="tour-sub-spot" style={{ top: sub.top, left: sub.left, width: sub.width, height: sub.height }} />
      )}

      <div className="tour-panel">
        <div className="tour-panel-head">
          <span className="tour-step-count">{step.section ?? "Walkthrough"} · {idx + 1}/{steps.length}</span>
          <button className="tour-close" onClick={onClose} aria-label="Close walkthrough">×</button>
        </div>
        <h3 className="tour-panel-title">{step.title}</h3>
        <div className="tour-panel-body">{step.body}</div>
        {subs.length > 1 && (
          <div className="tour-subdots">
            {subs.map((s, i) => (
              <button
                key={i}
                className={`tour-subdot ${i === subIdx ? "active" : ""}`}
                onClick={() => setIdx(sectionStart + i)}
                title={s.title}
              />
            ))}
            <span className="tour-subdots-hint">part {subIdx + 1} of {subs.length}</span>
          </div>
        )}
        {step.media && (
          <div className="tour-panel-media">
            <div className="tour-media-frame">
              <TourMedia src={step.media} />
              {step.mediaBox && (
                <div
                  className="tour-media-hl"
                  style={{ left: `${step.mediaBox.x}%`, top: `${step.mediaBox.y}%`, width: `${step.mediaBox.w}%`, height: `${step.mediaBox.h}%` }}
                />
              )}
            </div>
          </div>
        )}
        <div className="tour-panel-actions">
          <button className="btn btn-ghost btn-xs text-muted" onClick={onClose}>Skip tour</button>
          <div className="tour-panel-nav">
            {!isFirst && <button className="btn btn-outline btn-sm" onClick={() => setIdx((i) => i - 1)}>Back</button>}
            {isLast
              ? <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
              : <button className="btn btn-primary btn-sm" onClick={() => setIdx((i) => i + 1)}>Next</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
