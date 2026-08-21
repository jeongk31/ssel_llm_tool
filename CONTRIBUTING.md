# Contributing to CAT

Thank you for helping improve the Communication Annotation Tool.

## Before contributing

- Use a GitHub issue for reproducible bugs and narrowly scoped feature proposals.
- Use the private process in [SECURITY.md](SECURITY.md) for vulnerabilities.
- Never submit participant data, API keys, credentials, server configuration, or other
  sensitive information.
- Keep publication scope in mind: deferred functionality is recorded in
  [DEFERRED_FEATURES.md](DEFERRED_FEATURES.md).

## Development checks

Use Python 3.12 and Node.js 22. Install the locked dependencies as described in the
[README](README.md), then run:

```bash
cd backend
python -m unittest discover -s tests -v

cd ../frontend
npm run lint
npm audit --omit=dev --audit-level=high
npm run build
```

Pull requests should explain the user-facing change, include focused tests, update the
relevant documentation, and avoid unrelated formatting or dependency changes.
