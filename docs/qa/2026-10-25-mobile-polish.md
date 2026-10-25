# Mobile first polish verification

Date: 2026-10-25
Branch: `design-change`

## Scope

Refined the existing warm paper and forest-green interface across account setup, library, knowledge-base resources, plan editing, episodes, player, and listening settings. Preserved the approved “Small listens. Steady learning.” message and minimal player controls.

- Rebuilt responsive CSS with phone defaults and larger-screen enhancements.
- Increased small text, placeholder contrast, field sizes, and touch targets; added safe-area spacing, a skip link, and visible keyboard focus.
- Removed redundant section labels, reduced nested panels, and made resources and plan explanations expandable.
- Prioritized episodes after approval; kept the learning goal in the plan explanation.
- Added inline form errors and first-invalid-field focus, visible unsaved-edit guidance, plan locking during approval, and failed-episode retry through the existing endpoint.
- Kept settings feedback beside its action. Notification setup checks server availability before offering permission-dependent actions.
- Enlarged the seek target, labelled its value in seconds, and removed continuous playback-percentage announcements.

## Automated checks

- `npm run build`: passed, including TypeScript checks.
- `npm test`: 13 tests passed across 7 files.
- `git diff --check`: passed.
- New regression checks cover misleading paused-library actions, title-field remounting/focus loss, and notification permission requests when notifications are unavailable. Each regression was observed failing before its fix.
- Updated the existing Playwright scenario for the current headline and episode-to-knowledge-base navigation. The Playwright runner was not run in this pass; the browser flow below was exercised through native Chrome automation.

## Browser checks

Used Chrome desktop and device emulation at 320 × 780, 360 × 780, 393 × 852, and 768 × 1024. Inspected the full desktop layout and settings at 200% browser zoom. Representative screens showed no visible horizontal overflow.

The isolated mock preview at `http://127.0.0.1:5174` uses API port 3001 and database `bit_by_ear_polish_20261025`. Its worker uses mock providers and has push disabled. Normal local data and keys were preserved. The preview used the same browser profile and hostname: browser cookies are shared across ports, so the test sign-in replaced the normal app's login cookie. Sign in again on port 5173 when returning to the normal database. Future browser checks should use a separate profile or hostname.

Completed in the browser:

- Account creation and inline validation.
- Knowledge-base creation and required-field feedback.
- File upload and extraction, including a long filename.
- Plan generation, continuous title typing, saving, invalid-edit recovery, and approval with locked controls.
- Episode-library access and return navigation from the player.
- Failed-episode retry, followed by a ready episode.
- Playback and pause using a copy of an existing 82.6-second local recording; drag seeking and keyboard seeking changed the displayed position correctly.
- Time-zone saving and visible saved feedback; pause and resume feedback.
- Notification-unavailable guidance without requesting browser permission.

## Contrast measurements

Calculated from the implemented CSS colors, without rounding before comparison:

| Pair | Contrast |
| --- | --- |
| Body text on paper | 11.11:1 |
| Helper text on paper | 5.07:1 |
| Helper text on cards | 5.53:1 |
| Placeholder text on white | 5.00:1 |
| Control borders on white | 3.35:1 |
| Primary button text | 9.51:1 |
| Error text on its surface | 6.44:1 |
| Success text on its surface | 6.75:1 |

## Limits of this verification

Device checks used browser emulation, rather than physical iOS/Android devices. Real push delivery, Home Screen installation, and new live-provider generation were not exercised. No provider credits were spent. These checks are not a complete accessibility certification.

Vite still reports the existing large JavaScript chunk warning: the final main bundle is approximately 740 kB before compression, 222 kB gzip. Route splitting and measured performance work remain separate follow-up work.
