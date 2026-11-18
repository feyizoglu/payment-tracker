# Book Tower Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Book Tower / Kitap Kulesi, a single-player one-tap stacking game, to the Games section on web and mobile, playable offline, as specified in `docs/superpowers/specs/2026-11-19-book-tower-design.md`.

**Architecture:** One pure engine in `shared/book-tower.ts` (sliding book, drop and trim, perfect drops, camera, falling pieces, pause), driven by the existing `shared/frame-loop.ts`. Web draws on a canvas and mobile with Views moved by Reanimated shared values. Both screens follow Paper Plane's: the live state lives in a ref, the engine runs every frame, and React re-renders only when the phase or score changes. The best-score session rule moves from `shared/paper-plane.ts` to `shared/best-score.ts`, and both games use it.

**Tech Stack:** Next.js (web; read `node_modules/next/dist/docs/` before touching routes), Expo SDK 57 + Expo Router + NativeWind + Reanimated 4 (mobile), vitest on both.

**Base:** branch `feature/book-tower` from `main` *after* the Paper Plane best-score PR (`feature/paper-plane-best`) is merged, because Task 1 moves its session rule.

**Commands:**
- Web tests: `npx --no-install vitest run <file>` from the repo root.
- Mobile tests: `cd mobile && npx --no-install vitest run <file>` (only `mobile/src/lib/**/*.test.ts` is collected).
- Web types/lint: `npx --no-install tsc --noEmit -p .` and `npx --no-install eslint <files>`.
- Mobile types: `cd mobile && npx --no-install tsc --noEmit`; bundle check: `cd mobile && npx expo export --platform android --output-dir /tmp/ptx --no-bytecode --source-maps`.

## File structure

| File | Responsibility |
|---|---|
| `shared/best-score.ts` | Session best rule (`SessionBest`, `newSessionBest`, `sessionRead`, `bestAfter`) and `parseSavedBest`, moved from Paper Plane. |
| `shared/paper-plane.ts` | Re-exports the moved names under its current names. |
| `shared/book-tower.ts` | Engine: constants, `newTowerGame`, `towerTap`, `towerPause`, `stepTower`, speed, camera, palette. |
| `src/lib/book-tower.ts`, `src/lib/best-score.ts` | Web re-export shims. |
| `src/lib/book-tower.test.ts`, `src/lib/best-score.test.ts` | Engine and rule tests. |
| `src/components/games/tower/draw-tower.ts` | Canvas drawing of one frame. |
| `src/components/games/tower/TowerGame.tsx` | Web game: canvas, loop, input, best score, overlay. |
| `src/components/games/tower/TowerOverlay.tsx` | Web Ready / Paused / Playing / Over overlays. |
| `src/app/games/tower/page.tsx` | Web route in `GamesShell`. |
| `mobile/src/lib/book-tower-storage.ts` | Mobile best score in AsyncStorage (`null` on a failed read). |
| `mobile/src/components/games/tower/tower-world.tsx` | `useTowerView` (shared values + `sync`) and `TowerWorld`. |
| `mobile/src/components/games/tower/tower-overlay.tsx` | Mobile overlays. |
| `mobile/src/app/games/tower.tsx` | Mobile screen. |
| `shared/i18n.ts`, both games lists, `mobile/src/app/_layout.tsx`, `src/lib/games-offline.ts`, `public/sw.js` | Wiring. |

---

### Task 1: Move the best-score rule to `shared/best-score.ts`

**Files:** Create `shared/best-score.ts`, `src/lib/best-score.ts`, `src/lib/best-score.test.ts`. Modify `shared/paper-plane.ts`, `src/lib/paper-plane.test.ts`.

- [ ] **Step 1:** Create `shared/best-score.ts` by moving `parseSavedBest`, `PlaneSessionBest`, `newPlaneSessionBest`, `planeSessionRead`, `planeBestAfter` out of `shared/paper-plane.ts`. Rename them to `parseSavedBest`, `SessionBest`, `newSessionBest`, `sessionRead`, `bestAfter`, and keep their bodies and doc comments unchanged.
- [ ] **Step 2:** In `shared/paper-plane.ts` add, where the moved code was:

```ts
export {
  parseSavedBest,
  bestAfter as planeBestAfter,
  newSessionBest as newPlaneSessionBest,
  sessionRead as planeSessionRead,
  type SessionBest as PlaneSessionBest,
} from "./best-score";
```

- [ ] **Step 3:** Create `src/lib/best-score.ts` with `export * from "../../shared/best-score";`.
- [ ] **Step 4:** Move the `describe("planeBestAfter")` and `describe("parseSavedBest")` blocks from `src/lib/paper-plane.test.ts` to `src/lib/best-score.test.ts`, importing the new names from `@/lib/best-score`. Rename the describe blocks to `bestAfter` and `parseSavedBest`. Keep one test in `paper-plane.test.ts` that pins the aliases:

