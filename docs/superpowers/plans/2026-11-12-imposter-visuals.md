# Imposter Game Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Imposter game from a settings form into a party-game flow on web and mobile: a three-step setup wizard, one colour per player, and a card that shows the secret only while it is held (a Show / Hide button on desktop web).

**Architecture:** Colours, category emoji and step validation are pure additions to `shared/imposter.ts`. Each platform keeps its own components: the setup form is split into one component per step under a prop-controlled wizard, the deal phase gets a new `DealTurn` component that owns the "card is open" state, and the vote phase keeps the tap gate (`PassPhone`). The game draws on a fixed dark background: on web through a wrapper with the `dark` class, on mobile through NativeWind `vars()` holding the dark palette. The reducer and the saved-settings format do not change.

**Tech Stack:** Next.js 16 (client components, Tailwind v4), Expo SDK 57 + NativeWind 4.2 + react-native-reanimated 4.5, vitest (node environment, components are called as plain functions).

**Spec:** `docs/superpowers/specs/2026-11-12-imposter-visuals-design.md`

## Read this first

- **Branch:** `feature/imposter-visuals`. Commit after every task. Stage files by explicit path, never `git add .` or `-A`. Do not push; the owner asks for that.
- **Precondition for Task 17 only:** PR #11 (`fix/mobile-duplicate-react`) must be merged to `main` and `main` merged into this branch (`git merge origin/main`). Without it an update published from this machine crashes on launch. Tasks 1–16 do not depend on it.
- **How component tests work here.** The test environment is `node`, there is no DOM and no renderer. A test calls the component as a function and walks the returned element tree. Consequences:
  - A child component is **not** expanded: the tree contains the element with its props. Test each component by calling it directly.
  - Hooks only work when the test mocks them (`useState`, `useEffect`, …) with the index-based mock shown in the tests below. Components without state are tested with no hook mock.
  - Tests are `.ts`, so they use `createElement`, never JSX.
  - Web tests live next to the component (`src/**/*.test.ts`). Mobile tests **must** live in `mobile/src/lib/` (`mobile/vitest.config.ts` includes only `src/lib/**/*.test.ts`).
- **Colours.** A player's colour is a runtime hex value: it goes through `style={{ backgroundColor }}`. Never build a Tailwind class name from it.
- **Themed classes.** `text-gray-*`, `bg-surface` and friends follow the theme. Inside the dark game frame they give light text, which is right on the dark background and wrong on a player's colour. On a player's colour use `GAME_THEME.ink` through `style`.
- **Commands.** Web: run from the repo root. Mobile: run from `mobile/`.
  - One web test file: `npx vitest run src/components/games/DealTurn.test.ts`
  - One mobile test file: `cd mobile && npx vitest run src/lib/deal-turn.test.ts`
- **Known red on `main`, not ours:** two tests in `src/components/CalendarView.mark-paid.test.ts` fail and `npm run lint` reports 54 problems. Do not fix them here; do not add to them.

## File structure

Shared:
- Modify `shared/imposter.ts` — `PLAYER_COLORS`, `playerColor`, `GAME_THEME`, `CATEGORY_EMOJI`, `SETUP_STEPS`, `SetupStep`, `stepErrors`.
- Modify `shared/i18n.ts` — new keys; `imposterHideNext` removed in Task 16.

Web (`src/`):
- Create `lib/desktop-pointer.ts` — is the primary pointer a mouse.
- Create `components/games/GameFrame.tsx` — the dark (or player-coloured) panel around every game screen.
- Create `components/games/DealTurn.tsx` — pass-the-phone screen with the hold card / Show button.
- Modify `components/games/PassPhone.tsx` — vote gate only; fixed colours.
- Create `components/games/SetupPlayersStep.tsx`, `SetupCategoryStep.tsx`, `SetupRulesStep.tsx`, `ImposterSetupWizard.tsx`.
- Delete `components/games/ImposterSetupForm.tsx` and its test (its assertions move to the step and wizard tests).
- Modify `components/games/ImposterDiscuss.tsx`, `ImposterResult.tsx`, `ImposterGame.tsx`.
- Modify `app/globals.css` — one keyframe.

Mobile (`mobile/src/`):
- Create `lib/game-theme.ts` — the dark palette as NativeWind variables.
- Create `components/games/game-button.tsx` — dark button for player-coloured screens.
- Modify `components/games/game-screen.tsx` — `tone`, `color`, `scroll`.
- Create `components/games/deal-turn.tsx`.
- Modify `components/games/pass-phone.tsx`.
- Create `components/games/setup-players-step.tsx`, `setup-category-step.tsx`, `setup-rules-step.tsx`; rewrite `components/games/imposter-setup.tsx` as the wizard.
- Modify `components/games/imposter-discuss.tsx`, `imposter-result.tsx`, `app/games/imposter.tsx`.

---

### Task 1: Shared colours, emoji and step validation

**Files:**
- Modify: `shared/imposter.ts`
- Test: `src/lib/imposter.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/imposter.test.ts`, extend the import from `@/lib/imposter` with these names (keep the existing ones):

```ts
  CATEGORY_CHOICES,
  CATEGORY_EMOJI,
  GAME_THEME,
  MAX_PLAYERS,
  PLAYER_COLORS,
  SETUP_ERROR_KEYS,
  SETUP_STEPS,
  playerColor,
  stepErrors,
  type SetupError,
```

Append at the end of the file:

```ts
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("player colours", () => {
  it("has a distinct colour for every seat", () => {
    expect(PLAYER_COLORS).toHaveLength(MAX_PLAYERS);
    expect(new Set(PLAYER_COLORS).size).toBe(PLAYER_COLORS.length);
    for (const c of PLAYER_COLORS) expect(c).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("gives each seat its colour and wraps after the last one", () => {
    expect(playerColor(0)).toBe(PLAYER_COLORS[0]);
    expect(playerColor(11)).toBe(PLAYER_COLORS[11]);
    expect(playerColor(12)).toBe(PLAYER_COLORS[0]);
  });

  it("keeps dark text readable on every player colour and light text on the game background", () => {
    for (const c of PLAYER_COLORS) expect(contrast(c, GAME_THEME.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(GAME_THEME.text, GAME_THEME.bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(GAME_THEME.muted, GAME_THEME.bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("category emoji", () => {
  it("has one distinct emoji per category choice", () => {
    expect(Object.keys(CATEGORY_EMOJI).sort()).toEqual([...CATEGORY_CHOICES].sort());
    for (const c of CATEGORY_CHOICES) expect(CATEGORY_EMOJI[c]).toBeTruthy();
    expect(new Set(Object.values(CATEGORY_EMOJI)).size).toBe(CATEGORY_CHOICES.length);
  });
});

describe("stepErrors", () => {
  it("returns nothing on any step for a valid setup", () => {
    for (const step of SETUP_STEPS) expect(stepErrors(setup(), step)).toEqual([]);
  });

  it("puts player errors on the players step", () => {
    expect(stepErrors(setup({ players: ["Ayşe", "ayşe", ""] }), "players")).toEqual(["blankName", "duplicateName"]);
    expect(stepErrors(setup({ players: ["A"] }), "players")).toEqual(["tooFewPlayers"]);
    const thirteen = Array.from({ length: 13 }, (_, i) => `P${i}`);
    expect(stepErrors(setup({ players: thirteen }), "players")).toEqual(["tooManyPlayers"]);
  });

  it("puts imposter count and scoreboard errors on the rules step", () => {
    const s = setup({ imposterCount: 3, scoreboard: true, voting: false });
    expect(stepErrors(s, "rules")).toEqual(["imposterCount", "scoreboardNeedsVoting"]);
    expect(stepErrors(s, "players")).toEqual([]);
  });

  it("has no errors of its own on the category step", () => {
    expect(stepErrors(setup({ players: [], imposterCount: 9, scoreboard: true }), "category")).toEqual([]);
  });

  it("assigns every setup error to exactly one step", () => {
    const few = setup({ players: [""], imposterCount: 9, scoreboard: true });
    const many = setup({ players: Array.from({ length: 13 }, (_, i) => (i < 2 ? "Same" : `P${i}`)) });
    const seen = new Set<SetupError>();
    for (const s of [few, many]) {
      const perStep = SETUP_STEPS.flatMap((step) => stepErrors(s, step));
      expect([...perStep].sort()).toEqual([...validateSetup(s)].sort());
      perStep.forEach((e) => seen.add(e));
    }
    expect([...seen].sort()).toEqual(Object.keys(SETUP_ERROR_KEYS).sort());
  });
});

describe("hold to see and the tap guard", () => {
  // No reducer change is needed for this; it pins the behaviour the hold card relies on.
  it("does not count a press inside the tap guard as seen, and counts the next one", () => {
    const dealt = gameReducer(initialGameState(), { type: "start", setup: setup(), lang: "en", rng: zero, at: 1000 });
    const early = gameReducer(dealt, { type: "reveal", at: 1000 + TAP_GUARD_MS - 1 });
    expect(early.revealed).toBe(false);
    const later = gameReducer(early, { type: "reveal", at: 1000 + TAP_GUARD_MS });
    expect(later.revealed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/imposter.test.ts`
Expected: FAIL — the new names are not exported (`PLAYER_COLORS` is undefined / `stepErrors is not a function`). The "hold to see" test may already pass; that is expected.

- [ ] **Step 3: Implement**

In `shared/imposter.ts`, after the `CATEGORY_LABEL_KEYS` block add:

```ts
export const CATEGORY_EMOJI = {
  mixed: "🎲",
  animals: "🐾",
  food: "🍕",
  jobs: "🧑‍🚒",
  places: "🏝️",
  objects: "📦",
  sports: "⚽",
} as const satisfies Record<CategoryChoice, string>;

/** One colour per seat. All are light enough for `GAME_THEME.ink` text on top. */
export const PLAYER_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#FFD93D",
  "#A78BFA",
  "#6BCB77",
  "#FF9F43",
  "#54A0FF",
  "#F78FB3",
  "#C4E538",
  "#48DBFB",
  "#E2B07E",
  "#B2BEC3",
] as const;

export function playerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

/** Fixed colours of the game screens; they do not follow the app's light or dark theme. */
export const GAME_THEME = {
  bg: "#0B1020",
  text: "#FFFFFF",
  muted: "#A3ACC2",
  /** Text on a player's colour. */
  ink: "#111827",
} as const;
```

After the `SETUP_ERROR_KEYS` block add:

```ts
export const SETUP_STEPS = ["players", "category", "rules"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

const ERROR_STEP = {
  tooFewPlayers: "players",
  tooManyPlayers: "players",
  blankName: "players",
  duplicateName: "players",
  imposterCount: "rules",
  scoreboardNeedsVoting: "rules",
} as const satisfies Record<SetupError, SetupStep>;
```

After `validateSetup` add:

```ts
/** The `validateSetup` errors the given wizard step can fix. */
export function stepErrors(setup: ImposterSetup, step: SetupStep): SetupError[] {
  return validateSetup(setup).filter((e) => ERROR_STEP[e] === step);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/imposter.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add shared/imposter.ts src/lib/imposter.test.ts
git commit -m "feat(shared): add player colours, category emoji and setup step validation"
```

---

### Task 2: i18n keys

**Files:**
- Modify: `shared/i18n.ts`

- [ ] **Step 1: Add the English keys**

In the `en` block, directly after the line `imposterEnd: "End game",` add:

```ts
    imposterStepRules: "Rules",
    imposterStep: "Step {n} of {total}",
    imposterNext: "Next",
    imposterQuickStart: "Start with last settings",
    imposterHoldToSee: "Hold to see",
    imposterHide: "Hide",
    imposterNextPlayer: "Next player",
```

- [ ] **Step 2: Add the Turkish keys**

In the `tr` block, directly after the line `imposterEnd: "Oyunu bitir",` add:

```ts
    imposterStepRules: "Kurallar",
    imposterStep: "Adım {n} / {total}",
    imposterNext: "İleri",
    imposterQuickStart: "Son ayarlarla başla",
    imposterHoldToSee: "Görmek için basılı tut",
    imposterHide: "Gizle",
    imposterNextPlayer: "Sıradaki oyuncu",
```

- [ ] **Step 3: Run the i18n tests**

Run: `npx vitest run src/lib/i18n.test.ts src/lib/shared-i18n.wiring.test.ts`
Expected: PASS (key parity between `en` and `tr` holds).

Run: `cd mobile && npx vitest run src/lib/shared-i18n.wiring.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add shared/i18n.ts
git commit -m "feat(shared): add strings for the imposter setup steps and the hold card"
```

---

### Task 3: Web — desktop pointer detection

**Files:**
- Create: `src/lib/desktop-pointer.ts`
- Test: `src/lib/desktop-pointer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/desktop-pointer.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { DESKTOP_POINTER_QUERY, isDesktopPointer, subscribeDesktopPointer } from "@/lib/desktop-pointer";

function stubMatchMedia(matches: boolean) {
  const query = { matches, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const matchMedia = vi.fn(() => query);
  vi.stubGlobal("window", { matchMedia });
  return { query, matchMedia };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isDesktopPointer", () => {
  it("asks for a fine pointer that can hover", () => {
    const { matchMedia } = stubMatchMedia(true);
    expect(isDesktopPointer()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(DESKTOP_POINTER_QUERY);
    expect(DESKTOP_POINTER_QUERY).toBe("(hover: hover) and (pointer: fine)");
  });

  it("is false on a touch device", () => {
    stubMatchMedia(false);
    expect(isDesktopPointer()).toBe(false);
  });

  it("is false where matchMedia does not exist", () => {
    vi.stubGlobal("window", {});
    expect(isDesktopPointer()).toBe(false);
  });

  it("is false without a window", () => {
    expect(isDesktopPointer()).toBe(false);
  });
});

describe("subscribeDesktopPointer", () => {
  it("listens for changes and stops on unsubscribe", () => {
    const { query } = stubMatchMedia(true);
    const onChange = vi.fn();
    const unsubscribe = subscribeDesktopPointer(onChange);
    expect(query.addEventListener).toHaveBeenCalledWith("change", onChange);
    unsubscribe();
    expect(query.removeEventListener).toHaveBeenCalledWith("change", onChange);
  });

  it("does nothing where matchMedia does not exist", () => {
    vi.stubGlobal("window", {});
    expect(() => subscribeDesktopPointer(vi.fn())()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/desktop-pointer.test.ts`
Expected: FAIL — cannot resolve `@/lib/desktop-pointer`.

- [ ] **Step 3: Implement**

Create `src/lib/desktop-pointer.ts`:

```ts
// "Desktop" means a mouse-like primary pointer: fine and able to hover. Phones and tablets
// report a coarse pointer and get the hold-to-see card instead of the Show button.
export const DESKTOP_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

function canMatch(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

export function isDesktopPointer(): boolean {
  return canMatch() && window.matchMedia(DESKTOP_POINTER_QUERY).matches;
}

export function subscribeDesktopPointer(onChange: () => void): () => void {
  if (!canMatch()) return () => {};
  const query = window.matchMedia(DESKTOP_POINTER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/desktop-pointer.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/desktop-pointer.ts src/lib/desktop-pointer.test.ts
git commit -m "feat(web): detect a mouse-like primary pointer"
```

---

### Task 4: Web — game frame

**Files:**
- Create: `src/components/games/GameFrame.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/games/GameFrame.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/games/GameFrame.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { GAME_THEME } from "@/lib/imposter";
import GameFrame from "./GameFrame";

type Node = ReactElement<Record<string, unknown>>;

describe("GameFrame", () => {
  it("draws the game on its own dark background with the dark palette", () => {
    const tree = GameFrame({ children: "X" }) as Node;
    expect(tree.props.style).toEqual({ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text });
    expect(String(tree.props.className).split(" ")).toContain("dark");
    expect(tree.props.children).toBe("X");
  });

  it("takes a player's colour with dark text on it", () => {
    const tree = GameFrame({ color: "#FF6B6B", children: "X" }) as Node;
    expect(tree.props.style).toEqual({ backgroundColor: "#FF6B6B", color: GAME_THEME.ink });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/games/GameFrame.test.ts`
