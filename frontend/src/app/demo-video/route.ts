import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_PATH = path.join(process.cwd(), "public", "demos", "coding-demo.mp4");

function commonHeaders(size: number) {
  return {
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400, must-revalidate",
    "Content-Type": "video/mp4",
    "Content-Length": String(size),
  };
}

export async function HEAD() {
  const { size } = await stat(VIDEO_PATH);
  return new Response(null, { status: 200, headers: commonHeaders(size) });
}

export async function GET(request: Request) {
  const { size } = await stat(VIDEO_PATH);
  const range = request.headers.get("range");

  if (!range) {
    const stream = Readable.toWeb(createReadStream(VIDEO_PATH));
    return new Response(stream as ReadableStream, {
      status: 200,
      headers: commonHeaders(size),
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Number(match[2]);
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  end = Math.min(end, size - 1);
  const chunkSize = end - start + 1;
  const stream = Readable.toWeb(createReadStream(VIDEO_PATH, { start, end }));

  return new Response(stream as ReadableStream, {
    status: 206,
    headers: {
      ...commonHeaders(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${size}`,
    },
  });
}
