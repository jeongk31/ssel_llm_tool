# CAT frontend

This directory contains the Next.js and React interface for the Communication
Annotation Tool (CAT).

## Development

Use Node.js 22 and install exactly the versions in `package-lock.json`:

```bash
npm ci
npm run dev
```

The development interface is available at `http://localhost:3000`. API requests are
forwarded to `http://localhost:8000` by default. Set `NEXT_PUBLIC_API_URL` before the
build when the backend uses another address.

## Verification

```bash
npm run lint
npm audit --omit=dev --audit-level=high
npm run build
```

Do not place API keys, participant data, server credentials, or local environment files
under this directory. Public images and the guided demonstration video belong in
`public/`; application code belongs in `src/`.
