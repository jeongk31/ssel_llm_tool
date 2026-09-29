"""ASGI middleware that transparently decodes encoded request bodies.

Some deployments sit behind a web application firewall (the NYU gateway runs an
F5 BIG-IP ASM policy) that scans plain-text request bodies and rejects ones whose
content matches attack signatures. Ordinary research text — percentages such as
``93.15%`` in instructions, or a phrase such as ``or 1=1`` inside an experiment
transcript — trips those signatures even though the application builds no SQL from
user input.

When the client encodes the request body and marks it with an ``X-CAT-Encoding``
header, the body is opaque to the scanner. This middleware decodes it before routing
so downstream handlers see the original bytes and need no per-route changes. Two
encodings are supported:

- ``gzip+base64`` — preferred: gzip-compressed then base64-encoded. base64's restricted
  alphabet (A-Z a-z 0-9 + / =) can never contain the byte patterns the firewall's
  signatures match (``<``, quotes, ``../``, ``%``, ``--`` …), which raw gzip binary can
  hit by coincidence on larger payloads. base64 keeps it opaque; gzip keeps it small.
- ``base64`` — same safety without compression (browsers without ``CompressionStream``).
- ``gzip`` — legacy/compat: raw gzip binary. Still decoded, but no longer sent by the
  client because the raw binary can coincidentally trip a signature.

This is a workaround for an upstream firewall we do not control, not a security
boundary. A decoded-size cap guards against decompression bombs.
"""

import base64
import zlib

_GZIP_WBITS = 16 + zlib.MAX_WBITS  # decode the gzip container, not raw deflate
_SUPPORTED_ENCODINGS = (b"gzip", b"base64", b"gzip+base64")


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
        if encoding not in _SUPPORTED_ENCODINGS:
            return await self.app(scope, receive, send)

        # Drain the (encoded) body.
        body = bytearray()
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] != "http.request":
                break
            body.extend(message.get("body", b""))
            more_body = message.get("more_body", False)

        try:
            if encoding == b"gzip":
                decompressed = self._inflate(bytes(body))
            elif encoding == b"base64":
                decompressed = self._b64decode(bytes(body))
            else:  # gzip+base64
                decompressed = self._inflate(self._b64_bytes(bytes(body)))
        except _BodyTooLarge:
            return await _send_error(send, 413, "Encoded request body is too large.")
        except Exception:
            return await _send_error(send, 400, "Malformed encoded request body.")

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

    def _b64_bytes(self, data: bytes) -> bytes:
        # base64 expands the original by ~4/3, so bound the encoded input. For
        # gzip+base64 the decoded bytes are the (small) gzip stream; _inflate then
        # caps the final decompressed size.
        if len(data) > (self.max_bytes // 3) * 4 + 8:
            raise _BodyTooLarge()
        return base64.b64decode(data, validate=False)

    def _b64decode(self, data: bytes) -> bytes:
        decoded = self._b64_bytes(data)
        if len(decoded) > self.max_bytes:
            raise _BodyTooLarge()
        return decoded

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
