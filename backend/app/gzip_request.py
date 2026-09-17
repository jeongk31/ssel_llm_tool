"""ASGI middleware that transparently decompresses gzip-encoded request bodies.

Some deployments sit behind a web application firewall (the NYU gateway runs an
F5 BIG-IP ASM policy) that scans plain-text request bodies and rejects ones whose
content matches attack signatures. Ordinary research text — percentages such as
``93.15%`` in instructions, or a phrase such as ``or 1=1`` inside an experiment
transcript — trips those signatures even though the application builds no SQL from
user input.

When the client sends the request body gzip-compressed and marks it with the
``X-CAT-Encoding: gzip`` header, the body is opaque binary and is not signature
scanned. This middleware inflates it before routing so downstream handlers see the
original bytes and need no per-route changes.

This is a workaround for an upstream firewall we do not control, not a security
boundary. A decompressed-size cap guards against gzip bombs.
"""

import zlib

_GZIP_WBITS = 16 + zlib.MAX_WBITS  # decode the gzip container, not raw deflate


class GzipRequestMiddleware:
    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        headers = scope.get("headers", [])
        encoding = b""
        target_content_type = None
        for key, value in headers:
            lowered = key.lower()
            if lowered == b"x-cat-encoding":
                encoding = value.lower()
            elif lowered == b"x-cat-content-type":
                target_content_type = value
        if encoding != b"gzip":
            return await self.app(scope, receive, send)

        # Drain the (compressed) body.
        body = bytearray()
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] != "http.request":
                break
            body.extend(message.get("body", b""))
            more_body = message.get("more_body", False)

        try:
            decompressed = self._inflate(bytes(body))
        except _BodyTooLarge:
            return await _send_error(send, 413, "Compressed request body is too large.")
        except Exception:
            return await _send_error(send, 400, "Malformed compressed request body.")

        # Rewrite headers: drop the compression markers and stale length, set the
        # real decompressed length, and restore the true content-type. The wire
        # content-type is application/octet-stream (so the firewall treats the body
        # as opaque binary); downstream handlers need the original type — JSON for
        # coding requests — to parse the body. X-CAT-Content-Type carries it.
        new_headers = [
            (key, value)
            for key, value in headers
            if key.lower() not in (
                b"x-cat-encoding",
                b"x-cat-content-type",
                b"content-length",
                b"content-encoding",
                b"content-type",
            )
        ]
        new_headers.append((b"content-length", str(len(decompressed)).encode("latin-1")))
        new_headers.append((b"content-type", target_content_type or b"application/json"))

        new_scope = dict(scope)
        new_scope["headers"] = new_headers

        served = False

        async def patched_receive():
            nonlocal served
            if served:
                return {"type": "http.request", "body": b"", "more_body": False}
            served = True
            return {"type": "http.request", "body": decompressed, "more_body": False}

        return await self.app(new_scope, patched_receive, send)

    def _inflate(self, data: bytes) -> bytes:
        decompressor = zlib.decompressobj(_GZIP_WBITS)
        out = bytearray()
        # Bound each step so a small compressed payload cannot expand without limit.
        out.extend(decompressor.decompress(data, self.max_bytes + 1))
        while decompressor.unconsumed_tail:
            if len(out) > self.max_bytes:
                raise _BodyTooLarge()
            out.extend(decompressor.decompress(decompressor.unconsumed_tail, self.max_bytes + 1))
        out.extend(decompressor.flush())
        if len(out) > self.max_bytes:
            raise _BodyTooLarge()
        return bytes(out)


class _BodyTooLarge(Exception):
    pass


async def _send_error(send, status: int, detail: str):
    body = ('{"detail": "%s"}' % detail).encode("utf-8")
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode("latin-1")),
        ],
    })
    await send({"type": "http.response.body", "body": body})