```ts
describe("best-score re-exports", () => {
  it("keeps Paper Plane's names for the shared rule", () => {
    expect(planeBestAfter).toBe(bestAfter);
    expect(planeSessionRead).toBe(sessionRead);
    expect(newPlaneSessionBest).toBe(newSessionBest);
  });
});
```

- [ ] **Step 5:** Run `npx --no-install vitest run src/lib/best-score.test.ts src/lib/paper-plane.test.ts src/components/games/plane` and `cd mobile && npx --no-install vitest run src/lib/plane-screen.test.ts`. Expected: all pass.
- [ ] **Step 6:** Commit with `refactor(games): move the best-score session rule to a shared module`.

### Task 2: Engine

**Files:** Create `shared/book-tower.ts`, `src/lib/book-tower.ts` (`export * from "../../shared/book-tower";`), `src/lib/book-tower.test.ts`.

The world is 100 units wide. `y` points up from the desk surface, and book `i` sits between `i·7` and `(i+1)·7`. A book's `x` is its left edge. The slider's `x` is its centre.

- [ ] **Step 1: Write the failing tests** in `src/lib/book-tower.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  BOOK_H,
  START_W,
  TOWER_WIDTH,
  newTowerGame,
  stepTower,
  towerBookColour,
  towerCameraTarget,
  towerPause,
  towerSpeed,
  towerTap,
  TOWER_BOOKS,
  type TowerState,
} from "@/lib/book-tower";

const playing = (): TowerState => towerTap(newTowerGame());
const at = (s: TowerState, x: number): TowerState => ({ ...s, slider: { ...s.slider, x } });
const top = (s: TowerState) => s.stack[s.stack.length - 1];

describe("start", () => {
  it("waits with one book on the desk, and the first tap starts the slider without dropping", () => {
    const s = newTowerGame();
    expect(s.phase).toBe("ready");
    expect(s.stack).toEqual([{ x: 25, w: START_W, index: 0 }]);
    const p = towerTap(s);
    expect(p.phase).toBe("playing");
    expect(p.stack).toHaveLength(1);
    expect(p.slider).toEqual({ x: 0, dir: 1 });
    expect(stepTower(s, 0.5)).toBe(s);
  });
});

describe("sliding", () => {
  it("moves at the current speed and bounces at both ends", () => {
    let s = playing();
    s = stepTower(s, 1 / 60);
    expect(s.slider.x).toBeCloseTo(towerSpeed(0) / 60);
    s = stepTower({ ...s, slider: { x: 99, dir: 1 } }, 1 / 30);
    expect(s.slider.dir).toBe(-1);
    expect(s.slider.x).toBeCloseTo(100 - (towerSpeed(0) / 30 - 1));
    s = stepTower({ ...s, slider: { x: 0.5, dir: -1 } }, 1 / 30);
    expect(s.slider.dir).toBe(1);
  });

  it("treats a long frame as at most 1/30 s", () => {
    expect(stepTower(playing(), 1).slider.x).toBeCloseTo(towerSpeed(0) / 30);
  });

  it("speeds up by score and stops at 40 points", () => {
    expect(towerSpeed(0)).toBe(35);
    expect(towerSpeed(10)).toBe(50);
    expect(towerSpeed(40)).toBe(95);
    expect(towerSpeed(90)).toBe(95);
  });
});

describe("dropping", () => {
  it("cuts what hangs over on the right and drops it as a falling piece", () => {
    const s = towerTap(at(playing(), 60));
    expect(s.score).toBe(1);
    expect(top(s)).toEqual({ x: 35, w: 40, index: 1 });
    expect(s.pieces).toHaveLength(1);
    expect(s.pieces[0]).toMatchObject({ x: 75, w: 10, y: BOOK_H, index: 1 });
    expect(s.slider).toEqual({ x: TOWER_WIDTH, dir: -1 });
  });

  it("cuts what hangs over on the left", () => {
    const s = towerTap(at(playing(), 40));
    expect(top(s)).toEqual({ x: 25, w: 40, index: 1 });
    expect(s.pieces[0]).toMatchObject({ x: 15, w: 10 });
  });

  it("lands a near miss exactly on the book below, and grows on every third perfect drop in a row", () => {
    let s = playing();
    s = towerTap(at(s, 51));
    expect(top(s)).toEqual({ x: 25, w: 50, index: 1 });
    expect(s.pieces).toHaveLength(0);
    expect(s.perfect).toBeGreaterThan(0);
    s = { ...s, stack: [...s.stack.slice(0, -1), { x: 30, w: 40, index: 1 }] };
    s = towerTap(at(s, 50));
    s = towerTap(at(s, 50));
    expect(s.streak).toBe(3);
    expect(top(s)).toEqual({ x: 27, w: 46, index: 3 });
    s = towerTap(at(s, 60));
    expect(s.streak).toBe(0);
  });

  it("never grows past the starting width", () => {
    let s = playing();
    for (let i = 0; i < 3; i++) s = towerTap(at(s, 50));
    expect(top(s).w).toBe(START_W);
  });

  it("ends the game when the book misses, and lets the whole book fall", () => {
    const s = towerTap(at(playing(), 95));
    expect(s.phase).toBe("over");
    expect(s.score).toBe(0);
    expect(s.pieces).toHaveLength(1);
    expect(s.pieces[0]).toMatchObject({ x: 70, w: 50 });
  });

  it("does nothing on a tap after the end", () => {
    const over = towerTap(at(playing(), 95));
    expect(towerTap(over)).toBe(over);
  });
});

describe("camera and falling pieces", () => {
  it("keeps five books below the top, easing towards it", () => {
    expect(towerCameraTarget(newTowerGame())).toBe(0);
    let s = playing();
    for (let i = 0; i < 8; i++) s = towerTap(at(s, 50));
    expect(towerCameraTarget(s)).toBe((s.stack.length - 6) * BOOK_H);
    const after = stepTower(s, 1 / 60);
    expect(after.camera).toBeGreaterThan(0);
    expect(after.camera).toBeLessThan(towerCameraTarget(s));
    let settled = after;
    for (let i = 0; i < 120; i++) settled = stepTower(settled, 1 / 60);
    expect(settled.camera).toBeCloseTo(towerCameraTarget(s), 1);
  });

  it("lets pieces fall and spin, and drops them below the view; over keeps them falling", () => {
    let s = towerTap(at(playing(), 95));
    const y0 = s.pieces[0].y;
    s = stepTower(s, 1 / 30);
    expect(s.pieces[0].y).toBeLessThan(y0);
    expect(s.pieces[0].angle).not.toBe(0);
    for (let i = 0; i < 120; i++) s = stepTower(s, 1 / 30);
    expect(s.pieces).toHaveLength(0);
  });

  it("fades the perfect flash out", () => {
    let s = towerTap(at(playing(), 50));
    for (let i = 0; i < 30; i++) s = stepTower(s, 1 / 30);
    expect(s.perfect).toBe(0);
  });
});

describe("pause", () => {
  it("stops the slider while paused, and a tap resumes without dropping", () => {
    const p = towerPause(stepTower(playing(), 1 / 60));
    expect(p.phase).toBe("paused");
    expect(stepTower(p, 1 / 30)).toBe(p);
    const r = towerTap(p);
    expect(r.phase).toBe("playing");
    expect(r.stack).toHaveLength(1);
  });

  it("ignores pause outside play", () => {
    const s = newTowerGame();
    expect(towerPause(s)).toBe(s);
  });
});

describe("colours", () => {
  it("gives a book the same colour for its whole life", () => {
    expect(towerBookColour(0)).toBe(TOWER_BOOKS[0]);
    expect(towerBookColour(TOWER_BOOKS.length + 2)).toBe(TOWER_BOOKS[2]);
  });
});
```

