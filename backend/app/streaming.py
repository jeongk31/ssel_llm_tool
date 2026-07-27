import asyncio
from contextlib import suppress
from typing import AsyncIterator


async def with_keepalive(
    events: AsyncIterator[dict],
    interval_seconds: float = 15,
) -> AsyncIterator[dict]:
    """Yield heartbeat events while an async generator is waiting on slow work."""
    next_event = asyncio.create_task(anext(events))
    try:
        while True:
            done, _ = await asyncio.wait({next_event}, timeout=interval_seconds)
            if not done:
                yield {"type": "keepalive"}
                continue

            try:
                event = next_event.result()
            except StopAsyncIteration:
                break

            yield event
            next_event = asyncio.create_task(anext(events))
    finally:
        if not next_event.done():
            next_event.cancel()
            with suppress(asyncio.CancelledError):
                await next_event
        with suppress(Exception):
            await events.aclose()
