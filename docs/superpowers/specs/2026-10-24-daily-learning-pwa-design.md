# Daily Learning PWA — Design Spec

Status: Draft for user review. No implementation authorized by this document alone.
Date: 2026-10-24
Proposed app name: **Bit by Ear** (awaiting user selection; filenames retain Daily Learning).
Proposed tagline: **A little wiser, two minutes a day.**
Companion: `../plans/2026-10-24-daily-learning-pwa.md`

## 1. Intent

Turn a learning goal and user-supplied resources into a personal sequence of short, connected audio lessons. After reviewing the proposed plan once, the user can return each day and listen without organising further work.

The product promise is: **Something you have been meaning to learn, explained a little each day in a story you can listen to.** This is a Hacktoberfest Week 3 project for the Slow and Steady theme. Long-term learning improvement is a hypothesis, not a verified result.

## 2. Confirmed requirements

- Users create knowledge bases and add their own resources and learning context.
- Context includes the learning goal and current knowledge.
- The configured OpenRouter model generates a proposed learning plan. The system proposes duration; the user can adjust the plan and approve it.
- Approval starts an automated daily audio series.
- Each episode is an informative narrative: briefly recall what the previous episode shared, then develop a new concept through a connected explanation or illustrative story. Episode one establishes the starting point.
- No questions, quizzes, exercises, or required responses in episodes.
- ElevenLabs generates the narration.
- Every published episode must have a measured audio duration of at most 120 seconds.
- Render hosts the web interface, generation/scheduling service, and listening experience.
- Delivery is through the PWA rather than email. Users can use it in a browser or add it to their mobile Home Screen.
- Generate episodes even when the browser/PWA is closed. Attempt optional push notifications when an episode is ready.
- Player controls are play/pause and a draggable seek bar. Remember playback position.
- Minimise ongoing user effort. The system automates the sequence and daily preparation.
- React and TypeScript on the frontend; TypeScript on the backend. Use idiomatic code, appropriate libraries, and useful abstractions that keep it readable to humans.
- A simple, intuitive, modern user experience is a core requirement, not optional polish.

## 3. Proposed implementation defaults requiring review

These are builder proposals, not earlier user commitments:

| Decision | Proposed MVP default |
|---|---|
| Accounts | Email/username and password; persistent secure cookie sessions. No email delivery or email verification. Explain that password recovery is unavailable in this small alpha. |
| Knowledge bases | Multiple private knowledge bases, at most three per account; one course per knowledge base. |
| Resources | Text-based PDF, UTF-8 Markdown, and plain text; no URL import, OCR, DOCX, or audio uploads. |
| Limits | Ten resources per knowledge base, 5 MiB per file; 60,000 extracted characters per knowledge base. Reject an oversized addition explicitly; never silently truncate it. |
| Course | Model proposes 3–30 daily episodes according to the resources and goal. User can change the count, ordering, titles, and learning objectives before approval. |
| Episode | English, one preset narrator; target 180–220 narration words and 90–110 seconds. Every published episode must have a measured audio duration of at most 120 seconds. |
| Schedule | Browser-detected IANA timezone and 08:00 local delivery target, editable before approval and in course settings. |
| First episode | Generate immediately after approval. Start the daily schedule on the following local calendar day. |
| Editing after approval | Plan and resource set are frozen for the course. A new course based on changed resources is deferred. |
| Missed listening | Continue generating daily. Preserve all prior episodes and resume the last unfinished episode by default. |
| Pause | Course settings can pause future generation. Resume makes overdue work eligible immediately only if no episode has been published on the current local date; otherwise use the following local day's slot. |
| Offline | Cache the static app shell only. Offline audio downloads are deferred; display an honest offline message. |

For unsupported/scanned/encrypted PDFs, show a specific extraction error and suggest uploading text. The resource library is a source collection, not a chat/RAG product.

## 4. Approaches and tradeoffs

### Delivery approaches considered

1. Daily email linking to a web player: originally considered, replaced by the user's preference for a PWA.
2. Browser/PWA with server-generated episodes and optional web push: chosen direction. One place for setup, library, and listening, with no inbox dependency.
3. Native mobile apps: deferred; separate distribution and platform work add little to this MVP.

### Proposed implementation approach

