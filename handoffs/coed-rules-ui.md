# Handoff: Coed-rules entry UI (roadmap milestone 7.1)

Implement the **Coed-rules entry UI** section of `DESIGN.md`. It is the
authoritative spec and its decision log is settled. Read that section in full,
plus the **Coed rule engine** (6.5) and **Self-serve teams** (7) sections — 7.1
builds directly on both (milestone 7 is already shipped). Do not read root
`notes.txt`, `Untitled*.txt`, or `league-rules-questions.md`; they are
private/separate scratch work.

Terminology:

- **Current React app** = this repository and the app live at turtleherder.com.
- **Legacy PHP site** = the 20-year-old code/site. Reference only.

The design was settled in a /grill-me interview. Do not re-litigate the product
choices in the decision log. Ask only genuine build-level questions.

## Copy: build against the draft; don't invent or agonize

The setup-screen strings below are drafted and **sufficient to build against.**
Final wordsmithing is **Richard's** — he'll refine strings by playing with the
built app. It is **not** your job to invent copy or polish wording. Build with
these strings exactly as given, keeper question included; treat none of them as
open questions for you to resolve.

## Scope

The captains-only guided form for entering a team's coed rules, plus the team
"in setup" lifecycle it introduces. A **single page** using progressive
disclosure via the existing 5.8 primitives (`client/src/components/disclosure.tsx`)
— **not** a modal wizard. Reuse `create-team.ts`'s zod for all validation.

## Build boundaries

### 1. Schema

- `full_side` / `min_to_play` → **nullable** (reverse 6.5's `NOT NULL`).
- New nullable **`setup_completed_at timestamptz`** on `team`.
- New nullable **restricting-group noun pair** (mirroring the existing
  protecting-group `quota_noun_singular/plural`).
- Constraints — each noun stored where it surfaces:
  - protecting noun non-null **iff** `men_ceiling OR women_floor` (already in
    place from milestone 7's option-1 fix);
  - restricting noun non-null **iff** `men_ceiling` is set.
- `db:create-team` + seed keep **requiring** format, set the restricting noun
  default (`man`/`men`), and stamp `setup_completed_at = now()` (CLI/seed teams
  are born complete).

### 2. The "in setup" gate (server-enforced)

- A team is **in setup** until `full_side`/`min_to_play` are set **and** the
  gender-rules choice has been made (`setup_completed_at IS NULL`).
- While in setup, the API **rejects** player-link creation and game creation.
  This is the single gate that keeps `report.ts`/schedule from ever seeing a
  null format — do not scatter null-format guards through the report layer.
- Expose `setup_completed_at` (or a derived `inSetup`) on the team payload.
- An in-setup team **routes its captain to the setup screen** on every visit.
  Only captains can be in this state (no links exist yet), so there is no
  in-setup view to design for non-captains.

### 3. The setup screen (create → here)

After "Create a team," land on a dedicated setup screen (not the team page).
Draft copy, top to bottom:

> **Set up {Team name}**
>
> *(callout)* **Save your link** — This link is how you get back into {Team} on
> a new phone or browser. Save it now — bookmark it, or email it to yourself.
> `{captain link}` [Copy]
>
> **How many play?**
> Players per side `[ ]` *(placeholder `7`)* — a full side at full strength
> Fewest to play `[ ]` *(placeholder `5`)* — any fewer and it's a forfeit
>
> **Does your league have a gender rule?**  ( ) Yes  ( ) No
>
> *(on Yes — reveal below)* **Which describes it?**
> ( ) A minimum of `[N]` women, otherwise we play a person short.
> ( ) A minimum of `[N]` women, otherwise we forfeit.
> ( ) A maximum of `[M]` men.
> ( ) A maximum of `[M]` men, and a minimum of `[N]` women, or we forfeit.
>
> *(cap shapes 3–4 only)* **Does your sport have a goalkeeper?** ( ) Yes ( ) No
> *(if yes)* **Does the keeper count toward the men limit?** ( ) Yes ( ) No
>
> Category we're protecting `[women]`  *(e.g. women, women/non-binary, females)*
> *(cap shapes only)* Category we're restricting `[men]`  *(e.g. men, cis-men)*
>
> **[ Finish setup ]**

Notes:

- Format inputs use `7`/`5` as **placeholder**, not pre-filled values (nullable
  until submitted).
- Nouns: **plural** entered; derive the singular with a small hard-coded rule
  set (`women→woman`, `men→man`, `people→person`, `players→player`, else strip
  trailing `s`), shown for confirmation and overridable. Shape sentences render
  the nouns **read-only** (edit only in the fields).
- The **restricting** noun field reveals only for cap shapes; a value typed then
  hidden (by switching to a floor shape) is **preserved in form state, not
  cleared**, and persisted only when a cap shape is active.
- Keeper first line is a **UI gate only** — no schema; "no goalkeeper" and
  "keeper counts" both store `keeperScoping: included`, only "doesn't count" is
  `excluded`.
- The same form is reused for later edits on the settings page. Editing rules on
  a live team needs no versioning (past games are immune — `pastRosterReport`
  has no quota clause).

## Not in scope (parking lot)

Dynamic-ratio leagues (no disclaimer — that captain sets a fixed minimum); the
static contact page; the league preset-picker. All parked in DESIGN.md.
