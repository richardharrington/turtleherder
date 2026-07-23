# Handoff: Self-serve teams (roadmap milestone 7)

Implement the **Self-serve teams** section of `DESIGN.md`. It is the
authoritative spec and its decision log is settled. Read that section in full,
plus the **Coed rule engine** (6.5), **Multi-team keyring** (6), **Roster
history** (5.5), and **Auth design** sections for the behavior this builds on.
Do not read root `notes.txt`, `Untitled*.txt`, or `league-rules-questions.md`;
they are private/separate scratch work, not implementation input for this pass.

Terminology:

- **Current React app** = this repository and the app live at
  turtleherder.com. This is what you are changing.
- **Legacy PHP site** = the 20-year-old code/site. Reference only; not an
  implementation or compatibility target.

The architecture was settled in a /grill-me interview. Do not re-litigate the
product choices in the decision log. Ask only genuine build-level questions. If
using an AskUserQuestion tool, always include an explicit "Other — type
something" choice, and reveal your recommendation only after Richard chooses.

## The one thing that is NOT yet designed

The **coed-rules entry UI and all copy are a separate, still-to-be-grilled
pass.** `DESIGN.md` settles *where* the coed rules are entered (the
captains-only settings page, reached via a skippable first-run onboarding),
*which* fields exist, and their validation — but **not** how the six engine
parameters become a form a captain understands, nor any wording. Do **not**
invent that form. Build everything else first; the coed form lands after its
own grill.

## Build order

Front-load the coed-independent work. Only the coed-rules form is blocked; the
rest has no dependency on that grill and can proceed now in any order.

### 1. Permissions cluster (fully independent of self-serve)

- **Removal → captains-only.** Add `DELETE …/players/:playerId` to the
  `requireCaptain` list in `app.ts` (it is the one roster-mutating route not
  already there). Hide the Remove affordance for non-captains. Revert the 5.5
  remove-confirmation copy from "*a captain* can add them back" to "*you* can"
  (only captains reach it now). Add the 403 to the permission test matrix.
- **Peer captain management** on the already-captains-only Access page: any
  captain can promote any active player and demote or remove any captain,
  bounded by the existing `hasAnotherActiveCaptain` guard (`players.ts:114`,
  already generic). Invariant: ≥ 1 active captain per team, applied uniformly
  (self or other). New promote/demote endpoints + toggles.

### 2. Quota-nouns-nullable migration (schema only)

- Make `quota_noun_singular` / `quota_noun_plural` nullable. Add a check tying
  "nouns present" to "`women_floor` present," mirroring the existing
  `(women_floor IS NULL) = (floor_type IS NULL)` constraint. `report.ts`
  already reads the nouns only behind `hasGenderConstraint` — no report change.

### 3. Public spine

- **Combined `/` page**: hero (what-is-this + Create a team) with an immediate,
  unmissable "Already on a team? You need the link your captain texted you"
  block below it, hero first. Only the bare key-less fallthrough of `WallPage`
  changes; its five other states are untouched. **No branching on PWA install
  state.**
- **Create form**: `name`, captain name, `full_side` (default 7),
  `min_to_play` (default 5, real editable pre-filled values + "change later"
  note), browser-detected `timezone`, plus a **honeypot** field. Reuse
  `create-team.ts`'s zod for validation.
- **Slug**: `slugify(name)` pre-filled, shown, editable; **reserved denylist**
  (`join`, `api`, `create`, empty string, `assets`/`health`/`.well-known`);
  **no live availability check** (would break non-enumeration) — collisions
  handled on submit (`23505` → "that URL's taken"); immutable after creation.
- **Auto-sign-in** the creator's browser on success; show the captain link for
  *saving* (loud "save this — bookmark it or email it to yourself"), not for
  clicking-to-enter.
- **Abuse**: honeypot only. The IP rate limit is deliberately deferred — build
  it reactively if/when the row count actually moves.

### 4. Settings page shell + identity editing

- Captains-only settings page with **`name`** and **`timezone`** editing (slug
  excluded — immutable). The coed-rules form slots into this same page later.

### 5. BLOCKED — the coed-rules form (after its grill)

- The coed-rules form, its onboarding framing, and the create→onboarding
  handoff. **This is the only grill-blocked piece.**
- Note: that grill may move the create-form/onboarding boundary — e.g. whether
  `full_side`/`min_to_play` stay on signup or move into the rules. **Rework
  that seam freely if so.** It is small, and there are no users; do not
  sequence defensively around it.

## Deferred (parking lot, not this milestone)

Captain-initiated team deletion; per-action permission configurability; the tip
jar (milestone 8); a hashed recovery code.