Use one TypeScript application with a React/Vite client, an Express HTTP server, a separate worker process from the same repository, and Render Postgres. Use React Router for routes, TanStack Query for server state/polling, React Hook Form with Zod for setup/outline forms, and React Aria Components for accessible interactive primitives such as dialogs and the seek slider. Use ordinary SQL and `pg`, native `fetch` for model/TTS APIs, PDF.js for text extraction, `web-push` for VAPID delivery, and a timezone-aware date library for scheduling. Lock exact dependency versions during setup. Pin Node to a supported 24.x patch after verifying local/Render compatibility.

Use strict TypeScript, discriminated unions for asynchronous states, schema-derived boundary types, and small feature-oriented React components. Keep the API client, provider integrations, scheduling policy, and persistence operations behind clear modules; avoid a generic repository/service/factory hierarchy. Effects synchronise browser APIs such as audio; derived state stays derived. Libraries should cover difficult interaction/state concerns rather than recreating them by hand.

Store bounded upload and MP3 bytes in Postgres `bytea` for this small alpha. This avoids shared-disk assumptions between Render web and worker services and avoids adding an object storage vendor. Audio routes must support byte ranges. This is a deliberate volume ceiling, not a long-term media architecture; move media to object storage when measured storage/backup/bandwidth makes it necessary.

An alternative is S3-compatible storage plus Postgres. It scales media better but adds another service and credentials. A web-only process with in-memory scheduling is rejected because restarts could lose work and generation could block request handling. No Redis, vector database, multi-agent framework, or Browserbase integration is needed.

## 5. User experience

### Setup

1. Sign up or sign in. Create a named knowledge base with topic, goal, and current knowledge.
2. Upload resources. Show extraction status and errors; enable plan generation only when at least one resource is ready and none is processing/failed.
3. Request a proposed plan. Show the proposed episode count, sequence, titles, objectives, and mapped resources. Explain material gaps instead of promising unsupported coverage.
4. Edit the outline. Changing duration asks the configured OpenRouter model to regenerate a draft; manually reorder/edit/add/remove outline items within the 3–30 limit. Generation requests are explicit and never overwrite unsaved edits silently.
5. Approve the displayed revision and delivery settings. A background validation checks the edited plan against the resources. Unsupported objectives return the plan to editable draft with specific gaps. A valid approval atomically freezes the resource snapshot and ordered plan, then enqueues episode one. No audio-generation charges before approval. Show “Checking your plan” while validation runs.

### Daily use

- Home lists knowledge bases with next unfinished episode, readiness, and next expected availability.
- Course view lists available episodes in sequence, with a separate upcoming outline.
- Episode view prioritises title, episode number, play/pause, current/total duration, and a seek slider. No speed selector, skip buttons, quiz, or chat.
- A collapsed transcript and source panel remains available below the player; sources are not spoken as citation codes.
- Never autoplay on notification/open. A user gesture starts playback. Resume saved position when returning.
- Notification links to the exact episode. If earlier episodes are unfinished, show a simple link back to the earliest unfinished episode.
- Settings hold schedule, pause/resume, and notification preferences; these are separate from the minimal player controls.
- Provide account logout and knowledge-base deletion with confirmation. Deletion removes its resources, plans, episodes, jobs, and playback data; notifications cannot resurrect it.

### Installation and notifications

Provide a manifest with stable app ID, standalone display, theme, start URL, and 192/512 icons; serve through HTTPS. Install guidance is platform-specific and unobtrusive. An install prompt may be offered only where supported; do not claim one universal install mechanism.

Notification subscription is optional and requested only after an explicit Enable notifications action. iOS/iPadOS web push requires 16.4+ and a Home Screen web app. Unsupported, denied, or dismissed permission never blocks listening. The episode library is the source of truth; push may be late or absent. Push payloads use generic copy such as “Your new lesson is ready” without private resource/topic details. Logout unsubscribes this browser from account-bound pushes; invalidate the stored endpoint even if the browser unsubscribe fails.

### UI quality requirements

- Mobile-first at 360 px and comfortable on larger screens; no horizontal overflow at 200% text zoom.
- A consistent visual system: restrained colour palette, clear typography, generous spacing, reusable design tokens, and deliberate loading/empty/error/ready states.
- One primary action per step: add material, generate plan, approve plan, or play. Use progressive disclosure for advanced details and sources.
- Preserve form input after validation errors and background failures. Show actual job state; no fictional progress percentages. Announce important async changes to assistive technology without stealing focus.
- Plan editing visibly preserves lesson order and unsaved changes; provide accessible move-up/down controls. Approval shows episode count, daily time/timezone, and resource coverage before confirmation.
- Player is the visual focus of an episode page. Use touch targets at least 44 by 44 CSS px, labelled controls, visible focus, keyboard seek support, and sufficient contrast (WCAG AA target). Respect reduced-motion preferences.
- Test the core flow on a real small-screen device as well as desktop. User experience acceptance covers setup clarity, responsiveness, player ergonomics, and recovery from failure; screenshots alone are insufficient.

