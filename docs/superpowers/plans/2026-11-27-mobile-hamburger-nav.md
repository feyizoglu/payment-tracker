# Mobile Hamburger Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the web section links into a hamburger menu below `lg`, as specified in `docs/superpowers/specs/2026-11-27-mobile-hamburger-nav-design.md`.

**Architecture:** One shared client component, `AppNav`, owns the logo, the ☰ button, the inline links and the menu panel; the three headers render it with their section.

**Tech Stack:** Next.js client components, Tailwind, lucide-react, vitest (node environment: components are called as functions with `useState` mocked, as in `EventsHeader.test.ts`).

**Conventions:** branch `feature/mobile-hamburger-nav`; conventional commits; stage by path and run `git diff --cached --name-only` before each commit. Tests: `npx vitest run <file>`. Type check: `npx tsc --noEmit`. Lint: `npm run lint`.

---

## Tasks

- [ ] **1. i18n** — add `menu` to `shared/i18n.ts` (`en`: "Menu", `tr`: "Menü") next to `games`/`wordsTitle`.
- [ ] **2. AppNav (tests first)** — `src/components/AppNav.test.ts`: five links in order with their hrefs; active link carries `aria-current="page"` and its section colour (dashboard blue, economy green, events/games/words purple), the others the idle class; ☰ button has the `menu` label, `aria-expanded` follows the state, `aria-controls` names the panel and the panel id matches; tapping ☰ toggles; panel and backdrop render only while open; a panel link, the backdrop and Escape close it, another key does not; the word "PayTrack" is `hidden sm:inline`. Then `src/components/AppNav.tsx`.
- [ ] **3. Headers** — replace the logo + nav block in `src/app/dashboard/page.tsx`, `src/app/economy/page.tsx` and `src/components/events/EventsHeader.tsx` with `<AppNav active=… />` and make the header row `flex h-14 items-center justify-between` without the wrap/second-row classes. Move the "highlights the nav item" assertions in `EventsHeader.test.ts` to checks that it renders `AppNav` with `active` (default `events`, `games` when passed). Drop imports that are no longer used.
- [ ] **4. Verify and publish** — all suites, `tsc`, lint; commit `feat(web): move the section links into a hamburger menu on small screens`; `/push-gate:push`; `/push-gate:create-pr`; CI green; give the owner the Vercel preview link to check on a phone. Merge only on the owner's word.