- [ ] **Step 2:** Run `npx --no-install vitest run src/lib/book-tower.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Write `shared/book-tower.ts`:**

```ts
// Book Tower: a one-tap stacking game. Pure logic shared by web and mobile, driven by elapsed time.
// The world is 100 units wide; y points up from the desk, and book i sits between i·7 and (i+1)·7.

export type TowerPhase = "ready" | "playing" | "paused" | "over";

export interface TowerBook {
  /** Left edge. */
  x: number;
  w: number;
  /** Order of placement from 0 (the desk book); picks the colour. */
  index: number;
}

export interface TowerPiece {
  x: number;
  w: number;
  /** Bottom edge. */
  y: number;
  vy: number;
  /** Degrees. */
  angle: number;
  spin: number;
  index: number;
}

export interface TowerState {
  phase: TowerPhase;
  stack: TowerBook[];
  /** Centre of the sliding book and its direction. */
  slider: { x: number; dir: 1 | -1 };
  score: number;
  /** Perfect drops in a row. */
  streak: number;
  camera: number;
  pieces: TowerPiece[];
  /** Seconds the "Perfect!" text still shows. */
  perfect: number;
}

export const TOWER_WIDTH = 100;
export const BOOK_H = 7;
export const START_W = 50;
export const PERFECT_TOLERANCE = 1.5;
export const GROW = 6;
export const GROW_EVERY = 3;
export const KEEP_BELOW = 5;
export const PERFECT_FLASH = 0.6;
export const TOWER_BEST_KEY = "book-tower-best";
export const TOWER_OVER_GUARD_MS = 500;

