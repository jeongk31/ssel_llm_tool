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
    """Attach the buffer handler to the uvicorn loggers only (idempotent).

    We deliberately do NOT touch the root logger or its level: raising the root
    level to INFO makes libraries like SQLAlchemy emit a log line per query, which
    floods the process. Attaching only to uvicorn's own loggers captures request
    logs and tracebacks without that side effect.
    """
    global _installed
    if _installed:
        return
    handler = _BufferHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    handler.setLevel(logging.INFO)
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


def clear_logs() -> dict:
    """Empty the buffer. The sequence counter keeps advancing so live pollers just
    see fresh lines from here on."""
    with _lock:
        _buffer.clear()
    return {"ok": True, "last_seq": _seq}
