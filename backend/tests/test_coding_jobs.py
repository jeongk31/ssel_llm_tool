import asyncio
import os
import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@127.0.0.1:5432/test")

from app import jobs
from app.config import settings
from app.mailer import run_link, send_run_finished, send_run_started


def job_row(**kwargs):
    base = dict(
        token="t" * 32, status="running", current_episode=0, total_episodes=0,
        episodes_coded=0, error_count=0, error_sample=[], message="",
        file_name="data.csv", models=["gpt-4o-mini"], runs_per_model=1,
        result_path="", email_status="", started_at=None, finished_at=None,
        expires_at=None,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


class RunTokenTests(unittest.TestCase):
    """The token is the only thing guarding a run's results, so it has to be
    unguessable and unique."""

    def test_tokens_are_long_and_do_not_repeat(self):
        tokens = {jobs.new_token() for _ in range(500)}
        self.assertEqual(len(tokens), 500)
        self.assertTrue(all(len(t) == 32 for t in tokens))

    def test_links_expire_after_the_configured_window(self):
        start = datetime(2026, 10, 1, 12, 0, 0)
        self.assertEqual(
            jobs.expiry_from(start),
            start + timedelta(hours=settings.run_link_ttl_hours),
        )


class EtaTests(unittest.TestCase):
    """The estimate comes from the rate the run itself achieves, which works
    because the coding loop is sequential — one awaited call per episode."""

    def test_no_estimate_until_enough_episodes_are_observed(self):
        self.assertIsNone(jobs.eta_seconds(1, 100, 2))
        self.assertIsNone(jobs.eta_seconds(4, 100, 8))

    def test_estimate_extrapolates_the_observed_rate(self):
        # 10 episodes in 20s is 2s each; 90 remain.
        self.assertEqual(jobs.eta_seconds(10, 100, 20), 180)

    def test_no_estimate_once_the_run_is_done(self):
        self.assertIsNone(jobs.eta_seconds(100, 100, 200))

    def test_a_stalled_clock_cannot_produce_a_negative_estimate(self):
        self.assertIsNone(jobs.eta_seconds(10, 100, 0))


class JobPayloadTests(unittest.TestCase):
    def test_payload_carries_progress_and_no_dataset_content(self):
        started = datetime.utcnow() - timedelta(seconds=20)
        payload = jobs.job_payload(job_row(
            status="running", current_episode=10, total_episodes=100, started_at=started,
        ))
        self.assertEqual(payload["current"], 10)
        self.assertEqual(payload["total"], 100)
        self.assertIsNotNone(payload["eta_seconds"])
        # Nothing that could carry participant text.
        self.assertEqual(
            set(payload) & {"rows", "coded", "dataset", "api_key", "result_path"},
            set(),
        )

    def test_finished_runs_report_no_estimate(self):
        payload = jobs.job_payload(job_row(
            status="completed", current_episode=100, total_episodes=100,
            started_at=datetime.utcnow() - timedelta(seconds=50),
            finished_at=datetime.utcnow(), result_path="/tmp/llm_coding_x/coded_results.csv",
        ))
        self.assertIsNone(payload["eta_seconds"])
        self.assertTrue(payload["has_results"])

    def test_results_are_not_offered_before_the_run_completes(self):
        payload = jobs.job_payload(job_row(
            status="failed", result_path="/tmp/llm_coding_x/coded_results.csv",
        ))
        self.assertFalse(payload["has_results"])


class MailerTests(unittest.TestCase):
    def test_no_link_without_a_public_url(self):
        with patch.object(settings, "public_base_url", ""):
            self.assertEqual(run_link("abc"), "")

    def test_link_points_at_the_runs_page(self):
        with patch.object(settings, "public_base_url", "https://example.org/"):
            self.assertEqual(run_link("abc"), "https://example.org/runs/abc")

    def test_mail_is_skipped_rather_than_failed_when_unconfigured(self):
        # A missing relay must not break a run: the results are on the server and
        # the link works regardless.
        with patch.object(settings, "smtp_host", ""):
            outcome = asyncio.run(send_run_finished("someone@example.org", "abc", "completed", 5, 5))
        self.assertEqual(outcome, "skipped")

    def test_mail_is_skipped_when_no_address_was_given(self):
        with patch.object(settings, "smtp_host", "smtp.example.org"), \
             patch.object(settings, "public_base_url", "https://example.org"):
            outcome = asyncio.run(send_run_finished("", "abc", "completed", 5, 5))
        self.assertEqual(outcome, "skipped")

    def test_a_relay_failure_is_reported_without_raising(self):
        def boom(_message):
            raise OSError("relay refused")

        with patch.object(settings, "smtp_host", "smtp.example.org"), \
             patch.object(settings, "public_base_url", "https://example.org"), \
             patch("app.mailer._send_sync", boom):
            outcome = asyncio.run(send_run_finished("someone@example.org", "abc", "completed", 5, 5))
        self.assertEqual(outcome, "failed")

    def test_the_start_message_hands_over_the_link_immediately(self):
        captured = {}

        def capture(message):
            captured["body"] = message.get_content()
            captured["subject"] = message["Subject"]

        with patch.object(settings, "smtp_host", "smtp.example.org"), \
             patch.object(settings, "public_base_url", "https://example.org"), \
             patch("app.mailer._send_sync", capture):
            outcome = asyncio.run(send_run_started("someone@example.org", "abc"))

        self.assertEqual(outcome, "sent")
        self.assertIn("started", captured["subject"].lower())
        # The point of the start message: they hold the link before anything can
        # go wrong with their connection.
        self.assertIn("https://example.org/runs/abc", captured["body"])
        self.assertIn(str(settings.run_link_ttl_hours), captured["body"])

    def test_the_start_message_is_skipped_when_mail_is_unconfigured(self):
        with patch.object(settings, "smtp_host", ""):
            self.assertEqual(asyncio.run(send_run_started("someone@example.org", "abc")), "skipped")

    def test_a_relay_failure_at_start_does_not_raise(self):
        def boom(_message):
            raise OSError("relay refused")

        with patch.object(settings, "smtp_host", "smtp.example.org"), \
             patch.object(settings, "public_base_url", "https://example.org"), \
             patch("app.mailer._send_sync", boom):
            self.assertEqual(asyncio.run(send_run_started("someone@example.org", "abc")), "failed")

    def test_the_message_carries_a_link_and_never_the_results(self):
        captured = {}

        def capture(message):
            captured["body"] = message.get_content()
            captured["to"] = message["To"]
            captured["from"] = message["From"]

        with patch.object(settings, "smtp_host", "smtp.example.org"), \
             patch.object(settings, "public_base_url", "https://example.org"), \
             patch("app.mailer._send_sync", capture):
            outcome = asyncio.run(send_run_finished("someone@example.org", "abc", "completed", 9, 10))

        self.assertEqual(outcome, "sent")
        self.assertIn("https://example.org/runs/abc", captured["body"])
        self.assertIn("9 of 10 episodes", captured["body"])
        self.assertIn(settings.mail_from, captured["from"])
        self.assertIn(str(settings.run_link_ttl_hours), captured["body"])


if __name__ == "__main__":
    unittest.main()