Expected: FAIL — cannot resolve `./GameFrame`.

- [ ] **Step 3: Implement**

Create `src/components/games/GameFrame.tsx`:

```tsx
import type { ReactNode } from "react";
import { GAME_THEME } from "@/lib/imposter";

// The game draws on its own dark background whatever the app theme is: the `dark` class
// switches the themed gray classes inside to their dark values. `color` replaces the
// background on the screens that belong to one player; text there is dark.
export default function GameFrame({ color, children }: { color?: string; children: ReactNode }) {
  return (
    <div
      className="dark rounded-2xl p-4 sm:p-6"
      style={{ backgroundColor: color ?? GAME_THEME.bg, color: color ? GAME_THEME.ink : GAME_THEME.text }}
    >
      {children}
    </div>
  );
}
```

Append to `src/app/globals.css` (the file must still end with a newline):

```css

/* The imposter card fades in when it is shown; it hides at once. */
@keyframes game-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/games/GameFrame.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/games/GameFrame.tsx src/components/games/GameFrame.test.ts src/app/globals.css
git commit -m "feat(web): add the dark game frame"
```

---

### Task 5: Web — DealTurn (hold card and Show button)

**Files:**
- Create: `src/components/games/DealTurn.tsx`
- Test: `src/components/games/DealTurn.test.ts`

The frame around it (Task 10) supplies the player's colour and dark text; this component only sets colours on the card and the button.

- [ ] **Step 1: Write the failing test**

Create `src/components/games/DealTurn.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, type ReactElement } from "react";
import { GAME_THEME } from "@/lib/imposter";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  index: 0,
  desktop: false,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = hooks.index++;
      if (!(i in hooks.states)) hooks.states[i] = typeof initial === "function" ? initial() : initial;
      const set = (next: unknown) => {
        hooks.states[i] = typeof next === "function" ? next(hooks.states[i]) : next;
      };
      return [hooks.states[i], set];
    },
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
    useSyncExternalStore: () => hooks.desktop,
  };
});
vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "imposterPassTo" ? "Pass to {name}" : String(key)),
    }),
  }),
}));

import DealTurn from "./DealTurn";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onReveal = vi.fn();
const onNext = vi.fn();
const listeners: Record<string, () => void> = {};
const doc = {
  hidden: false,
  addEventListener: (type: string, fn: () => void) => {
    listeners[type] = fn;
  },
  removeEventListener: vi.fn(),
};

function render(revealed: boolean): Node {
  hooks.index = 0;
  hooks.effects = [];
  return DealTurn({ name: "Ann", revealed, onReveal, onNext, children: createElement("p", null, "SECRET") }) as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

const card = (tree: Node) => nodes(tree).find((n) => n.props["data-card"])!;
const button = (tree: Node, label: string) => nodes(tree).find((n) => n.type === "button" && text(n) === label);

function press(tree: Node) {
  const setPointerCapture = vi.fn();
  (card(tree).props.onPointerDown as (e: unknown) => void)({ pointerId: 7, currentTarget: { setPointerCapture } });
  return setPointerCapture;
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.states = [];
  hooks.desktop = false;
  doc.hidden = false;
  vi.stubGlobal("document", doc);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DealTurn hold card", () => {
  it("keeps the card closed until it is held", () => {
    const out = text(render(false));
    expect(out).toContain("Pass to Ann");
    expect(out).toContain("imposterHoldToSee");
    expect(out).not.toContain("SECRET");
  });

  it("asks for the reveal on the first press and shows the card once it was accepted", () => {
    press(render(false));
    expect(onReveal).toHaveBeenCalledTimes(1);
    // A press inside the reducer's tap guard is not accepted: the card must stay closed.
    expect(text(render(false))).not.toContain("SECRET");
    expect(text(render(true))).toContain("SECRET");
  });

  it("does not ask for the reveal again once the card was seen", () => {
    press(render(true));
    expect(onReveal).not.toHaveBeenCalled();
    expect(text(render(true))).toContain("SECRET");
  });

  it.each(["onPointerUp", "onPointerCancel", "onPointerLeave"])("hides the card on %s", (handler) => {
    press(render(true));
    expect(text(render(true))).toContain("SECRET");
    (card(render(true)).props[handler] as () => void)();
    expect(text(render(true))).not.toContain("SECRET");
  });

  it("captures the pointer so a drifting finger keeps the card open", () => {
    expect(press(render(true))).toHaveBeenCalledWith(7);
  });

  it("blocks the long-press menu, text selection and scrolling on the card", () => {
    const { props } = card(render(false));
    const preventDefault = vi.fn();
    (props.onContextMenu as (e: unknown) => void)({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(props.style).toMatchObject({ touchAction: "none", userSelect: "none" });
  });

  it("hides the card when the page goes to the background", () => {
    render(true);
    const cleanup = hooks.effects[0]() as () => void;
    press(render(true));
    listeners.visibilitychange();
    expect(text(render(true))).toContain("SECRET");
    doc.hidden = true;
    listeners.visibilitychange();
    expect(text(render(true))).not.toContain("SECRET");
    cleanup();
    expect(doc.removeEventListener).toHaveBeenCalledWith("visibilitychange", listeners.visibilitychange);
  });

  it("uses the same card colours closed and open, whatever the card says", () => {
    const fixed = { backgroundColor: GAME_THEME.bg, color: GAME_THEME.text };
    expect(card(render(true)).props.style).toMatchObject(fixed);
    press(render(true));
    expect(card(render(true)).props.style).toMatchObject(fixed);
  });
});

describe("DealTurn next player", () => {
  it("is disabled until the player has seen the card", () => {
    expect(button(render(false), "imposterNextPlayer")!.props.disabled).toBe(true);
    const next = button(render(true), "imposterNextPlayer")!;
    expect(next.props.disabled).toBe(false);
    expect(next.props.onClick).toBe(onNext);
  });
});

describe("DealTurn on a desktop pointer", () => {
  beforeEach(() => {
    hooks.desktop = true;
  });

  it("offers a Show button instead of the hold card", () => {
    const tree = render(false);
    expect(card(tree).props.onPointerDown).toBeUndefined();
    expect(text(tree)).not.toContain("imposterHoldToSee");
    expect(text(tree)).not.toContain("SECRET");
    expect(button(tree, "imposterShow")).toBeDefined();
  });

  it("shows and hides the card with the button, with no holding", () => {
    (button(render(false), "imposterShow")!.props.onClick as () => void)();
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(text(render(true))).toContain("SECRET");
    (button(render(true), "imposterHide")!.props.onClick as () => void)();
    expect(text(render(true))).not.toContain("SECRET");
    expect(button(render(true), "imposterShow")).toBeDefined();
    expect(onReveal).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/games/DealTurn.test.ts`
Expected: FAIL — cannot resolve `./DealTurn`.

- [ ] **Step 3: Implement**

Create `src/components/games/DealTurn.tsx`:

```tsx
"use client";

import { useEffect, useState, useSyncExternalStore, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { useLang } from "@/lib/i18n";
import { GAME_THEME } from "@/lib/imposter";
import { isDesktopPointer, subscribeDesktopPointer } from "@/lib/desktop-pointer";

// Without these a long press on a phone selects text, opens the context menu or is taken
// for a scroll, and the browser cancels the hold.
const holdStyle = { touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" } as const;

// One player's turn while the cards are dealt. On touch the card shows only while it is
// held; with a mouse it has a Show / Hide button. Mount it with `key={turn}` so an open
// card can never carry over to the next player.
export default function DealTurn({
  name,
  revealed,
  onReveal,
  onNext,
  children,
}: {
  name: string;
  /** The reducer accepted this player's reveal: they have seen their card. */
  revealed: boolean;
  onReveal: () => void;
  onNext: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  // False during prerender and before hydration: the hold card also works with a mouse.
  const desktop = useSyncExternalStore(subscribeDesktopPointer, isDesktopPointer, () => false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setOpen(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // The reducer ignores a reveal that comes too soon after the last tap. The card only
  // shows once the reveal was accepted, so "has seen it" and "may pass the phone on" never
  // disagree. Asking again after that would restart the tap guard and swallow Next.
  const show = () => {
    if (!revealed) onReveal();
    setOpen(true);
  };
  const hide = () => setOpen(false);
  const shown = open && revealed;

  const hold = desktop
    ? undefined
    : {
        role: "button",
        "aria-label": t.imposterHoldToSee,
        onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          show();
        },
        onPointerUp: hide,
        onPointerCancel: hide,
        onPointerLeave: hide,
        onContextMenu: (e: MouseEvent<HTMLDivElement>) => e.preventDefault(),
      };

  return (
    <div className="space-y-6 text-center">
      <p className="text-2xl font-bold">{t.imposterPassTo.replace("{name}", () => name)}</p>
      <p className="text-sm opacity-80">{t.imposterPassHint}</p>
      <div
        data-card
        className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-2xl p-6"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text, ...(desktop ? null : holdStyle) }}
        {...hold}
      >
        {shown ? (
          <div className="animate-[game-fade_150ms_ease-out] space-y-2">{children}</div>
        ) : (
          <p className="text-lg font-semibold" style={{ color: GAME_THEME.muted }}>
            {desktop ? "?" : t.imposterHoldToSee}
          </p>
        )}
        {desktop && (
          <button
            type="button"
            onClick={shown ? hide : show}
            className="rounded-lg px-8 py-2 font-semibold"
            style={{ backgroundColor: GAME_THEME.text, color: GAME_THEME.ink }}
          >
            {shown ? t.imposterHide : t.imposterShow}
          </button>
        )}
      </div>
      <button
        type="button"
        disabled={!revealed}
        onClick={onNext}
        className="rounded-lg px-10 py-3 font-semibold disabled:opacity-40"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        {t.imposterNextPlayer}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/games/DealTurn.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/games/DealTurn.tsx src/components/games/DealTurn.test.ts
git commit -m "feat(web): show the imposter card only while it is held"
```

---

### Task 6: Web — PassPhone becomes the vote gate

**Files:**
- Modify: `src/components/games/PassPhone.tsx`
- Test: `src/components/games/PassPhone.test.ts`

- [ ] **Step 1: Add a failing test**

In `src/components/games/PassPhone.test.ts` add `import { GAME_THEME } from "@/lib/imposter";` below the `react` import, and add this test inside `describe("PassPhone reveal gate", …)`:

```ts
  it("draws on the voter's colour with fixed colours, not themed ones", () => {
    const tree = render(false);
    expect(button(tree)!.props.style).toEqual({ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text });
    const classes = nodes(tree).map((n) => String(n.props.className ?? "")).join(" ");
    expect(classes).not.toMatch(/text-gray-|bg-blue-/);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/games/PassPhone.test.ts`
Expected: FAIL — the button has no `style`, classes contain `text-gray-900` and `bg-blue-600`. The three existing tests still pass.

- [ ] **Step 3: Implement**

Replace the whole of `src/components/games/PassPhone.tsx` with:

```tsx
"use client";

import type { ReactNode } from "react";
import { useLang } from "@/lib/i18n";
import { GAME_THEME } from "@/lib/imposter";

// The hand-over screen of the secret vote: the ballot only appears after the named player
// presses the button. It sits on that player's colour, so it sets no themed colours.
export default function PassPhone({
  name,
  revealed,
  revealLabel,
  onReveal,
  children,
}: {
  name: string;
  revealed: boolean;
  revealLabel: string;
  onReveal: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  if (revealed) return <div className="space-y-6 text-center">{children}</div>;
  return (
    <div className="space-y-6 py-10 text-center">
      <p className="text-2xl font-bold">{t.imposterPassTo.replace("{name}", () => name)}</p>
      <p className="text-sm opacity-80">{t.imposterPassHint}</p>
      <button
        type="button"
        onClick={onReveal}
        className="rounded-lg px-10 py-3 font-semibold"
        style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
      >
        {revealLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/games/PassPhone.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/games/PassPhone.tsx src/components/games/PassPhone.test.ts
git commit -m "feat(web): draw the vote hand-over screen on the voter's colour"
```

---

### Task 7: Web — setup step components

**Files:**
- Create: `src/components/games/SetupPlayersStep.tsx`, `SetupCategoryStep.tsx`, `SetupRulesStep.tsx`
- Test: `src/components/games/SetupPlayersStep.test.ts`, `SetupCategoryStep.test.ts`, `SetupRulesStep.test.ts`

The old `ImposterSetupForm.test.ts` assertions about players and the voting toggle move here unchanged in what they check; the start-gate ones move to Task 8. The old form and its test are deleted in Task 10.

- [ ] **Step 1: Write the failing tests**

Create `src/components/games/SetupPlayersStep.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, GAME_THEME, MAX_PLAYERS, playerColor, type ImposterSetup } from "@/lib/imposter";

vi.mock("lucide-react", () => ({ X: () => null }));
vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));

import SetupPlayersStep from "./SetupPlayersStep";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };

function render(value: ImposterSetup): Node {
  return SetupPlayersStep({ value, onChange }) as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

function button(tree: Node, label: string) {
  return nodes(tree).find((n) => n.type === "button" && text(n).includes(label));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SetupPlayersStep players", () => {
  it("removes exactly the chosen player", () => {
    const remove = nodes(render(valid)).filter((n) => n.props["aria-label"] === "imposterRemovePlayer");
    (remove[1].props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, players: ["Ann", "Cem"] });
  });

  it("disables Add at the player limit", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i}`);
    expect(button(render({ ...valid, players: names(MAX_PLAYERS) }), "imposterAddPlayer")?.props.disabled).toBe(true);
    expect(button(render({ ...valid, players: names(MAX_PLAYERS - 1) }), "imposterAddPlayer")?.props.disabled).toBe(false);
  });

  it("adds an empty player at the end", () => {
    (button(render(valid), "imposterAddPlayer")!.props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, players: ["Ann", "Bob", "Cem", ""] });
  });

  it("renames only the edited player", () => {
    const inputs = nodes(render(valid)).filter((n) => n.type === "input");
    expect(inputs.map((n) => n.props.value)).toEqual(["Ann", "Bob", "Cem"]);
    (inputs[1].props.onChange as (e: unknown) => void)({ target: { value: "Bea" } });
    expect(onChange).toHaveBeenCalledWith({ ...valid, players: ["Ann", "Bea", "Cem"] });
  });
});

describe("SetupPlayersStep colours", () => {
  it("draws each player's card in that seat's colour with dark text", () => {
    const tree = render(valid);
    const cards = nodes(tree).filter((n) => n.type === "div" && (n.props.style as { backgroundColor?: string })?.backgroundColor);
    expect(cards.map((n) => (n.props.style as { backgroundColor: string }).backgroundColor)).toEqual([
      playerColor(0),
      playerColor(1),
      playerColor(2),
    ]);
    for (const input of nodes(tree).filter((n) => n.type === "input")) {
      expect(input.props.style).toEqual({ color: GAME_THEME.ink });
    }
  });
});
```

Create `src/components/games/SetupCategoryStep.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import {
  CATEGORY_CHOICES,
  CATEGORY_EMOJI,
  CATEGORY_LABEL_KEYS,
  DEFAULT_SETUP,
  GAME_THEME,
  playerColor,
  type ImposterSetup,
} from "@/lib/imposter";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));

import SetupCategoryStep from "./SetupCategoryStep";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"], category: "food" };

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