const MAX_DT = 1 / 30;
const GRAVITY = 300;
const CAMERA_RATE = 12;
const DIFFICULTY_CAP = 40;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const towerSpeed = (score: number) => 35 + 1.5 * Math.min(score, DIFFICULTY_CAP);

export function towerCameraTarget(s: TowerState): number {
  return Math.max(0, (s.stack.length - (KEEP_BELOW + 1)) * BOOK_H);
}

/** Books come alternately from the left and the right end. */
function sliderFor(index: number): TowerState["slider"] {
  return index % 2 === 1 ? { x: 0, dir: 1 } : { x: TOWER_WIDTH, dir: -1 };
}

export function newTowerGame(): TowerState {
  return {
    phase: "ready",
    stack: [{ x: (TOWER_WIDTH - START_W) / 2, w: START_W, index: 0 }],
    slider: sliderFor(1),
    score: 0,
    streak: 0,
    camera: 0,
    pieces: [],
    perfect: 0,
  };
}

function piece(x: number, w: number, index: number, side: number): TowerPiece {
  return { x, w, y: index * BOOK_H, vy: 0, angle: 0, spin: 90 * side, index };
}

function drop(s: TowerState): TowerState {
  const below = s.stack[s.stack.length - 1];
  const index = s.stack.length;
  const left = s.slider.x - below.w / 2;
  const right = left + below.w;
  const centre = below.x + below.w / 2;
  if (Math.abs(s.slider.x - centre) < PERFECT_TOLERANCE) {
    const streak = s.streak + 1;
    const w = streak % GROW_EVERY === 0 ? Math.min(START_W, below.w + GROW) : below.w;
    const book = { x: centre - w / 2, w, index };
    return { ...s, stack: [...s.stack, book], score: s.score + 1, streak, slider: sliderFor(index + 1), perfect: PERFECT_FLASH };
  }
  const lo = Math.max(left, below.x);
  const hi = Math.min(right, below.x + below.w);
  if (hi - lo <= 0) {
    return { ...s, phase: "over", streak: 0, pieces: [...s.pieces, piece(left, below.w, index, s.slider.x < centre ? -1 : 1)] };
  }
  const cut = left < lo ? piece(left, lo - left, index, -1) : piece(hi, right - hi, index, 1);
  return {
    ...s,
    stack: [...s.stack, { x: lo, w: hi - lo, index }],
    score: s.score + 1,
    streak: 0,
    slider: sliderFor(index + 1),
    pieces: [...s.pieces, cut],
  };
}

/** Ready: start sliding. Playing: drop. Paused: resume without a drop. Over: nothing. */
export function towerTap(s: TowerState): TowerState {
  if (s.phase === "ready" || s.phase === "paused") return { ...s, phase: "playing" };
  if (s.phase === "playing") return drop(s);
  return s;
}

export function towerPause(s: TowerState): TowerState {
  return s.phase === "playing" ? { ...s, phase: "paused" } : s;
}

/** Playing moves everything; over only lets the pieces finish falling. */
export function stepTower(s: TowerState, dt: number): TowerState {
  if (s.phase !== "playing" && s.phase !== "over") return s;
  const t = clamp(dt, 0, MAX_DT);
  if (t === 0) return s;
  let slider = s.slider;
  if (s.phase === "playing") {
    let x = slider.x + slider.dir * towerSpeed(s.score) * t;
    let dir = slider.dir;
    if (x > TOWER_WIDTH) {
      x = 2 * TOWER_WIDTH - x;
      dir = -1;
    } else if (x < 0) {
      x = -x;
      dir = 1;
    }
    slider = { x, dir };
  }
  const camera = s.camera + (towerCameraTarget(s) - s.camera) * (1 - Math.exp(-CAMERA_RATE * t));
  const pieces = s.pieces
    .map((p) => {
      const vy = p.vy + GRAVITY * t;
      return { ...p, vy, y: p.y - vy * t, angle: p.angle + p.spin * t };
    })
    .filter((p) => p.y > camera - 60);
  return { ...s, slider, camera, pieces, perfect: Math.max(0, s.perfect - t) };
}

export const TOWER_BOOKS = ["#c0392b", "#2e86c1", "#27ae60", "#e67e22", "#8e44ad", "#16a085"] as const;
export const towerBookColour = (index: number) => TOWER_BOOKS[index % TOWER_BOOKS.length];

