export class StreamResponseError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly contentType: string;

  constructor(message: string, options: { status: number; code?: string | null; contentType?: string }) {
    super(message);
    this.name = "StreamResponseError";
    this.status = options.status;
    this.code = options.code ?? null;
    this.contentType = options.contentType ?? "";
  }
}

export async function streamJsonLines<T>(
  url: string,
  body: unknown,
  signal: AbortSignal,
  onMessage: (message: T) => void,
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const contentType = (response.headers.get("Content-Type") || "").toLowerCase();
    const raw = await response.text().catch(() => "");
    let detail = "";
    let responseCode: string | null = null;
    if (contentType.includes("application/json")) {
      try {
        const parsed = JSON.parse(raw) as { detail?: unknown; code?: unknown };
        if (typeof parsed.detail === "string") detail = parsed.detail;
        if (typeof parsed.code === "string") responseCode = parsed.code;
      } catch {}
    }
    const headerCode = response.headers.get("X-ChAT-Error-Code");
    throw new StreamResponseError(
      detail || `Streaming request failed (${response.status})`,
      { status: response.status, code: headerCode || responseCode, contentType },
    );
  }
  const contentType = (response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("application/x-ndjson")) {
    throw new StreamResponseError(
      `The coding service returned an unexpected response type (HTTP ${response.status}).`,
      { status: response.status, contentType },
    );
  }
  if (!response.body) {
    throw new Error("Streaming response body is unavailable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const emitCompleteLines = () => {
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onMessage(JSON.parse(line) as T);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    emitCompleteLines();
  }

  buffer += decoder.decode();
  if (buffer.trim()) onMessage(JSON.parse(buffer) as T);
}
