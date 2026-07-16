# Turtleherder Mobile-First Redesign

## Overview

This document captures the design interview for milestone 2 (mobile-first redesign) of the turtleherder roadmap. It is the spec for the front-end redesign phase, to be built in milestone 3 ("One front-end push"). This redesign updates the UX across all pages — schedule, games, players, forms, and auth UI (friendly wall, manage-access) — while honoring the app's visual heritage.

**Core principle:** Ruthless simplicity. Every design decision serves the core value: lower friction than email for rec-sports attendance. Mobile is primary; desktop adapts.

## Design Philosophy

- **Honor the history:** The app has 10+ years of identity (green gradient, white card, status colors). The redesign keeps this soul recognizable while modernizing it for 2026 and thumbs.
- **Mobile-first, desktop-excellent:** Design for phones first (players arriving via texted links). Desktop gets a sidebar layout and full information density.
- **Accessibility first:** Status colors refreshed for colorblind users and WCAG contrast. Touch targets 44×44px minimum.
- **Conversational, not transactional:** Preserve the personal tone of the original ("Alice, will you be coming?"), especially in the personal question UI.

## Visual Identity

### Color Palette

**Primary green:** `#5ec942` (a subtle modernization of legacy `#b4dd90` — slightly more saturated and vibrant, still instantly recognizable as turtleherder)

**Neutrals:** Cool, pure grays:
- Background: `#f9fafb` (nearly white, light enough for contrast)
- Card/surface: `#ffffff` (white)
- Text primary: `#1f2937` (charcoal)
- Text secondary: `#6b7280` (medium gray)
- Borders/dividers: `#e5e7eb` (light gray)

**Status colors (refreshed for accessibility):**
- **Coming (yes):** `#10b981` (green, accessible against white)
- **Not coming (no):** `#ef4444` (red, accessible contrast)
- **Maybe (not_sure):** `#f59e0b` (amber, more accessible than legacy orange)
- **No response:** `#6b7280` (medium gray, not black — better contrast and less harsh)

**Supporting colors:**
- Error: `#dc2626` (for error messages)
- Success: `#059669` (for confirmations)

### Typography

**Font stack:** Inter (body text) + a serif for headings (e.g., Merriweather, Georgia fallback)
- **Body text:** Inter, 16px on all breakpoints, `line-height: 1.5`
- **Major headings** (game headers, page titles): 28px on mobile, 32px on tablet/desktop, serif, bold
- **Subheadings** (section headers like "Future games"): 20px on mobile, 24px on desktop, serif, bold
- **Labels, small text:** 14px, sans-serif

**Weight hierarchy:**
- Regular (400) for body
- Bold (700) for headings and emphasis
- Semibold (600) for labels

### Spacing Grid

**8px baseline grid:** All spacing is a multiple of 8px (8, 16, 24, 32, 40, 48, 56, 64px). This ensures consistency and scales cleanly across breakpoints.

**Container widths:**
- Mobile: full width with 16px side padding (effective content width ~288px on iPhone SE)
- Tablet: 640px content width, sidebar 200px
- Desktop: 960px content width, sidebar 240px

### Cards & Containers