## 6. Content generation and grounding

### Plan generation

Input: goal, current knowledge, extracted resources, requested duration if supplied, and draft edits when explicitly regenerating. Documents are untrusted data, not instructions.

Output validated JSON:

```text
PlanDraft = { title, rationale, materialGaps: string[], lessons: LessonOutline[] }
LessonOutline = { title, objective, sourceRefs: SourceRef[] }
SourceRef = { resourceId, page: number | null, excerpt }
```

For PDFs, retain real page numbers; for text use `page: null`. Validate that referenced resources belong to this knowledge base and excerpts occur in extracted text on the cited page. References establish traceability; they do not automatically prove every model claim correct.

If material is too thin for at least three useful, distinct episodes, return a clear needs-more-material result instead of padding or inventing facts. The user adds resources/context and requests the plan again.

### Episode generation

Use the approved outline, learner context, frozen resources, and previous episode's saved script and continuity summary. The first episode introduces the series; later episodes recap what was shared, never assert it was listened to or mastered. Avoid time claims such as “yesterday” after a pause; “last time” remains correct.

Output: `{ title, script, continuitySummary, sourceRefs }`. The script is continuous spoken prose targeting 180–220 words and 90–110 seconds, without questions, bullet lists, quiz prompts, or invented quotations. Word count is guidance for generation, not proof of duration; measured audio must be at most 120 seconds. Illustrative stories are clearly hypothetical. Preserve the goal/current-level tailoring and explain one new concept. No external web enrichment in the MVP. Keep the recap brief so the new concept receives most of the episode.

Validate schema, target word count, known source references, and excerpt matches. One corrective model call is allowed for invalid output. Remaining invalid output is recorded as a retryable generation failure, never narrated/published. A duration-repair script may be shorter than 180 words when needed to meet the hard audio limit. Quality beyond mechanical validation requires representative human review before launch, including narrative flow, factual support, and whether any question slipped through.

Default model: `z-ai/glm-5.3-flash` through OpenRouter, with the model ID configurable by the operator. This is a billed model that supports JSON responses through `response_format`; the app still validates every response against its sources. Test the model on representative material before finalising. Store model ID, prompt version, available usage/cost metadata, and latency for each call. Avoid claiming the hosted deployment is offline or private from its inference providers.

Narrate the persisted valid script using ElevenLabs, a configured preset voice, and `mp3_44100_128`. Select/verify the supported TTS model using the operator account before deployment. Limit returned audio to 8 MiB per episode and measure its decoded duration with an established audio parser. Reject corrupt audio or missing/non-finite/non-positive duration. If duration exceeds 120 seconds, shorten the script using the configured OpenRouter model and narrate it again once. Persist this repair state and attempt so a restart or stage retry cannot reset the repair budget. Revalidate grounding, narrative continuity, and the replacement summary/citations together with the repaired script. If the repaired audio still exceeds 120 seconds, leave the episode failed with a clear error; never publish or push it. An explicit user retry reuses the final repaired script and does not reset its shortening allowance. Never cut off the recording or speed up the narrator to meet the limit. Publish readiness only after the final script, matching citations/summary, and playable audio of at most 120 seconds are stored successfully; enforce this again at the publication boundary.

## 7. Scheduling, work recovery, and push delivery

