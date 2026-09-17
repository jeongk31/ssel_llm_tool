// Row-subset selection for Step 1: let a researcher code only part of an uploaded
// dataset (e.g. a 50-row test slice of a 1,000-row file) without preparing a
// separate file. Selection is over SOURCE ROWS as uploaded (1-based in the UI,
// 0-based internally). The resolved indices are sent to the backend, which slices
// the dataset before grouping rows into episodes, so the preview matches the run.

export type RowSelectionMode = "all" | "count" | "percent" | "specific";

// Parse a "specific rows" expression such as "1-50, 75, 90-100" (1-based, inclusive)
// into sorted, unique 0-based indices within [0, total). Returns an error message
// for malformed input instead of throwing.
export function parseRowSpec(
  spec: string,
  total: number,
): { indices: number[]; error: string | null } {
  const parts = spec.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { indices: [], error: "Enter at least one row number or range." };

  const out = new Set<number>();
  for (const part of parts) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      let a = parseInt(range[1], 10);
      let b = parseInt(range[2], 10);
      if (a < 1 || b < 1) return { indices: [], error: `Row numbers start at 1 (got "${part}").` };
      if (a > b) [a, b] = [b, a];
      for (let n = a; n <= b && n <= total; n++) out.add(n - 1);
    } else if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10);
      if (n < 1) return { indices: [], error: `Row numbers start at 1 (got "${part}").` };
      if (n <= total) out.add(n - 1);
    } else {
      return { indices: [], error: `Could not read "${part}". Use numbers and ranges like 1-50, 75.` };
    }
  }

  const indices = [...out].sort((x, y) => x - y);
  if (indices.length === 0) {
    return { indices: [], error: `No selected rows fall within the dataset (it has ${total} rows).` };
  }
  return { indices, error: null };
}

// Deterministic PRNG (mulberry32) so a given seed always yields the same sample —
// the preview and the coded run stay in sync across re-renders.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick `k` distinct 0-based indices from [0, total) using `seed`, returned sorted
// ascending so source-row order (and therefore episode grouping) is preserved.
export function randomIndices(total: number, k: number, seed: number): number[] {
  const n = Math.max(0, Math.min(Math.floor(k), total));
  if (n === 0) return [];
  const arr = Array.from({ length: total }, (_, i) => i);
  const rand = mulberry32(seed);
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n).sort((a, b) => a - b);
}

// Convert a percentage (0–100) of `total` into a row count (at least 1 when total>0).
export function percentToCount(percent: number, total: number): number {
  if (total <= 0) return 0;
  const raw = Math.round((percent / 100) * total);
  return Math.min(total, Math.max(1, raw));
}
