# Bit by Ear

**Small listens. Steady learning.**

Explore something you’ve been meaning to learn, one idea at a time. Bit by Ear turns your own notes and documents into connected daily audio stories. Add a topic and context, adjust and approve your learning plan, then listen at your own pace in a private, installable web app. Each episode briefly recalls the previous idea and introduces a new one. Published audio is measured to be two minutes or less; episode-ready notifications are optional.

## Run locally

Requirements: Node.js 22.22 or newer in the 22.x line, npm, and Docker Desktop (or Docker Engine with Compose).

```sh
npm ci
cp .env.example .env
npm run local:setup
npm run dev
```

Open <http://localhost:5173>. Local development uses deterministic mock providers, so the complete learning flow works without provider credentials. Add OpenRouter and ElevenLabs keys to `.env` and set `PROVIDER_MODE=real` when you want to try live generation. Keys stay on the server. Push remains disabled until VAPID keys are set.

`npm run local:setup` starts PostgreSQL and applies the schema. The app stores its local data in the Docker volume `bit-by-ear-postgres`. Run `docker compose down -v` only when you want to delete that local data.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

`npm run test:e2e` is the browser test entry point. Install Playwright's Chromium once with `npx playwright install chromium`.

## Render

`render.yaml` defines a web service, a background worker and a PostgreSQL database. Create a Render Blueprint from this repository and enter the OpenRouter API key, ElevenLabs API key and voice ID in the service environment settings. The blueprint leaves provider and VAPID credentials unset; no keys are stored in the repository. The web service runs the migration at startup, and the worker shares the same database and provider credentials.

The app uses Render’s assigned external URL for origin checks; set `APP_ORIGIN` only if you use a custom domain. Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to enable optional browser notifications. The demo Blueprint uses a free web service, a free PostgreSQL database, and an always-on paid worker. The web service sleeps after 15 minutes without traffic, and the free database expires after 30 days and has no backups. Upgrade the database before expiry to keep its data. The production build compiles the server and frontend; the web service applies migrations at startup because free web services do not support pre-deploy commands.

## What is included

- Private email/password accounts and owner-scoped learning spaces.
- PDF, Markdown and plain-text sources with visible extraction status.
- Editable, source-grounded plans and explicit approval.
- Daily narrative episodes, a private audio player and saved listening progress.
- PWA installation and optional ready-episode notifications.
- Mock-provider local flow, OpenRouter/Gemma plans and ElevenLabs narration.

This is an alpha: password recovery and live-provider quality checks are not included. Resource limits and episode checks are enforced by the server; see the design spec and implementation plan in `docs/superpowers/`.
