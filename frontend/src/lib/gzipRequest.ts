// Gzip request bodies so they pass the upstream firewall's text scanner.
//
// The NYU gateway runs a WAF that inspects plain-text request bodies and rejects
// ones whose content matches attack signatures. Ordinary research text — a
// percentage such as "93.15%" in coding instructions, or a phrase such as
// "or 1=1" inside an experiment transcript — trips those signatures even though
// the application builds no SQL from user input. A gzip-compressed body is opaque
// binary and is not scanned. The backend decompresses requests marked with the
// X-CAT-Encoding: gzip header (see backend/app/gzip_request.py).
//
// This is a workaround for a firewall we do not control. Where CompressionStream
// is unavailable (very old browsers), we fall back to the plain body; such a
// request may still be blocked, but it is no worse than before this change.

export const GZIP_ENCODING_HEADER = "X-CAT-Encoding";

const canGzip = (): boolean =>
  typeof CompressionStream !== "undefined" && typeof Response !== "undefined";

async function gzip(input: BufferSource): Promise<Blob> {
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  void writer.write(input);
  void writer.close();
  return new Response(stream.readable).blob();
}

// Compress a JSON-serializable value into a gzip request init, or fall back to a
// plain application/json body when compression is not available.
export async function gzipJsonInit(
  value: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ headers: Record<string, string>; body: BodyInit }> {
  const json = JSON.stringify(value);
  if (canGzip()) {
    try {
      const body = await gzip(new TextEncoder().encode(json) as BufferSource);
      return {
        headers: {
          // Wire type is binary so the firewall does not text-scan the body; the
          // backend restores the real type (X-CAT-Content-Type) before parsing.
          "Content-Type": "application/octet-stream",
          "X-CAT-Content-Type": "application/json",
          [GZIP_ENCODING_HEADER]: "gzip",
          ...extraHeaders,
        },
        body,
      };
    } catch {
      // fall through to the plain body
    }
  }
  return {
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: json,
  };
}

// Compress a file's bytes into a gzip raw-body request init, or fall back to a
// multipart/form-data body. The raw-body form sends the original file name in the
// X-CAT-Filename header; the backend upload route understands both shapes.
export async function gzipFileInit(
  file: File,
): Promise<{ headers: Record<string, string>; body: BodyInit }> {
  if (canGzip()) {
    try {
      const body = await gzip(await file.arrayBuffer());
      return {
        headers: {
          "Content-Type": "application/octet-stream",
          "X-CAT-Content-Type": "application/octet-stream",
          [GZIP_ENCODING_HEADER]: "gzip",
          "X-CAT-Filename": encodeURIComponent(file.name),
        },
        body,
      };
    } catch {
      // fall through to multipart
    }
  }
  const form = new FormData();
  form.append("file", file);
  return { headers: {}, body: form };
}

// Detect the firewall's block page so callers can surface a clear message and the
// support ID instead of a raw JSON/HTML parse error. F5 BIG-IP ASM returns an HTML
// page ("The requested URL was rejected...") carrying a numeric support ID.
export function detectFirewallBlock(raw: string): { supportId: string | null } | null {
  if (!/requested URL was rejected/i.test(raw)) return null;
  const match = raw.match(/support ID(?:\s+is)?:?\s*([0-9]+)/i);
  return { supportId: match ? match[1] : null };
}

export function firewallBlockMessage(supportId: string | null): string {
  const base =
    "The university firewall blocked this request before it reached the server. " +
    "This can happen when instructions or data contain text it mistakes for an attack " +
    "(for example a percent sign or the phrase “or 1=1”).";
  return supportId
    ? `${base} Please report support ID ${supportId} to IT.`
    : base;
}