- Web requests create durable Postgres jobs for resource extraction, plan generation, and approval validation. Successful approval validation creates episode-one work. Long provider calls never happen inside an HTTP request.
- One worker polls every 30 seconds; process one job at a time for MVP cost control. Persist a five-minute lease with heartbeat every 30 seconds; recover expired jobs after restarts. Final writes require the current lease token.
- The worker also discovers active courses due for a new episode. Maintain a unique `(course_id, lesson_index)` episode constraint and unique stage-job keys. Use transactional claims (`FOR UPDATE SKIP LOCKED`) rather than in-memory deduplication.
- Calculate the next target from the course's IANA timezone and local delivery time. For DST gaps use the first valid local instant after the gap; for repeated times use the earlier occurrence. Publish at most one episode per course per local date, including approval/resume paths. Store the last publication instant and its timezone/date; settings changes cannot move next eligibility earlier than 24 hours after the last publication, preventing rapid timezone changes from bypassing the limit.
- At approval, calculate lesson two's target on the following local date. For subsequent readiness, advance the next target to the first configured slot on a local date after publication. After an outage, release only the next sequential episode, then schedule the following one for the next local day; never dump a backlog in one run. The final lesson marks the course completed.
- A target is a generation start time, not a guaranteed completion deadline. Display that language accurately. Pausing stops new generation claims; a valid in-flight result may be saved but cannot become ready or send push until resumed. Resume may publish this saved result instead of paying to recreate it.
- Persist extraction, plan, script, audio, and push as separate job stages where external calls are involved. Saved scripts/audio are reused on retries. Retry transient failures up to three attempts per stage, with delays of one and five minutes; invalid credentials/non-retryable requests fail immediately. Expose failed state and an explicit retry action in setup or settings, not extra player controls.
- A paused episode with stored audio remains unpublished in generating state. The due-course loop can publish that existing audio after resume and eligibility checks; it must not depend on recreating an already-succeeded audio job. Use the same transactional publication operation for audio completion and resumed saved results.
- Provider calls have finite timeouts (model 120 seconds, TTS 180 seconds, push 15 seconds). A crash after a provider accepts work can still cause a duplicate charge on retry. Do not promise exactly-once external calls.
- Push is queued only after an episode becomes ready. Use a unique episode/subscription key and an episode-specific notification tag; retries may cause repeat delivery. Remove subscriptions on 404/410. A push failure never hides or regenerates a ready episode.
- Deletion, pause, and logout are rechecked at the appropriate stage before publication/push. Logs record IDs, stage, attempt, timings, provider status and available cost metadata; never log uploaded text, passwords, tokens, or full scripts.

## 8. Data and API boundaries

Use UUID identifiers and UTC timestamps. Core records:

| Record | Required data |
|---|---|
| users / sessions | Unique account identifier, salted password hash; opaque hashed session token, expiry, user ID |
| knowledge_bases | Owner, title, topic, goal, current knowledge, created time |
| resources | Knowledge-base ID, filename, media type, original bytes, extracted text/pages, extraction state/error |
| courses | Knowledge-base ID (unique), draft/validating/active/paused/completed state, plan revision/JSON, approved snapshot, timezone, delivery time, next due UTC, last publication instant/local date/timezone |
| episodes | Course ID, ordered index, pending/generating/ready/failed state, script, summary, citations, MP3 bytes, actual duration, ready time |
| jobs | Kind, unique key, payload IDs, pending/running/succeeded/failed state, attempt, available time, lease token/expiry, safe error |
| playback | User + episode (unique), saved position seconds, finished flag, updated time |
| push_subscriptions / push_deliveries | User, endpoint and encryption keys; episode/subscription delivery state and attempts |

All endpoints except health, public static assets, VAPID public key, and auth require sessions and owner checks. Audio and originals are private too. A non-owner gets 404. State-changing requests require same-origin validation plus a CSRF token. No provider secrets in the client bundle. Server validates types, sizes, counts, plan revision, source ownership, and schema limits.

API groups (exact route contracts are carried into the implementation plan): auth/session; knowledge-base CRUD; resource upload/status/delete; plan generate/read/update/approve; course settings/retry; episode metadata/audio/progress; push subscribe/unsubscribe. Approval returns 202 while validation runs; repeated approval of the same revision returns that validation state or the existing course without duplicate work. Resource/draft mutations serialize against approval and reject a stale revision with 409; mutations while validating are rejected with a clear wait message.

Store passwords with Node's scrypt and random salts, sessions with HttpOnly/Secure/SameSite=Lax cookies and seven-day expiry. Apply account/IP rate limits to signup/login and generation actions with bounded persisted counters. Bound accounts to three knowledge bases and one course each to constrain paid workload. Rich documents/transcripts are rendered as escaped text, not executable HTML.

Push endpoints are untrusted input even when presented as browser subscriptions. Restrict outgoing delivery to legitimate HTTPS push-service destinations, reject local/private/reserved addresses and embedded credentials, and do not follow redirects to unchecked hosts. Validate ownership before replacing/removing a subscription.

Player audio endpoint supports authenticated `GET`/`HEAD`, `Content-Type: audio/mpeg`, byte ranges (`206`, `Content-Range`, `Accept-Ranges`), and `416` for unsatisfiable ranges. The service worker must not cache private API, resource, transcript, or audio responses. Persist playback every five seconds while playing and on pause/seek/end; use `sendBeacon` on page exit as best effort. Clamp positions to actual duration; completion means within the last five seconds or an ended event, not learning mastery.