function tiles(value: ImposterSetup): Node[] {
  return nodes(SetupCategoryStep({ value, onChange })).filter((n) => n.type === "button");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SetupCategoryStep", () => {
  it("shows one tile per category with its emoji and name", () => {
    const all = tiles(valid);
    expect(all).toHaveLength(CATEGORY_CHOICES.length);
    CATEGORY_CHOICES.forEach((c, i) => {
      expect(text(all[i])).toBe(`${CATEGORY_EMOJI[c]}${CATEGORY_LABEL_KEYS[c]}`);
      expect(all[i].props.style).toEqual({ backgroundColor: playerColor(i), color: GAME_THEME.ink });
    });
  });

  it("marks only the chosen category as pressed", () => {
    const pressed = tiles(valid).map((n) => n.props["aria-pressed"]);
    expect(pressed).toEqual(CATEGORY_CHOICES.map((c) => c === "food"));
  });

  it("picks the category of the tile that was clicked", () => {
    const animals = CATEGORY_CHOICES.indexOf("animals");
    (tiles(valid)[animals].props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, category: "animals" });
  });
});
```

Create `src/components/games/SetupRulesStep.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, type ImposterSetup } from "@/lib/imposter";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));

import SetupRulesStep from "./SetupRulesStep";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };

function render(value: ImposterSetup): Node {
  return SetupRulesStep({ value, onChange }) as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

function checkboxes(tree: Node) {
  return nodes(tree).filter((n) => n.type === "input" && n.props.type === "checkbox");
}

function button(tree: Node, label: string) {
  return nodes(tree).find((n) => n.type === "button" && text(n) === label)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SetupRulesStep voting toggle", () => {
  it("turns the scoreboard off with voting", () => {
    const value = { ...valid, voting: true, scoreboard: true };
    const [voting] = checkboxes(render(value));
    (voting.props.onChange as (e: unknown) => void)({ target: { checked: false } });
    expect(onChange).toHaveBeenCalledWith({ ...value, voting: false, scoreboard: false });
  });

  it("disables the scoreboard checkbox only while voting is off", () => {
    expect(checkboxes(render({ ...valid, voting: false }))[1].props.disabled).toBe(true);
    expect(checkboxes(render({ ...valid, voting: true }))[1].props.disabled).toBe(false);
  });
});

describe("SetupRulesStep mode", () => {
  it("switches the mode", () => {
    (button(render(valid), "imposterModeSimilar").props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, mode: "similar-word" });
  });

  it("offers 'imposter knows their role' only in similar-word mode", () => {
    expect(text(render(valid))).not.toContain("imposterKnowsRole");
    const tree = render({ ...valid, mode: "similar-word" });
    expect(text(tree)).toContain("imposterKnowsRole");
    const [knows] = checkboxes(tree);
    (knows.props.onChange as (e: unknown) => void)({ target: { checked: true } });
    expect(onChange).toHaveBeenCalledWith({ ...valid, mode: "similar-word", imposterKnows: true });
  });
});

