import os
import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@127.0.0.1:5432/test")

from app.routes.analytics import _process_stats


def event(**kwargs):
    """A UsageEvent-shaped row. Defaults match a browser-reported event."""
    base = dict(
        event="run", source="client", session_id="s1", run_id="", status="", episodes_coded=0,
        error_count=0, duration_ms=0, error_sample=[], providers=[], models=[], num_models=0,
        runs_per_model=0, aggregation="", num_variables=0, num_rows=0, num_episodes=0,
        per_sender=False, ip="", country="", country_code="", city="", region="",
        user_agent="", referer="", created_at=datetime(2026, 9, 30, 8, 0, 0),
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


class RunReportMergeTests(unittest.TestCase):
    """A run is reported by the browser (with consent) and by the server (always).
    The dashboard must show one run, with the server's outcome and the browser's
    location — not two runs, and not an 'abandoned' run that actually completed.
    """

    def test_both_reports_of_one_run_count_once(self):
        rows = [
            event(run_id="r1", source="client", country="United Arab Emirates", country_code="AE", city="Abu Dhabi"),
            event(run_id="r1", source="server", session_id=""),
            event(run_id="r1", source="server", session_id="", event="run_complete",
                  status="completed", episodes_coded=12, duration_ms=4000),
        ]
        stats = _process_stats(rows)
        self.assertEqual(stats["runs"], 1)
        self.assertEqual(stats["runs_completed"], 1)
        self.assertEqual(stats["total_episodes_coded"], 12)
        self.assertEqual(stats["runs_abandoned"], 0)
        # The browser report supplies the location the server deliberately omits.
        self.assertEqual(stats["runs_list"][0]["country"], "United Arab Emirates")
        self.assertEqual(stats["runs_recorded_by_server"], 1)
        self.assertEqual(stats["runs_reported_by_browser"], 1)

    def test_run_is_counted_when_the_visitor_declined_analytics(self):
        # No browser report at all: the server is the only record of this run.
        rows = [
            event(run_id="r2", source="server", session_id=""),
            event(run_id="r2", source="server", session_id="", event="run_complete",
                  status="completed", episodes_coded=5),
        ]
        stats = _process_stats(rows)
        self.assertEqual(stats["runs"], 1)
        self.assertEqual(stats["runs_completed"], 1)
        self.assertEqual(stats["success_rate"], 100.0)

    def test_server_outcome_wins_over_a_browser_outcome(self):
        rows = [
            event(run_id="r3", source="client"),
            event(run_id="r3", source="client", event="run_complete", status="failed"),
            event(run_id="r3", source="server", session_id="", event="run_complete",
                  status="completed", episodes_coded=7),
        ]
        stats = _process_stats(rows)
        self.assertEqual(stats["runs"], 1)
        self.assertEqual(stats["runs_completed"], 1)
        self.assertEqual(stats["runs_list"][0]["episodes_coded"], 7)

    def test_package_downloads_are_counted_separately_from_runs(self):
        rows = [
            event(run_id="r4", source="server", session_id=""),
            event(run_id="d1", source="server", session_id="", event="package_download", status="downloaded"),
            event(run_id="d2", source="server", session_id="", event="package_download", status="downloaded"),
        ]
        stats = _process_stats(rows)
        self.assertEqual(stats["runs"], 1)
        self.assertEqual(stats["package_downloads"], 2)

    def test_server_events_do_not_pollute_the_location_map(self):
        rows = [
            event(event="visit", source="client", country="United Arab Emirates", country_code="AE"),
            event(run_id="r5", source="server", session_id="", country=""),
        ]
        stats = _process_stats(rows)
        self.assertEqual(stats["by_country"], {"United Arab Emirates": 1})
        self.assertNotIn("Unknown", stats["by_country"])

    def test_legacy_rows_without_a_source_are_treated_as_browser_reports(self):
        rows = [
            event(run_id="old1", source=None, country="Kuwait", country_code="KW"),
            event(run_id="old1", source=None, event="run_complete", status="completed", episodes_coded=3),
        ]
        stats = _process_stats(rows)
        self.assertEqual(stats["runs"], 1)
        self.assertEqual(stats["runs_completed"], 1)
        self.assertEqual(stats["runs_reported_by_browser"], 1)
        self.assertEqual(stats["runs_recorded_by_server"], 0)

    def test_activity_per_day_counts_a_merged_run_once(self):
        day = datetime(2026, 9, 30, 8, 0, 0)
        rows = [
            event(run_id="r6", source="client", created_at=day),
            event(run_id="r6", source="server", session_id="", created_at=day + timedelta(seconds=1)),
        ]
        stats = _process_stats(rows)
        self.assertEqual(sum(stats["by_day"].values()), 1)


if __name__ == "__main__":
    unittest.main()