## 9. Deployment and operations

Render Blueprint defines one web service, one background worker, and one managed Postgres database. Both processes use the same immutable build and database URL. Production web serves the Vite build and API from one origin. Run versioned SQL migrations once via a release/pre-deploy step, not concurrently from both processes.

Required operator settings: `DATABASE_URL`, `APP_ORIGIN`, `SESSION_SECRET`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Do not generate different VAPID keys on every deploy. Support a documented no-push mode if VAPID settings are absent; audio generation still works. Health checks expose no secrets; worker heartbeat is recorded for diagnosis.

Use paid-capable always-running worker/database plans as needed; do not promise a free deployment. No infrastructure is provisioned, provider requests made, or notifications sent while only writing these documents. During implementation, deployment and paid smoke tests follow the user's authorised scope and available credentials.

## 10. Acceptance criteria

1. Two accounts cannot access each other's knowledge bases, uploads, scripts, audio, playback, or push subscriptions.
2. Upload a valid text PDF and Markdown file; view extraction success and actual PDF page references. A scanned PDF and oversized file receive useful errors.
3. The configured OpenRouter model proposes a source-mapped 3–30 episode plan. User can change count, edit objectives, reorder lessons, and approve the displayed revision.
4. Approval generates episode one immediately; duplicate approval and restart do not create duplicate episode rows.
5. Every published episode has measured audio duration greater than zero and at most 120 seconds, with a clear narrative and new concept, no questions; a later episode accurately recaps its predecessor without implying listening/mastery. An overlong recording is repaired once or fails without publication; a recording of exactly 120 seconds is allowed.
6. With the app closed, a due course produces the next audio episode. A restart recovers work; overdue courses release sequentially without a backlog burst. DST and timezone cases pass deterministic tests.
7. A user can pause, resume, seek, and return to the saved position. Real range requests work; there is no autoplay.
8. On a supported real mobile device, installation opens standalone. Opt-in push opens the ready episode. Denied/unsupported push still permits the complete listening journey.
9. Paused/deleted courses do not publish new episodes or leak notifications; retrying failed push does not regenerate audio.
10. A real OpenRouter → ElevenLabs smoke run is reviewed for factual grounding and narrative quality; mocked tests alone do not establish this.
11. Responsive browser E2E, relevant automated tests, typecheck and production build pass before a completion claim.
12. Provide README setup/deployment instructions, architecture explanation, known limitations, and a DEV submission draft with demo/code/partner categories and measured observations. OpenRouter/GLM, ElevenLabs, and Render are intended categories; eligibility depends on the actual implemented use.

## 11. Non-goals and remaining builder choices

No email delivery, Browserbase, native apps, quizzes, chat, voice selection, playback-speed controls, offline audio, external knowledge enrichment, OCR, URL crawling, adaptive mastery scoring, billing, social sharing, or plan revisions after a course starts. Delete/recreate is the MVP route for changed source material.

Builder chooses the visual design, exact dependency patch versions, source excerpt formatting, accessible icon assets, and CSS layout. Use a calm listening-first interface, clear status copy, touch-friendly controls, keyboard access, and visible focus states. Final branding is not a prerequisite.

## 12. Evidence and challenge submission

- Challenge, template, deadline and judging: https://dev.to/challenges/hacktoberfest-week3-2026-10-19 — deadline October 25, 2026, 11:59 PM PDT; new project/repository within the challenge window; writing quality weighted highest. Capture a demo and explain why the open model is essential. Any post-deadline changes must be disclosed as required by the rules.
- Current model: https://openrouter.ai/z-ai/glm-5.3-flash — model ID and endpoint capabilities checked October 25, 2026; recheck availability with the actual key before deployment.
- Render background workers: https://render.com/docs/background-workers — continuous processes suitable for asynchronous provider work.
- ElevenLabs narration API: https://elevenlabs.io/docs/api-reference/text-to-speech/convert — text-to-speech endpoint, preset voice and MP3 output.
- Apple web push requirements: https://webkit.org/blog/13878/ and https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers — Home Screen installation and explicit permission on supported iOS/iPadOS.

These are documentation checks, not proof of a deployed system. Submission should show the initial generated episode plus a subsequent scheduled episode; a compressed test clock may demonstrate daily behavior if labelled honestly. Do not claim measured retention or weeks of use from a short demo.
