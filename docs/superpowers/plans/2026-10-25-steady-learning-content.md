# Steady Learning Content Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the approved “Small listens. Steady learning.” voice throughout Bit by Ear.

**Architecture:** Edit existing strings and generation instructions in place. Preserve UI structure, internal identifiers, persisted content, and validation rules.

**Tech Stack:** React, TypeScript, existing Gemma prompts and web-push integration.

**Spec:** `docs/superpowers/specs/2026-10-25-steady-learning-content-design.md`

## Global Constraints

- Episodes remain at most 120 seconds, with no questions or quizzes.
- No visual redesign, new dependencies, database changes, or regeneration of saved content.
- Keep error recovery actionable and factual; avoid guaranteed outcomes or exact readiness promises.
- Leave changes for review without committing.

## Review Focus

- Long copy on mobile: inspect representative screens for wrapping and overflow.
- Notifications: keep worker payload and service-worker fallback aligned and topic details private.
- Generated narration after a break: recap what was explained, without assuming listening or using “yesterday.”
- Existing plans and episodes: prompt updates apply only to future generation.
- Plan readiness: describe the required button action and approval validation honestly.

## Tasks

- [x] Apply the copy table in existing `src/client/App.tsx` and `src/client/features/{account,library,course,player,settings}.tsx`. Replace user-facing “course” with “series,” “learning plan,” or “listening settings” according to context; preserve internal names. Review all edited strings against their actions.
- [x] Update `index.html`, `public/manifest.webmanifest`, `public/sw.js`, and `src/server/worker.ts` metadata/notification copy; update `src/server/providers.ts` plan/narration instructions and mock wording. Keep schemas and generation budgets unchanged.
- [x] Update `PRODUCT.md`, README introduction, and spec status. Search scoped files for the old tagline and inconsistent terminology. Run `npm run typecheck`, `npm test`, and `git diff --check`.
- [x] Inspect rendered account/library/plan/player/settings copy at desktop and mobile widths using available browser access. Record any unavailable checks honestly. Summarize changes and limitations for review.

## Verification record

- Production build and TypeScript checks passed; Vite retains its existing large-chunk warning.
- All 9 unit tests passed. Diff whitespace checks passed.
- Reviewed welcome screen, library, setup form, and existing episode player on desktop. Reviewed library, setup form, player, and listening settings at 360 px. Edited copy wrapped without visible horizontal overflow.
- The existing account has an approved, paused series. The editable-plan state was reviewed in source, without creating another knowledge base or running live generation.
- Notification copy was checked for matching worker/fallback strings; no notification was sent. Prompt instructions were reviewed without spending provider credits.
- A read-only review found two old “course approval” error strings; both now say “learning plan approval.”
- Existing plans, scripts, and audio were preserved. Web/API preview processes are running without the generation worker.
