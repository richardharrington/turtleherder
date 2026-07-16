# Handoff: Mobile-first redesign — design interview (Roadmap milestone 2)

You are picking up **milestone 2 of the roadmap** in `DESIGN.md`: run the
design interview for the mobile-first redesign and write up the result. Read
`DESIGN.md` in full first — it is the authoritative spec and decision log —
plus the legacy CSS (`legacy/bobcats/css/main.css`) and the current client
pages (`client/src/`) to understand what exists.

## Deliverable — a document, nothing else

Your **only output is a fresh, standalone design document** (suggested:
`REDESIGN.md` at the repo root). Hard rules:

- **Write no code.** No edits to `client/`, `server/`, `shared/`, `e2e/`,
  configs — nothing. Implementation is milestone 3, a separate effort that
  will build from your document.
- **Do not edit `DESIGN.md`**, not even to cross-reference. Another agent is
  working in this repo in parallel and DESIGN.md reconciliation happens later.
- Mockups, if useful, belong *inside* the document (ASCII/description), or in
  AskUserQuestion previews during the interview.

## How Richard works

He settles designs via **/grill-me interviews**: walk the design tree branch
by branch, present options for each question, let him choose, and reveal your
own recommendation only **after** he picks (then argue if you feel strongly).
Record every settled decision in the deliverable document, including a
decision log. He's an experienced developer relearning the modern stack;
make decisions explicit, not implied.

## Product philosophy (non-negotiable)

Ruthless simplicity. The app's entire value is being **lower-friction than
email/evite/Facebook** for rec-sports attendance. Every unit of friction or
bells-and-whistles spends the product's reason to exist. Users are teammates
on their phones, arriving via links texted by their captain.

## Scope (already decided in the prioritization interview — don't re-ask)

The **full UX rethink**, comprising:

1. **Visual redesign, mobile-first.** The current look is a faithful port of
   the 2010 CSS (green gradient, centered white card, purple links,
   color-coded statuses: green = coming, red = not coming, orange = not sure,
   black = no response). The prioritization interview **superseded** the
   "2010 look on purpose" decision — but *how much of that soul survives is
   the open question your interview owns.* Desktop must remain fine;
   phone is primary.
2. **Attendance controls designed for thumbs.** The yes/no/not-sure controls
   on roster rows are 95% of what players do — currently small inline radio
   buttons.
3. **Calendar/date-picking UX** for the game form (currently a native
   `datetime-local` input; the original had six dropdowns). This is
   captain-facing and used ~a dozen times a season. **Your interview must set
   this work's ceiling explicitly** — "style the native input well" is a
   legitimate answer; a custom picker needs justifying.
4. **PWA shell**: manifest, icons, standalone display — so the launch team
   gets a home-screen icon from day one. (Push notifications are explicitly
   parked — see the roadmap's parking lot; do not design them.)

## Pages to design for

Everything in DESIGN.md's routes section, **plus the auth UI** being built
backend-first in parallel (spec in DESIGN.md's auth section):

- Schedule/home (`/:teamSlug`) — with the **personal question** at the top
  ("Alice, will you be coming to the game on Sunday, July 19 against the
  Wombats at 6:30 pm?" + inline controls, about the next non-bye game)
- Single game (`/:teamSlug/games/:id`) — the shareable link; same personal
  question about that game
- Roster management, game management, player/game forms
- The **friendly wall** for signed-out visitors ("Ask your captain for your
  link" — nothing about the team leaks)
- The captains' **manage-access page** (per-player join links, copy /
  regenerate / revoke)

Existing behaviors to preserve unless the interview decides otherwise: the
roster report's grammar (the app's soul — see DESIGN.md "UX fidelity"), the
past/future game split with the persisted show-past toggle, bye-week
rendering, delete confirms.

## Out of scope

Landing page + tip jar (milestone 7), self-serve team creation (milestone 6),
push notifications (parked), React Native (parked). Don't design them;
noting seams for them is fine.