export const TOWER_COLORS = {
  light: { wall: "#f6f1e7", desk: "#c8955c", deskEdge: "#a5733f", stripe: "rgba(255,255,255,0.55)", ink: "#3b3b3b", score: "#1f2937" },
  dark: { wall: "#141d33", desk: "#4a3524", deskEdge: "#33241a", stripe: "rgba(255,255,255,0.35)", ink: "#d9dfeb", score: "#f3f4f6" },
} as const;
```

- [ ] **Step 4:** Run the tests. Expected: PASS. Fix the engine (not the tests) if a number is off, unless a test assumed something the spec does not say.
- [ ] **Step 5:** Commit with `feat(games): add the Book Tower engine`.

### Task 3: Web drawing

**Files:** Create `src/components/games/tower/draw-tower.ts`, `src/components/games/tower/draw-tower.test.ts`.

- [ ] **Step 1: Tests.** Use the same `recorder()` as `src/components/games/plane/draw-plane.test.ts` (copy the function, including `rect` and `clip`). Test that:
  - `towerViewport(400, 500)` is `{ scale: 4, left: 0, desk: 500 - 12 * 4 }`;
  - `towerViewport(1000, 550)` is `{ scale: 5, left: 250, desk: 550 - 60 }`;
  - the first call is a `fillRect` of the wall colour;
  - a fresh game draws the desk book in `towerBookColour(0)`;
  - a playing game also draws the slider in `towerBookColour(stack.length)`;
  - the drawing is clipped to the world: `rect(0, …, TOWER_WIDTH, …)` comes before `clip`.
- [ ] **Step 2: Implement:**

```ts
import { BOOK_H, TOWER_COLORS, TOWER_WIDTH, towerBookColour, type TowerState } from "@/lib/book-tower";

const DESK = 12;

/** Pixels per unit, the world's left edge, and the desk surface's y in pixels. */
export function towerViewport(cssWidth: number, cssHeight: number) {
  const scale = Math.min(cssWidth / TOWER_WIDTH, cssHeight / 110);
  return { scale, left: (cssWidth - TOWER_WIDTH * scale) / 2, desk: cssHeight - DESK * scale };
}

function book(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, colour: string, stripe: string) {
  ctx.fillStyle = colour;
  ctx.fillRect(x, y - BOOK_H, w, BOOK_H);
  ctx.fillStyle = stripe;
  for (const at of [Math.min(3, w / 4), Math.max(w - 4, (3 * w) / 4)]) ctx.fillRect(x + at, y - BOOK_H + 1, 1, BOOK_H - 2);
}

export function drawTowerScene(ctx: CanvasRenderingContext2D, s: TowerState, cssWidth: number, cssHeight: number, dark: boolean) {
  const c = dark ? TOWER_COLORS.dark : TOWER_COLORS.light;
  ctx.fillStyle = c.wall;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  const { scale, left, desk } = towerViewport(cssWidth, cssHeight);
  ctx.save();
  ctx.translate(left, desk + s.camera * scale);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, -10000, TOWER_WIDTH, 10000 + DESK + 1);
  ctx.clip();
  ctx.fillStyle = c.desk;
  ctx.fillRect(0, 0, TOWER_WIDTH, DESK);
  ctx.fillStyle = c.deskEdge;
  ctx.fillRect(0, 0, TOWER_WIDTH, 1.5);
  const lowest = Math.max(0, Math.floor(s.camera / BOOK_H) - 1);
  for (let i = lowest; i < s.stack.length; i++) {
    const b = s.stack[i];
    book(ctx, b.x, -i * BOOK_H, b.w, towerBookColour(b.index), c.stripe);
  }
  if (s.phase === "playing" || s.phase === "paused") {
    const w = s.stack[s.stack.length - 1].w;
    book(ctx, s.slider.x - w / 2, -s.stack.length * BOOK_H, w, towerBookColour(s.stack.length), c.stripe);
  }
  for (const p of s.pieces) {
    ctx.save();
    ctx.translate(p.x + p.w / 2, -p.y - BOOK_H / 2);
    ctx.rotate((p.angle * Math.PI) / 180);
    ctx.fillStyle = towerBookColour(p.index);
    ctx.fillRect(-p.w / 2, -BOOK_H / 2, p.w, BOOK_H);
    ctx.restore();
  }
  ctx.restore();
}
```

- [ ] **Step 3:** Run, pass, commit with `feat(games): draw Book Tower on a canvas`.

### Task 4: Translations

**Files:** Modify `shared/i18n.ts`.

- [ ] Add after `planeBackToGames` in `en`:

```ts
    towerTitle: "Book Tower",
    towerDesc: "Stack books as high as you can. One tap drops the next book.",
    towerKeyHint: "Tap or press Space to drop.",
    towerPerfect: "Perfect!",
```

  and in `tr`:

```ts
    towerTitle: "Kitap Kulesi",
    towerDesc: "Kitapları olabildiğince yükseğe diz. Bir dokunuş sıradaki kitabı bırakır.",
    towerKeyHint: "Bırakmak için dokun ya da Boşluk tuşuna bas.",
    towerPerfect: "Tam!",
