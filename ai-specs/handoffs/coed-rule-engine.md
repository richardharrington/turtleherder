# Handoff: coed rule engine (milestone 6.5)

Implement the coed rule engine designed in DESIGN.md →
[Coed rule engine (designed July 2026, build in milestone 6.5)](../DESIGN.md#coed-rule-engine-designed-july-2026-build-in-milestone-65).
Read that section first; this doc is the build plan, not the rationale. The
league research behind it (with verbatim rule quotes and sent emails) is in the
repo-root `league-rules-questions.md`.

## Scope in one paragraph

Generalize the roster quota from two hard minimums to a six-parameter engine that
computes the **largest legal side** a turnout can field, then rewrite the report
as pure grammar over the engine's status object. Parameters are entered through
`db:create-team` (no captain-facing config UI — that's milestone 7). Ship the
engine, not any league's answers; nothing here blocks on pending league emails.

## How to work this handoff

- **The acceptance-case table in §1c is the specification of the engine.** Treat
  every row as a test to write first and then make pass — not prose to skim. If
  the engine passes that table (and the report tests in §1d), it is correct.
- **If anything is ambiguous or underspecified, stop and report it — do not
  invent an answer.** A surfaced gap tells the authors where this document is
  thin; a silently-filled one ships a guess. Note the spot and what's unclear.
- **Stay inside the guardrails at the bottom.** Two of them need no code but are
  easy to violate: don't introduce a discriminated-union rule object or any
  config UI (both deliberately deferred), and keep all rule logic in the engine
  so `report.ts` stays pure grammar.

## Environment & conventions

This is a **pnpm workspace monorepo** (`pnpm@11`, Node ≥24, TypeScript
throughout, ES modules). Four packages (`pnpm-workspace.yaml`): `shared` (zod
schemas + types + the report/engine, imported by both sides as
`@turtleherder/shared`), `server` (Hono API on Node), `client` (Vite + React 19 +
React Router + TanStack Query), `e2e` (Playwright). The server uses **raw
parameterized SQL via `pg`**, confined to one data-access module per resource
(`server/src/data/*.ts`); migrations are **node-pg-migrate**. The same zod schemas
in `shared` type both client and server — there is one typed contract, so a
schema change is a coordinated client+server change in the same commit.

**Commands (run from repo root):**

- `pnpm typecheck` — `tsc --noEmit` across all packages.
- `pnpm build` — builds all packages (client does `tsc --noEmit && vite build`).
- `pnpm test` — vitest unit suites in `shared` and `server` (this is where the
  engine and report tests run).
- `pnpm test:e2e` — Playwright suite (the `e2e` package).
- `pnpm db:up` — start the Postgres container (Docker Compose).
- `pnpm db:migrate` / `pnpm db:migrate:down` — apply / roll back migrations.
- `pnpm db:seed` — run `server/src/seed.ts` (truncates + reseeds).
- `pnpm db:create-team -- --name … --slug …` — the operator create-team CLI.

CI runs typecheck, build, and all three suites on every push and PR; branch
protection requires them green. **Both commits must pass all of the above
independently.**

**Pattern files to imitate (match their style exactly):**

- Migration: `server/migrations/1753000000000_join-token-used.cjs` — a `.cjs`
  module exporting `up(pgm)` / `down(pgm)`, using `pgm.addColumns` /
  `pgm.dropColumns` / `pgm.sql`, with a header comment explaining intent. Files
  are named `<epoch-ms>_<kebab-title>.cjs`; use a timestamp greater than the
  latest existing one.
- Zod schemas + inferred types: `shared/src/schemas.ts` (e.g. `teamSchema` and
  `export type Team = z.infer<typeof teamSchema>`).
- Unit tests: `shared/src/report.test.ts` — vitest (`describe`/`it`/`expect`),
  with small fixture builders like the `bobcats(...)` helper.
- Data-access mapping: `server/src/data/teams.ts` (row type → domain object).
- CLI: `server/src/create-team.ts` — `node:util` `parseArgs` + a zod `argsSchema`
  with a `.refine`, a `USAGE` string, and friendly `fail()` messages.
- Report consumer on the client: `client/src/GameCard.tsx` (calls `rosterReport`).

## The parameters

Per-team (one stored ruleset = one side size; all examples at 7v7):

| Param | Type | Default | Meaning |
|---|---|---|---|
| `fullSide` | int | (required) | Players at full strength; upper bound on the side. |
| `minToPlay` | int | (required) | Forfeit below this. `minToPlay == fullSide` ⇒ no shorthanded. |
| `menCeiling` | int \| null | `null` | Max men on the field; null = no cap. Never forfeits. |
| `womenFloor` | int \| null | `null` | Min women/NB on the field; null = no gender minimum. |
| `floorType` | `'play_down' \| 'forfeit'` \| null | `'play_down'` when `womenFloor` set | Qualifies `womenFloor` only. Null iff `womenFloor` is null. |
| `keeperScoping` | `'included' \| 'excluded'` | `'included'` | `excluded` = one free any-gender keeper slot; constraints bind the other `fullSide − 1`. |
| `quotaNounSingular`/`Plural` | string | (existing) | Protected-category display noun. |

**Invariant (enforce in a zod refine in `shared`):** `floorType` is non-null iff
`womenFloor` is non-null. A ruleset with neither `menCeiling` nor `womenFloor` is
legal but must be intentional.

## Commit 1 — capability (request path)

Everything typed-contract-coupled lands together; CI must be green on its own
(existing teams keep working via backfill + defaults).

### 1a. Migration (`server/migrations/`)

node-pg-migrate `.cjs`, next timestamp after `1753100000000_multi-team-keyring.cjs`
(use `1753300000000_coed-rule-engine.cjs`). Follow the existing files' style
(`exports.up` / `exports.down`, `pgm.addColumns` / `pgm.sql`).

- Add columns to `team`: `full_side int`, `min_to_play int`, `men_ceiling int
  null`, `women_floor int null`, `floor_type text null` (check in
  `('play_down','forfeit')`), `keeper_scoping text not null default 'included'`
  (check in `('included','excluded')`).
- **Backfill** from the legacy columns in the same migration:
  - `full_side = min_players`, `min_to_play = min_players` (preserves
    no-shorthanded behavior exactly).
  - `women_floor = NULLIF(min_quota_players, 0)` (0 → null = no gender rule).
  - `floor_type = CASE WHEN min_quota_players > 0 THEN 'play_down' ELSE NULL END`.
  - `men_ceiling` stays null; `keeper_scoping` defaults `'included'`.
- After backfill, set `full_side`/`min_to_play` `NOT NULL`, then **drop
  `min_players` and `min_quota_players`**. Add a partial CHECK for the invariant
  (`(women_floor IS NULL) = (floor_type IS NULL)`).
- `down`: re-add the two columns, `min_players = full_side`,
  `min_quota_players = COALESCE(women_floor, 0)`, drop the new columns.

### 1b. `shared/src/schemas.ts`

- Replace `minPlayers`/`minQuotaPlayers` on `teamSchema` with `fullSide`,
  `minToPlay`, `menCeiling` (`.int().nullable()`), `womenFloor`
  (`.int().nullable()`), `floorType` (`z.enum(['play_down','forfeit']).nullable()`),
  `keeperScoping` (`z.enum(['included','excluded'])`). Keep the quota nouns.
- Add the `.refine` for the `floorType`⇔`womenFloor` invariant.

### 1c. New engine module (`shared/src/`, e.g. `engine.ts`)

Pure function: `(rules, turnout) → RosterStatus`.

- `turnout`: `{ men, women }` where `women` = attending players with
  `countsTowardMinimum`, `men` = the rest. (Names are display shorthand for
  capped vs protected categories.)
- **Compile** the stored knobs to one canonical form — a cap and a hard wall, both
  on the **counted** players (outfield when the keeper is excluded, all `fullSide`
  otherwise) — then run one uniform routine:
  - `countedFull = fullSide − (keeperScoping === 'excluded' ? 1 : 0)` — the slots the
    constraints actually bind; the keeper is exempt when excluded.
  - `effectiveMenCap = min( menCeiling ?? ∞, (floorType === 'play_down' ? countedFull − womenFloor : ∞) )`
    — a cap on **counted** men. `menCeiling` is already stored in counted terms
    (NSC's "4" = 4 *outfield* men; Volo's "5" = 5 *on-field* men, keeper included),
    so the two compose directly.
  - `hardWall = (floorType === 'forfeit') ? womenFloor : 0` — a floor on **counted**
    women.
  - **Use `countedFull`, not `fullSide` — this is the easy bug.** A soft floor of 2
    with the keeper excluded means "2 women among the **6 outfield**," i.e. outfield
    men ≤ 4, so the derived cap is `6 − 2 = 4`, *not* `7 − 2 = 5`. Using `fullSide`
    would allow 5 outfield men + 1 woman + a keeper = a 7 with one woman, breaking
    the **NYC Footy 6,1 → side 6** case. With `countedFull`, NYC Footy (soft floor 2,
    excluded) and NSC (menCeiling 4, excluded) compile to the *same*
    `effectiveMenCap = 4` — they are the same gender rule — so the routine stays
    uniform; you never track whether a cap came from a floor or a ceiling.
  - Keeper: when `keeperScoping === 'excluded'`, one on-field slot is a free
    any-gender keeper, exempt from both `effectiveMenCap` and `hardWall`; they bind
    the other `countedFull` slots. A male keeper is a 5th man the cap of 4 doesn't
    see (NSC 8,0 → side 5). Since the engine optimizes the keeper choice (a man in
    goal when that yields a larger legal side), this never *rejects* a lineup — it
    just sets how large a legal side exists (see the keeper note under the table).
- Return a `RosterStatus` — exactly what the grammar reads, nothing it doesn't.
  The report is a pure function of this one object plus the quota nouns, so it
  **echoes the turnout and `fullSide`** (the "So far we have N…" and "a full N"
  sentences need them):

  ```ts
  interface RosterStatus {
    attendingTotal: number;   // turnout echo: men + women who said yes
    attendingQuota: number;   // turnout echo: protected-category count
    fullSide: number;         // for "a full {fullSide}"
    canField: boolean;        // a legal side of size >= minToPlay exists
    sideSize: number;         // largest legal side (0 when !canField)
    atFullStrength: boolean;  // canField && sideSize === fullSide
    playersNeeded: number;    // additional attendees to fix the current problem
    womenNeeded: number;      //   ...and how many of them must be protected-category
    hasGenderConstraint: boolean; // womenFloor OR menCeiling set — gates the
                              // "K of whom are women" clause in sentence 1
  }
  ```

  Do **not** add fields the report doesn't read — no on-field composition, and no
  forfeit-reason enum (the two shortfall numbers drive the wording).

**Shortfall semantics (`playersNeeded` / `womenNeeded`).** Attendance only grows
(people say yes; you never reassign someone's category), so a fix is always
*adding* attendees:

- **`!canField` (forfeit):** `playersNeeded` = fewest additional attendees to make
  a legal side of size ≥ `minToPlay` possible; `womenNeeded` = how many of those
  must be protected-category. A team can have ≥ `minToPlay` bodies and still be
  `!canField` — e.g. Volo 5 men, 0 women: it must add a woman, so `playersNeeded
  1, womenNeeded 1`.
- **`canField && !atFullStrength` (short-handed):** the team can field a legal side
  but fewer than `fullSide` would play — they're short-handed, which is exactly
  what the app exists to flag (never-block is about *surplus*, not shortage).
  `playersNeeded`/`womenNeeded` = the shortfall to a legal **full side**: fewest
  added attendees, and how many of them must be women. This is the **same shortfall
  shape as the forfeit case**, only aimed at `fullSide` instead of `minToPlay` (and
  nothing is at stake but full strength). The woman-only nudge is just the special
  case where every missing spot must be a woman (`playersNeeded === womenNeeded`);
  a pure body shortage is `womenNeeded 0`; a mix is both. Because the numbers are
  computed *to reach* a full side, the "…it'll be a full `{fullSide}`" promise is
  always accurate. **No cap/floor special case:** a soft men ceiling *is* a soft
  women floor (`menCeiling C ≡ womenFloor fullSide − C`), so a **cap-stored league
  needs women to fill a full side exactly like a floor league**, and the compiled
  `effectiveMenCap` yields the same `womenNeeded`. NSC (cap 4 + keeper = 5 men on
  the field) with 8 men, 0 women fields 5 and needs 2 women for a full 7 — the same
  women-phrased reminder a floor league gets. The *only* thing that suppresses the
  women wording is a genuinely genderless ruleset (no `menCeiling` **and** no
  `womenFloor`), which yields `womenNeeded 0` and the plain "N more players" form;
  it still gets the short-handed reminder, just without the women clause.
- **Otherwise (`atFullStrength`):** both `0`.

**The acceptance cases below are the spec.** Write them as the engine's tests
first, then make them pass. `∞` = "no cap"; the Expected column lists the
`RosterStatus` fields that matter for that row.

| League shape | Params (F,P,cap,floor,type,keeper) | Turnout (m,w) | Expected |
|---|---|---|---|
| Bobcats (no shorthanded) | 7,7,∞,2,play_down,included | 3,2 | `!canField`, `playersNeeded 2`, `womenNeeded 0` (5 bodies < minToPlay 7) |
| Bobcats | 7,7,∞,2,play_down,included | 5,2 | `canField`, `sideSize 7`, `atFullStrength` (all set) |
| Bobcats | 7,7,∞,2,play_down,included | 6,1 | `!canField`, `playersNeeded 1`, `womenNeeded 1` — largest legal side is 6 (< minToPlay 7); "one more woman to avoid forfeit" |
| NYC Footy std | 7,5,∞,2,play_down,excluded | 6,1 | `canField`, `sideSize 6`, `playersNeeded 1`, `womenNeeded 1` → "six can play now; with one more woman it'll be a full seven" |
| NYC Footy std | 7,5,∞,2,play_down,excluded | 5,0 | `canField`, `sideSize 5`, `playersNeeded 2`, `womenNeeded 2` → "five can play now; with two more women it'll be a full seven" |
| NYC Footy std | 7,5,∞,2,play_down,excluded | 4,1 | `canField`, `sideSize 5`, `playersNeeded 2`, `womenNeeded 1` → "five can play now; with two more players, one of whom must be a woman, it'll be a full seven" (short-handed + still a woman short of the floor) |
| NYC Footy std | 7,5,∞,2,play_down,excluded | 4,2 | `canField`, `sideSize 6`, `playersNeeded 1`, `womenNeeded 0` → "six can play now; with one more player it'll be a full seven" (floor met; a body of either gender) |
| NYC Footy std | 7,5,∞,2,play_down,excluded | 3,0 | `!canField`, `playersNeeded 2`, `womenNeeded 0` → "two more players to avoid forfeit" |
| NSC (cap ≡ soft floor 2) | 7,4,4,null,null,excluded | 8,0 | `canField`, `sideSize 5` (4 outfield men + free male keeper), `playersNeeded 2`, `womenNeeded 2` → "five can play now; with two more women it'll be a full seven" (cap is a floor; women-phrased) |
| NSC | 7,4,4,null,null,excluded | 4,0 | `canField`, `sideSize 4`, `playersNeeded 3`, `womenNeeded 2` → "four can play now; with three more players, two of whom must be women, it'll be a full seven" |
| Volo (cap + hard floor) | 7,5,5,1,forfeit,included | 8,2 | `canField`, `sideSize 7`, `atFullStrength` (3 men sub, silent) |
| Volo | 7,5,5,1,forfeit,included | 6,1 | `canField`, `sideSize 6`, `playersNeeded 1`, `womenNeeded 1` → "six can play now; with one more woman it'll be a full seven" (hard-floor league, but short-handed at the top like any other) |
| Volo | 7,5,5,1,forfeit,included | 5,0 | `!canField`, `playersNeeded 1`, `womenNeeded 1` ("one more woman to avoid forfeit") |
| Volo | 7,5,5,1,forfeit,included | 3,0 | `!canField`, `playersNeeded 2`, `womenNeeded 1` ("two more players, one of whom must be a woman, to avoid forfeit") |

**Keeper handling, and why there is no "woman-in-goal" test.** The engine takes
counts, not a chosen lineup, and reports whether *some* legal side exists — so it
always seats the keeper optimally and will put a man in goal whenever that is
legal. There is therefore no input that makes it "reject a woman in goal"; do not
try to write one. The keeper carve-out is verified where it changes the **verdict**
— the men-ceiling side — by the **NSC 8,0 → sideSize 5** row: `keeperScoping
'excluded'` lets a male keeper be a legal 5th man the cap of 4 doesn't count, so
the side is 5, not 4. Implement `excluded` as "the cap and floor bind the
`sideSize − 1` non-keeper players; a male keeper is not counted against
`effectiveMenCap`." For a plain women floor the carve-out changes only *advice*
(which women play out), never the verdict at a real side size, and keeper-advice
sentences are **out of scope for 6.5** — so no floor-side keeper test is needed.

### 1d. `shared/src/report.ts` → pure grammar over `RosterStatus`

- Change `rosterReport` to `rosterReport(status: RosterStatus, nouns)` — a pure
  function of the one status object plus the quota nouns (no raw minimums, no
  separate turnout arg; the echo is in `status`). Keep `numWord`,
  `pastRosterReport`, and the `<strong>`/markdown-emphasis marking.
- **Sentence 1 (always)** — from the echo: *"So far we have `{attendingTotal}`
  players[, `{attendingQuota}` of whom are women]."* The women clause shows iff
  `hasGenderConstraint` (a floor team with 0 women still says "none of whom are
  women"; a genderless team never shows it, even with women present). Read the
  counts from `status`, not from a turnout argument. (A cap-stored league keeps the
  women-noun phrasing here — a max-men display skin is a later polish.)
- **Sentence 2** — exactly one of, keyed on `canField` then the two shortfalls
  (`p = playersNeeded`, `w = womenNeeded`). Both live branches share one **merge
  clause** — call it `need(p, w)`:
  - `w === 0`: *"`{p}` more players"*
  - `p === w` (both > 0): *"`{w}` more women"* (every added player must be a woman;
    drop the "players" clause — "one more woman" / "two more women")
  - `p > w > 0`: *"`{p}` more players, `{w}` of whom must be women"* ("one of whom
    must be a woman" when `w === 1`) — the legacy merge phrasing.

  Then:
  - **Forfeit** (`!canField`): *"You need `{need(p, w)}` to avoid forfeit."* E.g.
    `2,1` → "two more players, one of whom must be a woman, to avoid forfeit";
    `1,1` → "one more woman to avoid forfeit".
  - **Short-handed** (`canField && !atFullStrength`): *"`{Sidesize}` can play now;
    with `{need(p, w)}` it'll be a full `{fullSide}`."* Here `p` is always ≥ 1 (a
    side short of full always needs more attendees). "Must be" stays — reaching a
    full side genuinely requires those women. E.g. `2,1` → "…with two more players,
    one of whom must be a woman, it'll be a full seven"; `1,0` → "…with one more
    player…".
  - **All set** (`atFullStrength`): no second sentence — surplus is silent
    (never-block).
- **Vocabulary:** sport-neutral — "play," never "field"/"pitch"/"outfield"; never
  "recruit." Rewrite `report.test.ts` for the new signature and grammar; cover one
  row per branch from the engine acceptance table.

### 1e. Wiring

- `server/src/data/teams.ts`: map the new columns; update `TeamRow` and the
  domain mapping.
- `client/src/GameCard.tsx`: build `turnout` from the roster and call the engine,
  then `rosterReport(status, nouns)`. `client/src/pages/PlayersPage.tsx`: it reads
  the old `minQuotaPlayers` for helper copy — update to `womenFloor` (guard null).

## Commit 2 — ergonomics + docs (off request path)

- `server/src/create-team.ts`: add CLI flags `--full-side`, `--min-to-play`,
  `--women-floor` (optional), `--men-ceiling` (optional), `--floor-type`
  (default `play_down` when `--women-floor` given), `--keeper-scoping` (default
  `included`); drop `--min-players`/`--min-quota-players`. Mirror the invariant in
  the args zod. Update `USAGE`.
- `server/src/seed.ts`: keep **bobcats** faithful (`fullSide 7, minToPlay 7,
  womenFloor 2, play_down, keeper included`) so its identity is unchanged, and add
  **one seed team per engine type** to exercise every path — a cap-only team
  (NSC-like), a hard-floor+cap+keeper team (Volo-like), and a play-down team with
  `minToPlay < fullSide` (to actually demonstrate shorthanded play, which bobcats'
  `minToPlay == fullSide` never triggers).
- Docs: this milestone is already written up in DESIGN.md; no further DESIGN.md
  work unless the build surfaces a decision. If it does, add an as-built note and
  a row to the decision log.

## Guardrails

- **Do not** introduce a discriminated-union rule object or a config UI — both are
  deliberately deferred (union: until a non-quota family; UI: milestone 7).
- If a future task ever adds FLIP/50-50 dynamic-ratio behavior, the **first** step
  is migrating the flat columns to a `kind`-tagged union — before the new family
  goes in (DESIGN.md → Storage).
- Keep rule logic in the engine only; `report.ts` must not re-derive anything —
  it only renders `RosterStatus`.
- Run `pnpm typecheck`, `pnpm build`, and all three test suites; both commits must
  be independently green (branch protection requires it).