describe("SetupRulesStep imposter count and timer", () => {
  it("disables the counts the player count does not allow", () => {
    const three = render(valid);
    expect(button(three, "1").props.disabled).toBe(false);
    expect(button(three, "2").props.disabled).toBe(true);
    expect(button(three, "3").props.disabled).toBe(true);
    const seven = render({ ...valid, players: ["A", "B", "C", "D", "E", "F", "G"] });
    expect(button(seven, "3").props.disabled).toBe(false);
  });

  it("sets the imposter count and the timer", () => {
    const five = { ...valid, players: ["A", "B", "C", "D", "E"] };
    (button(render(five), "2").props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...five, imposterCount: 2 });
    const select = nodes(render(valid)).find((n) => n.type === "select")!;
    (select.props.onChange as (e: unknown) => void)({ target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith({ ...valid, timerMinutes: 5 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/games/SetupPlayersStep.test.ts src/components/games/SetupCategoryStep.test.ts src/components/games/SetupRulesStep.test.ts`
Expected: FAIL — the three components cannot be resolved.

- [ ] **Step 3: Implement**

Create `src/components/games/SetupPlayersStep.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { GAME_THEME, MAX_PLAYERS, playerColor, type ImposterSetup } from "@/lib/imposter";

export default function SetupPlayersStep({
  value,
  onChange,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
}) {
  const { t } = useLang();
  const setPlayers = (players: string[]) => onChange({ ...value, players });

  return (
    <div className="space-y-2">
      {value.players.map((name, i) => (
        <div key={i} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: playerColor(i) }}>
          <input
            value={name}
            onChange={(e) => setPlayers(value.players.map((p, j) => (j === i ? e.target.value : p)))}
            placeholder={t.imposterPlayerName}
            className="min-w-0 flex-1 bg-transparent text-lg font-semibold placeholder:text-black/40 focus:outline-none"
            style={{ color: GAME_THEME.ink }}
          />
          <button
            type="button"
            onClick={() => setPlayers(value.players.filter((_, j) => j !== i))}
            className="rounded-lg p-1 hover:bg-black/10"
            style={{ color: GAME_THEME.ink }}
            aria-label={t.imposterRemovePlayer}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={value.players.length >= MAX_PLAYERS}
        onClick={() => setPlayers([...value.players, ""])}
        className="w-full rounded-xl border border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-50"
      >
        + {t.imposterAddPlayer}
      </button>
    </div>
  );
}
```

Create `src/components/games/SetupCategoryStep.tsx`:

```tsx
"use client";

import { useLang } from "@/lib/i18n";
import {
  CATEGORY_CHOICES,
  CATEGORY_EMOJI,
  CATEGORY_LABEL_KEYS,
  GAME_THEME,
  playerColor,
  type ImposterSetup,
} from "@/lib/imposter";

export default function SetupCategoryStep({
  value,
  onChange,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
}) {
  const { t } = useLang();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {CATEGORY_CHOICES.map((c, i) => {
        const active = value.category === c;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            onClick={() => onChange({ ...value, category: c })}
            className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-5 font-semibold transition ${
              active ? "ring-4 ring-white" : "opacity-60 hover:opacity-90"
            }`}
            style={{ backgroundColor: playerColor(i), color: GAME_THEME.ink }}
          >
            <span className="text-3xl" aria-hidden>
              {CATEGORY_EMOJI[c]}
            </span>
            <span>{t[CATEGORY_LABEL_KEYS[c]]}</span>
          </button>
        );
      })}
    </div>
  );
}
```

Create `src/components/games/SetupRulesStep.tsx`:

```tsx
"use client";

import { useLang } from "@/lib/i18n";
import {
  MAX_IMPOSTERS,
  MAX_TIMER_MINUTES,
  maxImposters,
  type ImposterMode,
  type ImposterSetup,
} from "@/lib/imposter";

const pill = (active: boolean) =>
  `flex-1 rounded-md px-3 py-2 text-sm transition ${active ? "bg-surface font-semibold text-gray-900 shadow-sm" : "text-gray-500"}`;

export default function SetupRulesStep({
  value,
  onChange,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
}) {
  const { t } = useLang();
  const limit = Math.max(1, maxImposters(value.players.length));
  const set = (patch: Partial<ImposterSetup>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-gray-500">{t.imposterMode}</h3>
        <div className="flex rounded-lg bg-gray-100 p-1">
          {(["no-word", "similar-word"] as ImposterMode[]).map((mode) => (
            <button key={mode} type="button" className={pill(value.mode === mode)} onClick={() => set({ mode })}>
              {mode === "no-word" ? t.imposterModeNoWord : t.imposterModeSimilar}
            </button>
          ))}
        </div>
        {value.mode === "similar-word" && (
          <label className="flex items-center justify-between gap-3 pt-1">
            <span>
              <span className="block text-gray-900">{t.imposterKnowsRole}</span>
              <span className="block text-xs text-gray-400">{t.imposterKnowsRoleHint}</span>
            </span>
            <input
              type="checkbox"
              checked={value.imposterKnows}
              onChange={(e) => set({ imposterKnows: e.target.checked })}
              className="h-5 w-5 shrink-0"
            />
          </label>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-gray-500">{t.imposterCount}</h3>
        <div className="flex rounded-lg bg-gray-100 p-1">
          {Array.from({ length: MAX_IMPOSTERS }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              disabled={n > limit}
              className={`${pill(value.imposterCount === n)} disabled:opacity-40`}
              onClick={() => set({ imposterCount: n })}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-gray-500">{t.imposterTimer}</span>
        <select
          value={value.timerMinutes}
          onChange={(e) => set({ timerMinutes: Number(e.target.value) })}
          className="w-full rounded-lg border border-gray-200 bg-surface px-3 py-2 text-gray-900"
        >
          {Array.from({ length: MAX_TIMER_MINUTES + 1 }, (_, m) => (
            <option key={m} value={m}>
              {m === 0 ? t.imposterTimerOff : t.imposterMinutes.replace("{n}", String(m))}
            </option>
          ))}
        </select>
      </label>

      <section className="space-y-3 rounded-xl border border-gray-100 bg-surface p-4">
        <label className="flex items-center justify-between">
          <span className="text-gray-900">{t.imposterVoting}</span>
          <input
            type="checkbox"
            checked={value.voting}
            onChange={(e) => set({ voting: e.target.checked, scoreboard: e.target.checked && value.scoreboard })}
            className="h-5 w-5"
          />
        </label>
        <label className={`flex items-center justify-between ${value.voting ? "" : "opacity-50"}`}>
          <span>
            <span className="block text-gray-900">{t.imposterScoreboard}</span>
            {!value.voting && <span className="block text-xs text-gray-400">{t.imposterScoreboardHint}</span>}
          </span>
          <input
            type="checkbox"
            disabled={!value.voting}
            checked={value.scoreboard}
            onChange={(e) => set({ scoreboard: e.target.checked })}
            className="h-5 w-5"
          />
        </label>
      </section>
    </div>
  );
}
```

Note for the checkbox order the tests rely on: in `no-word` mode the checkboxes are `[voting, scoreboard]`; in `similar-word` mode `[imposterKnows, voting, scoreboard]`.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/components/games/SetupPlayersStep.test.ts src/components/games/SetupCategoryStep.test.ts src/components/games/SetupRulesStep.test.ts`
Expected: PASS — 5 + 3 + 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/games/SetupPlayersStep.tsx src/components/games/SetupPlayersStep.test.ts src/components/games/SetupCategoryStep.tsx src/components/games/SetupCategoryStep.test.ts src/components/games/SetupRulesStep.tsx src/components/games/SetupRulesStep.test.ts
git commit -m "feat(web): split the imposter setup into player, category and rules steps"
```

---

### Task 8: Web — setup wizard

**Files:**
- Create: `src/components/games/ImposterSetupWizard.tsx`
- Test: `src/components/games/ImposterSetupWizard.test.ts`

`ImposterSetupForm.tsx` and its test stay until Task 10 switches `ImposterGame` over and deletes them, so the build stays green between tasks.

- [ ] **Step 1: Write the failing test**

Create `src/components/games/ImposterSetupWizard.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, type ImposterSetup } from "@/lib/imposter";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));
vi.mock("./SetupPlayersStep", () => ({ default: () => null }));
vi.mock("./SetupCategoryStep", () => ({ default: () => null }));
vi.mock("./SetupRulesStep", () => ({ default: () => null }));

import ImposterSetupWizard from "./ImposterSetupWizard";
import SetupPlayersStep from "./SetupPlayersStep";
import SetupCategoryStep from "./SetupCategoryStep";
import SetupRulesStep from "./SetupRulesStep";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const onStep = vi.fn();
const onStart = vi.fn();
const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };

function render(value: ImposterSetup, step: number, quickStart = false): Node {
  return ImposterSetupWizard({ value, onChange, step, onStep, onStart, quickStart }) as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

function button(tree: Node, label: string) {
  return nodes(tree).find((n) => n.type === "button" && text(n) === label);
}

function errors(tree: Node) {
  return nodes(tree).filter((n) => n.type === "li").map(text);
}

function has(tree: Node, type: unknown) {
  return nodes(tree).some((n) => n.type === type);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ImposterSetupWizard steps", () => {
  it("shows one step at a time and hands it the setup", () => {
    const first = render(valid, 0);
    expect([has(first, SetupPlayersStep), has(first, SetupCategoryStep), has(first, SetupRulesStep)]).toEqual([true, false, false]);
    expect(nodes(first).find((n) => n.type === SetupPlayersStep)!.props).toEqual({ value: valid, onChange });
    expect(has(render(valid, 1), SetupCategoryStep)).toBe(true);
    expect(has(render(valid, 2), SetupRulesStep)).toBe(true);
  });

  it("says which step of how many is showing", () => {
    const label = nodes(render(valid, 1)).find((n) => n.props["aria-label"])!.props["aria-label"];
    expect(label).toBe("imposterStep".replace("{n}", "2").replace("{total}", "3"));
  });

  it("has no Back on the first step and goes back from the others", () => {
    expect(button(render(valid, 0), "back")).toBeUndefined();
    (button(render(valid, 2), "back")!.props.onClick as () => void)();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("moves on with Next when the step has no errors", () => {
    const next = button(render(valid, 0), "imposterNext")!;
    expect(next.props.disabled).toBe(false);
    (next.props.onClick as () => void)();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("stops on a step with errors and lists only that step's errors", () => {
    const broken = { ...DEFAULT_SETUP, players: ["Ann"], scoreboard: true };
    const tree = render(broken, 0);
    expect(errors(tree)).toEqual(["imposterErrTooFew"]);
    expect(button(tree, "imposterNext")!.props.disabled).toBe(true);
    expect(errors(render(broken, 1))).toEqual([]);
    expect(button(render(broken, 1), "imposterNext")!.props.disabled).toBe(false);
  });
});

describe("ImposterSetupWizard start gate", () => {
  it("lists the errors and disables Start for an invalid setup", () => {
    const tree = render({ ...DEFAULT_SETUP, players: ["Ann"] }, 2);
    expect(errors(tree)).toEqual(["imposterErrTooFew"]);
    expect(button(tree, "imposterStart")?.props.disabled).toBe(true);
    expect(button(tree, "imposterNext")).toBeUndefined();
  });

  it("starts the game from a valid setup", () => {
    const tree = render(valid, 2);
    expect(errors(tree)).toEqual([]);
    const start = button(tree, "imposterStart")!;
    expect(start.props.disabled).toBe(false);
    (start.props.onClick as () => void)();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("does not offer Start before the last step", () => {
    expect(button(render(valid, 0), "imposterStart")).toBeUndefined();
    expect(button(render(valid, 1), "imposterStart")).toBeUndefined();
  });
});

describe("ImposterSetupWizard quick start", () => {
  it("starts at once from the first step when a game was played before", () => {
    const quick = button(render(valid, 0, true), "imposterQuickStart")!;
    (quick.props.onClick as () => void)();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("is not offered to a first-time player, with an invalid setup, or after the first step", () => {
    expect(button(render(valid, 0, false), "imposterQuickStart")).toBeUndefined();
    expect(button(render({ ...valid, players: ["Ann"] }, 0, true), "imposterQuickStart")).toBeUndefined();
    expect(button(render(valid, 1, true), "imposterQuickStart")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/games/ImposterSetupWizard.test.ts`
Expected: FAIL — cannot resolve `./ImposterSetupWizard`.

- [ ] **Step 3: Implement**

Create `src/components/games/ImposterSetupWizard.tsx`:

```tsx
"use client";

import { useLang } from "@/lib/i18n";
import {
  GAME_THEME,
  SETUP_ERROR_KEYS,
  SETUP_STEPS,
  playerColor,
  stepErrors,
  validateSetup,
  type ImposterSetup,
} from "@/lib/imposter";
import SetupPlayersStep from "./SetupPlayersStep";
import SetupCategoryStep from "./SetupCategoryStep";
import SetupRulesStep from "./SetupRulesStep";

// The setup, one step at a time. The step lives in the parent so this component has no
// state of its own.
export default function ImposterSetupWizard({
  value,
  onChange,
  step,
  onStep,
  onStart,
  quickStart,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
  /** Index into SETUP_STEPS. */
  step: number;
  onStep: (step: number) => void;
  onStart: () => void;
  /** A game was played on this device before: offer to skip the remaining steps. */
  quickStart: boolean;
}) {
  const { t } = useLang();
  const name = SETUP_STEPS[step];
  const last = step === SETUP_STEPS.length - 1;
  const allErrors = validateSetup(value);
  // The last step shows everything that still blocks Start, whichever step it belongs to.
  const errors = last ? allErrors : stepErrors(value, name);
  const titles = { players: t.imposterPlayers, category: t.imposterCategory, rules: t.imposterStepRules };
  const primary = "flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">{titles[name]}</h2>
        <div
          className="flex gap-1.5"
          role="img"
          aria-label={t.imposterStep.replace("{n}", String(step + 1)).replace("{total}", String(SETUP_STEPS.length))}
        >
          {SETUP_STEPS.map((s, i) => (
            <span key={s} className={`h-2 w-2 rounded-full ${i === step ? "bg-white" : "bg-white/30"}`} />
          ))}
        </div>
      </div>

      {name === "players" && <SetupPlayersStep value={value} onChange={onChange} />}
      {name === "category" && <SetupCategoryStep value={value} onChange={onChange} />}
      {name === "rules" && <SetupRulesStep value={value} onChange={onChange} />}

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:text-amber-400">
          {errors.map((e) => (
            <li key={e}>{t[SETUP_ERROR_KEYS[e]]}</li>
          ))}
        </ul>
      )}

      <div className="flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => onStep(step - 1)}
            className="flex-1 rounded-lg border border-gray-200 py-3 text-gray-600 hover:bg-gray-100"
          >
            {t.back}
          </button>
        )}
        {last ? (
          <button type="button" disabled={allErrors.length > 0} onClick={onStart} className={primary}>
            {t.imposterStart}
          </button>
        ) : (
          <button type="button" disabled={errors.length > 0} onClick={() => onStep(step + 1)} className={primary}>
            {t.imposterNext}
          </button>
        )}
      </div>

      {step === 0 && quickStart && allErrors.length === 0 && (
        <button
          type="button"
          onClick={onStart}
          className="w-full rounded-lg py-3 font-semibold"
          style={{ backgroundColor: playerColor(2), color: GAME_THEME.ink }}
        >
          {t.imposterQuickStart}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/components/games/ImposterSetupWizard.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/games/ImposterSetupWizard.tsx src/components/games/ImposterSetupWizard.test.ts
git commit -m "feat(web): add the three-step imposter setup wizard"
```

---

### Task 9: Web — player colours on the discussion and result screens

**Files:**
- Modify: `src/components/games/ImposterDiscuss.tsx`, `src/components/games/ImposterResult.tsx`
- Test: `src/components/games/ImposterDiscuss.test.ts`, `src/components/games/ImposterResult.test.ts`

- [ ] **Step 1: Add the failing tests**

In `src/components/games/ImposterDiscuss.test.ts`:

1. Add `import { GAME_THEME } from "@/lib/imposter";` below the `react` import.
2. Change the `render` helper's call to pass the new prop:

```ts
  return ImposterDiscuss({ starter: "Ann", starterColor: "#123456", timerMinutes, voting: true, onFinish: vi.fn() }) as Node;
```

3. Add this helper below `text`:

```ts
function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}
```

4. Add at the end of the file:

```ts
describe("ImposterDiscuss starter", () => {
  it("names who starts on that player's colour", () => {
    const chip = nodes(render(0)).find((n) => n.props.style)!;
    expect(text(chip)).toBe("imposterStarts");
    expect(chip.props.style).toEqual({ backgroundColor: "#123456", color: GAME_THEME.ink });
  });
});
```

In `src/components/games/ImposterResult.test.ts`:

1. Change the import from `@/lib/imposter` to also bring in `playerColor`:

```ts
import { DEFAULT_SETUP, initialGameState, playerColor, type GameState, type Outcome } from "@/lib/imposter";
```

2. Add at the end of the file:

```ts
describe("ImposterResult colours", () => {
  it("writes each name in that player's colour, imposters and scoreboard alike", () => {
    const names = ["Ann", "Bob", "Cem"];
    const coloured = nodes(render(game(null, true))).filter((n) => (n.props.style as { color?: string })?.color);
    // Two imposters, then the three scoreboard rows (highest score first).
    expect(coloured.map(text)).toEqual(["Ann", "Cem", "Bob", "Cem", "Ann"]);
    for (const n of coloured) {
      expect((n.props.style as { color: string }).color).toBe(playerColor(names.indexOf(text(n))));
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/games/ImposterDiscuss.test.ts src/components/games/ImposterResult.test.ts`
Expected: FAIL — no element has a `style` (Discuss); `coloured` is empty (Result). The existing tests in both files still pass.

- [ ] **Step 3: Implement**

In `src/components/games/ImposterDiscuss.tsx`:

Change the imports to:

```tsx
import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { GAME_THEME, formatCountdown, remainingSeconds } from "@/lib/imposter";
```

Change the props to:

```tsx
export default function ImposterDiscuss({
  starter,
  starterColor,
  timerMinutes,
  voting,
  onFinish,
}: {
  starter: string;
  starterColor: string;
  timerMinutes: number;
  voting: boolean;
  onFinish: () => void;
}) {
```

Replace the line with the starter sentence:

```tsx
      <p className="text-2xl font-bold text-gray-900">{t.imposterStarts.replace("{name}", () => starter)}</p>
```

with:

```tsx
      <p
        className="inline-block rounded-full px-5 py-2 text-2xl font-bold"
        style={{ backgroundColor: starterColor, color: GAME_THEME.ink }}
      >
        {t.imposterStarts.replace("{name}", () => starter)}
      </p>
```

In `src/components/games/ImposterResult.tsx`:

Change the type import to:

```tsx
import { playerColor, type GameState } from "@/lib/imposter";
```

Replace the imposters line:

```tsx
          <b>{round.imposters.map((i) => names[i]).join(", ")}</b>
```

with:

```tsx
          <b>
            {round.imposters.flatMap((i, n) => [
              n > 0 ? ", " : "",
              <span key={i} style={{ color: playerColor(i) }}>
                {names[i]}
              </span>,
            ])}
          </b>
```

Replace the scoreboard rows:

```tsx
          {names
            .map((name, i) => ({ name, score: scores[i] }))
            .sort((a, b) => b.score - a.score)
            .map(({ name, score }) => (
              <div key={name} className="flex justify-between py-1 text-gray-900">
                <span>{name}</span>
                <b>{score}</b>
              </div>
            ))}
```

with:

```tsx
          {names
            .map((name, i) => ({ name, score: scores[i], color: playerColor(i) }))
            .sort((a, b) => b.score - a.score)
            .map(({ name, score, color }) => (
              <div key={name} className="flex justify-between py-1 text-gray-900">
                <span className="font-semibold" style={{ color }}>
                  {name}
                </span>
                <b>{score}</b>
              </div>
            ))}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/components/games/ImposterDiscuss.test.ts src/components/games/ImposterResult.test.ts`
Expected: PASS, including the existing "reveals the imposters" test (`"Ann, Cem"`).

`ImposterGame.tsx` does not pass `starterColor` yet, so `npx tsc --noEmit` fails until Task 10. Do Task 10 next, before anything else.

- [ ] **Step 5: Commit**

```bash
git add src/components/games/ImposterDiscuss.tsx src/components/games/ImposterDiscuss.test.ts src/components/games/ImposterResult.tsx src/components/games/ImposterResult.test.ts
git commit -m "feat(web): show player colours on the discussion and result screens"
```

---

### Task 10: Web — wire the game container

**Files:**
- Modify: `src/components/games/ImposterGame.tsx`
- Modify: `src/components/games/ImposterGame.test.ts`
- Delete: `src/components/games/ImposterSetupForm.tsx`, `src/components/games/ImposterSetupForm.test.ts`

`ImposterGame.test.ts` renders the real component with `react-dom` into a fake container with no DOM. `ImposterGame` must therefore keep returning only other components (all mocked to `null` in the test), never a host element such as `<div>`. That is why the frame is its own component.

- [ ] **Step 1: Update the test**

In `src/components/games/ImposterGame.test.ts`:

1. Extend the import from `@/lib/imposter` with `playerColor`.

2. Replace the hoisted `state` object with:

```ts
const state = vi.hoisted(() => ({
  form: null as null | {
    value: unknown;
    onChange: (v: unknown) => void;
    onStart: () => void;
    step: number;
    onStep: (step: number) => void;
    quickStart: boolean;
  },
  turnRenders: 0,
  frameColor: undefined as string | undefined,
  pass: null as null | { name: string; revealed: boolean; onReveal: () => void; onNext?: () => void; children?: unknown },
  discuss: null as null | { onFinish: () => void; starterColor: string },
  result: null as null | { state: GameState; onEnd: () => void; onNextRound: () => void },
}));
```

3. Replace the `vi.mock("./ImposterSetupForm", …)` and `vi.mock("./PassPhone", …)` blocks with:

```ts
vi.mock("./ImposterSetupWizard", () => ({
  default: (props: NonNullable<typeof state.form>) => {
    state.form = props;
    return null;
  },
}));
vi.mock("./GameFrame", () => ({
  default: (props: { color?: string; children?: unknown }) => {
    state.frameColor = props.color;
    return props.children;
  },
}));
vi.mock("./DealTurn", () => ({
  default: (props: NonNullable<typeof state.pass>) => {
    state.turnRenders++;
    state.pass = props;
    return null;
  },
}));
vi.mock("./PassPhone", () => ({
  default: (props: NonNullable<typeof state.pass>) => {
    state.turnRenders++;
    state.pass = props;
    return null;
  },
}));
```

4. Change the `./ImposterDiscuss` mock's prop type to `{ onFinish: () => void; starterColor: string }`.

5. Replace `dealAll` with:

```ts
async function dealAll(count: number) {
  for (let i = 0; i < count; i++) {
    await reveal();
    await act(async () => state.pass!.onNext!());
  }
}
```

6. In `beforeEach`, replace `state.passPhoneRenders = 0;` with:

```ts
  state.turnRenders = 0;
  state.frameColor = undefined;
```

7. In the `saveSetup` test, replace `expect(state.passPhoneRenders).toBeGreaterThan(0);` with `expect(state.turnRenders).toBeGreaterThan(0);`.

8. Rename the test `"shows the crew word to the next player after hide and next"` to `"shows the crew word to the next player after Next player"`. Its body does not change.

9. Add these tests inside `describe("ImposterGame rounds", …)`:

```ts
  it("draws each turn on that player's colour and the other screens on the dark frame", async () => {
    await render();
    expect(state.frameColor).toBeUndefined();
    await act(async () => state.form?.onChange(valid));
    await act(async () => state.form?.onStart());
    expect(state.frameColor).toBe(playerColor(0));
    await dealAll(1);
    expect(state.frameColor).toBe(playerColor(1));
    await dealAll(2);
    expect(state.frameColor).toBeUndefined();
    expect(state.discuss?.starterColor).toBe(playerColor(0));
  });

  it("keeps the wizard step in the game and opens on the first step again after a game", async () => {
    await render();
    expect(state.form?.step).toBe(0);
    await act(async () => state.form?.onStep(2));
    expect(state.form?.step).toBe(2);
    await act(async () => state.form?.onChange(valid));
    await act(async () => state.form?.onStart());
    await dealAll(3);
    await act(async () => state.discuss!.onFinish());
    await act(async () => state.result!.onEnd());
    expect(state.form?.step).toBe(0);
  });
```

10. Add a new `describe` at the end of the file:

```ts
describe("ImposterGame quick start", () => {
  it("is off on a device that has no saved game", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
    await render();
    expect(state.form?.quickStart).toBe(false);
  });

  it("is on when a valid setup was saved", async () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(valid), setItem: vi.fn() });
    await render();
    expect(state.form?.value).toEqual(valid);
    expect(state.form?.quickStart).toBe(true);
  });

  it("turns on after the first game on this device", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
    vi.spyOn(Math, "random").mockReturnValue(0);
    let clock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
    await start(valid);
    await dealAll(3);
    await act(async () => state.discuss!.onFinish());
    await act(async () => state.result!.onEnd());
    expect(state.form?.quickStart).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/games/ImposterGame.test.ts`
Expected: FAIL — `state.form` stays `null` (the game still renders `ImposterSetupForm`, which is no longer mocked and crashes the fake container).

- [ ] **Step 3: Implement**

Replace the whole of `src/components/games/ImposterGame.tsx` with:

```tsx
"use client";

import { useEffect, useReducer, useState } from "react";
import { useLang } from "@/lib/i18n";
import {
  CATEGORY_LABEL_KEYS,
  DEFAULT_SETUP,
  GAME_THEME,
  SETUP_STORAGE_KEY,
  gameReducer,
  initialGameState,
  parseSavedSetup,
  playerColor,
  validateSetup,
  type ImposterSetup,
} from "@/lib/imposter";
import DealTurn from "./DealTurn";
import GameFrame from "./GameFrame";
import ImposterDiscuss from "./ImposterDiscuss";
import ImposterResult from "./ImposterResult";
import ImposterSetupWizard from "./ImposterSetupWizard";
import PassPhone from "./PassPhone";

function loadSetup(): ImposterSetup {
  try {
    return parseSavedSetup(localStorage.getItem(SETUP_STORAGE_KEY));
  } catch {
    return DEFAULT_SETUP;
  }
}

function saveSetup(setup: ImposterSetup) {
  try {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Private mode or full storage: the game still runs, the names just are not remembered.
  }
}

// Returns only other components, never a host element: its test renders it without a DOM.
export default function ImposterGame() {
  const { t, lang } = useLang();
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState());
  const [draft, setDraft] = useState<ImposterSetup>(DEFAULT_SETUP);
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);

  // Read after mount: localStorage does not exist during prerendering.
  useEffect(() => {
    const saved = loadSetup();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(saved);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlayed(validateSetup(saved).length === 0);
  }, []);

  const { phase, setup, round, turn, revealed } = state;
  const names = setup.players;

  if (phase === "setup") {
    return (
      <GameFrame>
        <ImposterSetupWizard
          value={draft}
          onChange={setDraft}
          step={step}
          onStep={setStep}
          quickStart={played}
          onStart={() => {
            saveSetup(draft);
            setPlayed(true);
            setStep(0);
            dispatch({ type: "start", setup: draft, lang, rng: Math.random, at: Date.now() });
          }}
        />
      </GameFrame>
    );
  }

  if (!round) return null;

  if (phase === "deal") {
    const card = round.cards[turn];
    // The card text is the same colour for every role: only the words differ.
    const label = <p className="text-sm" style={{ color: GAME_THEME.muted }}>{t.imposterYourWord}</p>;
    return (
      <GameFrame color={playerColor(turn)}>
        <DealTurn
          key={turn}
          name={names[turn]}
          revealed={revealed}
          onReveal={() => dispatch({ type: "reveal", at: Date.now() })}
          onNext={() => dispatch({ type: "next", at: Date.now() })}
        >
          {card.kind === "word" ? (
            <>
              {label}
              <p className="text-4xl font-bold">{card.text}</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold">{t.imposterYouAre}</p>
              {card.word ? (
                <>
                  {label}
                  <p className="text-4xl font-bold">{card.word}</p>
                </>
              ) : (
                <p style={{ color: GAME_THEME.muted }}>
                  {t.imposterCategoryHint.replace("{category}", t[CATEGORY_LABEL_KEYS[card.category]])}
                </p>
              )}
            </>
          )}
        </DealTurn>
      </GameFrame>
    );
  }

  if (phase === "discuss") {
    return (
      <GameFrame>
        <ImposterDiscuss
          starter={names[round.starter]}
          starterColor={playerColor(round.starter)}
          timerMinutes={setup.timerMinutes}
          voting={setup.voting}
          onFinish={() => dispatch({ type: "finishDiscussion", at: Date.now() })}
        />
      </GameFrame>
    );
  }

  if (phase === "vote") {
    return (
      <GameFrame color={playerColor(turn)}>
        <PassPhone
          name={names[turn]}
          revealed={revealed}
          revealLabel={t.imposterOpenBallot}
          onReveal={() => dispatch({ type: "reveal", at: Date.now() })}
        >
          <p className="text-xl font-bold">{t.imposterWhoIs}</p>
          <div className="grid grid-cols-2 gap-2">
            {names.map((name, i) =>
              i === turn ? null : (
                <button
                  key={name}
                  type="button"
                  onClick={() => dispatch({ type: "vote", target: i, at: Date.now() })}
                  className="rounded-xl border-2 py-3 font-semibold"
                  style={{ backgroundColor: playerColor(i), color: GAME_THEME.ink, borderColor: GAME_THEME.bg }}
                >
                  {name}
                </button>
              )
            )}
          </div>
        </PassPhone>
      </GameFrame>
    );
  }

  return (
    <GameFrame>
      <ImposterResult
        state={state}
        onNextRound={() => dispatch({ type: "nextRound", lang, rng: Math.random, at: Date.now() })}
        onEnd={() => {
          setDraft(state.setup);
          dispatch({ type: "end", at: Date.now() });
        }}
      />
    </GameFrame>
  );
}
```

Delete the old form and its test:

```bash
git rm src/components/games/ImposterSetupForm.tsx src/components/games/ImposterSetupForm.test.ts
```

Every assertion of the deleted test now lives in `SetupPlayersStep.test.ts` (remove a player, Add limit), `SetupRulesStep.test.ts` (voting toggle, scoreboard disabled) and `ImposterSetupWizard.test.ts` (start gate). Check with `grep -rn "ImposterSetupForm" src` — expected: no output.

- [ ] **Step 4: Run the web checks**

Run: `npx vitest run src/components/games src/lib/imposter.test.ts src/lib/desktop-pointer.test.ts`
Expected: PASS, every file.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx eslint src/components/games src/lib/desktop-pointer.ts`
Expected: no problems.

- [ ] **Step 5: Commit**

```bash
git add src/components/games/ImposterGame.tsx src/components/games/ImposterGame.test.ts
git commit -m "feat(web): run the imposter game through the setup wizard and the hold card"
```

(`git rm` already staged the two deletions; confirm with `git diff --cached --name-only` before committing.)

---

### Task 11: Mobile — game theme, game button, GameScreen options

**Files:**
- Create: `mobile/src/lib/game-theme.ts`, `mobile/src/components/games/game-button.tsx`
- Modify: `mobile/src/components/games/game-screen.tsx`
- Test: `mobile/src/lib/game-theme.test.ts`, `mobile/src/lib/game-button.test.ts`, `mobile/src/lib/game-screens.test.ts`

All commands in Tasks 11–16 run from `mobile/`.

- [ ] **Step 1: Write the failing tests**

Create `mobile/src/lib/game-theme.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("nativewind", () => ({ vars: (v: Record<string, string>) => ({ applied: v }) }));

import { GAME_DARK_TOKENS, gameDarkVars } from "@/lib/game-theme";

function darkTokensInCss(): Record<string, string> {
  const css = readFileSync(path.resolve(__dirname, "../../tailwind.css"), "utf8");
  const dark = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
  return Object.fromEntries([...dark.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

describe("game theme", () => {
  it("is the dark palette of tailwind.css, token for token", () => {
    expect(GAME_DARK_TOKENS).toEqual(darkTokensInCss());
  });

  it("is handed to NativeWind as variables", () => {
    expect(gameDarkVars).toEqual({ applied: GAME_DARK_TOKENS });
  });
});
```

Create `mobile/src/lib/game-button.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { GAME_THEME } from "@ptracker/shared/imposter";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null }));

import { GameButton } from "@/components/games/game-button";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

describe("GameButton", () => {
  it("is a dark button with light text, readable on any player colour", () => {
    const onPress = vi.fn();
    const button = GameButton({ label: "GO", onPress }) as Node;
    expect(button.props.onPress).toBe(onPress);
    expect(button.props.disabled).toBe(false);
    expect(button.props.style).toEqual({ backgroundColor: GAME_THEME.bg });
    const label = button.props.children as Node;
    expect(label.props.children).toBe("GO");
    expect(label.props.style).toEqual({ color: GAME_THEME.text });
  });

  it("dims and stops reacting when disabled", () => {
    const button = GameButton({ label: "GO", onPress: vi.fn(), disabled: true }) as Node;
    expect(button.props.disabled).toBe(true);
    expect(String(button.props.className)).toContain("opacity-40");
  });
});
```

In `mobile/src/lib/game-screens.test.ts`:

1. In the `vi.mock("react-native", …)` object add `StatusBar: () => null,` (keep the list alphabetical: after `ScrollView`).

2. Below the `vi.mock("react-native-safe-area-context", …)` line add:

```ts
vi.mock("@/lib/game-theme", () => ({ gameDarkVars: { dark: true } }));
```

3. Change the `react-native` import line to:

```ts
import { KeyboardAvoidingView, Pressable, ScrollView, StatusBar, View } from "react-native";
```

and add below the other imports:

```ts
import { GAME_THEME } from "@ptracker/shared/imposter";
import { gameDarkVars } from "@/lib/game-theme";
```

4. Add at the end of the file:

```ts
describe("GameScreen tone and body", () => {
  type ScreenProps = Parameters<typeof GameScreen>[0];
  const screen = (props: Partial<ScreenProps> = {}) => GameScreen({ title: "Game", children: "BODY", ...props }) as Node;
  const styles = (node: Node) => [node.props.style].flat();

  it("follows the app theme by default", () => {
    const tree = screen();
    expect(tree.type).toBe(KeyboardAvoidingView);
    expect(String(tree.props.className)).toContain("bg-surface");
    expect(nodes(tree).some((n) => n.type === StatusBar)).toBe(false);
    expect(nodes(tree).some((n) => n.props.style === gameDarkVars)).toBe(false);
  });

  it("draws the game tone on the fixed dark background with the dark palette and a light status bar", () => {
    const tree = screen({ tone: "game" });
    expect(String(tree.props.className)).not.toContain("bg-surface");
    expect(styles(tree)).toContainEqual({ backgroundColor: GAME_THEME.bg });
    expect(nodes(tree).find((n) => n.type === StatusBar)!.props.barStyle).toBe("light-content");
    const themed = nodes(tree).find((n) => n.type === View && n.props.style === gameDarkVars)!;
    expect(text(themed)).toContain("BODY");
  });

  it("fills the body with the player's colour", () => {
    const body = nodes(screen({ tone: "game", color: "#FF6B6B" })).find((n) => n.type === ScrollView)!;
    expect(body.props.style).toEqual({ backgroundColor: "#FF6B6B" });
    expect(nodes(screen({ tone: "game" })).find((n) => n.type === ScrollView)!.props.style).toBeNull();
  });

  it("does not scroll when asked, so holding the card is never taken for a scroll", () => {
    const tree = screen({ tone: "game", color: "#FF6B6B", scroll: false });
    expect(nodes(tree).some((n) => n.type === ScrollView)).toBe(false);
    const body = nodes(tree).find((n) => n.type === View && styles(n).some((s) => s && (s as { backgroundColor?: string }).backgroundColor === "#FF6B6B"))!;
    expect(text(body)).toBe("BODY");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/game-theme.test.ts src/lib/game-button.test.ts src/lib/game-screens.test.ts`
Expected: FAIL — `@/lib/game-theme` and `@/components/games/game-button` cannot be resolved; in `game-screens.test.ts` the four new tests fail and the existing ones pass.

- [ ] **Step 3: Implement**

Create `mobile/src/lib/game-theme.ts`:

```ts
import { vars } from "nativewind";

// The dark values of tailwind.css. The game screens apply them whatever the app theme is,
// so the themed classes inside (text-gray-900, bg-surface, …) always read on the game's dark
// background. game-theme.test.ts fails when this drifts from tailwind.css.
export const GAME_DARK_TOKENS = {
  "--surface": "17 24 39",
  "--gray-50": "3 7 18",
  "--gray-100": "31 41 55",
  "--gray-200": "55 65 81",
  "--gray-300": "75 85 99",
  "--gray-400": "139 147 161",
  "--gray-500": "180 186 196",
  "--gray-600": "209 213 219",
  "--gray-700": "229 231 235",
  "--gray-800": "243 244 246",
  "--gray-900": "249 250 251",
  "--red-50": "59 18 25",
  "--red-700": "252 165 165",
  "--green-50": "15 42 26",
  "--green-100": "20 83 45",
  "--green-700": "134 239 172",
  "--emerald-50": "5 46 34",
  "--emerald-700": "110 231 183",
  "--emerald-900": "209 250 229",
  "--amber-50": "58 42 5",
  "--amber-700": "252 211 77",
  "--blue-50": "23 37 84",
  "--blue-600": "96 165 250",
  "--purple-50": "46 16 101",
} as const;

export const gameDarkVars = vars(GAME_DARK_TOKENS);
```

Create `mobile/src/components/games/game-button.tsx`:

```tsx
import { Pressable, Text } from "react-native";

import { GAME_THEME } from "@ptracker/shared/imposter";

// The button of the player-coloured screens: fixed dark with light text, so it reads on
// every player colour. On the dark screens use PrimaryButton.
export function GameButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`items-center rounded-xl px-6 py-3.5 ${disabled ? "opacity-40" : ""}`}
      style={{ backgroundColor: GAME_THEME.bg }}>
      <Text className="text-center text-base font-semibold" style={{ color: GAME_THEME.text }}>
        {label}
      </Text>
    </Pressable>
  );
}
```

Replace the whole of `mobile/src/components/games/game-screen.tsx` with:

```tsx
import { router, usePathname } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME } from "@ptracker/shared/imposter";
import { useAppLock } from "@/lib/app-lock-context";
import { gameDarkVars } from "@/lib/game-theme";

// Header with a back action + body, shared by the games screens.
// - `tone="game"`: the fixed dark game look, whatever the app theme is.
// - `color`: fills the body with a player's colour.
// - `scroll={false}`: a plain body. A held card inside a ScrollView loses the press as soon
//   as the finger drifts.
export function GameScreen({
  title,
  tone = "app",
  color,
  scroll = true,
  children,
}: {
  title: string;
  tone?: "app" | "game";
  color?: string;
  scroll?: boolean;
  children: ReactNode;
}) {
  const { t } = useLang();
  const { top, bottom } = useSafeAreaInsets();
  const { lock } = useAppLock();
  const path = usePathname();
  // In game mode the games list is the root: going "back" from it would leave the games.
  const showBack = !(lock.gameMode && path === "/games");
  const game = tone === "game";
  const fill = color ? { backgroundColor: color } : null;

  const content = (
    <>
      <View className="flex-row items-center border-b border-gray-100 px-4 py-3">
        {showBack ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace(lock.gameMode ? "/games" : "/"))} className="pr-3">
            <Text className="text-sm text-gray-500">‹ {t.back}</Text>
          </Pressable>
        ) : (
          <View className="w-14" />
        )}
        <Text className="flex-1 text-center text-base font-semibold text-gray-900">{title}</Text>
        {lock.gameMode && path !== "/app-lock" ? (
          <Pressable onPress={() => router.push("/app-lock")} className="pl-3">
            <Text className="text-sm text-gray-500">{t.gameModeExit}</Text>
          </Pressable>
        ) : (
          <View className="w-14" />
        )}
      </View>
      {scroll ? (
        <ScrollView
          className="flex-1"
          style={fill}
          contentContainerClassName="gap-4 p-4"
          contentContainerStyle={{ paddingBottom: bottom + 16 }}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 gap-4 p-4" style={[fill, { paddingBottom: bottom + 16 }]}>
          {children}
        </View>
      )}
    </>
  );

  return (
    <KeyboardAvoidingView
      className={game ? "flex-1" : "flex-1 bg-surface"}
      style={[{ paddingTop: top }, game ? { backgroundColor: GAME_THEME.bg } : null]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {game ? <StatusBar barStyle="light-content" /> : null}
      {game ? (
        <View className="flex-1" style={gameDarkVars}>
          {content}
        </View>
      ) : (
        content
      )}
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/lib/game-theme.test.ts src/lib/game-button.test.ts src/lib/game-screens.test.ts`
Expected: PASS — 2 + 2 + (existing 8 + 4 new) tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-theme.ts src/lib/game-theme.test.ts src/lib/game-button.test.ts src/lib/game-screens.test.ts src/components/games/game-button.tsx src/components/games/game-screen.tsx
git commit -m "feat(mobile): add the dark game tone, player-coloured body and game button"
```

---

### Task 12: Mobile — DealTurn (hold card)

**Files:**
- Create: `mobile/src/components/games/deal-turn.tsx`
- Test: `mobile/src/lib/deal-turn.test.ts`

- [ ] **Step 1: Write the failing test**

Create `mobile/src/lib/deal-turn.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactElement } from "react";
import { GAME_THEME } from "@ptracker/shared/imposter";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  index: 0,
}));
const rn = vi.hoisted(() => ({
  listener: null as null | ((state: string) => void),
  remove: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = hooks.index++;
      if (!(i in hooks.states)) hooks.states[i] = typeof initial === "function" ? initial() : initial;
      const set = (next: unknown) => {
        hooks.states[i] = typeof next === "function" ? next(hooks.states[i]) : next;
      };
      return [hooks.states[i], set];
    },
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
  };
});
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_type: string, fn: (state: string) => void) => {
      rn.listener = fn;
      return { remove: rn.remove };
    },
  },
  Pressable: () => null,
  Text: () => null,
  View: () => null,
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: () => null },
  FadeIn: { duration: () => ({}) },
}));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "imposterPassTo" ? "Pass to {name}" : String(key)),
    }),
  }),
}));
vi.mock("@/components/games/game-button", () => ({ GameButton: () => null }));

import { Pressable } from "react-native";
import { DealTurn } from "@/components/games/deal-turn";
import { GameButton } from "@/components/games/game-button";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onReveal = vi.fn();
const onNext = vi.fn();

function render(revealed: boolean): Node {
  hooks.index = 0;
  hooks.effects = [];
  return DealTurn({ name: "Ann", revealed, onReveal, onNext, children: createElement("p", null, "SECRET") }) as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

const card = (tree: Node) => nodes(tree).find((n) => n.type === Pressable)!;
const pressIn = (tree: Node) => (card(tree).props.onPressIn as () => void)();
const pressOut = (tree: Node) => (card(tree).props.onPressOut as () => void)();

beforeEach(() => {
  vi.clearAllMocks();
  hooks.states = [];
  rn.listener = null;
});

describe("DealTurn hold card", () => {
  it("keeps the card closed until it is held", () => {
    const out = text(render(false));
    expect(out).toContain("Pass to Ann");
    expect(out).toContain("imposterHoldToSee");
    expect(out).not.toContain("SECRET");
  });

  it("asks for the reveal on the first press and shows the card once it was accepted", () => {
    pressIn(render(false));
    expect(onReveal).toHaveBeenCalledTimes(1);
    // A press inside the reducer's tap guard is not accepted: the card must stay closed.
    expect(text(render(false))).not.toContain("SECRET");
    expect(text(render(true))).toContain("SECRET");
  });

  it("does not ask for the reveal again once the card was seen", () => {
    pressIn(render(true));
    expect(onReveal).not.toHaveBeenCalled();
    expect(text(render(true))).toContain("SECRET");
  });

  it("hides the card when the finger lifts", () => {
    pressIn(render(true));
    expect(text(render(true))).toContain("SECRET");
    pressOut(render(true));
    expect(text(render(true))).not.toContain("SECRET");
  });

  it("hides the card when the app leaves the foreground", () => {
    render(true);
    const cleanup = hooks.effects[0]() as () => void;
    pressIn(render(true));
    rn.listener!("active");
    expect(text(render(true))).toContain("SECRET");
    rn.listener!("background");
    expect(text(render(true))).not.toContain("SECRET");
    cleanup();
    expect(rn.remove).toHaveBeenCalledTimes(1);
  });

  it("uses the same card colour closed and open, whatever the card says", () => {
    expect(card(render(true)).props.style).toEqual({ backgroundColor: GAME_THEME.bg });
    pressIn(render(true));
    expect(card(render(true)).props.style).toEqual({ backgroundColor: GAME_THEME.bg });
  });
});

describe("DealTurn next player", () => {
  it("is disabled until the player has seen the card", () => {
    const next = (tree: Node) => nodes(tree).find((n) => n.type === GameButton)!;
    expect(next(render(false)).props.disabled).toBe(true);
    expect(next(render(true)).props).toMatchObject({ label: "imposterNextPlayer", onPress: onNext, disabled: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/deal-turn.test.ts`
Expected: FAIL — cannot resolve `@/components/games/deal-turn`.

- [ ] **Step 3: Implement**

Create `mobile/src/components/games/deal-turn.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME } from "@ptracker/shared/imposter";
import { GameButton } from "@/components/games/game-button";

// One player's turn while the cards are dealt: the card shows only while it is held.
// Render it in a GameScreen with `scroll={false}` and the player's colour, and mount it with
// `key={turn}` so an open card can never carry over to the next player.
export function DealTurn({
  name,
  revealed,
  onReveal,
  onNext,
  children,
}: {
  name: string;
  /** The reducer accepted this player's reveal: they have seen their card. */
  revealed: boolean;
  onReveal: () => void;
  onNext: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") setOpen(false);
    });
    return () => sub.remove();
  }, []);

  // The reducer ignores a reveal that comes too soon after the last tap. The card only
  // shows once the reveal was accepted, so "has seen it" and "may pass the phone on" never
  // disagree. Asking again after that would restart the tap guard and swallow Next.
  const shown = open && revealed;

  return (
    <View className="flex-1 justify-between gap-6 py-4">
      <View className="items-center gap-2">
        <Text className="text-center text-2xl font-bold" style={{ color: GAME_THEME.ink }}>
          {t.imposterPassTo.replace("{name}", () => name)}
        </Text>
        <Text className="text-center text-sm" style={{ color: GAME_THEME.ink, opacity: 0.8 }}>
          {t.imposterPassHint}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.imposterHoldToSee}
        onPressIn={() => {
          if (!revealed) onReveal();
          setOpen(true);
        }}
        onPressOut={() => setOpen(false)}
        className="min-h-64 items-center justify-center rounded-3xl p-6"
        style={{ backgroundColor: GAME_THEME.bg }}>
        {shown ? (
          <Animated.View entering={FadeIn.duration(150)} style={{ alignItems: "center", gap: 8 }}>
            {children}
          </Animated.View>
        ) : (
          <Text className="text-lg font-semibold" style={{ color: GAME_THEME.muted }}>
            {t.imposterHoldToSee}
          </Text>
        )}
      </Pressable>
      <GameButton label={t.imposterNextPlayer} onPress={onNext} disabled={!revealed} />
    </View>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/deal-turn.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/games/deal-turn.tsx src/lib/deal-turn.test.ts
git commit -m "feat(mobile): show the imposter card only while it is held"
```

---

### Task 13: Mobile — PassPhone becomes the vote gate

**Files:**
- Modify: `mobile/src/components/games/pass-phone.tsx`
- Test: `mobile/src/lib/pass-phone.test.ts`

- [ ] **Step 1: Update the test**

In `mobile/src/lib/pass-phone.test.ts`:

1. Replace the `vi.mock("@/components/ui/primary-button", …)` line with:

```ts
vi.mock("@/components/games/game-button", () => ({ GameButton: () => null }));
```

2. Replace `import { PrimaryButton } from "@/components/ui/primary-button";` with:

```ts
import { GameButton } from "@/components/games/game-button";
import { GAME_THEME } from "@ptracker/shared/imposter";
```

3. In the `button` helper, change `n.type === PrimaryButton` to `n.type === GameButton`.

4. Add inside `describe("PassPhone reveal gate", …)`:

```ts
  it("writes on the voter's colour in the fixed dark ink, not a themed colour", () => {
    const texts = nodes(render(false)).filter((n) => typeof n.props.children === "string");
    expect(texts).toHaveLength(2);
    for (const n of texts) expect(n.props.style).toMatchObject({ color: GAME_THEME.ink });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/pass-phone.test.ts`
Expected: FAIL — the component still renders `PrimaryButton`, so `button(...)` is `undefined`, and the texts have no `style`.

- [ ] **Step 3: Implement**

Replace the whole of `mobile/src/components/games/pass-phone.tsx` with:

```tsx
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME } from "@ptracker/shared/imposter";
import { GameButton } from "@/components/games/game-button";

// The hand-over screen of the secret vote: the ballot only appears after the named player
// presses the button. It sits on that player's colour, so it sets no themed colours.
export function PassPhone({
  name,
  revealed,
  revealLabel,
  onReveal,
  children,
}: {
  name: string;
  revealed: boolean;
  revealLabel: string;
  onReveal: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  if (revealed) return <View className="items-stretch gap-6 py-6">{children}</View>;
  return (
    <View className="items-center gap-6 py-16">
      <Text className="text-center text-2xl font-bold" style={{ color: GAME_THEME.ink }}>
        {t.imposterPassTo.replace("{name}", () => name)}
      </Text>
      <Text className="text-center text-sm" style={{ color: GAME_THEME.ink, opacity: 0.8 }}>
        {t.imposterPassHint}
      </Text>
      <View className="w-full">
        <GameButton label={revealLabel} onPress={onReveal} />
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/pass-phone.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/games/pass-phone.tsx src/lib/pass-phone.test.ts
git commit -m "feat(mobile): draw the vote hand-over screen on the voter's colour"
```

---

### Task 14: Mobile — setup steps and wizard

**Files:**
- Create: `mobile/src/components/games/setup-players-step.tsx`, `setup-category-step.tsx`, `setup-rules-step.tsx`
- Rewrite: `mobile/src/components/games/imposter-setup.tsx` (exports `ImposterSetupWizard`; `ImposterSetupForm` is gone)
- Test: create `mobile/src/lib/setup-players-step.test.ts`, `setup-category-step.test.ts`, `setup-rules-step.test.ts`; rewrite `mobile/src/lib/imposter-setup.test.ts`

After this task `mobile/src/app/games/imposter.tsx` still imports `ImposterSetupForm`, so `tsc` is red until Task 15. Do Task 15 right after.

- [ ] **Step 1: Write the failing tests**

Create `mobile/src/lib/setup-players-step.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, GAME_THEME, MAX_PLAYERS, playerColor, type ImposterSetup } from "@ptracker/shared/imposter";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, TextInput: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));

import { Pressable, TextInput, View } from "react-native";
import { SetupPlayersStep } from "@/components/games/setup-players-step";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };

function render(value: ImposterSetup): Node {
  return SetupPlayersStep({ value, onChange }) as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

function addButton(tree: Node) {
  return nodes(tree).find((n) => n.type === Pressable && text(n).includes("imposterAddPlayer"))!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SetupPlayersStep players", () => {
  it("removes exactly the chosen player", () => {
    const remove = nodes(render(valid)).filter((n) => n.type === Pressable && text(n) === "✕");
    (remove[1].props.onPress as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, players: ["Ann", "Cem"] });
  });

  it("disables Add at the player limit", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i}`);
    expect(addButton(render({ ...valid, players: names(MAX_PLAYERS) })).props.disabled).toBe(true);
    expect(addButton(render({ ...valid, players: names(MAX_PLAYERS - 1) })).props.disabled).toBe(false);
  });

  it("adds an empty player at the end", () => {
    (addButton(render(valid)).props.onPress as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, players: ["Ann", "Bob", "Cem", ""] });
  });

  it("renames only the edited player", () => {
    const inputs = nodes(render(valid)).filter((n) => n.type === TextInput);
    expect(inputs.map((n) => n.props.value)).toEqual(["Ann", "Bob", "Cem"]);
    (inputs[1].props.onChangeText as (v: string) => void)("Bea");
    expect(onChange).toHaveBeenCalledWith({ ...valid, players: ["Ann", "Bea", "Cem"] });
  });
});

describe("SetupPlayersStep colours", () => {
  it("draws each player's card in that seat's colour with dark text", () => {
    const tree = render(valid);
    const cards = nodes(tree).filter((n) => n.type === View && (n.props.style as { backgroundColor?: string })?.backgroundColor);
    expect(cards.map((n) => (n.props.style as { backgroundColor: string }).backgroundColor)).toEqual([
      playerColor(0),
      playerColor(1),
      playerColor(2),
    ]);
    for (const input of nodes(tree).filter((n) => n.type === TextInput)) {
      expect(input.props.style).toEqual({ color: GAME_THEME.ink });
    }
  });
});
```

Create `mobile/src/lib/setup-category-step.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import {
  CATEGORY_CHOICES,
  CATEGORY_EMOJI,
  CATEGORY_LABEL_KEYS,
  DEFAULT_SETUP,
  playerColor,
  type ImposterSetup,
} from "@ptracker/shared/imposter";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));

import { Pressable } from "react-native";
import { SetupCategoryStep } from "@/components/games/setup-category-step";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"], category: "food" };

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

function tiles(value: ImposterSetup): Node[] {
  return nodes(SetupCategoryStep({ value, onChange })).filter((n) => n.type === Pressable);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SetupCategoryStep", () => {
  it("shows one tile per category with its emoji and name", () => {
    const all = tiles(valid);
    expect(all).toHaveLength(CATEGORY_CHOICES.length);
    CATEGORY_CHOICES.forEach((c, i) => {
      expect(text(all[i])).toBe(`${CATEGORY_EMOJI[c]}${CATEGORY_LABEL_KEYS[c]}`);
      expect(all[i].props.style).toEqual({ backgroundColor: playerColor(i) });
    });
  });

  it("marks only the chosen category as selected", () => {
    const selected = tiles(valid).map((n) => (n.props.accessibilityState as { selected: boolean }).selected);
    expect(selected).toEqual(CATEGORY_CHOICES.map((c) => c === "food"));
  });

  it("picks the category of the tile that was pressed", () => {
    const animals = CATEGORY_CHOICES.indexOf("animals");
    (tiles(valid)[animals].props.onPress as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, category: "animals" });
  });
});
```

Create `mobile/src/lib/setup-rules-step.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, type ImposterSetup } from "@ptracker/shared/imposter";

vi.mock("react-native", () => ({ Switch: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));
vi.mock("@/components/ui/segmented-toggle", () => ({ SegmentedToggle: () => null }));
vi.mock("@/components/ui/select-field", () => ({ SelectField: () => null }));

import { Switch } from "react-native";
import { SetupRulesStep } from "@/components/games/setup-rules-step";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { SelectField } from "@/components/ui/select-field";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };

function render(value: ImposterSetup): Node {
  return SetupRulesStep({ value, onChange }) as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

function switches(tree: Node) {
  return nodes(tree).filter((n) => n.type === Switch);
}

function toggle(tree: Node, label: string) {
  return nodes(tree).find((n) => n.type === SegmentedToggle && n.props.label === label)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SetupRulesStep voting switch", () => {
  it("turns the scoreboard off with voting", () => {
    const value = { ...valid, voting: true, scoreboard: true };
    const [voting] = switches(render(value));
    (voting.props.onValueChange as (v: boolean) => void)(false);
    expect(onChange).toHaveBeenCalledWith({ ...value, voting: false, scoreboard: false });
  });

  it("disables the scoreboard switch only while voting is off", () => {
    expect(switches(render({ ...valid, voting: false }))[1].props.disabled).toBe(true);
    expect(switches(render({ ...valid, voting: true }))[1].props.disabled).toBe(false);
  });
});

describe("SetupRulesStep mode", () => {
  it("switches the mode", () => {
    (toggle(render(valid), "imposterMode").props.onChange as (v: string) => void)("similar-word");
    expect(onChange).toHaveBeenCalledWith({ ...valid, mode: "similar-word" });
  });

  it("offers 'imposter knows their role' only in similar-word mode", () => {
    expect(text(render(valid))).not.toContain("imposterKnowsRole");
    const tree = render({ ...valid, mode: "similar-word" });
    expect(text(tree)).toContain("imposterKnowsRole");
    const [knows] = switches(tree);
    (knows.props.onValueChange as (v: boolean) => void)(true);
    expect(onChange).toHaveBeenCalledWith({ ...valid, mode: "similar-word", imposterKnows: true });
  });
});

describe("SetupRulesStep imposter count and timer", () => {
  it("offers only the counts the player count allows", () => {
    const options = (tree: Node) => (toggle(tree, "imposterCount").props.options as { value: string }[]).map((o) => o.value);
    expect(options(render(valid))).toEqual(["1"]);
    expect(options(render({ ...valid, players: ["A", "B", "C", "D", "E", "F", "G"] }))).toEqual(["1", "2", "3"]);
  });

  it("sets the imposter count and the timer", () => {
    const five = { ...valid, players: ["A", "B", "C", "D", "E"] };
    (toggle(render(five), "imposterCount").props.onChange as (v: string) => void)("2");
    expect(onChange).toHaveBeenCalledWith({ ...five, imposterCount: 2 });
    const timer = nodes(render(valid)).find((n) => n.type === SelectField)!;
    expect(timer.props.label).toBe("imposterTimer");
    (timer.props.onChange as (v: string) => void)("5");
    expect(onChange).toHaveBeenCalledWith({ ...valid, timerMinutes: 5 });
  });
});
```

Replace the whole of `mobile/src/lib/imposter-setup.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, type ImposterSetup } from "@ptracker/shared/imposter";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/games/setup-players-step", () => ({ SetupPlayersStep: () => null }));
vi.mock("@/components/games/setup-category-step", () => ({ SetupCategoryStep: () => null }));
vi.mock("@/components/games/setup-rules-step", () => ({ SetupRulesStep: () => null }));

