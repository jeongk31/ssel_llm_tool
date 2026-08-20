# Production deployment

CAT is deployed on a university-hosted Red Hat Enterprise Linux server. Nginx
terminates HTTPS and reverse-proxies requests to separate systemd-managed FastAPI and
Next.js services. PostgreSQL stores operational analytics and contact messages.

This directory contains the repository-side automatic deployment timer and script. It
does not contain service credentials, database passwords, TLS keys, hostnames, or
private server configuration.

The server administrator supplies `CAT_APP_DIR` and `CAT_APP_USER` through the private
systemd environment file referenced by the service. Optional `CAT_BRANCH`,
`CAT_REPOSITORY`, and `CAT_STATE_DIR` values may override the public defaults.

## Release flow

GitHub Actions runs `.github/workflows/ci.yml` for each push to `main`. Every two
minutes, the server checks whether a new `main` commit has a successful push-triggered
CI run. The deployer then:

1. refuses to run if the server checkout has tracked local changes;
2. fetches `origin/main` and verifies the exact commit's CI conclusion;
3. performs a fast-forward-only update;
4. installs the hash-locked Python dependencies and locked npm dependencies;
5. builds the Next.js production bundle;
6. restarts the frontend and backend services; and
7. records the deployed commit only after both local health checks pass.

## Required configuration

The backend service environment provides:

- `DATABASE_URL`: PostgreSQL connection string;
- `ADMIN_PASSWORD`: password for the administrative dashboard; and
- `CORS_ORIGINS`: permitted browser origins.

`MAX_CONCURRENT_LLM_CALLS` and `MAX_UPLOAD_MB` may be set to override their application
defaults. The frontend build may set `NEXT_PUBLIC_API_URL` when the backend is not
reached through the default local proxy. Secrets are managed outside Git and must never
be added to this directory.

## Operations and rollback

Service status and deployment logs should be reviewed through systemd and journald.
The repository intentionally omits deployment-specific usernames, internal paths, and
hostnames.

Rollback is performed by selecting a previously tested commit on `main`, allowing CI to
validate it, and deploying it through the same fast-forward release process. Database
schema changes require a separately reviewed rollback plan before release; Git rollback
does not itself reverse persistent data changes.
