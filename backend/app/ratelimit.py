"""Shared rate limiter for public endpoints (basic abuse / DoS protection)."""
from slowapi import Limiter
from slowapi.util import get_remote_address


def _client_key(request) -> str:
    """Rate-limit key: the claimed client IP (X-Forwarded-For first, as we run
    behind Railway's proxy), falling back to the socket address."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_client_key)
