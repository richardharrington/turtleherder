# Handoff: Design refinement (roadmap milestone 5.8)

Implement the **Design refinement** section of `DESIGN.md`. It is the
authoritative spec and its decision log is settled. Read that section in
full, plus the 5.75 Design overhaul and 5.5 Roster history sections for the
behavior being refined. Do not read root `notes.txt`, `Untitled*.txt`, or
`league-rules-questions.md`; they are private/separate scratch work, not
implementation input.

Terminology matters:

- **Current React app** = this repository and the app live at
  turtleherder.com. This is what you are changing.
- **Legacy PHP site** = the 20-year-old code/site. It supplied useful ideas
  during critique but is not an implementation or compatibility target.

The design was settled in a /grill-me interview. Do not re-litigate product
choices. Ask only genuine build-level questions (for example final tuned
light palette values after visual comparison, or a browser limitation in
animating auto-height). If using an AskUserQuestion tool, always include an
explicit “Other — type something” choice and reveal your recommendation only
after Richard chooses.

## Scope

This is mostly client work, with one deliberate backend/shared/migration
addition: durable first-use state for the **current** join token. It does not
include dominant-group nouns or any other coed-rules work. Until that later
model ships, non-quota player summaries truthfully show an em dash.

No compatibility is required for the current React app's dedicated form
routes: remove `/players/new`, `/players/:id/edit`, `/games/new`, and
`/games/:id/edit` along with standalone form presentations. The shareable
single-game route `/games/:gameId` stays.

## Suggested implementation boundaries

### 1. Token-use fact (migration + server/shared)

- Add nullable `player.join_token_used_at timestamptz`, with no backfill.
- Extend `PlayerAccess` and access SQL with nullable ISO
  `joinTokenUsedAt` (or a clearly justified equivalent contract name).
- A successful valid/current/active token exchange sets first use once.
  Repeat joins preserve the first timestamp. Regenerate resets it to null;
  revoke preserves it. Invalid, revoked, and departed tokens never mark it.
- Keep the exchange race-safe: a join already validated against an old token
  must not mark a concurrently generated replacement token as opened. Make
  usage marking part of the successful current-token exchange, not an
  eventually consistent UI write.
- Add server integration coverage before moving to UI.

Likely files: a new migration after `1752900000000_roster-membership.cjs`,
`shared/src/schemas.ts`, `server/src/data/access.ts`, session/join data code,
`server/src/app.ts`, and `server/src/app.test.ts`.

### 2. Shared row/form primitives

Build a reusable disclosure/form shell rather than duplicating fragile dirty-
draft behavior across Players and Games:

- whole summary row activation, keyboard support, `aria-expanded`;
- one open row/draft per page;
- 160–180ms height/fade + chevron, reduced-motion instant;
- dirty-state detection and inline discard confirmation;
- browser `beforeunload` warning for dirty drafts;
- separated Cancel / compact Save footer;
- inline destructive confirmation;
- pending, success-beat, and retryable error states.

Do not introduce modals, native confirm dialogs, toasts, overflow menus, or a
component dependency. Preserve 44px targets. Be careful not to make form
controls inside an expanded row toggle their parent.

### 3. Players and Games

- Fold form logic from `PlayerFormPage.tsx` and `GameFormPage.tsx` into
  reusable inline forms owned by the list pages; then remove obsolete routes
  and standalone pages.
- Add is the final row inside each active list/table and opens a blank form.
- Desktop expansions are full-width table rows; mobile expansions are list
  details. Use the exact responsive field layouts in DESIGN.md.
- Player summaries show Name + title-cased quota noun or em dash.
- Former players stay captain-only. They expand to Add back (confirmed) and
  permanent purge (confirmed). Purge moves out of active editing.
- Games remain date-first. Desktop columns are Date/time, Opponent, Color,
  disclosure. Keep native `datetime-local` and all timezone conversion.
- Remove/Delete semantics and server guards are unchanged; only their
  presentation changes.
- Management saves are pessimistic: pending label, wait for server, show
  success for ~500ms, then collapse. Preserve drafts on failure.

### 4. Access

- Replace mobile action stacks and desktop action-button clusters with dense
  disclosure rows. Copy stays directly available in the summary; full URL is
  visible when expanded.
- Show Never opened / Opened from the durable token field. Revoked rows also
  preserve that usage state.
- Implement the nested Manage link disclosure and exact regenerate/revoke
  success, confirmation, error, and recovery states from DESIGN.md.
- Clipboard success says `Copied!` for ~2s; failure says `Copy failed`.
- Access operations wait for the server; no optimistic token state.

### 5. Schedule + visual calibration

- Replace dots/full phrases with the settled short colored phrases. Ensure
  light and dark status colors meet WCAG contrast as text on card surfaces.
- Implement one-line name/status grid: name ellipsis, untruncated status,
  second-line emergency fallback only at extremely narrow widths.
- Make attendance fully optimistic across selected control, roster phrase,
  report, and personal chip. Roll all cache/UI surfaces back together on
  failure. Collapse at `max(tap + 500ms, success)`, not success + 500ms.
- Compact sticky headings, status chip/date/title copy, past placement/count/
  ordering/wording, card spacing, and removal of desktop Edit labels all
  follow DESIGN.md exactly.
- Tune the light vertical green in actual browser screenshots, starting near
  `#b4dd96 → #86c264`; update HTML/manifest theme color. Do not reintroduce
  legacy repeating bands/heavy shadows. Preserve the current neutral-card
  dark-mode direction.
- Apply the calibrated type hierarchy without assuming every system font has
  intermediate weights.

## Tests and verification

Testing is required, not optional selector cleanup.

### Server integration

Cover token usage null → first redemption, repeat preservation, regenerate
reset, revoke preservation, non-marking invalid/revoked/departed links, API
shape, and race safety where practical.

### Playwright

Update obsolete form-route flows and add focused coverage for:

- inline player/game create and edit;
- one row open, dirty discard confirmation, and navigation blocking;
- remove/delete confirmations;
- former add-back and permanent purge;
- Copy feedback; Never opened → Opened through an actual join; regenerate
  reset/new URL; revoke state;
- optimistic attendance before a deliberately delayed response, minimum
  500ms + success collapse gate, and complete rollback on forced failure;
- past count, newest-first order, wording, and expansion;
- at least one mobile-list and desktop-table flow, keyboard disclosure, and
  reduced-motion behavior.

Keep timing tests tolerant: prove “not before” and eventual state rather than
sleeping for an exact animation frame. Preserve auth/wall, attendance lock,
localStorage, delete semantics, join redirects, and PWA installability.

### Unit tests

Do not create client unit infrastructure merely for CSS or component wiring.
Add unit tests only for a meaningfully branchy pure helper extracted during
implementation (compact current-year date formatting or optimistic cache
transformation are candidates). Existing shared date/report units stay
untouched and green.

Run:

```sh
pnpm db:up
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
```

Visually inspect phone, tablet, wide desktop, light, dark, keyboard focus,
and reduced motion. Do not add screenshot snapshots unless they prove stable
enough to own long-term.

## Commit guidance

Use reasonable real boundaries, for example:

1. token-use migration + contract + integration tests;
2. disclosure/form primitives + Players/Games;
3. Access;
4. schedule/visual calibration + e2e updates;
5. as-built documentation adjustments.

Do not commit unrelated scratch files.
