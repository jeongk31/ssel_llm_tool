"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Live view of a coding run that is executing on the server.
 *
 * The same component serves two places: the results panel while you are still on
 * the page, and the run's own link, which is what the emailed notification points
 * at. Both poll the same endpoint, so a reopened link shows exactly what the tab
 * you closed was showing.
 *
 * It polls rather than streams, deliberately: polling survives the university
 * gateway, needs no connection held open, and cannot wedge the server the way a
 * long-lived stream can.
 *
 * Opening a run needs two things: the link and the access key emailed with it.
 * The key travels in a header, never the URL, so a leaked address — from browser
 * history, a screen share, a pasted message — opens nothing on its own. Once
 * entered it is remembered per browser, so the prompt appears only on a new
 * device.
 */

/** Where a browser remembers the key for one run. */
function keyStorageName(token: string): string {
  return `cat_run_key_${token}`;
}

export function rememberRunKey(token: string, key: string): void {
  try { localStorage.setItem(keyStorageName(token), key); } catch { /* private window */ }
}

function recallRunKey(token: string): string {
  try { return localStorage.getItem(keyStorageName(token)) || ""; } catch { return ""; }
}

class RunKeyRequired extends Error {}

export type JobStatus = {
  token: string;
  status: "queued" | "running" | "completed" | "failed" | "stopped" | "interrupted";
  current: number;
  total: number;
  episodes_coded: number;
  error_count: number;
  error_sample: string[];
  message: string;
  file_name: string;
  models: string[];
  runs_per_model: number;
  elapsed_seconds: number;
  eta_seconds: number | null;
  has_results: boolean;
  result_path: string;
  email_status: string;
  expires_at: string;
};

const POLL_ACTIVE_MS = 2500;
const POLL_SETTLED_MS = 30000;

export function isFinished(status: JobStatus["status"]): boolean {
  return status === "completed" || status === "failed" || status === "stopped" || status === "interrupted";
}

