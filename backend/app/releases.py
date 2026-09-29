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
