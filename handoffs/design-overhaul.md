# Handoff: Design overhaul (Roadmap milestone 5.75)

You are picking up **milestone 5.75 of the roadmap** in `DESIGN.md`: replace
the shipped mobile-first UX (which failed in use) with the legacy site's
information density in modern styling. Read these in full before touching
code:

1. `DESIGN.md` — authoritative spec and decision log. The **"Design
   overhaul" section is your spec**; its decision-log table is settled.
2. `REDESIGN.md` — now carries a superseded banner. Its visual/interaction
   specs are **dead**; still honored from it: PWA shell decisions, the
   native `datetime-local` ceiling (no custom picker), responsive
   breakpoints, 44px touch targets, WCAG contrast.

Do not read `notes.txt` or `Untitled*.txt` at the repo root — private
scratch files, not agent input.

## How Richard works

- He settles open questions via **/grill-me interviews**: present options,
  let him choose, and reveal your own recommendation only **after** he
  picks (then argue for it if you feel strongly). Include an explicit
  "Other — type something" option in every AskUserQuestion.
- The **design is settled** — do not re-litigate anything in the design
  overhaul section or its decision log. Grill only genuine
  implementation-level unknowns (exact palette token values — especially
  the dark theme, which he called out as needing real tuning; sticky-header
  mechanics; animation details).
- Commit at reasonable sub-boundaries (e.g. "tokens + fonts", "schedule
  page", "remaining pages") with real messages, when he says to.

## What this milestone is (and isn't)

**Client-only.** CSS/tokens, components, and page layouts. No schema
changes, no API changes, no route changes, no new endpoints. The
`shared/src/report.ts` grammar engine's *output* is used as-is; only where
and how it renders changes. If you find yourself editing `server/` or
`shared/`, stop — you've left the milestone. (One exception: nothing. The
coed-rules work that would touch shared/server is explicitly deferred —
see DESIGN.md's "Deferred: the coed-rules cluster".)

## The work, per surface

**Design tokens first** (`client/src/main.css`):

- Palette: green page (descended from legacy `#b4dd90 → #83bf56`), white
  cards, status colors (green/red/orange/grey). Light sketch values in the
  spec section are a starting point, not gospel. Dark theme via
  `@media (prefers-color-scheme: dark)` only (no toggle, no `data-theme`
  machinery) — neutral dark surfaces, green as accent, **not**
  olive-tinted cards (explicitly rejected). Both themes need WCAG contrast
  on the status colors.
- Type: `--font-body` becomes
  `Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", sans-serif`;
  `--font-heading` becomes the same stack, applied at weight 800 with
  `letter-spacing: -0.025em`. Remove the Merriweather and Inter
  dependencies entirely (check `client/src/main.tsx` and `package.json`
  for `@fontsource` imports — dropping them removes the only font
  downloads).
- `theme-color` meta (`client/index.html`) and `manifest.webmanifest`
  colors will need to match the new page green. PWA icons stay.

**Schedule page** (`/:teamSlug`, the core of the milestone):

- Kill the giant question card and per-player button stacks.
- Compact status strip at page top ("You: no response yet for Saturday →");
  targets the next non-bye future game (same semantics as the old card);
  omitted when none; persists after answering as "You: playing Saturday ✓";
  tap scrolls to + expands your row.
- Game cards: sticky heading (date · time · opponent) pinned while
  scrolled within the card; roster report sentences at top of card; then
  dense rows (dot, semibold name, muted phrase, chevron).
- Row expansion: whole row tappable on phone, explicit edit affordance at
  desktop widths; one open at a time; short question ("Bob, will you be
  playing?" self / "Will Bob be playing?" others) + three small buttons,
  always tinted (Yes green / No red / Not sure orange), solid when
  selected; ~500ms confirm then auto-collapse.
- Past games: one-liners ("Sun, Mar 7 vs Mad Max — 5 confirmed
  attendance"), tap to expand the locked past-tense roster. Keep the
  existing past/future toggle + localStorage persistence. Bye weeks render
  "Bye week." as today.
- Desktop: single centered column (~640–720px) beside the sidebar.

**Single-game page**: same card treatment; its personal-question card is
replaced by the same strip + expansion pattern, scoped to that game.

**Nav** (`TeamLayout.tsx`): structure untouched (bottom tabs / desktop
sidebar, Access captain-gated) — restyle only.

**Manage pages** (players, games) and **access page**: phone layouts
restyled; each gains a distinct desktop treatment — these are
table-shaped lists, render them as real tables at desktop widths. Access
keeps its mobile reveal-on-tap / share-friendly flow.

**Forms** (player, game): restyle; keep native `datetime-local`. Player
form's checkbox becomes the category noun + helper line stating the rule
("Woman — the league requires at least two on the field") — data comes
from the existing `quotaNounSingular/Plural` + `minQuotaPlayers` team
fields; **do not** touch the underlying `countsTowardMinimum` model.

**Wall page**: restyle only, phone-first.

## Existing behaviors to preserve

Report grammar output verbatim (placement/styling changes only); uniform
401 → wall routing; the attendance lock's past-tense rendering rules
(5.5); delete confirmations; join-flow redirect handling; PWA
installability.

## Tests

- Playwright: existing suite (e2e/, ports 3100/5199, workers: 1, captain
  fixture "Alison Bechdel" via `storageState` in `e2e/global-setup.ts`)
  must keep passing — expect to update selectors/flows for the new row
  expansion (the old segmented controls are gone) and add coverage for:
  strip jump-and-expand, one-row-at-a-time, answer → collapse → dot/phrase
  update, past-game expand.
- `pnpm test` for unit/integration (should be untouched by a client-only
  milestone, but run it).
- Docker Postgres via `pnpm db:up`.

## Out of scope

- **Coed rules model** — storage, shorthanded math, min-to-start, percent
  rules, report-grammar changes. Deferred to a second grill session
  (DESIGN.md records the facts). The checkbox relabel above is the only
  quota-adjacent change.
- **Keyring** (milestone 6), **self-serve** (7), **landing/tip jar** (8).
- **Custom date picker** — ceiling unchanged.
- **Manual dark-mode toggle** — system-following only.

## Coordination

- A live fake team ("Bobcats", 3 players) exists in production for eyeball
  checks; Richard has the join link. The legacy site is still viewable at
  `98.129.229.120` via Host-header/`--resolve` tricks if you need the
  reference design.
- This milestone's docs (DESIGN.md section, REDESIGN.md banner, this file)
  were written by the design-interview session; you own only code.
