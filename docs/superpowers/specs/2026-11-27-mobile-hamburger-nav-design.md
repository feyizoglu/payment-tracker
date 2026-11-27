# Mobile web hamburger nav

## Problem

On a phone the web header puts the five section links (Panel, Ekonomi, Etkinlikler, Oyunlar,
Kelimelerim) on a second row that does not fit: at 375px roughly 425px of links meet about 343px of
room, so "Kelimelerim" runs off the edge. The same nav is copied in three headers
(`src/app/dashboard/page.tsx`, `src/app/economy/page.tsx`, `src/components/events/EventsHeader.tsx`,
the last one shared by Events, Games and My Words).

## Decision (owner, 2026-11-27)

Below the `lg` breakpoint the links move into a hamburger menu. From `lg` up nothing changes.

## Design

- New client component `src/components/AppNav.tsx`, `active: "dashboard" | "economy" | "events" |
  "games" | "words"`. It renders the left side of the header: the ☰ button (below `lg`), the logo,
  the inline links (from `lg`) and the menu panel. All three headers use it; their own nav and logo
  markup goes.
- Header row: one line at every width (`h-14`); the second nav row is gone.
- Logo: the card icon always; the "PayTrack" word from `sm` up, so ☰ + logo + the right-hand
  controls fit a 360px screen.
- ☰ button: `aria-label` "Menu"/"Menü" (new i18n key `menu`), `aria-expanded`, `aria-controls` the
  panel. Tapping it toggles the panel.
- Panel: under the header, full width, the five sections one per row. The current one is
  highlighted in its section colour (Panel blue, Ekonomi green, the others purple, as today) and
  carries `aria-current="page"`. It closes when a link is chosen, when the user taps outside it (a
  backdrop), on Escape wherever the focus is (focus then returns to ☰) and when the window grows to
  `lg`, so a widened-then-narrowed window does not bring it back.
- Each header holds one open-menu value (section menu, user menu or none) and passes it to
  `AppNav`, so the section menu and the user menu are never open together.
- Inline links from `lg`: as today, with the same per-section active colour; the active one is a
  link with `aria-current="page"` everywhere (Panel and Ekonomi used a plain span).
- The user menu, the right-hand controls and the Expo app are unchanged.

## Testing

Unit tests for `AppNav` (links, active item and colour, `aria-current`, toggle, close on link,
backdrop and Escape, the labels) and the three headers render `AppNav` with their section. The look
on a phone is checked by the owner on the Vercel preview: the pages need a signed-in session.
