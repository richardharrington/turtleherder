# Handoff: One front-end push (Roadmap milestone 3)

You are picking up **milestone 3 of the roadmap** in `DESIGN.md`: rebuild
every client page in the new design language, and add the auth UI. Read
these in full before touching code:

1. `DESIGN.md` — authoritative spec and decision log, especially the "Auth
   design" section and its "Decision log (auth implementation interview)"
   subsection.
2. `REDESIGN.md` (repo root) — the visual/UX spec this milestone builds
   from: color palette, typography, component specs, page layouts,
   responsive breakpoints, PWA shell. It is a separate document from
   DESIGN.md by design; don't merge them.

## How Richard works

- He settles open questions via **/grill-me interviews**: present options,
  let him choose, and reveal your own recommendation only **after** he
  picks (then argue for it if you feel strongly).
- The **visual/UX design is settled** in REDESIGN.md — don't re-litigate
  colors, typography, breakpoints, nav pattern, or component shapes. Grill
  only on genuine *implementation-level* unknowns (e.g. exact component
  boundaries, how routing changes for the wall, state management details)
  that neither document resolves.
- Commit at each milestone boundary — and reasonable sub-boundaries within
  this one, e.g. "PWA shell", "attendance controls", "auth UI" — with a
  real message, when he says to. Don't batch unrelated work into one commit.

## Dependency: auth backend (milestone 1) — done

Milestone 1 is complete and merged (verified July 2026: `GET /join/:token`,
session middleware on `/api/teams/:slug/*`, captain endpoints, and `/me`
are all wired into `server/src/app.ts` and covered by tests). Read
DESIGN.md's "Auth implementation notes (milestone 1, backend built July
2026)" subsection for the full as-built contract; summary below. Still
worth a quick sanity check (`pnpm test`) before you start, but the API is
real, not aspirational.

**The API contract you build against:**

- `GET /join/:token` — lives *outside* `/api` (browser navigation, not a
  fetch). Valid token → sets the `th_session` cookie (httpOnly, SameSite=Lax,
  1 year, rolling renewal throttled to once/hour), 302 to `/:teamSlug`.
  Invalid/revoked → 302 to `/?join=invalid` (`INVALID_JOIN_REDIRECT` in
  `shared/src/schemas.ts`). The wall/home page should read that query param
  and show "that link didn't work — ask your captain for a fresh one."
- Every `/api/teams/:slug/*` endpoint requires a session for that team.
  Signed-out, expired, wrong-team, or nonexistent-team → uniform
  `401 {"error":"unauthorized"}` (no enumeration). Signed-in non-captain on
  a captain endpoint → `403 {"error":"forbidden"}`.
- `GET /api/teams/:slug/me` → `{ playerId, name, isCaptain }`
  (`meSchema` in `shared`). Backs the personal question card and the
  captain-only nav gating; team data itself stays auth-agnostic.
- Captain endpoints: `GET /api/teams/:slug/access` → list of
  `playerAccessSchema` (`shared`) — each player's current join link, or
  `joinToken: null` + a `revokedAt` timestamp if revoked.
  `POST /api/teams/:slug/players/:id/regenerate-token` and
  `POST /api/teams/:slug/players/:id/revoke-token` — both invalidate the
  player's existing sessions server-side.
- Client-side: on any `401`, route to the friendly wall. TanStack Query's
  error handling is the natural hook point — check how `api.ts` currently
  surfaces errors before adding new plumbing.
- e2e fixtures already sign in as captain "Alison Bechdel" via a
  Playwright `storageState` file written in `e2e/global-setup.ts` — reuse
  that pattern for new specs rather than re-deriving sign-in.

## Scope: full front-end rebuild

Rebuild against REDESIGN.md, page by page. Existing pages to redo in the
new design language (currently faithful-2010-CSS versions):

- **Schedule/home** (`/:teamSlug`) — add the personal question card at
  top (about the next non-bye future game, omitted when none), sticky
  past/future toggle, segmented attendance controls, bottom nav
  (mobile) / sidebar (desktop).
- **Single game** (`/:teamSlug/games/:id`) — same personal question card,
  about that specific game.
- **Roster management** (`/:teamSlug/players`) and **game management**
  (`/:teamSlug/games`) — list + add/edit/delete, new design language.
- **Player form** and **game form** — per REDESIGN.md's form specs. Game
  form's date/time input is a **styled native `datetime-local`**, not a
  custom picker (REDESIGN.md's decision, ceiling explicitly set — don't
  build a custom calendar).

New pages (auth UI, not built yet at all):

- **Friendly wall** — signed-out visitors. Minimal banner: "Ask your
  captain for your link." Reads `?join=invalid` to show the
  invalid-link variant. Nothing about the team leaks, ever — this page
  must render identically regardless of why the visitor is signed out.
- **Manage-access page** (captains only) — per player: name, current
  join link, regenerate, revoke. Mobile: reveal-on-tap. Desktop
  (≥1024px): all links visible in a table. Gate the nav link to captains
  only (check `/me`'s response), but the route itself must also handle a
  non-captain hitting it directly (403 from the API — show something
  reasonable, don't crash).

Also in scope:

- **PWA shell** — manifest.json, icon set (turtle silhouette on
  `#5ec942` green, 192px + 512px), `display: standalone`, theme color
  `#5ec942`. Spec is in REDESIGN.md's "PWA" section.
- **Playwright suite** — update to cover the join flow (`/join/:token` →
  cookie → redirect) and the wall (signed-out visitor sees it, invalid
  token shows the right copy). The existing 6 e2e flows should keep
  passing; milestone 1 already handled making them work *with* the wall
  active (sessions established in `e2e/global-setup.ts`) — you're adding
  coverage *of* the wall/join flow itself, which is new ground.

## Out of scope

- **Custom calendar/date picker** — REDESIGN.md set the ceiling at
  "style the native input well." Don't build one.
- **Multi-team switching UI** — came up in the redesign interview as a
  real future need but is explicitly not scoped here. Sessions/UI assume
  one team per visit, as today.
- **Landing page + tip jar** (milestone 7), **self-serve team creation**
  (milestone 6), **push notifications** and **React Native** (parking
  lot) — don't design or build any of these; noting seams is fine.
- **Component library / Storybook** — REDESIGN.md notes this as a
  possible future formalization, not required now.

## Existing behaviors to preserve

Unless REDESIGN.md says otherwise: the roster report's grammar engine
output (unstyled logic, only its presentation changes), the past/future
game split with the persisted `localStorage` toggle, bye-week rendering
("Bye week." with no roster), delete confirmations.

## Coordination

- The auth-backend agent wrote only server/shared code and appended to
  DESIGN.md — no conflicts expected in `client/`.
- The redesign-interview agent wrote only `REDESIGN.md` — untouched by
  anyone else.
- Docker Postgres via `pnpm db:up`; suites: `pnpm test` (unit +
  integration), e2e in `e2e/` (ports 3100/5199, workers: 1).