import { Pressable, View } from "react-native";
import { ImposterSetupWizard } from "@/components/games/imposter-setup";
import { SetupCategoryStep } from "@/components/games/setup-category-step";
import { SetupPlayersStep } from "@/components/games/setup-players-step";
import { SetupRulesStep } from "@/components/games/setup-rules-step";
import { PrimaryButton } from "@/components/ui/primary-button";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const onStep = vi.fn();
const onStart = vi.fn();
const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };

function render(value: ImposterSetup, step: number, quickStart = false): Node {
  return ImposterSetupWizard({ value, onChange, step, onStep, onStart, quickStart }) as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

function primary(tree: Node) {
  return nodes(tree).find((n) => n.type === PrimaryButton)!;
}

function pressable(tree: Node, label: string) {
  return nodes(tree).find((n) => n.type === Pressable && text(n) === label);
}

function has(tree: Node, type: unknown) {
  return nodes(tree).some((n) => n.type === type);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ImposterSetupWizard steps", () => {
  it("shows one step at a time and hands it the setup", () => {
    const first = render(valid, 0);
    expect([has(first, SetupPlayersStep), has(first, SetupCategoryStep), has(first, SetupRulesStep)]).toEqual([true, false, false]);
    expect(nodes(first).find((n) => n.type === SetupPlayersStep)!.props).toEqual({ value: valid, onChange });
    expect(has(render(valid, 1), SetupCategoryStep)).toBe(true);
    expect(has(render(valid, 2), SetupRulesStep)).toBe(true);
  });

  it("says which step of how many is showing", () => {
    const dots = nodes(render(valid, 1)).find((n) => n.type === View && n.props.accessibilityLabel)!;
    expect(dots.props.accessibilityLabel).toBe("imposterStep".replace("{n}", "2").replace("{total}", "3"));
  });

  it("has no Back on the first step and goes back from the others", () => {
    expect(pressable(render(valid, 0), "back")).toBeUndefined();
    (pressable(render(valid, 2), "back")!.props.onPress as () => void)();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("moves on with Next when the step has no errors", () => {
    const next = primary(render(valid, 0));
    expect(next.props.label).toBe("imposterNext");
    expect(next.props.disabled).toBe(false);
    (next.props.onPress as () => void)();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("stops on a step with errors and lists only that step's errors", () => {
    const broken = { ...DEFAULT_SETUP, players: ["Ann"], scoreboard: true };
    const tree = render(broken, 0);
    expect(text(tree)).toContain("imposterErrTooFew");
    expect(text(tree)).not.toContain("imposterErrScoreboard");
    expect(primary(tree).props.disabled).toBe(true);
    expect(text(render(broken, 1))).not.toContain("imposterErr");
    expect(primary(render(broken, 1)).props.disabled).toBe(false);
  });
});

describe("ImposterSetupWizard start gate", () => {
  it("lists the errors and disables Start for an invalid setup", () => {
    const tree = render({ ...DEFAULT_SETUP, players: ["Ann"] }, 2);
    expect(text(tree)).toContain("imposterErrTooFew");
    expect(primary(tree).props.label).toBe("imposterStart");
    expect(primary(tree).props.disabled).toBe(true);
  });

  it("starts the game from a valid setup", () => {
    const tree = render(valid, 2);
    expect(text(tree)).not.toContain("imposterErr");
    expect(primary(tree).props.disabled).toBe(false);
    expect(primary(tree).props.onPress).toBe(onStart);
  });

  it("does not offer Start before the last step", () => {
    expect(primary(render(valid, 0)).props.label).toBe("imposterNext");
    expect(primary(render(valid, 1)).props.label).toBe("imposterNext");
  });
});

describe("ImposterSetupWizard quick start", () => {
  it("starts at once from the first step when a game was played before", () => {
    expect(pressable(render(valid, 0, true), "imposterQuickStart")!.props.onPress).toBe(onStart);
  });

  it("is not offered to a first-time player, with an invalid setup, or after the first step", () => {
    expect(pressable(render(valid, 0, false), "imposterQuickStart")).toBeUndefined();
    expect(pressable(render({ ...valid, players: ["Ann"] }, 0, true), "imposterQuickStart")).toBeUndefined();
    expect(pressable(render(valid, 1, true), "imposterQuickStart")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/setup-players-step.test.ts src/lib/setup-category-step.test.ts src/lib/setup-rules-step.test.ts src/lib/imposter-setup.test.ts`
Expected: FAIL — the three step components cannot be resolved and `ImposterSetupWizard` is not exported.

- [ ] **Step 3: Implement**

Create `mobile/src/components/games/setup-players-step.tsx`:

```tsx
import { Pressable, Text, TextInput, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, MAX_PLAYERS, playerColor, type ImposterSetup } from "@ptracker/shared/imposter";

export function SetupPlayersStep({
  value,
  onChange,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
}) {
  const { t } = useLang();
  const setPlayers = (players: string[]) => onChange({ ...value, players });
  const full = value.players.length >= MAX_PLAYERS;

  return (
    <View className="gap-2">
      {value.players.map((name, i) => (
        <View key={i} className="flex-row items-center gap-2 rounded-2xl px-4 py-1" style={{ backgroundColor: playerColor(i) }}>
          <TextInput
            className="flex-1 py-2.5 text-lg font-semibold"
            style={{ color: GAME_THEME.ink }}
            value={name}
            onChangeText={(next) => setPlayers(value.players.map((p, j) => (j === i ? next : p)))}
            placeholder={t.imposterPlayerName}
            placeholderTextColor="rgba(17, 24, 39, 0.45)"
          />
          <Pressable
            onPress={() => setPlayers(value.players.filter((_, j) => j !== i))}
            accessibilityLabel={t.imposterRemovePlayer}
            className="px-2 py-2">
            <Text className="text-lg" style={{ color: GAME_THEME.ink }}>
              ✕
            </Text>
          </Pressable>
        </View>
      ))}
      <Pressable
        disabled={full}
        onPress={() => setPlayers([...value.players, ""])}
        className={`rounded-2xl border border-dashed border-gray-300 py-3 ${full ? "opacity-50" : ""}`}>
        <Text className="text-center text-sm text-gray-500">+ {t.imposterAddPlayer}</Text>
      </Pressable>
    </View>
  );
}
```

Create `mobile/src/components/games/setup-category-step.tsx`:

```tsx
import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  CATEGORY_CHOICES,
  CATEGORY_EMOJI,
  CATEGORY_LABEL_KEYS,
  GAME_THEME,
  playerColor,
  type ImposterSetup,
} from "@ptracker/shared/imposter";

export function SetupCategoryStep({
  value,
  onChange,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
}) {
  const { t } = useLang();
  return (
    <View className="flex-row flex-wrap gap-3">
      {CATEGORY_CHOICES.map((c, i) => {
        const active = value.category === c;
        return (
          <Pressable
            key={c}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange({ ...value, category: c })}
            className={`grow basis-[45%] items-center gap-1 rounded-2xl border-4 px-3 py-5 ${
              active ? "border-white" : "border-transparent opacity-60"
            }`}
            style={{ backgroundColor: playerColor(i) }}>
            <Text className="text-3xl">{CATEGORY_EMOJI[c]}</Text>
            <Text className="text-base font-semibold" style={{ color: GAME_THEME.ink }}>
              {t[CATEGORY_LABEL_KEYS[c]]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

Create `mobile/src/components/games/setup-rules-step.tsx`:

```tsx
import { Switch, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  MAX_IMPOSTERS,
  MAX_TIMER_MINUTES,
  maxImposters,
  type ImposterMode,
  type ImposterSetup,
} from "@ptracker/shared/imposter";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { SelectField } from "@/components/ui/select-field";

export function SetupRulesStep({
  value,
  onChange,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
}) {
  const { t } = useLang();
  const limit = Math.max(1, maxImposters(value.players.length));
  const set = (patch: Partial<ImposterSetup>) => onChange({ ...value, ...patch });

  return (
    <View className="gap-5">
      <SegmentedToggle
        label={t.imposterMode}
        value={value.mode}
        options={[
          { value: "no-word", label: t.imposterModeNoWord },
          { value: "similar-word", label: t.imposterModeSimilar },
        ]}
        onChange={(mode) => set({ mode: mode as ImposterMode })}
      />

      {value.mode === "similar-word" ? (
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-base text-gray-900">{t.imposterKnowsRole}</Text>
            <Text className="text-xs text-gray-400">{t.imposterKnowsRoleHint}</Text>
          </View>
          <Switch value={value.imposterKnows} onValueChange={(imposterKnows) => set({ imposterKnows })} />
        </View>
      ) : null}

      <SegmentedToggle
        label={t.imposterCount}
        value={String(value.imposterCount)}
        options={Array.from({ length: Math.min(MAX_IMPOSTERS, limit) }, (_, i) => ({
          value: String(i + 1),
          label: String(i + 1),
        }))}
        onChange={(n) => set({ imposterCount: Number(n) })}
      />

      <SelectField
        label={t.imposterTimer}
        value={String(value.timerMinutes)}
        options={Array.from({ length: MAX_TIMER_MINUTES + 1 }, (_, m) => ({
          value: String(m),
          label: m === 0 ? t.imposterTimerOff : t.imposterMinutes.replace("{n}", String(m)),
        }))}
        onChange={(m) => set({ timerMinutes: Number(m) })}
      />

      <View className="gap-3 rounded-xl border border-gray-100 p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-base text-gray-900">{t.imposterVoting}</Text>
          <Switch
            value={value.voting}
            onValueChange={(voting) => set({ voting, scoreboard: voting && value.scoreboard })}
          />
        </View>
        <View className={`flex-row items-center justify-between ${value.voting ? "" : "opacity-50"}`}>
          <View>
            <Text className="text-base text-gray-900">{t.imposterScoreboard}</Text>
            {!value.voting ? <Text className="text-xs text-gray-400">{t.imposterScoreboardHint}</Text> : null}
          </View>
          <Switch
            disabled={!value.voting}
            value={value.scoreboard}
            onValueChange={(scoreboard) => set({ scoreboard })}
          />
        </View>
      </View>
    </View>
  );
}
```

Replace the whole of `mobile/src/components/games/imposter-setup.tsx` with:

```tsx
import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  GAME_THEME,
  SETUP_ERROR_KEYS,
  SETUP_STEPS,
  playerColor,
  stepErrors,
  validateSetup,
  type ImposterSetup,
} from "@ptracker/shared/imposter";
import { SetupCategoryStep } from "@/components/games/setup-category-step";
import { SetupPlayersStep } from "@/components/games/setup-players-step";
import { SetupRulesStep } from "@/components/games/setup-rules-step";
import { PrimaryButton } from "@/components/ui/primary-button";

// The setup, one step at a time. The step lives in the parent so this component has no
// state of its own.
export function ImposterSetupWizard({
  value,
  onChange,
  step,
  onStep,
  onStart,
  quickStart,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
  /** Index into SETUP_STEPS. */
  step: number;
  onStep: (step: number) => void;
  onStart: () => void;
  /** A game was played on this device before: offer to skip the remaining steps. */
  quickStart: boolean;
}) {
  const { t } = useLang();
  const name = SETUP_STEPS[step];
  const last = step === SETUP_STEPS.length - 1;
  const allErrors = validateSetup(value);
  // The last step shows everything that still blocks Start, whichever step it belongs to.
  const errors = last ? allErrors : stepErrors(value, name);
  const titles = { players: t.imposterPlayers, category: t.imposterCategory, rules: t.imposterStepRules };

  return (
    <View className="gap-5">
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-bold text-gray-900">{titles[name]}</Text>
        <View
          className="flex-row gap-1.5"
          accessibilityLabel={t.imposterStep.replace("{n}", String(step + 1)).replace("{total}", String(SETUP_STEPS.length))}>
          {SETUP_STEPS.map((s, i) => (
            <View
              key={s}
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: GAME_THEME.text, opacity: i === step ? 1 : 0.3 }}
            />
          ))}
        </View>
      </View>

      {name === "players" ? <SetupPlayersStep value={value} onChange={onChange} /> : null}
      {name === "category" ? <SetupCategoryStep value={value} onChange={onChange} /> : null}
      {name === "rules" ? <SetupRulesStep value={value} onChange={onChange} /> : null}

      {errors.length > 0 ? (
        <View className="gap-1 rounded-lg bg-amber-50 p-3">
          {errors.map((e) => (
            <Text key={e} className="text-sm text-amber-700">
              {t[SETUP_ERROR_KEYS[e]]}
            </Text>
          ))}
        </View>
      ) : null}

      <View className="flex-row items-center gap-3">
        {step > 0 ? (
          <Pressable onPress={() => onStep(step - 1)} className="flex-1 rounded-lg border border-gray-200 py-3">
            <Text className="text-center text-base text-gray-600">{t.back}</Text>
          </Pressable>
        ) : null}
        <View className="flex-1">
          {last ? (
            <PrimaryButton label={t.imposterStart} onPress={onStart} disabled={allErrors.length > 0} />
          ) : (
            <PrimaryButton label={t.imposterNext} onPress={() => onStep(step + 1)} disabled={errors.length > 0} />
          )}
        </View>
      </View>

      {step === 0 && quickStart && allErrors.length === 0 ? (
        <Pressable onPress={onStart} className="rounded-lg py-3.5" style={{ backgroundColor: playerColor(2) }}>
          <Text className="text-center text-base font-semibold" style={{ color: GAME_THEME.ink }}>
            {t.imposterQuickStart}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/lib/setup-players-step.test.ts src/lib/setup-category-step.test.ts src/lib/setup-rules-step.test.ts src/lib/imposter-setup.test.ts`
Expected: PASS — 5 + 3 + 6 + 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/games/setup-players-step.tsx src/components/games/setup-category-step.tsx src/components/games/setup-rules-step.tsx src/components/games/imposter-setup.tsx src/lib/setup-players-step.test.ts src/lib/setup-category-step.test.ts src/lib/setup-rules-step.test.ts src/lib/imposter-setup.test.ts
git commit -m "feat(mobile): replace the imposter setup form with a three-step wizard"
```

---

### Task 15: Mobile — colours on discussion and result, and the game container

**Files:**
- Modify: `mobile/src/components/games/imposter-discuss.tsx`, `mobile/src/components/games/imposter-result.tsx`, `mobile/src/app/games/imposter.tsx`
- Test: `mobile/src/lib/imposter-discuss.test.ts`, `mobile/src/lib/imposter-result.test.ts`, `mobile/src/lib/imposter-screen.test.ts`

- [ ] **Step 1: Update the tests**

In `mobile/src/lib/imposter-discuss.test.ts`:

1. Change the `ImposterDiscuss({ … })` call inside `renderAndRunEffects` to pass the new prop, and return the tree:

```ts
function renderAndRunEffects(timerMinutes: number) {
  hooks.index = 0;
  hooks.refIndex = 0;
  hooks.effects = [];
  const tree = ImposterDiscuss({ starter: "Ann", starterColor: "#123456", timerMinutes, voting: true, onFinish: vi.fn() });
  for (const effect of hooks.effects) {
    const cleanup = effect();
    if (cleanup) hooks.cleanups.push(cleanup);
  }
  return tree;
}
```

2. Add below the imports:

```ts
import type { ReactElement } from "react";
import { GAME_THEME } from "@ptracker/shared/imposter";

type StyledNode = ReactElement<Record<string, unknown> & { children?: unknown }>;

function styledNodes(node: unknown): StyledNode[] {
  if (Array.isArray(node)) return node.flatMap(styledNodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as StyledNode;
  return [...(el.props.style ? [el] : []), ...styledNodes(el.props.children)];
}
```

3. Add at the end of the file:

```ts
describe("ImposterDiscuss starter", () => {
  it("names who starts on that player's colour", () => {
    const [chip, label] = styledNodes(renderAndRunEffects(0));
    expect(chip.props.style).toEqual({ backgroundColor: "#123456" });
    expect(label.props.children).toBe("imposterStarts");
    expect(label.props.style).toEqual({ color: GAME_THEME.ink });
  });
});
```

In `mobile/src/lib/imposter-result.test.ts`:

1. Change the import from `@ptracker/shared/imposter` to also bring in `playerColor`:

```ts
import { DEFAULT_SETUP, initialGameState, playerColor, type GameState, type Outcome } from "@ptracker/shared/imposter";
```

2. Add at the end of the file:

```ts
describe("ImposterResult colours", () => {
  it("writes each name in that player's colour, imposters and scoreboard alike", () => {
    const names = ["Ann", "Bob", "Cem"];
    const coloured = nodes(render(game(null, true))).filter((n) => (n.props.style as { color?: string })?.color);
    // Two imposters, then the three scoreboard rows (highest score first).
    expect(coloured.map(text)).toEqual(["Ann", "Cem", "Bob", "Cem", "Ann"]);
    for (const n of coloured) {
      expect((n.props.style as { color: string }).color).toBe(playerColor(names.indexOf(text(n))));
    }
  });
});
```

In `mobile/src/lib/imposter-screen.test.ts`:

1. Extend the import from `@ptracker/shared/imposter` with `playerColor`.

2. Replace the mocks of `imposter-setup` and `primary-button`:

```ts
vi.mock("@/components/games/imposter-setup", () => ({ ImposterSetupForm: () => null }));
```
becomes
```ts
vi.mock("@/components/games/imposter-setup", () => ({ ImposterSetupWizard: () => null }));
vi.mock("@/components/games/deal-turn", () => ({ DealTurn: () => null }));
```
and delete the line `vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));`.

3. Replace the imports of `ImposterSetupForm` and `PrimaryButton`:

```ts
import { DealTurn } from "@/components/games/deal-turn";
import { GameScreen } from "@/components/games/game-screen";
import { ImposterSetupWizard } from "@/components/games/imposter-setup";
```
(keep the other imports; remove `import { PrimaryButton } …` and `import { ImposterSetupForm } …`).

4. Replace the `pass`, `hideNext` helpers and the `start` helper's last line:

```ts
function pass(): Node {
  return nodes(render()).find((n) => n.type === DealTurn || n.type === PassPhone)!;
}

function nextPlayer() {
  (find(DealTurn).props.onNext as () => void)();
}
```

In `start`, the last line becomes:

```ts
  (find(ImposterSetupWizard).props.onStart as () => void)();
```

In `dealAll`, `hideNext();` becomes `nextPlayer();`.

5. In the test `"shows the setup form with the played setup again"`, `find(ImposterSetupForm)` becomes `find(ImposterSetupWizard)`.

6. Add at the end of the file:

```ts
describe("ImposterScreen look", () => {
  it("draws each turn on that player's colour without scrolling, and the other screens dark", async () => {
    storage.getStoredSetup.mockResolvedValue(valid);
    render();
    expect(find(GameScreen).props).toMatchObject({ tone: "game", color: undefined, scroll: true });
    await start(valid);
    expect(find(GameScreen).props).toMatchObject({ tone: "game", color: playerColor(0), scroll: false });
    dealAll(1);
    expect(find(GameScreen).props.color).toBe(playerColor(1));
    dealAll(2);
    expect(find(GameScreen).props).toMatchObject({ color: undefined, scroll: true });
    expect(find(ImposterDiscuss).props.starterColor).toBe(playerColor(0));
  });

  it("colours the vote screen by voter and each ballot button by candidate", async () => {
    await start({ ...valid, voting: true });
    dealAll(3);
    (find(ImposterDiscuss).props.onFinish as () => void)();
    expect(find(GameScreen).props).toMatchObject({ color: playerColor(0), scroll: true });
    reveal();
    expect(ballot().map((b) => (b.props.style as { backgroundColor: string }).backgroundColor)).toEqual([
      playerColor(1),
      playerColor(2),
    ]);
  });
});

describe("ImposterScreen wizard", () => {
  it("offers quick start only when a valid setup was saved", async () => {
    storage.getStoredSetup.mockResolvedValue(valid);
    render();
    for (const effect of hooks.effects) effect();
    await Promise.resolve();
    await Promise.resolve();
    expect(find(ImposterSetupWizard).props.quickStart).toBe(true);

    hooks.states = [];
    storage.getStoredSetup.mockResolvedValue({ ...valid, players: [] });
    render();
    for (const effect of hooks.effects) effect();
    await Promise.resolve();
    await Promise.resolve();
    expect(find(ImposterSetupWizard).props.quickStart).toBe(false);
  });

  it("keeps the step and opens on the first step again after a game", async () => {
    storage.getStoredSetup.mockResolvedValue(valid);
    render();
    for (const effect of hooks.effects) effect();
    await Promise.resolve();
    await Promise.resolve();
    (find(ImposterSetupWizard).props.onStep as (n: number) => void)(2);
    expect(find(ImposterSetupWizard).props.step).toBe(2);
    (find(ImposterSetupWizard).props.onStart as () => void)();
    dealAll(3);
    (find(ImposterDiscuss).props.onFinish as () => void)();
    (find(ImposterResult).props.onEnd as () => void)();
    expect(find(ImposterSetupWizard).props.step).toBe(0);
    expect(find(ImposterSetupWizard).props.quickStart).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/imposter-discuss.test.ts src/lib/imposter-result.test.ts src/lib/imposter-screen.test.ts`
Expected: FAIL — no styled nodes in Discuss, no coloured names in Result, and the screen still renders the removed `ImposterSetupForm` (`find(ImposterSetupWizard)` is `undefined`).

- [ ] **Step 3: Implement**

In `mobile/src/components/games/imposter-discuss.tsx`:

Change the shared import to:

```tsx
import { GAME_THEME, formatCountdown, remainingSeconds } from "@ptracker/shared/imposter";
```

Change the props to:

```tsx
export function ImposterDiscuss({
  starter,
  starterColor,
  timerMinutes,
  voting,
  onFinish,
}: {
  starter: string;
  starterColor: string;
  timerMinutes: number;
  voting: boolean;
  onFinish: () => void;
}) {
```

Replace the starter line:

```tsx
      <Text className="text-center text-2xl font-bold text-gray-900">{t.imposterStarts.replace("{name}", () => starter)}</Text>
```

with:

```tsx
      <View className="rounded-full px-5 py-2" style={{ backgroundColor: starterColor }}>
        <Text className="text-center text-2xl font-bold" style={{ color: GAME_THEME.ink }}>
          {t.imposterStarts.replace("{name}", () => starter)}
        </Text>
      </View>
```

In `mobile/src/components/games/imposter-result.tsx`:

Change the shared import to:

```tsx
import { playerColor, type GameState } from "@ptracker/shared/imposter";
```

Replace the imposters line:

```tsx
          <Text className="font-bold">{round.imposters.map((i) => names[i]).join(", ")}</Text>
```

with:

```tsx
          <Text className="font-bold">
            {round.imposters.flatMap((i, n) => [
              n > 0 ? ", " : "",
              <Text key={i} style={{ color: playerColor(i) }}>
                {names[i]}
              </Text>,
            ])}
          </Text>
```

Replace the scoreboard rows:

```tsx
          {names
            .map((name, i) => ({ name, score: scores[i] }))
            .sort((a, b) => b.score - a.score)
            .map(({ name, score }) => (
              <View key={name} className="flex-row justify-between py-1">
                <Text className="text-base text-gray-900">{name}</Text>
                <Text className="text-base font-bold text-gray-900">{score}</Text>
              </View>
            ))}
```

with:

```tsx
          {names
            .map((name, i) => ({ name, score: scores[i], color: playerColor(i) }))
            .sort((a, b) => b.score - a.score)
            .map(({ name, score, color }) => (
              <View key={name} className="flex-row justify-between py-1">
                <Text className="text-base font-semibold" style={{ color }}>
                  {name}
                </Text>
                <Text className="text-base font-bold text-gray-900">{score}</Text>
              </View>
            ))}
```

Replace the whole of `mobile/src/app/games/imposter.tsx` with:

```tsx
import { useEffect, useReducer, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  CATEGORY_LABEL_KEYS,
  GAME_THEME,
  gameReducer,
  initialGameState,
  playerColor,
  validateSetup,
  type ImposterSetup,
} from "@ptracker/shared/imposter";
import { DealTurn } from "@/components/games/deal-turn";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { ImposterDiscuss } from "@/components/games/imposter-discuss";
import { ImposterResult } from "@/components/games/imposter-result";
import { ImposterSetupWizard } from "@/components/games/imposter-setup";
import { PassPhone } from "@/components/games/pass-phone";
import { getStoredSetup, setStoredSetup } from "@/lib/imposter-storage";

export default function ImposterScreen() {
  const { t, lang } = useLang();
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState());
  const [draft, setDraft] = useState<ImposterSetup | null>(null);
  const [step, setStep] = useState(0);
  // A game was played on this device before: the wizard may offer to skip its steps.
  const [played, setPlayed] = useState(false);
  const pinReady = useEnterGameModeOnce();

  useEffect(() => {
    getStoredSetup().then((saved) => {
      setDraft(saved);
      setPlayed(validateSetup(saved).length === 0);
    });
  }, []);

  if (!pinReady) return <GamesPinSetup title={t.imposterTitle} />;

  const { phase, setup, round, turn, revealed } = state;
  const names = setup.players;
  // Deal and vote belong to one player at a time: the screen takes that player's colour.
  const ownTurn = round !== null && (phase === "deal" || phase === "vote");

  let body: React.ReactNode = null;

  if (phase === "setup") {
    body = draft ? (
      <ImposterSetupWizard
        value={draft}
        onChange={setDraft}
        step={step}
        onStep={setStep}
        quickStart={played}
        onStart={() => {
          void setStoredSetup(draft);
          setPlayed(true);
          setStep(0);
          dispatch({ type: "start", setup: draft, lang, rng: Math.random, at: Date.now() });
        }}
      />
    ) : (
      <ActivityIndicator />
    );
  } else if (round && phase === "deal") {
    const card = round.cards[turn];
    // The card text is the same colour for every role: only the words differ.
    const label = (
      <Text className="text-sm" style={{ color: GAME_THEME.muted }}>
        {t.imposterYourWord}
      </Text>
    );
    body = (
      <DealTurn
        key={turn}
        name={names[turn]}
        revealed={revealed}
        onReveal={() => dispatch({ type: "reveal", at: Date.now() })}
        onNext={() => dispatch({ type: "next", at: Date.now() })}>
        {card.kind === "word" ? (
          <>
            {label}
            <Text className="text-center text-4xl font-bold" style={{ color: GAME_THEME.text }}>
              {card.text}
            </Text>
          </>
        ) : (
          <>
            <Text className="text-center text-3xl font-bold" style={{ color: GAME_THEME.text }}>
              {t.imposterYouAre}
            </Text>
            {card.word ? (
              <>
                {label}
                <Text className="text-center text-4xl font-bold" style={{ color: GAME_THEME.text }}>
                  {card.word}
                </Text>
              </>
            ) : (
              <Text style={{ color: GAME_THEME.muted }}>
                {t.imposterCategoryHint.replace("{category}", t[CATEGORY_LABEL_KEYS[card.category]])}
              </Text>
            )}
          </>
        )}
      </DealTurn>
    );
  } else if (round && phase === "discuss") {
    body = (
      <ImposterDiscuss
        starter={names[round.starter]}
        starterColor={playerColor(round.starter)}
        timerMinutes={setup.timerMinutes}
        voting={setup.voting}
        onFinish={() => dispatch({ type: "finishDiscussion", at: Date.now() })}
      />
    );
  } else if (round && phase === "vote") {
    body = (
      <PassPhone name={names[turn]} revealed={revealed} revealLabel={t.imposterOpenBallot} onReveal={() => dispatch({ type: "reveal", at: Date.now() })}>
        <Text className="text-center text-xl font-bold" style={{ color: GAME_THEME.ink }}>
          {t.imposterWhoIs}
        </Text>
        <View className="gap-2">
          {names.map((name, i) =>
            i === turn ? null : (
              <Pressable
                key={name}
                onPress={() => dispatch({ type: "vote", target: i, at: Date.now() })}
                className="rounded-xl border-2 py-3"
                style={{ backgroundColor: playerColor(i), borderColor: GAME_THEME.bg }}>
                <Text className="text-center text-base font-semibold" style={{ color: GAME_THEME.ink }}>
                  {name}
                </Text>
              </Pressable>
            )
          )}
        </View>
      </PassPhone>
    );
  } else if (phase === "result") {
    body = (
      <ImposterResult
        state={state}
        onNextRound={() => dispatch({ type: "nextRound", lang, rng: Math.random, at: Date.now() })}
        onEnd={() => {
          setDraft(state.setup);
          dispatch({ type: "end", at: Date.now() });
        }}
      />
    );
  }

  return (
    <GameScreen
      title={t.imposterTitle}
      tone="game"
      color={ownTurn ? playerColor(turn) : undefined}
      scroll={phase !== "deal"}>
      {body}
    </GameScreen>
  );
}
```

- [ ] **Step 4: Run the mobile checks**

Run: `npx vitest run`
Expected: PASS, every mobile test file.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `grep -rn "ImposterSetupForm" src`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/components/games/imposter-discuss.tsx src/components/games/imposter-result.tsx src/app/games/imposter.tsx src/lib/imposter-discuss.test.ts src/lib/imposter-result.test.ts src/lib/imposter-screen.test.ts
git commit -m "feat(mobile): run the imposter game through the setup wizard and the hold card"
```

---

### Task 16: Remove the unused string and run every check

**Files:**
- Modify: `shared/i18n.ts`

- [ ] **Step 1: Confirm the old button label is unused**

Run (repo root): `grep -rn "imposterHideNext" src mobile/src shared`
Expected: exactly two lines, both in `shared/i18n.ts` (the `en` and `tr` definitions). If any other file is listed, stop: a screen still uses the old label.

- [ ] **Step 2: Remove it**

In `shared/i18n.ts` delete these two lines:

```ts
    imposterHideNext: "Hide, next",
```

```ts
    imposterHideNext: "Gizle, sıradaki",
```

- [ ] **Step 3: Run the whole web suite**

Run (repo root): `npm test`
Expected: every file passes except the two known failures in `src/components/CalendarView.mark-paid.test.ts`. Compare with `git stash; npm test; git stash pop` only if something else is red.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx eslint src/components/games src/lib/desktop-pointer.ts src/lib/desktop-pointer.test.ts`
Expected: no problems.

Run: `npm run build`
Expected: the build completes; `/games` and `/games/imposter` are listed.

- [ ] **Step 4: Run the whole mobile suite**

Run: `cd mobile && npx vitest run && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 5: Look at the web game in a browser**

Run (repo root): `AUTH_TRUST_HOST=true npx next start` and open `http://localhost:3000/games/imposter` signed in. Check in both the light and the dark app theme:
- the three steps, the dots, Back / Next, an error on a step with a problem;
- player cards and category tiles are coloured; text on them is dark and readable;
- with a mouse: the card has Show / Hide, no holding;
- in the browser's device toolbar (touch emulation, reload the page): the card shows only while pressed, and hides when the tab is switched;
- an imposter card and a crew card have the same colours;
- the vote buttons carry each candidate's colour; the result names are coloured.

Stop the server afterwards.

- [ ] **Step 6: Commit**

```bash
git add shared/i18n.ts
git commit -m "chore(shared): drop the unused 'Hide, next' string"
```

---

### Task 17: Mobile bundle check and release (only when the owner asks)

Nothing in this task runs without the owner's request: pushing, opening a PR, merging and publishing an update are each their call.

- [ ] **Step 1: Bring in the Metro fix**

PR #11 must be merged to `main`. Then, on this branch:

```bash
git fetch origin
git merge origin/main
```

Expected: `mobile/metro.config.js` contains the `resolveRequest` override for `shared/`. If PR #11 is not merged, stop here and say so.

- [ ] **Step 2: Check the Android bundle has one React**

```bash
cd mobile
rm -rf /tmp/ptx
npx expo export --platform android --output-dir /tmp/ptx --no-bytecode --source-maps
python3 -I -c "import json,sys; m=json.load(open(sys.argv[1])); print(sorted(set(x.split('/node_modules/')[0] for x in m['sources'] if '/node_modules/react/' in x)))" "$(ls /tmp/ptx/_expo/static/js/android/*.map | head -1)"
```

Expected: the export finishes and the last command prints `['']`. `['', '/..']` means the web app's React is bundled too: do not publish.

- [ ] **Step 3: Push and open the PR**

Use `/push-gate:push` and `/push-gate:create-pr`. Commit any tests the coverage gate generates as their own `test:` commit.

- [ ] **Step 4: Publish to the phone and check it starts**

After the PR is merged and the owner asks for the mobile release, from `mobile/` on `main`:

```bash
npx eas-cli update --channel preview --environment preview --platform android --message "Imposter: setup wizard, player colours, hold to see" --non-interactive
```

With the phone on USB:

```bash
adb logcat -c -b crash
adb shell am force-stop com.tolgahan.paymenttracker
adb shell monkey -p com.tolgahan.paymenttracker -c android.intent.category.LAUNCHER 1
sleep 15
adb shell am force-stop com.tolgahan.paymenttracker
adb shell monkey -p com.tolgahan.paymenttracker -c android.intent.category.LAUNCHER 1
sleep 15
adb shell pidof com.tolgahan.paymenttracker
adb logcat -d -b crash | grep -E "FATAL|JavascriptException" | tail -5
```

Expected: a process id is printed and the crash log has no lines. Only then tell the owner it is published.

- [ ] **Step 5: Device checklist for the owner**

On the phone, in the **light** app theme first (that is where a wrong palette shows), then dark:
1. Setup: text is readable on the dark background on all three steps, including the mode toggle, the timer field and the switches. If any text is dark on dark, the dark palette is not reaching that control: report which one.
2. The status bar icons are light on the game screens and back to normal on Payments.
3. Player cards and category tiles are coloured; "Start with last settings" appears from the second game on.
4. Deal: the screen is the player's colour; the card shows only while held, also when the finger drifts a little; it closes when the app is sent to the background.
5. "Next player" is disabled until the card was seen; a very fast press right after "Next player" does not flash the next card.
6. Vote: the screen is the voter's colour, candidates carry their own colour, a long list (9+ players) scrolls.
7. Result: names are in their colours.
