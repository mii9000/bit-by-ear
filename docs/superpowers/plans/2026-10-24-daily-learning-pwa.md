# Daily Learning PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first PWA that converts user resources into an approved learning plan and automatically publishes daily narrative audio episodes.

**Architecture:** One repository builds a React client and TypeScript web/worker processes. Render Postgres holds private application data, bounded files/audio, and durable jobs; Gemma through OpenRouter produces grounded plans/scripts and ElevenLabs narrates them. Optional push links to ready episodes; scheduling never depends on a running browser.

**Tech Stack:** React, strict TypeScript, Vite, Express, PostgreSQL/pg, Zod, React Router, TanStack Query, React Hook Form, React Aria Components, PDF.js, a timezone-aware date library, web-push, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-24-daily-learning-pwa-design.md`

**Status:** Draft for review, prepared alongside the spec at the user's request. No product code has been written. The workspace is empty and not yet a Git repository; initialise it only when implementation starts.

**Branding proposal:** Bit by Ear — “A little wiser, two minutes a day.” Await user selection before finalising app labels, manifest name and icons; existing documentation paths stay stable.

## Global Constraints

- React and TypeScript on the frontend; TypeScript on the backend. Use idiomatic code, appropriate libraries, and useful abstractions that keep it readable to humans.
- A simple, intuitive, modern user experience is a core requirement, not optional polish.
- No questions, quizzes, exercises, or required responses in episodes.
- Player controls are play/pause and a draggable seek bar. Remember playback position.
- Delivery is through the PWA rather than email.
- Ten resources per knowledge base, 5 MiB per file; 60,000 extracted characters per knowledge base. Reject an oversized addition explicitly; never silently truncate it.
- Model proposes 3–30 daily episodes according to the resources and goal.
- English, one preset narrator; target 180–220 narration words and 90–110 seconds.
- Every published episode must have a measured audio duration of at most 120 seconds.
- One worker polls every 30 seconds; process one job at a time for MVP cost control.
- Publish at most one episode per course per local date, including approval/resume paths.
- Keep provider keys server-side, private responses out of service-worker caches, and all user records owner-scoped.
- Do not implement email, OCR, URL crawling, chat, adaptive scoring, audio downloads, or post-approval plan/resource revisions.
- Test the core flow on a real small-screen device as well as desktop.

## Review Focus

1. Concurrent editing/upload/approval must not approve a stale plan or attach a different resource set (Tasks 2–4).
2. Pauses, restarts, DST, and timezone changes must not cause skipped sequence, duplicate publication, or backlog bursts (Tasks 3, 6).
3. A private audio URL or cached response must not expose one user's material to another user (Tasks 1, 7, 8).
4. Unsupported/scanned documents and model-invented citations must produce useful errors instead of silent truncation or fabricated lessons (Tasks 2, 4, 5).
5. Notification permission/device limitations and failed provider calls must preserve the listening experience and visible recovery (Tasks 5, 8, 9).

## File map

Proposed files below define responsibilities, not an obligation to split every small function into its own module. Keep cohesive code together; do not add generic framework layers.

```text
package.json, package-lock.json, tsconfig.json, .node-version, vite.config.ts
.env.example, .gitignore, render.yaml, README.md
src/shared/contracts.ts                 Zod schemas and inferred public types
src/server/app.ts                       Express app, route wiring, static client
src/server/db.ts                        pg pool and transaction helper
src/server/auth.ts                      sessions, scrypt, ownership/CSRF/rate limits
src/server/knowledge.ts                 knowledge-base/resource HTTP operations
src/server/resources.ts                 upload validation and PDF/text extraction
src/server/courses.ts                   draft, approval, settings and course HTTP operations
src/server/jobs.ts                      durable claims, leases, retries, stage completion
src/server/generation.ts                Gemma calls, prompts, validation, citations
src/server/audio.ts                     ElevenLabs call and authenticated range serving
src/server/schedule.ts                  local-date schedule policy
src/server/episodes.ts                  episode metadata and playback HTTP operations
src/server/push.ts                      push subscriptions, delivery, endpoint validation
src/server/worker.ts                    loop and stage dispatch
src/server/migrate.ts, migrations/001_initial.sql
src/client/main.tsx, src/client/App.tsx  routing and providers
src/client/api.ts, src/client/styles.css
src/client/features/account.tsx         sign-in/signup
src/client/features/library.tsx         home and knowledge-base/resource setup
src/client/features/plan.tsx            editable plan and approval status
src/client/features/player.tsx          episode library, audio hook and player
src/client/features/settings.tsx        schedule, pause and notification preferences
src/client/pwa.ts                       installation and push subscription helpers
public/manifest.webmanifest, public/sw.js, public/icons/*
tests/{auth,resources,jobs,plans,generation,schedule,audio,push}.test.ts
tests/e2e/{setup,player,pwa}.spec.ts
tests/fixtures/*                        small authored public-safe source files/audio
docs/submission.md, docs/verification.md
```

## Shared interfaces and route conventions

Define these once in `src/shared/contracts.ts`, reusing Zod inference for boundary types. `Id` is a UUID string; dates crossing HTTP are ISO strings. Internal SQL dates may use `Date` consistently.

```ts
type SourceRef = { resourceId: string; page: number | null; excerpt: string };
type LessonOutline = { title: string; objective: string; sourceRefs: SourceRef[] };
type PlanDraft = { title: string; rationale: string; materialGaps: string[]; lessons: LessonOutline[] };
type EpisodeDraft = { title: string; script: string; continuitySummary: string; sourceRefs: SourceRef[] };
type LearnerContext = { topic: string; goal: string; currentKnowledge: string };
type ExtractedResource = { id: string; text: string; pages: { page: number; text: string }[] };
type CourseState = 'draft' | 'validating' | 'active' | 'paused' | 'completed';
type JobKind = 'extract' | 'plan' | 'approve' | 'script' | 'audio' | 'push';
```

Use `/api` routes, same-origin cookies, a session CSRF token on mutations, JSON errors `{ code, message, fieldErrors? }`, 401 when unauthenticated, 404 for non-owned IDs, 409 for stale/locked mutations, 413 for upload limits, 422 for unsupported input. Uploads use multipart. Async actions return 202 and a job/status ID; clients poll active statuses through TanStack Query every three seconds, stopping on terminal states. Approval, resume, and retry actions are idempotent at the database boundary. Choose exact response schemas in the shared module when each task first exposes them.

### Task 1: Private account and application foundation

**Files:** Root build/config files; `migrations/001_initial.sql`; `src/shared/contracts.ts`; `src/server/{app,db,auth,migrate}.ts`; `src/client/{main,App}.tsx`; `src/client/api.ts`; `src/client/features/account.tsx`; `tests/auth.test.ts`.

**Interfaces:** `createApp(): Express`; `requireUser` supplies `req.user.id`; `withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>`. Routes: `POST /api/auth/signup`, `/login`, `/logout`; `GET /api/session` returns user and CSRF token. Client exports `api<T>(path: string, init?: RequestInit): Promise<T>`.

- [ ] Create the repository/build setup, strict TypeScript configs, locked dependencies, and scripts `dev`, `build`, `start:web`, `start:worker`, `migrate`, `typecheck`, `test`, `test:e2e`. Use the same build output in both services. Confirm the React/Node library versions work together before pinning them.
- [ ] Write `auth.test.ts`: unauthenticated private request gives 401; signup/login establishes a cookie; logout invalidates it; cross-origin/CSRF-less mutation fails; credentials and registration limits are enforced without logging secrets.
- [ ] Run `npm test -- tests/auth.test.ts`; confirm tests fail because auth is unimplemented, not because the harness cannot connect.
- [ ] Implement scrypt password storage, seven-day opaque sessions, CSRF/origin checks, SQL-backed bounded rate limits, and the account screen with inline recoverable errors. Set conservative initial limits: 10 signup attempts/IP/hour, 10 login attempts/account+IP/15 minutes, 20 generation actions/user/hour. Explain no password recovery in this alpha.
- [ ] Run the auth tests, `npm run typecheck`, and `npm run build`; expect exit 0. Commit the foundation when passing.

### Task 2: Knowledge bases and useful resource ingestion

**Files:** `src/server/{knowledge,resources}.ts`; extend migration/shared contracts; `src/client/features/library.tsx`; `tests/resources.test.ts`; `tests/fixtures/*`.

**Interfaces:** `extractResource(input: { id: string; bytes: Buffer; mediaType: string }): Promise<ExtractedResource>`; `POST/GET /api/knowledge-bases`; `GET/PATCH/DELETE /api/knowledge-bases/:id`; `POST/GET /api/knowledge-bases/:id/resources`; `DELETE /api/resources/:id`. Task 3 supplies `enqueueJob`; until then, tests inspect durable pending rows.

- [ ] Write tests for valid Markdown and two-page PDF extraction with real page numbers; reject scanned/encrypted PDF, invalid UTF-8, file over 5 MiB, eleventh resource, and extracted total above 60,000 characters. Verify failed extraction preserves visible status and never truncates.
- [ ] Add two-user tests proving list/delete/read are owner-scoped, the fourth knowledge base is rejected, and mutations serialize with course validation/approval.
- [ ] Run `npm test -- tests/resources.test.ts` and observe expected failures.
- [ ] Implement multipart limits, source-byte persistence, background extraction records and page-preserving PDF.js extraction. Serialize character-budget updates so concurrent extraction cannot exceed the total. Invalidate draft revision on any source/context change. Prevent resource mutation during/after approval; deletion of the entire knowledge base remains allowed.
- [ ] Build the mobile setup screen with goal/current-knowledge inputs, upload states, empty/error guidance, and Generate plan enabled only when all uploaded resources are ready. Preserve edits on errors.
- [ ] Run resource and auth tests plus typecheck; expect exit 0. Commit the ingestion slice.

### Task 3: Durable jobs and recoverable worker

**Files:** `src/server/{jobs,worker}.ts`; extend migration; `tests/jobs.test.ts`.

**Interfaces:** `enqueueJob(tx: PoolClient, input: { kind: JobKind; key: string; entityId: string }): Promise<string>`; `claimJob(now: Date): Promise<ClaimedJob | null>`; `runJob(job: ClaimedJob): Promise<void>`; `ClaimedJob = { id, kind, entityId, leaseToken, attempts }` with typed string fields and numeric attempts. Export `tick(now: Date): Promise<void>` for deterministic tests and later scheduling integration.

- [ ] Write tests proving two claims cannot run the same job; expired leases are recoverable; stale lease tokens cannot commit; duplicate stage keys return one row; transient retries use one/five-minute delays and stop after three attempts; permanent errors stop immediately.
- [ ] Run `npm test -- tests/jobs.test.ts`; confirm expected failures.
- [ ] Implement SQL row claims, five-minute leases/30-second heartbeats, finite provider-call support, retry classification, stage completion transactions and worker heartbeat. Keep SQL statements transactional and worker concurrency one; no custom generic queue framework.
- [ ] Wire extraction and placeholder typed dispatch boundaries for remaining stages. On process shutdown stop new claims and release/recover unfinished work safely; missing stage handlers must fail visibly rather than mark success.
- [ ] Run jobs/resources tests against a disposable real Postgres database; expect exit 0. Commit the worker slice.

### Task 4: Gemma plan generation, editing, and validated approval

**Files:** `src/server/{generation,courses}.ts`; `src/shared/contracts.ts`; `src/client/features/plan.tsx`; `tests/plans.test.ts`.

**Interfaces:** `generatePlan(input: { learner: LearnerContext; resources: ExtractedResource[]; requestedCount?: number; previousDraft?: PlanDraft }): Promise<PlanDraft>`; `validateApproval(input: { learner: LearnerContext; resources: ExtractedResource[]; plan: PlanDraft }): Promise<{ valid: boolean; gaps: string[] }>`; routes `POST /api/knowledge-bases/:id/plan/generate`, `GET/PATCH /api/knowledge-bases/:id/plan`, `POST /api/knowledge-bases/:id/plan/approve`. Approval body: `{ revision: number; timezone: string; deliveryTime: string }`.

- [ ] Write tests for valid 3/30-lesson boundaries, invalid count, wrong resource/page/excerpt, insufficient material, invalid JSON followed by one corrective call, and a failure after that correction. Provider HTTP is stubbed at its boundary.
- [ ] Add approval tests: changed source/revision gives 409; unsupported user-edited objective returns editable draft with gaps; duplicate approval creates one validation job; a validated revision freezes exact resources/order and queues exactly one script job. An interrupted draft-generation result never overwrites newer edits.
- [ ] Run `npm test -- tests/plans.test.ts`; observe expected failures.
- [ ] Implement the OpenRouter client using server-only native fetch and configured Gemma ID, schema/ownership/excerpt checks, prompt version/usage/timing records, approval validation stage and transactional publication into the active course. Abort with a useful error if approval-time settings or resources are invalid.
- [ ] Implement proposal/edit/approval screens using React Hook Form and Zod. Show duration rationale, editable titles/objectives, accessible reorder controls, explicit regenerate action, revision conflict recovery, and checking-plan status. Display timezone/time and that the first episode is generated immediately.
- [ ] Run plans/resources/jobs tests and typecheck; expect exit 0. Commit the plan-to-approved-course slice.

### Task 5: Narrative scripts and ElevenLabs audio

**Files:** `src/server/{generation,audio,worker}.ts`; `tests/generation.test.ts`; safe provider fixtures.

**Interfaces:** `generateEpisode(input: { learner: LearnerContext; lesson: LessonOutline; resources: ExtractedResource[]; previous: { script: string; continuitySummary: string } | null }): Promise<EpisodeDraft>`; `shortenEpisode(input: { episode: EpisodeDraft; measuredDurationSeconds: number; resources: ExtractedResource[] }): Promise<EpisodeDraft>`; `narrate(script: string): Promise<{ bytes: Buffer; durationSeconds: number }>`; `publishEpisode(episodeId: string, now: Date): Promise<boolean>` transactionally checks stored audio, finite positive duration of at most 120 seconds, active state and daily eligibility before readiness/schedule/push changes. A persisted script job queues audio; audio completion and resumed due-course work both use `publishEpisode`.

- [ ] Write tests for first-episode introduction vs previous-episode recap context, script target bounds 180/220 with a shorter duration-repair exception, invalid citations, obvious question marks, failure/retry after invalid output, audio API errors/timeouts, and an audio response over 8 MiB. Use a real tiny MP3 fixture to determine duration and reject corrupt audio or missing/non-finite/non-positive duration.
- [ ] Add duration tests: 119.9 seconds and exactly 120 seconds can publish; 120.1 seconds cannot. An overlong recording triggers one persisted shortening/re-narration pass with revalidated script, matching summary and sources. A still-overlong repair fails without readiness/push. Restart or explicit retry must not reset the shortening budget; retries reuse the final script. Never truncate audio or increase narration speed.
- [ ] Add recovery tests: saved scripts are reused for TTS retries; a saved valid audio result is reused after a pause; readiness requires audio and citations; no push exists before readiness; deletion prevents late writes. State changes and downstream jobs commit in one transaction guarded by lease token.
- [ ] Run `npm test -- tests/generation.test.ts`; confirm expected failures.
- [ ] Implement narrative prompts targeting 180–220 words/90–110 seconds, a brief recap, mechanical validation and the single corrective call. Store previous script/summary for continuity without claiming listening. Use an established MP3 metadata parser for actual duration. Implement ElevenLabs narration with configured voice/model, MP3 output, bounded response and finite timeouts, plus the persisted single duration-repair pass. Gate readiness on measured duration, not word count.
- [ ] Recheck course state before publication: paused work is saved but not made ready; deleted work is discarded. Store safe telemetry and note duplicate external charges remain possible after ambiguous network/crash failures.
- [ ] Run generation/jobs/plans tests and typecheck; expect exit 0. Commit the audio-generation slice. Live provider quality validation belongs to Task 9.

### Task 6: Daily scheduling, pause, and recovery

**Files:** `src/server/{schedule,courses,worker}.ts`; `src/client/features/settings.tsx`; `tests/schedule.test.ts`.

**Interfaces:** `nextLocalSlot(input: { after: Date; timezone: string; deliveryTime: string }): Date`; `enqueueDueCourses(now: Date): Promise<number>`; `PATCH /api/courses/:id/settings` accepts `{ timezone?, deliveryTime?, paused? }`; `POST /api/courses/:id/retry` retries a failed stage without duplicating completed work.

- [ ] Write deterministic tests for approval at 23:50, normal daily order, Amsterdam spring gap/autumn repeated time, pause/resume before and after today's publication, timezone change respecting the 24-hour setting-change guard, final completion, and an outage spanning five days producing only the next episode.
- [ ] Add worker tests where pause/deletion occurs during TTS and where two ticks compete to enqueue the same next lesson. Verify no duplicates or push while paused and a ready episode cannot be undone by a stale worker.
- [ ] Run `npm test -- tests/schedule.test.ts`; confirm expected failures.
- [ ] Implement timezone policy with a proven timezone-aware library, SQL due-course claims, publication-date bookkeeping, pause/resume and fixed retry semantics. Validate timezone/time changes before saving and recalculate future eligibility without changing existing episodes.
- [ ] Expose schedule and paused/failed/next-expected status in settings/home. Polling displays actual state; do not promise an exact ready instant.
- [ ] Run schedule/jobs/generation tests and typecheck; expect exit 0. Commit daily automation.

### Task 7: Private audio player and listening progress

**Files:** `src/server/{episodes,audio}.ts`; `src/client/features/player.tsx`; `src/client/styles.css`; `tests/audio.test.ts`; `tests/e2e/player.spec.ts`.

**Interfaces:** `GET /api/courses/:id/episodes`; `GET /api/episodes/:id`; `GET/HEAD /api/episodes/:id/audio`; `PUT/POST /api/episodes/:id/progress` accepts `{ positionSeconds: number; ended?: boolean }` (POST supports beacon); owner-scoped metadata includes readiness, saved progress, duration, transcript and sources.

- [ ] Write audio tests for owner-only metadata/HEAD/ranges, full GET, valid `206` including suffix/open-ended ranges, malformed/multiple range policy, `416`, and no private caching. Use a proven range parser if it improves correctness.
- [ ] Write player E2E: no autoplay, play/pause, seek by pointer and keyboard, saved position after navigation, source/transcript disclosure, and completed status only at ended/last-five-seconds. A second user cannot fetch audio or progress.
- [ ] Run `npm test -- tests/audio.test.ts` and `npm run test:e2e -- tests/e2e/player.spec.ts`; observe failures.
- [ ] Implement range serving, playback persistence/clamping every five seconds and on pause/seek/end, plus best-effort exit beacon with CSRF token carried in its body. Implement an audio hook for browser synchronisation and React Aria seek slider; keep derived React state out of effects.
- [ ] Design the listening page and library with clear hierarchy, restrained styling/tokens, 44 px touch controls, useful readiness states and one primary play action. Default to the last unfinished episode; exact notification deep links remain exact. Do not add speed/skip/quiz controls.
- [ ] Run audio tests and player E2E at mobile and desktop viewport sizes, then typecheck/build; expect exit 0. Commit the listening slice.

### Task 8: PWA installation and optional push

**Files:** `src/server/push.ts`; `src/client/pwa.ts`; settings/App; `public/{manifest.webmanifest,sw.js,icons/*}`; `tests/push.test.ts`; `tests/e2e/pwa.spec.ts`.

**Interfaces:** `GET /api/push/public-key` returns supported/enabled state and public VAPID key; `POST /api/push/subscriptions` accepts a standard push subscription; `DELETE /api/push/subscriptions` removes this user's endpoint; `deliverPush(deliveryId: string): Promise<void>`. Notification target: `/episodes/:id`.

- [ ] Write tests for owner-scoped subscriptions, ready-only unique delivery rows, failure independent of audio, 404/410 cleanup, logout/deletion invalidation, no-VAPID mode, and denied/unsupported permission preserving normal playback.
- [ ] Treat registered push endpoints as untrusted server-side destinations: use HTTPS, reject credentials/local/private/reserved addresses, validate resolved addresses, disable redirects, and use known push-service host restrictions where practical. Add a test for private-network endpoint rejection; never let subscription submission become an arbitrary internal request tool.
- [ ] Write PWA E2E for manifest/icons, standalone metadata, exact notification route handling, and static-shell offline fallback without caching authenticated API/audio responses. Run push/PWA tests and observe expected failures.
- [ ] Implement minimal shell service worker, installation guidance, explicit permission action, persistent VAPID-based subscriptions and tagged generic notifications. A click focuses/navigates an existing app window or opens the episode route; require normal session checks and never autoplay. Logout purges this browser's private state/subscription.
- [ ] Run push tests and PWA E2E, typecheck/build; expect exit 0. Commit PWA/push. Record real-device validation separately; emulation does not prove iOS delivery.

### Task 9: Integrated UX, provider quality, and deployment

**Files:** `render.yaml`, `.env.example`, `README.md`, `docs/verification.md`; `tests/e2e/setup.spec.ts`; refine existing feature UI only where needed for acceptance.

**Interfaces:** Render web and worker share `DATABASE_URL`; build once and start separate entrypoints. Use the spec's exact environment-variable names. Web listens on Render's `PORT`; production serves client and API on one origin. Migrations run once in a release/pre-deploy step.

- [ ] Write complete setup E2E using deterministic providers: create account/knowledge base, upload, generate, change count/order/objective, approve, wait for first ready audio, listen, pause future generation, resume, and delete. Assert clear errors, preserved form values, keyboard access and no overflow at 360 px/200% text zoom.
- [ ] Run setup E2E; confirm failures pinpoint missing integration before making corrections.
- [ ] Complete the shared visual system, screen transitions, skeleton/loading/empty/error states, focus handling and reduced-motion behavior. Review screenshots at mobile/desktop sizes and navigate the full flow by keyboard. Test the listening UX on a real phone; document any platform constraints.
- [ ] Add Render Blueprint, health endpoint, worker heartbeat diagnostics, migration/build/start commands and operator instructions. Verify no secrets enter the client build and no provider text is logged. Do not provision infrastructure until implementation scope and credentials support it.
- [ ] With explicit live-test configuration and available credentials, run two consecutive episodes through Gemma and ElevenLabs on representative authored resources. Manually assess factual support, story continuity, reading level and no questions; require measured duration of at most 120 seconds for each published episode. Record actual latency/usage/cost where available. Adjust prompts or the configured Gemma variant if necessary and repeat only failed checks.
- [ ] Deploy when authorised and verify persistence across web/worker restart, audio byte ranges on phone, closed-app scheduled generation, and opt-in push on a supported real device. Test the unsupported/denied path too. Label any missing device/provider verification as unverified, not passing.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:e2e`; require exit 0 and record evidence. Commit deployment/verified UX integration.

### Task 10: Reviewable submission and handoff

**Files:** `README.md`, `docs/submission.md`, `docs/verification.md`.

**Interfaces:** Documentation links to the actual repository and deployed demo only once available. No automatic DEV publishing or sending external messages.

- [ ] Map each of the spec's acceptance criteria to a test result, live observation or explicitly unverified limitation in `docs/verification.md`. Include resource limits, alpha account-recovery limitation, provider data flow and storage ceiling.
- [ ] Write the DEV draft using its template: what was built, demo, code, how it works, why open innovation matters, actual lazy payoff, and intended Render/ElevenLabs/Gemma categories. Do not claim long-term retention, offline inference or guaranteed notifications. Credit relevant prior work and disclose post-deadline commits as required.
- [ ] Capture a short demo of resources → edited/approved plan → immediate audio → next scheduled narrative → mobile PWA. Label accelerated scheduling demonstrations honestly. Keep private material and credentials out of recordings.
- [ ] Re-read the final diff for unrelated changes and unmet requirements. Run only checks affected by any final code fixes; confirm the final verification record matches the shipped revision. Commit handoff docs.

## Self-review and execution handoff

Spec coverage: account/privacy (Task 1), resources (2), recoverable work (3), plan/approval (4), narrative/audio (5), automation (6), listening (7), PWA/push (8), deployment and modern UX (9), submission evidence (10). Review Focus cases each have tests in their owning tasks. Shared types and route names above are authoritative; implementations must update the spec/plan together if a concrete incompatibility requires a change.

The most consequential assumptions still awaiting user review are email/password accounts without recovery, upload/course/storage bounds, frozen resources after approval, and no external enrichment. These are recorded proposals rather than implementation discoveries. The maximum episode duration of 120 seconds is a confirmed user requirement.

Recommended execution: **Native**, implementing this plan in the current session using `superpowers:executing-plans`, because the feature slices share schema/state contracts and the MVP benefits from one coherent implementation. The user may instead choose subagent-driven execution. Review the draft spec and plan before implementation begins.
