# CAT — contributor & AI-agent notes

Read this before making changes. It captures conventions and gotchas that are not
obvious from the code alone. Applies to any AI assistant or human contributor.

## Releasing / versioning (do this on every deploy)

- The version is **single-sourced** in `backend/app/releases.py`. `RELEASES` is the
  list of deploys, newest first; `backend/app/__init__.py` derives `__version__` from
  `RELEASES[0]`.
- **Every deploy = one new entry at the TOP of `RELEASES`**, with the next **patch**
  number, the date it ships (UAE), a short `title`, and `notes`. Example: current is
  `1.2.5`, so the next deploy is `1.2.6`, then `1.2.7`, … Bump the **minor** (e.g. `1.3.0`)
  only for a notable feature release.
- When you bump the version, also update the literal in `backend/tests/test_version.py`
  and the `version` in `frontend/package.json` (+ `package-lock.json`) to match.
- The website masthead badge shows the **major.minor** (e.g. `v1.2`); the **admin
  Version History** (`/admin` → Version history) shows the full patch-level log from
  `RELEASES`. Keep both truthful.
- A deploy = a merge to `main` (see below), so add the `RELEASES` entry in that PR.

## Deploy pipeline

- Production is a university server; the auto-deployer (`deploy/ssel-auto-deploy`) polls
  every ~2 min and deploys `origin/main` **only when the `ci.yml` GitHub workflow is green
  for that commit**. A red CI (e.g. `npm audit` flagging a new advisory) silently blocks all
  deploys — keep CI green.
- Frontend, backend, **and the admin dashboard all deploy together** — the admin is just
  routes inside the FastAPI backend (`/admin`, rendered from `app/admin_template.py` +
  `app/routes/analytics.py`). There is no separate admin deploy.
- Work on a branch, open a PR to `main`, let CI pass, merge (squash). Never force-push `main`.

## Firewall / request encoding (important, easy to reintroduce a bug)

- The production server sits behind an NYU gateway WAF that **rejects plain-text request
  bodies** containing patterns like `%`, `or 1=1`, `../../`, or `<script>` — ordinary
  research text. It returns an HTTP 200 HTML "Request Rejected … support ID …" page.
- Mitigation: request bodies that carry user content are **encoded** (gzip, with a base64
  fallback) so the WAF sees opaque bytes. See `frontend/src/lib/gzipRequest.ts` (client) and
  `backend/app/gzip_request.py` (an ASGI middleware that decodes `X-CAT-Encoding` on **all**
  routes).
- **If you add a new endpoint that sends user-entered text/data in the request body, encode
  it** with `gzipJsonInit`/`gzipFileInit` and handle the block page with `firewallErrorFromText`,
  or it will be blocked for real users. Do not send instructions/codebook/dataset content as
  plain JSON.

## Other

- No SQLite fallback: the backend requires a real `DATABASE_URL` (PostgreSQL). Only usage
  metadata + contact messages are stored; uploaded datasets live in a temp dir and expire.
- The private ops runbook is `SERVER_OPERATIONS_PRIVATE.md` (git-ignored; do not commit it or
  paste secrets).