- **Rounded corners:** 12px for most cards and components (modern, softer than legacy's 20px)
- **Shadows:** Subtle `0 1px 3px rgba(0,0,0,0.1)` on cards (lighter than legacy's heavy shadow)
- **Padding:** 16px inside cards and containers
- **Borders:** 1px `#e5e7eb` (optional, used for input fields and some containers for definition)

## Component Design

### Attendance Controls

**Segmented control (pill buttons):**
- Three buttons in a visual group: `[Yes | No | Not Sure]`
- Height: 44px (touch-friendly)
- Width: ~33% each on mobile (fit in one row), flexible on desktop
- Selected state: filled with `#5ec942`, white text
- Unselected state: light border `#e5e7eb`, dark text
- Spacing between buttons: 4px (8px grid minus 4px for visual grouping)
- Mutation in progress: buttons disabled, opacity 0.6
- Error state: "Error saving." message below, red text

### Personal Question Card

**Styling:**
- Distinct card container with `#f9fafb` background (very light gray, not white)
- Padding: 24px (three grid units)
- Rounded corners: 12px
- No shadow (to feel integrated, not floating)
- Positioned at the top of schedule page and single-game page

**Content:**
- Heading: "Your status for [game date]" in serif, 20px (subheading size), bold
- Question: "Alice, will you be coming to the game on [date] against [opponent] at [time]?" in body text
- Segmented control below (44px height, full width on mobile)
- No borders or over-styling — let the background color define it

### Buttons & Form Controls

**Primary buttons:** Green background `#5ec942`, white text, 12px rounded corners, 8px padding (16px × 32px minimum), active state darker green `#059669`

**Secondary buttons:** Light background `#f3f4f6`, dark text `#1f2937`, 12px rounded corners, border `#d1d5db`

**Danger buttons:** Red background `#ef4444`, white text, for delete/revoke actions

**Input fields:** 
- 1px border `#d1d5db`, 12px rounded corners
- 8px padding, 16px horizontal
- Focus: border `#5ec942`, no outline (outline used for focus ring instead)
- Font: 16px (prevent iOS zoom on input focus)

**Radio buttons & checkboxes:** Styled with custom CSS to align with design system. Size: 24px (large enough for touch).

### Forms (Add/Edit Player, Add/Edit Game)

**Player form:**
- Name input field (required)
- "Counts toward quota" checkbox (labeled with the team's quota noun, e.g., "Counts toward women minimum")
- Submit button, Cancel link

**Game form:**
- Opponent name input field (required)
- Opponent color input field (optional)
- Date/time input: native `datetime-local` styled with custom CSS (green borders, modern font). **This is intentionally not a custom picker yet** — it's sufficient for captains, and a custom picker can be added in a future milestone if needed.
- Submit button, Cancel link

**Mobile:** Stack vertically, 16px padding, full width inputs.
**Desktop:** Can be laid out in two columns if desired, but single column is acceptable.

### Past/Future Toggle

**Location:** Sticky header at the top of the schedule page, visible while scrolling through games.

**Styling:**
- Small link or button: "Show past games" / "Hide past games"
- Secondary button style (light background)
- Positioned in sticky header (same element as bottom nav on mobile? or separate?)

Actually, on mobile with bottom nav, the toggle lives in the main content area (not in the nav bar itself). On desktop with sidebar, it can live in a top bar or in the content.

**Decision: Keep toggle in main content (not in nav), but style it as a sticky element so it stays accessible while scrolling games.**

### Manage-Access Page (Captains)

**Mobile (< 640px):**
- List of players (name only)
- Each row has [Regenerate] [Revoke] [Show link] buttons
- Tap "Show link" reveals the join link in a copyable box below

**Tablet/Desktop (≥ 640px):**
- Table layout: Name | Join Link (copyable) | [Regenerate] [Revoke]
- All links visible at once
- Copyable links highlighted in a light background box

### Friendly Wall (Signed-Out Visitors)

**Full-page banner approach:**
- Top banner (not a modal, not an overlay)
- Centered text: "Ask your captain for your link."
- Subtext (optional): "The schedule is only visible to team members."
- No schedule visible behind it, no hints at the team's data
- Link/button to go back (if applicable) or just a clean message

## Page Layouts

### Schedule/Home (`/:teamSlug`)

**Mobile:**
1. Personal question card (top, sticky? no, scrolls away)
2. Past/future toggle (sticky, always accessible)
3. Section: "Future games" (if any)
4. Game cards (one per game)
5. Conditional: "Past games" section (if showing, behind toggle)

**Desktop (sidebar layout):**
- Sidebar on left (240px): navigation, toggle for past/future
- Main content (960px): personal question card, games
- Same content, different layout

### Single Game (`/:teamSlug/games/:id`)

Same personal question card (about this game) at the top, then the game card with roster.

### Players Page (`/:teamSlug/players`)

List of players, links to edit, add player button. Same sidebar layout on desktop.

### Games Page (`/:teamSlug/games`)

List of games, links to edit, add game button. Same sidebar layout on desktop.

### Player Form & Game Form

Simple forms (described above), either modal/overlay or a dedicated page. Decision: dedicated page (simpler nav, no stacking complexity).

## Responsive Behavior

### Breakpoints

**Three breakpoints (8px grid for easy calculations):**

1. **Mobile:** < 640px
   - Single column, full width minus 16px padding
   - Bottom navigation bar at bottom of screen (sticky/fixed)
   - All content stacks vertically
   - Touch-optimized spacing (larger gaps, larger buttons)

2. **Tablet:** 640px – 1023px
   - Sidebar appears (200px), content area narrows
   - Bottom nav transforms into vertical sidebar
   - Two-column games or forms are acceptable
   - Touch still primary

3. **Desktop:** ≥ 1024px
   - Sidebar wider (240px), full-width layout unlocked
   - Multi-column layouts for lists (e.g., manage-access with table)
   - Manage-access page shows all links visible (no reveal-on-tap)
   - Mouse interaction assumed, but touch still supported

### Navigation

**Mobile (< 640px):** Bottom navigation bar (sticky/fixed at bottom)
- Home, Players, Games, + Manage-Access (captains only)
- Icons + labels, one per screen
- Full-width touch targets

**Desktop (≥ 640px):** Sidebar navigation (left side)
- Vertical layout, all nav items visible
- Logo/team name at top
- Manage-Access link visible only to captains (gated server-side)

### Adaptive Layouts

- **Game cards:** Full width on mobile, no change needed. On desktop, can be grouped or styled more densely.
- **Roster lines:** Stacked on mobile (name, status phrase, buttons on separate lines). On desktop, can be inline if space allows.
- **Forms:** Single column always, for simplicity. On desktop, could be two columns but not required.

## PWA (Progressive Web App)

**Manifest requirements:**
- App name: `Turtleherder`
- Display: `standalone` (launches without browser UI)
- Icon set: 192px and 512px at minimum
  - Design: turtle silhouette on `#5ec942` green background
  - Solid color, recognizable at small sizes
- Start URL: `/:teamSlug` (or root, redirects to team)
- Theme color: `#5ec942`
- Background color: `#ffffff`

**Scope:** Single app for all teams. Multi-team switching (captain managing multiple teams) is a future feature; it doesn't require separate app installs.

## Existing Behaviors to Preserve

- **Roster report grammar:** The original's sentence construction, emphasis markers, and singular/plural handling stay exactly as-is. This is the app's soul.
- **Bye week rendering:** "Bye week." with no roster.
- **Past/future toggle:** Persists in localStorage (was a cookie in the original).
- **Delete confirmations:** Confirm dialogs on delete actions.
- **Status color coding:** Same meaning (green=yes, red=no, orange=maybe, gray=no response), refreshed for accessibility.

## Out of Scope (for this redesign)

- **Custom calendar/date picker:** Native `datetime-local` input is sufficient. A custom picker is a future upgrade.
- **Push notifications:** Deliberately parked (see main DESIGN.md roadmap).
- **Multi-team management UI:** Later settled as the multi-team keyring (milestone 6; designed July 2026, see DESIGN.md); this redesign assumes single-team sessions.
- **Landing page + tip jar:** Milestone 8 (post-launch).
- **Self-serve team creation:** Milestone 7 (post-launch).

## Decision Log

| Decision | Choice | Rationale |
| --- | --- | --- |
| Visual direction | Honor the history (B) | Keep the 10-year identity recognizable (green, white card, status colors), modernize with cleaner typography and spacing, and make it work for thumbs. |
| Attendance controls | Segmented control (A) | Pill-shaped buttons in one visual group signal "pick one of these," are compact for mobile, and feel modern. 44×44px touch targets. |
| Calendar/date-picking UX | Style native input well (A) | Captains use this ~12 times a season; a well-styled native input is sufficient. Defer custom picker to future if needed. |
| PWA shell | Standard (manifest, icons, standalone) | Home-screen icon from day one for captains and players on mobile. Single app, not team-specific. |
| Personal question styling | Card-like container (A) | Distinct card preserves the conversational tone of the original ("Alice, will you…?") and makes it a clear moment on the page. |
| Navigation pattern | Bottom nav on mobile, sidebar on desktop (B) | Mobile-native pattern (thumbs reach the bottom), doesn't compete with top content. Sidebar on desktop is familiar and scalable. |
| Desktop layout | Sidebar (B) | More space for nav items, scalable design, common in modern apps. Sidebar on desktop, bottom nav on mobile. |
| Spacing system | 8px grid | Modern standard, scales cleanly, keeps decisions simple and systematic. |
| Friendly wall | Minimal banner (C) | Top banner saying "Ask your captain for your link." No hints about team data, no modal overlay. Clean and clear. |
| Manage-access page | Reveal-on-tap mobile, all visible on desktop (C→A responsive) | Mobile streamlined (less visual clutter), desktop gives full view. Responsive upgrade path. |
| Typography | Inter (body) + serif (headings) | Inter is modern and readable; serif headings add hierarchy and warmth. Fits the "honored history" direction. |
| Font sizing | 16px base, 28-32px major headings, 20-24px subheadings | 16px is standard for mobile readability. Heading hierarchy is clear. Scales well across breakpoints. |
| Primary green | `#5ec942` | Subtle modernization of legacy `#b4dd90` — more saturated, more vibrant, still instantly recognizable. |
| Status colors | Refreshed for accessibility (A2) | Legacy colors (bright green, red, orange, black) lack WCAG contrast and aren't colorblind-friendly. Updated to: `#10b981` (green), `#ef4444` (red), `#f59e0b` (amber), `#6b7280` (gray). |
| Responsive breakpoints | Three breakpoints: mobile < 640px, tablet 640–1023px, desktop ≥ 1024px (A) | Clear, predictable layout shifts. Mobile-first approach: single column mobile, sidebar tablet/desktop. |

## Implementation Notes for Milestone 3

- The auth UI (friendly wall, manage-access, personal question) is included here but depends on the auth backend (milestone 1) being complete. Coordinate with auth work.
- All pages should be tested at mobile (375px), tablet (768px), and desktop (1440px) breakpoints.
- Inline attendance editing (segmented control) should support loading states and error messages without breaking the layout.
- The past/future toggle should persist in localStorage per team (existing behavior, preserved).
- Forms (player/game add/edit) can be modal overlays or dedicated pages; the design doesn't prescribe, but keep complexity low.
- Roster report output (the grammar engine) is independent of styling; apply this color/spacing system to it as-is.

## Design System (for future reference)

A future milestone could formalize this into a component library or Storybook, but for now:

- **Button component:** Primary (green), secondary (light), danger (red), sizes (small, default, large)
- **Input component:** Text, textarea, date/time, checkbox, radio (styled), with error states
- **Card component:** Rounded corners, subtle shadow, padding
- **Badge/pill component:** For status colors and labels
- **Navigation:** Bottom bar (mobile), sidebar (desktop)
- **Toast/alert:** For error messages and confirmations

These are implicit in the design above; formalize them when building the component library.