/** "4m 20s" — short enough to sit inside a progress line. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const STATUS_LABEL: Record<JobStatus["status"], string> = {
  queued: "Waiting to start",
  running: "Coding on the server",
  completed: "Coding complete",
  failed: "Run did not finish",
  stopped: "Run stopped",
  interrupted: "Run interrupted",
};

export default function RunProgress({
  token,
  onFinished,
}: {
  token: string;
  onFinished?: (job: JobStatus) => void;
}) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [accessKey, setAccessKey] = useState(() => recallRunKey(token));
  const [keyInput, setKeyInput] = useState("");
  const [keyNeeded, setKeyNeeded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const notified = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/coding/jobs/${encodeURIComponent(token)}`, {
      signal,
      headers: accessKey ? { "X-CAT-Run-Key": accessKey } : undefined,
    });
    if (response.status === 404) throw new Error("This run link is not valid, or it has expired.");
    if (response.status === 401) throw new RunKeyRequired();
    if (!response.ok) throw new Error(`Could not load this run (${response.status}).`);
    return (await response.json()) as JobStatus;
  }, [token, accessKey]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const tick = async () => {
      try {
        const next = await load(controller.signal);
        if (cancelled) return;
        setJob(next);
        setError("");
        setKeyNeeded(false);
        if (accessKey) rememberRunKey(token, accessKey);
        if (isFinished(next.status) && !notified.current) {
          notified.current = true;
          onFinished?.(next);
        }
        // Keep polling after it settles, but slowly: the row can still change
        // when the notification email is sent.
        timer = setTimeout(tick, isFinished(next.status) ? POLL_SETTLED_MS : POLL_ACTIVE_MS);
      } catch (e: unknown) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        if (e instanceof RunKeyRequired) {
          // Wait for the key rather than polling a door we cannot open.
          setKeyNeeded(true);
          return;
        }
        setError(e instanceof Error ? e.message : "Could not load this run.");
        timer = setTimeout(tick, POLL_SETTLED_MS);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [load, onFinished, accessKey, token]);

  const stop = async () => {
    setStopping(true);
    try {
      await fetch(`/api/coding/jobs/${encodeURIComponent(token)}/stop`, {
        method: "POST",
        headers: accessKey ? { "X-CAT-Run-Key": accessKey } : undefined,
      });
    } catch { /* the next poll will show whether it stopped */ }
    setStopping(false);
  };

  // Fetched rather than linked: a plain link cannot carry the key header, and
  // putting the key in the URL would undo the point of having one.
  const download = async () => {
    setDownloading(true);
    try {
      const response = await fetch(`/api/coding/jobs/${encodeURIComponent(token)}/download`, {
        headers: accessKey ? { "X-CAT-Run-Key": accessKey } : undefined,
      });
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = (job?.file_name || "results").replace(/\.[^.]+$/, "") + "_coded.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not download the results.");
    } finally {
      setDownloading(false);
    }
  };

  const submitKey = (event: React.FormEvent) => {
    event.preventDefault();
    const entered = keyInput.trim();
    if (!entered) return;
    setKeyNeeded(false);
    setAccessKey(entered);   // triggers a fresh poll through the effect
  };

  if (keyNeeded) {
    return (
      <form className="job-key-form" onSubmit={submitKey}>
        <div className="job-key-title">This run needs its access key</div>
        <p className="job-key-hint">
          Enter the key from the email that carried this link. We remember it in this
          browser, so you are asked only once per device.
        </p>
        <div className="job-key-row">
          <input
            className="job-key-input"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="ABCDE-FGHIJ"
            aria-label="Run access key"
            autoFocus
          />
          <button className="btn btn-primary btn-sm" type="submit" disabled={!keyInput.trim()}>Open run</button>
        </div>
      </form>
    );
  }

  if (error && !job) return <div className="job-status job-error" role="alert">{error}</div>;
  if (!job) return <div className="job-status"><span className="spinner" /> Loading this run...</div>;

  const percent = job.total > 0 ? Math.round((job.current / job.total) * 100) : 0;
  const active = job.status === "running" || job.status === "queued";

  return (
    <div className="job-panel">
      <div className="job-head">
        <div>
          <div className={`job-state job-state-${job.status}`}>{STATUS_LABEL[job.status]}</div>
          <div className="job-sub">
            {job.file_name && <strong>{job.file_name}</strong>}
            {job.models.length > 0 && <> · {job.models.join(", ")}</>}
            {job.runs_per_model > 1 && <> · {job.runs_per_model} runs each</>}
          </div>
        </div>
        {active && (
          <button className="btn btn-outline btn-sm" disabled={stopping} onClick={stop}>
            {stopping ? "Stopping..." : "Stop run"}
          </button>
        )}
      </div>

      {job.total > 0 && (
        <>
          <div className="enc-progress-header">
            <span className="enc-progress-label">
              {active ? `Episode ${job.current} of ${job.total}` : `${job.current} of ${job.total} episodes processed`}
            </span>
            <span className="enc-progress-pct">{percent}%</span>
          </div>
          <div className="enc-progress-track">
            <div
              className={`enc-progress-fill ${job.status === "completed" ? "complete" : ""}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </>
      )}

      <div className="job-meta">
        <span>Elapsed {formatDuration(job.elapsed_seconds)}</span>
        {job.eta_seconds != null && <span>About {formatDuration(job.eta_seconds)} remaining</span>}
        {job.episodes_coded > 0 && <span>{job.episodes_coded} coded</span>}
        {job.error_count > 0 && <span className="job-meta-bad">{job.error_count} errors</span>}
      </div>

      {job.message && <p className="job-message">{job.message}</p>}

      {job.error_sample.length > 0 && (
        <details className="job-errors">
          <summary>{job.error_count} error{job.error_count === 1 ? "" : "s"} during this run</summary>
          {job.error_sample.map((line, index) => (
            <div className="job-error-line" key={index}>{line}</div>
          ))}
        </details>
      )}

      {job.has_results && (
        <div className="job-download">
          <button className="btn btn-primary btn-sm" onClick={download} disabled={downloading}>
            {downloading ? <><span className="spinner" /> Preparing</> : "Download results (.csv)"}
          </button>
          {job.expires_at && (
            <span className="job-expiry">
              Available until {new Date(job.expires_at).toLocaleString()}
            </span>
          )}
        </div>
      )}
      {error && job && <p className="job-note job-meta-bad">{error}</p>}

      {job.email_status === "sent" && <p className="job-note">We emailed you a link to this page.</p>}
      {job.email_status === "failed" && (
        <p className="job-note job-meta-bad">We could not send the notification email. This page still has your results.</p>
      )}
    </div>
  );
}