```

  The overlays reuse the generic texts `planeBest`, `planeTapToStart`, `planeTapToContinue`, `planeScore`, `planeNewBest`, `planeAgain` and `planeBackToGames`.
- [ ] Run `npx --no-install tsc --noEmit -p .` (the translation type checks both languages), then commit with `feat(games): add Book Tower texts`.

### Task 5: Web game, overlay and route

**Files:** Create `src/components/games/tower/TowerOverlay.tsx`, `src/components/games/tower/TowerGame.tsx`, `src/components/games/tower/TowerGame.test.ts`, `src/app/games/tower/page.tsx`, `src/app/games/tower/page.test.ts`.

- [ ] **Step 1: `TowerOverlay.tsx`.** Copy `src/components/games/plane/PlaneOverlay.tsx`, then make these changes:
  - the type becomes `TowerPhase` from `@/lib/book-tower`;
  - the `"flying"` branch becomes `"playing"`, and it also renders `{perfect && <p className="…text-lg font-semibold" style={{ color: ink }}>{t.towerPerfect}</p>}` under the score (add a `perfect: boolean` prop);
  - `t.planeKeyHint` becomes `t.towerKeyHint`;
  - every `sky-` class becomes `amber-` (`text-amber-600 dark:text-amber-400`, `bg-amber-600`).
- [ ] **Step 2: `TowerGame.tsx`.** Copy `src/components/games/plane/PlaneGame.tsx`, then make these changes:
  - imports come from `@/lib/book-tower` and `@/lib/best-score` (`newSessionBest`, `sessionRead`, `bestAfter`, `parseSavedBest`);
  - `PLANE_*` become `TOWER_BEST_KEY`, `TOWER_COLORS`, `TOWER_OVER_GUARD_MS`;
  - `newPlaneGame(width)` becomes `newTowerGame()`; drop `planeWorldWidth`, and `onResize` only calls `draw()`;
  - `planeTap(live.current, Math.random)` becomes `towerTap(live.current)`, and `planePause` becomes `towerPause`;
  - `drawPlaneScene` becomes `drawTowerScene`;
  - the view state also holds `perfect: boolean`, set to `next.perfect > 0` and compared in `publish`;
  - the frame-loop effect runs while `view.phase` is `"playing"` or `"over"`. It calls `stepTower(live.current, dt)`, and the loop returns `next.phase === "playing" || next.pieces.length > 0`;
  - `"flying"` becomes `"playing"` everywhere.
- [ ] **Step 3: Tests.** Copy `src/components/games/plane/PlaneGame.test.ts` to `TowerGame.test.ts`, then:
  - replace the partial mock of `@/lib/paper-plane` with one of `@/lib/book-tower` whose `stepTower` returns `engine.endWith(s)` when set;
  - rename the plane names to their tower names;
  - drop the world-width and resize-refit tests;
  - replace "Tap to start" checks with the same ready text;
  - keep these tests: Space drops, primary button only, pause on blur and on hidden, best saved and shown, the session-best tests, the 500 ms guard from the first frame, Space plays again after the guard, theme switch.

  Add one test: after a perfect drop (a tap while `slider.x` is the top book's centre, set through `engine.endWith`), the overlay shows "Perfect!".
- [ ] **Step 4: Route.** `src/app/games/tower/page.tsx` mirrors `src/app/games/plane/page.tsx` with `TowerGame` and `t.towerTitle`. Copy `src/app/games/plane/page.test.ts` to `src/app/games/tower/page.test.ts` and rename.
- [ ] **Step 5:** Run the web tests in `src/components/games/tower` and `src/app/games/tower`, eslint on the new files, and `tsc`. Commit with `feat(games): play Book Tower on the web`.

### Task 6: Web list, offline and dark theme

**Files:** Modify `src/app/games/page.tsx`, `src/app/games/page.test.ts`, `src/lib/games-offline.ts`, `src/lib/games-offline.test.ts`, `public/sw.js`, `src/app/globals.css` (only if amber-600/400 is missing there).

- [ ] Add a card after Paper Plane that links to `/games/tower`. It uses the `Library` icon from `lucide-react`, the classes `w-6 h-6 text-amber-600 dark:text-amber-400` and the tile `bg-amber-50`, and shows `t.towerTitle` / `t.towerDesc`. Add `Library` to the lucide mock in `page.test.ts`, and add `/games/tower` to the link list it checks.
- [ ] Append `"/games/tower"` to `GAMES_PAGES` in `src/lib/games-offline.ts` and `public/sw.js`. Bump the cache name to `games-v8` in both, and update `games-offline.test.ts` (`games-v8`).
- [ ] Run the tests, then commit with `feat(games): list Book Tower and cache it offline`.

### Task 7: Mobile storage

**Files:** Create `mobile/src/lib/book-tower-storage.ts` and `mobile/src/lib/book-tower-storage.test.ts`, copying `paper-plane-storage.ts` and its test. Use `TOWER_BEST_KEY` from `@ptracker/shared/book-tower` and `parseSavedBest` from `@ptracker/shared/best-score`, and name the functions `getStoredTowerBest` and `setStoredTowerBest`. Run, then commit with `feat(mobile): keep the Book Tower best score`.

### Task 8: Mobile world

**Files:** Create `mobile/src/components/games/tower/tower-world.tsx`, `mobile/src/lib/tower-world.test.ts`.

- [ ] **Step 1: Implement:**

```tsx
import { useMemo } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";

