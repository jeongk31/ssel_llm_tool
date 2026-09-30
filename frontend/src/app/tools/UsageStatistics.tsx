"use client";

import { useEffect, useRef, useState } from "react";

import "jsvectormap/dist/css/jsvectormap.min.css";

/**
 * Public usage figures for CAT, read live from the server.
 *
 * Everything shown comes from /api/analytics/public-summary, which returns coarse
 * aggregates only: totals, provider/model names, activity per month, and per-country
 * counts for the map. It never returns an IP address, a city, a session identifier,
 * a user agent, a timestamp, or anything from a dataset.
 */

type PublicSummary = {
  since: string;
  visits: number;
  unique_visitors: number;
  countries: number;
  runs: number;
  runs_completed: number;
  episodes_coded: number;
  package_downloads: number;
  by_month: Record<string, number>;
  by_country: Record<string, number>;
  by_country_code: Record<string, number>;
  top_models: { name: string; runs: number }[];
  providers: { name: string; runs: number }[];
};

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** World map of where CAT is used, shaded by number of recorded events. */
function CountryMap({ counts }: { counts: Record<string, number> }) {
  const holder = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let map: { destroy?: () => void; updateSize?: () => void } | null = null;
    let cancelled = false;
    let cleanupResize: (() => void) | null = null;
    (async () => {
      try {
        const { default: JsVectorMap } = await import("jsvectormap");
        await import("jsvectormap/dist/maps/world.js");
        if (cancelled || !holder.current) return;
        // jsvectormap matches region codes case-sensitively per map file, so
        // register both spellings rather than guess which the world map uses.
        const totals: Record<string, number> = {};
        for (const [code, count] of Object.entries(counts)) {
          totals[code.toUpperCase()] = count;
          totals[code.toLowerCase()] = count;
        }
        // This version of jsvectormap has only an ORDINAL scale: it looks a region's
        // value up in `scale` as a key. Passing a two-colour array with raw counts
        // means scale[24] is undefined and the country is painted black. Bucket each
        // count into a step of the ramp instead, and key the scale by that step.
        const RAMP = ["#ede9fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#6d28d9"];
        const scale: Record<number, string> = {};
        RAMP.forEach((colour, index) => { scale[index] = colour; });
        const max = Math.max(1, ...Object.values(totals));
        const values: Record<string, number> = {};
        for (const [code, count] of Object.entries(totals)) {
          values[code] = Math.min(
            RAMP.length - 1,
            Math.max(0, Math.ceil((count / max) * RAMP.length) - 1),
          );
        }
        map = new JsVectorMap({
          selector: holder.current,
          map: "world",
          zoomButtons: true,
          regionStyle: { initial: { fill: "#e5e7eb", stroke: "#fff", strokeWidth: 0.4 } },
          series: { regions: [{ attribute: "fill", scale, values }] },
          onRegionTooltipShow(_event: unknown, tooltip: { text: (value?: string) => string }, code: string) {
            try {
              tooltip.text(`${tooltip.text()} — ${formatCount(totals[code] || 0)} events`);
            } catch { /* tooltip is cosmetic */ }
          },
        }) as { destroy?: () => void; updateSize?: () => void };
        // jsvectormap measures its container when it is constructed. Inside a
        // freshly-mounted panel that measurement can land before layout, which draws
        // the world a few pixels across, so re-measure once the browser has laid the
        // panel out.
        //
        // Deliberately NOT a ResizeObserver on the container: updateSize() resizes
        // the very element being observed, so the observer re-fires, the map grows
        // again, and the page expands without bound until the tab dies. The window's
        // own resize event cannot feed back that way.
        const resize = () => { try { map?.updateSize?.(); } catch { /* not ready */ } };
        requestAnimationFrame(resize);
        window.addEventListener("resize", resize);
        cleanupResize = () => window.removeEventListener("resize", resize);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      cleanupResize?.();
      try { map?.destroy?.(); } catch { /* already gone */ }
    };
  }, [counts]);

  if (failed) return null;
  return <div className="usage-map" ref={holder} />;
}

export default function UsageStatistics() {
  const [summary, setSummary] = useState<PublicSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/analytics/public-summary", { signal: controller.signal });
        if (!response.ok) throw new Error(`Could not load usage statistics (${response.status}).`);
        setSummary((await response.json()) as PublicSummary);
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Could not load usage statistics.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const cards = summary
    ? [
        { value: summary.visits, label: "Visits", hint: "recorded page visits" },
        { value: summary.runs, label: "Coding runs", hint: "started in the browser" },
        { value: summary.episodes_coded, label: "Episodes coded", hint: "across completed runs" },
        { value: summary.countries, label: "Countries", hint: "approximate, from visits" },
      ]
    : [];

  const countries = summary ? Object.entries(summary.by_country) : [];

  return (
    <div className="tool-page active">
      <div className="tool-header">
        <div>
          <h1>Usage Statistics</h1>
          <p className="tool-desc">
            How much CAT is being used{summary?.since ? `, since ${summary.since}` : ""}. Updated live.
          </p>
        </div>
      </div>

      <div className="tool-body usage-body">
        {loading && <p className="usage-status"><span className="spinner" /> Loading usage statistics...</p>}
        {!loading && error && <p className="usage-status usage-error" role="alert">{error}</p>}

        {summary && (
          <>
            <div className="usage-cards usage-cards-4">
              {cards.map((card) => (
                <div className="usage-card" key={card.label}>
                  <div className="usage-card-v">{formatCount(card.value)}</div>
                  <div className="usage-card-l">{card.label}</div>
                  <div className="usage-card-h">{card.hint}</div>
                </div>
              ))}
            </div>

            <section className="ana-section usage-panel">
              <h2>Where CAT is used</h2>
              {countries.length > 0 ? (
                <>
                  <CountryMap counts={summary.by_country_code} />
                  <div className="usage-country-list">
                    {countries.map(([name, count]) => (
                      <span className="usage-country" key={name}>
                        {name}<span className="usage-country-n">{formatCount(count)}</span>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="usage-note">No location data recorded yet.</p>
              )}
              <p className="usage-note">
                Countries are approximate and come only from visitors who allowed optional
                analytics. CAT does not publish IP addresses, cities, browser identifiers,
                or any dataset content — see the <a href="/privacy">privacy notice</a>.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
