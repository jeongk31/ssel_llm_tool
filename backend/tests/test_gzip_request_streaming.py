import asyncio
import gzip
import json
import unittest

from app.gzip_request import GzipRequestMiddleware


class GzipRequestStreamingTests(unittest.TestCase):
    """A StreamingResponse watches for client disconnects by calling receive() in a
    loop. If the middleware answers instantly with a synthetic message, that loop
    spins and pins the event loop, freezing the whole server for the life of the
    stream. After the body is delivered, receive() must defer to the real receive.
    """

    def test_receive_defers_to_real_receive_after_body(self):
        seen = []

        async def app(scope, receive, send):
            seen.append(await receive())          # body
            seen.append(await receive())          # like listen_for_disconnect
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        payload = json.dumps({"instructions": "93.15% overall"}).encode()
        pending = [
            {"type": "http.request", "body": gzip.compress(payload), "more_body": False},
            {"type": "http.disconnect"},
        ]

        async def receive():
            if pending:
                return pending.pop(0)
            await asyncio.sleep(3600)  # a third call would mean we are busy-looping

        async def send(_message):
            return None

        middleware = GzipRequestMiddleware(app, max_bytes=1024 * 1024)
        scope = {"type": "http", "headers": [(b"x-cat-encoding", b"gzip")]}

        async def run():
            await asyncio.wait_for(middleware(scope, receive, send), timeout=5)

        asyncio.run(run())

        self.assertEqual(seen[0]["body"], payload)
        # The decisive assertion: the second receive() must surface the real
        # disconnect, not an instantly-returned synthetic "http.request".
        self.assertEqual(seen[1]["type"], "http.disconnect")

    def test_body_is_decoded_once(self):
        got = {}

        async def app(scope, receive, send):
            message = await receive()
            got["body"] = message["body"]
            got["content_type"] = dict(scope["headers"]).get(b"content-type")
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        payload = b'{"a":1}'
        pending = [{"type": "http.request", "body": gzip.compress(payload), "more_body": False}]

        async def receive():
            if pending:
                return pending.pop(0)
            return {"type": "http.disconnect"}

        async def send(_message):
            return None

        middleware = GzipRequestMiddleware(app, max_bytes=1024 * 1024)
        scope = {
            "type": "http",
            "headers": [(b"x-cat-encoding", b"gzip"), (b"x-cat-content-type", b"application/json")],
        }
        asyncio.run(middleware(scope, receive, send))
        self.assertEqual(got["body"], payload)
        self.assertEqual(got["content_type"], b"application/json")


if __name__ == "__main__":
    unittest.main()