import { BOOK_H, TOWER_COLORS, TOWER_WIDTH, towerBookColour, type TowerBook, type TowerState } from "@ptracker/shared/book-tower";

const PIECE_SLOTS = 3;
const DESK = 12;
const SHOWN = 40;

export interface TowerView {
  slider: SharedValue<number>;
  camera: SharedValue<number>;
  /** Per slot: [x, w, y, angle], parked far below when empty. */
  pieces: SharedValue<number[][]>;
  colours: SharedValue<string[]>;
  sync: (s: TowerState) => void;
}

export function useTowerView(): TowerView {
  const slider = useSharedValue(0);
  const camera = useSharedValue(0);
  const pieces = useSharedValue<number[][]>(Array.from({ length: PIECE_SLOTS }, () => [0, 0, -1000, 0]));
  const colours = useSharedValue<string[]>(Array(PIECE_SLOTS).fill(towerBookColour(0)));
  // Stable across renders: the screen's frame loop depends on it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ slider, camera, pieces, colours, sync: (s: TowerState) => {
    slider.value = s.slider.x;
    camera.value = s.camera;
    const last = s.pieces.slice(-PIECE_SLOTS);
    pieces.value = Array.from({ length: PIECE_SLOTS }, (_, i) => (last[i] ? [last[i].x, last[i].w, last[i].y, last[i].angle] : [0, 0, -1000, 0]));
    colours.value = Array.from({ length: PIECE_SLOTS }, (_, i) => towerBookColour(last[i]?.index ?? 0));
  } }), []);
}

function Piece({ view, slot, scale }: { view: TowerView; slot: number; scale: number }) {
  const { pieces, colours } = view;
  const style = useAnimatedStyle(() => {
    const [x, w, y, angle] = pieces.value[slot];
    return {
      left: x * scale,
      width: w * scale,
      bottom: y * scale,
      backgroundColor: colours.value[slot],
      transform: [{ rotate: `${angle}deg` }],
    };
  });
  return <Animated.View style={[{ position: "absolute", height: BOOK_H * scale }, style]} />;
}

function Book({ book, level, scale, stripe }: { book: Pick<TowerBook, "x" | "w" | "index">; level: number; scale: number; stripe: string }) {
  const w = book.w * scale;
  return (
    <View style={{ position: "absolute", left: book.x * scale, bottom: level * BOOK_H * scale, width: w, height: BOOK_H * scale, backgroundColor: towerBookColour(book.index) }}>
      <View style={{ position: "absolute", left: Math.min(3 * scale, w / 4), top: scale, bottom: scale, width: Math.max(1, scale), backgroundColor: stripe }} />
      <View style={{ position: "absolute", right: Math.min(3 * scale, w / 4), top: scale, bottom: scale, width: Math.max(1, scale), backgroundColor: stripe }} />
    </View>
  );
}

