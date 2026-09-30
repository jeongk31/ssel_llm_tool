"""In-memory ring buffer of recent server log records, for the admin "Server logs"
view. Safe by construction: bounded size, admin-auth-gated endpoint, in-process only
(no journald/file access needed). It captures this backend process's own logs
(uvicorn access + application logs). It resets on restart — it is a live tail, not an
archive.
"""

import logging
from collections import deque
from threading import Lock

_MAX_LINES = 2000
_buffer: deque = deque(maxlen=_MAX_LINES)
_lock = Lock()
_seq = 0


class _BufferHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        global _seq
        try:
            msg = self.format(record)
        except Exception:
            return
        with _lock:
            _seq += 1
            _buffer.append({
                "seq": _seq,
                "ts": record.created,
                "level": record.levelname,
                "logger": record.name,
                "msg": msg[:2000],
            })


_installed = False


def install_log_buffer() -> None:
    """Attach the buffer handler to the root and uvicorn loggers (idempotent)."""
    global _installed
    if _installed:
        return
    handler = _BufferHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    handler.setLevel(logging.INFO)
    root = logging.getLogger()
    root.addHandler(handler)
    if root.level > logging.INFO or root.level == logging.NOTSET:
        root.setLevel(logging.INFO)
    # uvicorn uses its own loggers; make sure they propagate/reach the handler.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).addHandler(handler)
    _installed = True


def recent_logs(after_seq: int = 0, limit: int = 500) -> dict:
    """Return buffered log records with seq > after_seq (for incremental polling)."""
    with _lock:
        items = [r for r in _buffer if r["seq"] > after_seq]
    if len(items) > limit:
        items = items[-limit:]
    last = items[-1]["seq"] if items else after_seq
    return {"lines": items, "last_seq": last}
