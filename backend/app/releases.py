"""Deploy/release history — the single source of truth for the app version.

Each deploy to production adds one entry to the TOP of RELEASES with the next
patch number and the date it shipped. The website shows the major.minor (e.g.
"1.2"); the admin Version History shows the full patch-level log below.

``__version__`` (in app/__init__.py) is derived from RELEASES[0], so bumping the
version is just prepending a new entry here.

Dates for entries up to 1.2.4 were reconstructed from the git merge history on
`main` (each merge to main is one deploy). Times are the release date (UAE).
"""

RELEASES = [
    {
        "version": "1.2.12",
        "date": "2026-09-30",
        "title": "Count coding runs and downloads on the server",
        "notes": "Coding runs, their outcomes, and script-package downloads are now recorded by the backend, so the admin no longer undercounts runs when a visitor declines browser analytics or closes the tab.",
    },
    {
        "version": "1.2.11",
        "date": "2026-09-30",
        "title": "Fix coding runs freezing the server",
        "notes": "The request-decoding middleware answered receive() instantly, which made streaming coding runs busy-loop and hang the whole backend. It now defers to the real receive.",
    },
    {
        "version": "1.2.10",
        "date": "2026-09-30",
        "title": "Persistent error log; remove live server-log view",
        "notes": "Removed the live server-log tail. Backend exceptions are now persisted and shown in the admin Errors view alongside coding-run errors.",
    },
    {
        "version": "1.2.9",
        "date": "2026-09-30",
        "title": "Hotfix: backend stability",
        "notes": "Admin stats now compute off the event loop (bounded), and the log buffer no longer floods SQL logs. Fixes backend timeouts / admin 504s.",
    },
    {
        "version": "1.2.8",
        "date": "2026-09-30",
        "title": "Admin errors view + live server logs",
        "notes": "Capture run error messages, add an Errors view, a live backend-log tail, and admin auto-refresh.",
    },
    {
        "version": "1.2.7",
        "date": "2026-09-29",
        "title": "Firewall: base64-safe request encoding",
        "notes": "Send request bodies as gzip+base64 so large gzipped uploads no longer trip the firewall by coincidence.",
    },
    {
        "version": "1.2.6",
        "date": "2026-09-29",
        "title": "Contributor and AI-agent notes",
        "notes": "Added CLAUDE.md documenting the release, deploy, and firewall-encoding conventions.",
    },
    {
        "version": "1.2.5",
        "date": "2026-09-29",
        "title": "Admin version history",
        "notes": "Added this deploy history to the admin dashboard.",
    },
    {
        "version": "1.2.4",
        "date": "2026-09-29",
        "title": "Reliable uploads/coding on filtered networks",
        "notes": "Encoded all coding requests so none are rejected by the upstream firewall.",
    },
    {
        "version": "1.2.3",
        "date": "2026-09-29",
        "title": "Admin dashboard redesign",
        "notes": "Run outcomes, a sessions view, clearer metrics, and a light/dark interface.",
    },
    {
        "version": "1.2.2",
        "date": "2026-09-29",
        "title": "Broader upload/coding reliability",
        "notes": "Added a universal fallback so the firewall mitigation covers every browser.",
    },
    {
        "version": "1.2.1",
        "date": "2026-09-18",
        "title": "Layout and logo fixes",
        "notes": "Fixed blank space around the coding actions and the NYU logo display.",
    },
    {
        "version": "1.2.0",
        "date": "2026-09-17",
        "title": "Row subset, validation feedback, reliable uploads",
        "notes": "Step 1 row subsetting, submit-time setup validation, and firewall-resilient uploads/runs.",
    },
    {
        "version": "1.1.0",
        "date": "2026-09-01",
        "title": "Research documentation and agreement analysis",
        "notes": "Full CAT paper documentation, citations, privacy notice, and inter-coder agreement.",
    },
    {
        "version": "1.0.0",
        "date": "2026-08-21",
        "title": "Initial public release",
        "notes": "Paper-aligned release: upload, mapping, codebook, browser and package coding, exports.",
    },
]

# The current running version is always the newest release entry.
CURRENT_VERSION = RELEASES[0]["version"]