export function TowerWorld({
  view,
  stack,
  sliding,
  width,
  height,
  dark,
}: {
  view: TowerView;
  stack: TowerBook[];
  sliding: boolean;
  width: number;
  height: number;
  dark: boolean;
}) {
  const c = dark ? TOWER_COLORS.dark : TOWER_COLORS.light;
  const scale = Math.min(width / TOWER_WIDTH, height / 110);
  const left = (width - TOWER_WIDTH * scale) / 2;
  const { camera, slider } = view;
  const top = stack[stack.length - 1];
  const world = useAnimatedStyle(() => ({ transform: [{ translateY: camera.value * scale }] }));
  const moving = useAnimatedStyle(() => ({ left: (slider.value - top.w / 2) * scale }));
  const first = Math.max(0, stack.length - SHOWN);
  return (
    <View style={{ width, height, backgroundColor: c.wall, overflow: "hidden" }}>
      <Animated.View style={[{ position: "absolute", left, width: TOWER_WIDTH * scale, top: 0, bottom: 0 }, world]}>
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: DESK * scale, backgroundColor: c.desk, borderTopWidth: 1.5 * scale, borderTopColor: c.deskEdge }} />
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: DESK * scale }}>
          {stack.slice(first).map((b, i) => (
            <Book key={b.index} book={b} level={first + i} scale={scale} stripe={c.stripe} />
          ))}
          {sliding ? (
            <Animated.View
              style={[
                { position: "absolute", bottom: stack.length * BOOK_H * scale, width: top.w * scale, height: BOOK_H * scale, backgroundColor: towerBookColour(stack.length) },
                moving,
              ]}
            />
          ) : null}
          {Array.from({ length: PIECE_SLOTS }, (_, slot) => (
            <Piece key={slot} view={view} slot={slot} scale={scale} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}
```

- [ ] **Step 2: Tests.** Copy the mock setup of `mobile/src/lib/plane-world.test.ts` (react `useMemo`, react-native `View`, and reanimated). Test that:
  - `sync` copies the slider, camera and the last three pieces and parks empty slots at `y = -1000`;
  - the world paints the wall colour;
  - the stack draws one `Book` per book, and only the last 40;
  - the slider shows only while `sliding`, in `towerBookColour(stack.length)`;
  - the camera moves the world down by `camera · scale`.
- [ ] **Step 3:** Run, then commit with `feat(mobile): draw the Book Tower desk`.

### Task 9: Mobile overlay and screen

**Files:** Create `mobile/src/components/games/tower/tower-overlay.tsx`, `mobile/src/app/games/tower.tsx`, `mobile/src/lib/tower-overlay.test.ts`, `mobile/src/lib/tower-screen.test.ts`.

- [ ] **Step 1: Overlay.** Copy `mobile/src/components/games/plane/plane-overlay.tsx`, then:
  - use `TowerPhase`;
  - `"flying"` becomes `"playing"`, and add a `perfect` prop that shows `t.towerPerfect` under the score;
  - change `text-sky-600` to `text-amber-700`.

  Copy `mobile/src/lib/plane-overlay.test.ts` and adapt it the same way, adding a perfect-text test.
- [ ] **Step 2: Screen.** Copy `mobile/src/app/games/plane.tsx`, then:
  - use the tower engine, the storage from Task 7, `useTowerView` / `TowerWorld` / `TowerOverlay`, and `newSessionBest` / `sessionRead` / `bestAfter` from `@ptracker/shared/best-score`;
  - `shown` becomes `{ phase, score, perfect, stack }` (`perfect = next.perfect > 0`). `publish` compares phase, score and perfect, and takes `stack: next.stack` when they change;
  - there is no world width: `fresh` is `publish(newTowerGame())` and does not depend on `size`, so the "only a game not started yet takes the size" effect goes;
  - the frame loop runs while `shown.phase` is `"playing"` or `"over"`, and returns `next.phase === "playing" || next.pieces.length > 0`;
  - `TowerWorld` gets `stack={shown.stack}` and `sliding={shown.phase === "playing" || shown.phase === "paused"}`;
  - the title is `t.towerTitle`, and `playing` is `shown.phase === "playing" || shown.phase === "paused"`.
- [ ] **Step 3: Screen tests.** Copy `mobile/src/lib/plane-screen.test.ts` and point every mock at the tower modules. The engine partial mock sets `score` and `phase: "over"` through `engine.endScore`. Drop the two world-width tests and keep the rest, renaming as needed. Add one test: a tap while playing drops a book, and the overlay score becomes 1. Use the real engine with the slider at the top book's centre.
- [ ] **Step 4:** Run the mobile tests and `cd mobile && npx --no-install tsc --noEmit`. Commit with `feat(mobile): play Book Tower`.

### Task 10: Mobile list and route

**Files:** Modify `mobile/src/app/games/index.tsx`, `mobile/src/app/_layout.tsx`, `mobile/src/lib/game-mode-entry.test.ts`, `mobile/src/lib/root-layout.test.ts`.

- [ ] Add a card after Paper Plane: `bg-amber-50` tile, 📚, `t.towerTitle` / `t.towerDesc`, `router.push("/games/tower")`.
- [ ] Add `<Stack.Screen name="games/tower" />` after `games/plane`.
- [ ] Update `game-mode-entry.test.ts`: the presses array grows by one, and the last press index shifts by one. Mirror the Paper Plane change in the same file and add a test for the tower card. In `root-layout.test.ts`, guard `games/tower` like `games/plane`.
- [ ] Run the mobile suite and commit with `feat(mobile): list Book Tower`.

### Task 11: Docs and full check

- [ ] Add Kitap Kulesi to the shipped games in `docs/roadmap.md`.
- [ ] Run both full suites, both `tsc`, eslint on the changed web files, and the Android export with the single-React check.
- [ ] Play it on the web through a throwaway preview page (the games pages need a Google sign-in, which must not be automated): ready, drop, trim, perfect, miss and the over card, Again, in light and dark. Delete the preview page afterwards.
- [ ] Commit with `docs: record Book Tower in the roadmap`.
