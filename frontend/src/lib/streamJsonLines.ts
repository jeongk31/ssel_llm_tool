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
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Streaming request failed (${response.status})`);
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
