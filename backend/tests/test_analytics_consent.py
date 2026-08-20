import os
import unittest
from unittest.mock import AsyncMock, patch

os.environ["DATABASE_URL"] = "postgresql://test:test@127.0.0.1:5432/test"

from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.models.database import get_db
from app.ratelimit import limiter
from app.routes import analytics


class _FakeDatabase:
    def __init__(self):
        self.added = []

    def add(self, value):
        self.added.append(value)

    async def commit(self):
        return None


class AnalyticsConsentTests(unittest.TestCase):
    def setUp(self):
        self.db = _FakeDatabase()

        async def override_db():
            yield self.db

        app = FastAPI()
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        app.include_router(analytics.router, prefix="/api")
        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()

    def test_rejection_records_only_anonymous_visit(self):
        with patch.object(analytics, "_geo_lookup", new=AsyncMock()) as geo_lookup:
            response = self.client.post(
                "/api/analytics/track",
                headers={"user-agent": "identifying-agent", "referer": "https://example.test/private"},
                json={
                    "event": "visit",
                    "consent": "rejected",
                    "client_ip": "203.0.113.9",
                    "session_id": "should-not-be-stored",
                    "providers": ["openai"],
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True, "anonymous": True})
        geo_lookup.assert_not_awaited()
        self.assertEqual(len(self.db.added), 1)
        event = self.db.added[0]
        self.assertEqual(event.event, "visit")
        self.assertIsNone(event.session_id)
        self.assertIsNone(event.ip)
        self.assertIsNone(event.country)
        self.assertIsNone(event.user_agent)
        self.assertIsNone(event.referer)

    def test_detailed_event_requires_explicit_acceptance(self):
        response = self.client.post(
            "/api/analytics/track",
            json={"event": "visit", "session_id": "not-authorized", "client_ip": "203.0.113.9"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": False})
        self.assertEqual(self.db.added, [])

    def test_acceptance_records_configured_metadata(self):
        geo = {"country": "Example", "country_code": "EX", "city": "Test", "region": "Region"}
        with patch.object(analytics, "_geo_lookup", new=AsyncMock(return_value=geo)) as geo_lookup:
            response = self.client.post(
                "/api/analytics/track",
                headers={"user-agent": "browser", "referer": "https://example.test/"},
                json={
                    "event": "run",
                    "consent": "accepted",
                    "client_ip": "203.0.113.9",
                    "session_id": "session-1",
                    "providers": ["openai"],
                    "models": ["example-model"],
                    "num_models": 1,
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})
        geo_lookup.assert_awaited_once_with("203.0.113.9")
        event = self.db.added[0]
        self.assertEqual(event.session_id, "session-1")
        self.assertEqual(event.ip, "203.0.113.9")
        self.assertEqual(event.country, "Example")
        self.assertEqual(event.user_agent, "browser")


if __name__ == "__main__":
    unittest.main()
