# Paper Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Paper Plane / Kağıt Uçak, a single-player one-tap flyer, to the Games section on web and mobile, playable offline, as specified in `docs/superpowers/specs/2026-11-18-paper-plane-design.md`.

**Architecture:** One pure engine in `shared/paper-plane.ts` (physics, obstacles, scoring, pause) and one frame loop in `shared/frame-loop.ts`, both used by web (canvas) and mobile (Views moved by Reanimated shared values). The screens hold the live state in a ref, call the engine every frame, and re-render React only when the score or phase changes.

**Tech Stack:** Next.js (web, read `node_modules/next/dist/docs/` before touching routes), Expo SDK 57 + Expo Router + NativeWind + Reanimated 4 (mobile), vitest on both.

**Decisions made while planning (spec updated in Task 1):**
- The physics numbers in the spec were checked with an exhaustive reachability search (`/tmp/ppsim/bfs.mjs`): every layout of 30 seeds × widths 45 and 80 can be flown to 100 points; with a 70-unit gap step the same search finds dead ends, so the check discriminates. The test in Task 2 runs the same search on the real engine. A naive "flap when below the gap" autopilot cannot pass faster gaps and is not used.
- Mobile taps use `Pressable onPressIn` (fires on touch down). The app has no `GestureHandlerRootView`, so a gesture-handler tap is not used.
- Ruled lines are horizontal, so they cannot show the speed; a red margin line that repeats every 120 units of flight does.
- Up to 4 obstacles are kept: the ones on screen plus one waiting off screen at the right.

**Commands:**
- Web tests: `npx --no-install vitest run <file>` from the repo root.
- Mobile tests: `cd mobile && npx --no-install vitest run <file>` (only `mobile/src/lib/**/*.test.ts` is collected).
- Web types/lint: `npx --no-install tsc --noEmit -p .` and `npx --no-install eslint <files>`.
- Mobile types: `cd mobile && npx --no-install tsc --noEmit`; bundle check: `cd mobile && npx expo export --platform android --output-dir /tmp/ptx --no-bytecode --source-maps`.

## File structure

| File | Responsibility |
|---|---|
| `shared/paper-plane.ts` | Engine: constants, `newPlaneGame`, `planeTap`, `planePause`, `stepPlane`, difficulty, gap drawing, world width, nose angle, best-score parsing, palette. |
| `shared/frame-loop.ts` | `startFrameLoop(onFrame)`: requestAnimationFrame loop handing out seconds since the last frame. |
| `src/lib/paper-plane.ts`, `src/lib/frame-loop.ts` | Web re-export shims (`export * from "../../shared/…"`). |
| `src/lib/paper-plane.test.ts`, `src/lib/frame-loop.test.ts` | Engine and loop tests. |
| `src/components/games/plane/draw-plane.ts` | Canvas drawing of one frame. |
| `src/components/games/plane/PlaneGame.tsx` | Web game: canvas, loop, input, best score, overlays. |
| `src/components/games/plane/PlaneOverlay.tsx` | Web Ready / Paused / Over / score overlays. |
| `src/app/games/plane/page.tsx` | Web route in `GamesShell`. |
| `mobile/src/lib/paper-plane-storage.ts` | Mobile best score in AsyncStorage, fail-soft. |
| `mobile/src/components/games/plane/plane-world.tsx` | `usePlaneView` (shared values + `sync`) and `PlaneWorld` (the drawn page). |
| `mobile/src/components/games/plane/plane-overlay.tsx` | Mobile overlays. |
| `mobile/src/app/games/plane.tsx` | Mobile screen. |
| `shared/i18n.ts`, both games lists, `src/lib/games-offline.ts`, `public/sw.js` | Wiring. |

---

### Task 1: Spec touch-ups

**Files:** Modify `docs/superpowers/specs/2026-11-18-paper-plane-design.md`

- [ ] **Step 1:** In "Obstacles and difficulty", replace the last bullet with:
  `- Up to 4 obstacles are kept: the ones on screen plus one waiting off screen at the right. One leaving at the left is dropped.`
- [ ] **Step 2:** In "Look", replace "The lines scroll with the world, so they show the speed." with:
  `The ruled lines stay still; a red margin line repeats every 120 units of flight and scrolls with the world, so passing pages show the speed.`
- [ ] **Step 3:** In "Game loop", replace "(web: `pointerdown` and Space; mobile: a gesture-handler tap, which fires on touch down)" with
  "(web: `pointerdown` and Space; mobile: `Pressable` `onPressIn`, which fires on touch down)".
- [ ] **Step 4:** In "Testing", replace "and an autopilot that reaches 100 points on 200 seeds (every layout is flyable)" with
  "and a reachability search over flap / no-flap choices every 1/30 s that finds a way to 60 points on 10 seeds at widths 45 and 80 (every layout is flyable)".
- [ ] **Step 5:** Commit with the plan: `git add docs/superpowers/specs/2026-11-18-paper-plane-design.md docs/superpowers/plans/2026-11-18-paper-plane.md` then `git commit -m "docs: plan the Paper Plane game"`.

### Task 2: Engine

**Files:** Create `shared/paper-plane.ts`, `src/lib/paper-plane.ts`, `src/lib/paper-plane.test.ts`

- [ ] **Step 1: Write the failing tests** in `src/lib/paper-plane.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MAX_GAP_STEP,
  OBSTACLE_SPACING,
  OBSTACLE_WIDTH,
  PLANE_FLAP_SPEED,
  PLANE_GRAVITY,
  PLANE_MAX_FALL,
  drawGapY,
  newPlaneGame,
  parseSavedBest,
  planeAngle,
  planeGap,
  planePause,
  planeSpeed,
  planeTap,
  planeWorldWidth,
  planeX,
  stepPlane,
  type PlaneState,
  type Rng,
} from "@/lib/paper-plane";

function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const half = () => 0.5;
const flying = (width = 56): PlaneState => planeTap(newPlaneGame(width), half);

describe("world and difficulty", () => {
  it("sizes the world by the screen, within 45 to 80 units", () => {
    expect(planeWorldWidth(360, 640)).toBeCloseTo(56.25);
    expect(planeWorldWidth(300, 1000)).toBe(45);
    expect(planeWorldWidth(1600, 900)).toBe(80);
    expect(planeWorldWidth(0, 0)).toBe(56);
  });

  it("speeds up and narrows by score, and stops at 40 points", () => {
    expect([planeSpeed(0), planeGap(0)]).toEqual([30, 32]);
    expect([planeSpeed(20), planeGap(20)]).toEqual([40, 27]);
    expect([planeSpeed(40), planeGap(40)]).toEqual([50, 22]);
    expect([planeSpeed(90), planeGap(90)]).toEqual([50, 22]);
  });

  it("draws gaps away from the edges, within 30 units of the last one", () => {
    const rng = seeded(7);
    let prev: number | null = null;
    for (let i = 0; i < 500; i++) {
      const gap = planeGap(i % 50);
      const y = drawGapY(prev, gap, rng);
      expect(y - gap / 2).toBeGreaterThanOrEqual(12 - 1e-9);
      expect(y + gap / 2).toBeLessThanOrEqual(88 + 1e-9);
      if (prev !== null) expect(Math.abs(y - prev)).toBeLessThanOrEqual(MAX_GAP_STEP + 1e-9);
      prev = y;
    }
  });
});

describe("flying", () => {
  it("waits on the ready screen until the first tap, which flaps", () => {
    const ready = newPlaneGame(56);
    expect(stepPlane(ready, 1 / 30, half)).toBe(ready);
    const s = planeTap(ready, half);
    expect(s.phase).toBe("flying");
    expect(s.vy).toBe(PLANE_FLAP_SPEED);
    expect(s.obstacles).toHaveLength(1);
    expect(s.spawned).toBe(1);
    expect(s.obstacles[0].x).toBeCloseTo(56 + 30 * 1.5);
  });

  it("falls under gravity up to the fall cap, and a tap sends it up again", () => {
    let s = flying();
    s = { ...s, vy: 0 };
    s = stepPlane(s, 1 / 60, half);
    expect(s.vy).toBeCloseTo(PLANE_GRAVITY / 60);
    s = { ...s, vy: PLANE_MAX_FALL, y: 20 };
    s = stepPlane(s, 1 / 60, half);
    expect(s.vy).toBe(PLANE_MAX_FALL);
    expect(planeTap(s, half).vy).toBe(PLANE_FLAP_SPEED);
  });

  it("tilts the nose from -25 degrees climbing to 60 falling", () => {
    expect(planeAngle(PLANE_FLAP_SPEED)).toBeCloseTo(-25);
    expect(planeAngle(PLANE_MAX_FALL)).toBeCloseTo(60);
    expect(planeAngle(-500)).toBeCloseTo(-25);
  });

  it("treats a long frame as at most 1/30 s", () => {
    const s = { ...flying(), vy: 0 };
    expect(stepPlane(s, 2, half).y).toBeCloseTo(stepPlane(s, 1 / 30, half).y);
    expect(stepPlane(s, -1, half).y).toBe(s.y);
  });

  it("ends at the top and at the bottom edge", () => {
    expect(stepPlane({ ...flying(), y: 1.6, vy: -60 }, 1 / 60, half).phase).toBe("over");
    expect(stepPlane({ ...flying(), y: 98.4, vy: 60 }, 1 / 60, half).phase).toBe("over");
  });
});

describe("obstacles", () => {
  const at = (s: PlaneState, x: number, gapY: number, gap = 32): PlaneState => ({
    ...s,
    vy: 0,
    obstacles: [{ x, gapY, gap, kind: 0, scored: false }],
  });

  it("hits an obstacle when the plane is outside its gap", () => {
    const s = flying();
    const px = planeX(s.width);
    expect(stepPlane(at({ ...s, y: 30 }, px - 2, 60), 1 / 60, half).phase).toBe("over");
    expect(stepPlane(at({ ...s, y: 60 }, px - 2, 60), 1 / 60, half).phase).toBe("flying");
  });

  it("forgives a graze: the hitbox is 6 x 3 units", () => {
    const s = flying();
    const px = planeX(s.width);
    // Gap top at 44: the plane's top edge at 44.6 clears it.
    expect(stepPlane(at({ ...s, y: 46.1 }, px - 2, 60), 1 / 120, half).phase).toBe("flying");
  });

  it("hits an obstacle reached during a long frame", () => {
    const s = flying();
    const px = planeX(s.width);
    const before = at({ ...s, y: 20, vy: 0, score: 40 }, px + 3.2, 60);
    expect(stepPlane(before, 1 / 30, half).phase).toBe("over");
  });

  it("scores once per obstacle, after the plane is past it", () => {
    const s = flying();
    const px = planeX(s.width);
    let w = at({ ...s, y: 60 }, px - 3 - OBSTACLE_WIDTH + 0.1, 60);
    w = stepPlane(w, 1 / 60, half);
    expect(w.score).toBe(1);
    w = stepPlane(w, 1 / 60, half);
    expect(w.score).toBe(1);
  });

  it("keeps one obstacle waiting off screen, spaced 38 units, and drops the ones gone", () => {
    let s = flying(45);
    for (let i = 0; i < 600 && s.phase === "flying"; i++) {
      const ahead = s.obstacles.find((o) => !o.scored);
      s = stepPlane({ ...s, y: ahead?.gapY ?? 50, vy: 0 }, 1 / 60, seeded(i));
      expect(s.obstacles.length).toBeLessThanOrEqual(4);
      expect(s.obstacles.at(-1)!.x).toBeGreaterThanOrEqual(s.width - 1e-9);
      for (let k = 1; k < s.obstacles.length; k++) {
        expect(s.obstacles[k].x - s.obstacles[k - 1].x).toBeCloseTo(OBSTACLE_SPACING);
      }
      expect(s.obstacles[0].x + OBSTACLE_WIDTH).toBeGreaterThanOrEqual(0);
    }
  });

  it("can always be flown: a search over taps finds a way to 60 points", () => {
    for (const width of [45, 80]) {
      for (let seed = 1; seed <= 10; seed++) {
        expect(flyable(newPlaneGame(width), seeded(seed), 60), `width ${width}, seed ${seed}`).toBe(true);
      }
    }
  }, 60_000);
});

// Every state that survives, kept once per (height, speed) bucket. The obstacles do not depend
// on the path flown: obstacle n always gets the n-th number, so every branch replays the same
// sequence from its own `spawned`.
function flyable(start: PlaneState, rng: Rng, target: number): boolean {
  const draws: number[] = [];
  const from = (i: number): Rng => () => {
    while (draws.length <= i) draws.push(rng());
    return draws[i++];
  };
  let states = [planeTap(start, from(0))];
  for (let t = 0; t < 200; t += 1 / 30) {
    const next = new Map<string, PlaneState>();
    for (const s of states) {
      for (const flap of [false, true]) {
        const after = stepPlane(flap ? planeTap(s, from(s.spawned)) : s, 1 / 30, from(s.spawned));
        if (after.phase !== "flying") continue;
        if (after.score >= target) return true;
        const key = `${Math.round(after.y * 2)}:${Math.round(after.vy / 3)}`;
        if (!next.has(key)) next.set(key, after);
      }
    }
    if (next.size === 0) return false;
    states = [...next.values()];
  }
  return false;
}

describe("pause", () => {
  it("stops the world while paused and resumes on a tap without flapping", () => {
    const s = { ...flying(), vy: 20 };
    const paused = planePause(s);
    expect(paused.phase).toBe("paused");
    expect(stepPlane(paused, 1 / 30, half)).toBe(paused);
    const resumed = planeTap(paused, half);
    expect(resumed).toMatchObject({ phase: "flying", vy: 20 });
  });

  it("ignores pause outside a flight and taps after the end", () => {
    const ready = newPlaneGame(56);
    expect(planePause(ready)).toBe(ready);
    const over = { ...flying(), phase: "over" as const };
    expect(planeTap(over, half)).toBe(over);
  });
});

describe("parseSavedBest", () => {
  it("accepts a non-negative whole number and nothing else", () => {
    expect(parseSavedBest("23")).toBe(23);
    expect(parseSavedBest(null)).toBe(0);
    expect(parseSavedBest("-4")).toBe(0);
    expect(parseSavedBest("2.5")).toBe(0);
    expect(parseSavedBest("abc")).toBe(0);
    expect(parseSavedBest("")).toBe(0);
  });
});
```

- [ ] **Step 2: Run to see it fail:** `npx --no-install vitest run src/lib/paper-plane.test.ts` → FAIL, cannot resolve `@/lib/paper-plane`.

- [ ] **Step 3: Write the shim** `src/lib/paper-plane.ts`:

```ts
export * from "../../shared/paper-plane";
```

- [ ] **Step 4: Write the engine** `shared/paper-plane.ts`:

```ts
// Paper Plane: a one-tap flyer. Pure logic shared by web and mobile, driven by elapsed time so
// every refresh rate plays the same. The world is 100 units high; its width follows the screen.

export type Rng = () => number;
export type PlanePhase = "ready" | "flying" | "paused" | "over";

export interface PlaneObstacle {
  /** Left edge, in world units. */
  x: number;
  /** Centre of the gap. */
  gapY: number;
  gap: number;
  /** Which drawing: 0 a pencil, 1 a ruler. */
  kind: number;
  scored: boolean;
}

export interface PlaneState {
  phase: PlanePhase;
  width: number;
  /** Centre of the plane. */
  y: number;
  /** Units per second, down is positive. */
  vy: number;
  score: number;
  obstacles: PlaneObstacle[];
  /** Units flown, for the scrolling margin line. */
  distance: number;
  /** Obstacles created so far; each one draws exactly one number from the rng. */
  spawned: number;
}

export const PLANE_WORLD_HEIGHT = 100;
export const PLANE_GRAVITY = 260;
export const PLANE_FLAP_SPEED = -78;
export const PLANE_MAX_FALL = 120;
export const PLANE_HITBOX = { w: 6, h: 3 } as const;
export const OBSTACLE_WIDTH = 9;
export const OBSTACLE_SPACING = 38;
export const MAX_GAP_STEP = 30;
export const PLANE_MARGIN_EVERY = 120;
export const PLANE_BEST_KEY = "paper-plane-best";
/** The game-over buttons ignore taps this long, so a late flap does not restart the game. */
export const PLANE_OVER_GUARD_MS = 500;

const FIRST_OBSTACLE_DELAY = 1.5;
const GAP_EDGE = 12;
const DIFFICULTY_CAP = 40;
const MAX_DT = 1 / 30;
const MAX_SUBSTEP = 1 / 120;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function planeWorldWidth(screenWidth: number, screenHeight: number): number {
  if (!(screenWidth > 0) || !(screenHeight > 0)) return 56;
  return clamp((screenWidth / screenHeight) * PLANE_WORLD_HEIGHT, 45, 80);
}

export const planeSpeed = (score: number) => 30 + 0.5 * Math.min(score, DIFFICULTY_CAP);
export const planeGap = (score: number) => 32 - 0.25 * Math.min(score, DIFFICULTY_CAP);
export const planeX = (width: number) => width * 0.3;

/** Nose angle in degrees: -25 climbing at full flap speed, 60 at the fall cap. */
export function planeAngle(vy: number): number {
  const t = clamp((vy - PLANE_FLAP_SPEED) / (PLANE_MAX_FALL - PLANE_FLAP_SPEED), 0, 1);
  return -25 + t * 85;
}

/** A gap centre away from the edges and within MAX_GAP_STEP of the last one, so it can be flown. */
export function drawGapY(prev: number | null, gap: number, rng: Rng): number {
  const lo = GAP_EDGE + gap / 2;
  const hi = PLANE_WORLD_HEIGHT - GAP_EDGE - gap / 2;
  let y = lo + rng() * (hi - lo);
  if (prev !== null) y = clamp(y, prev - MAX_GAP_STEP, prev + MAX_GAP_STEP);
  return clamp(y, lo, hi);
}

function obstacleAfter(prev: PlaneObstacle | undefined, x: number, score: number, rng: Rng): PlaneObstacle {
  const gap = planeGap(score);
  return { x, gapY: drawGapY(prev ? prev.gapY : null, gap, rng), gap, kind: prev ? (prev.kind + 1) % 2 : 0, scored: false };
}

export function newPlaneGame(width: number): PlaneState {
  return { phase: "ready", width, y: 50, vy: 0, score: 0, obstacles: [], distance: 0, spawned: 0 };
}

/** Ready: start with a flap. Flying: flap. Paused: resume without a flap. Over: nothing. */
export function planeTap(s: PlaneState, rng: Rng): PlaneState {
  if (s.phase === "ready") {
    const first = obstacleAfter(undefined, s.width + planeSpeed(0) * FIRST_OBSTACLE_DELAY, 0, rng);
    return { ...s, phase: "flying", vy: PLANE_FLAP_SPEED, obstacles: [first], spawned: 1 };
  }
  if (s.phase === "flying") return { ...s, vy: PLANE_FLAP_SPEED };
  if (s.phase === "paused") return { ...s, phase: "flying" };
  return s;
}

export function planePause(s: PlaneState): PlaneState {
  return s.phase === "flying" ? { ...s, phase: "paused" } : s;
}

function hits(s: PlaneState, o: PlaneObstacle): boolean {
  const px = planeX(s.width);
  const w = PLANE_HITBOX.w / 2;
  const h = PLANE_HITBOX.h / 2;
  if (px + w <= o.x || px - w >= o.x + OBSTACLE_WIDTH) return false;
  return s.y - h < o.gapY - o.gap / 2 || s.y + h > o.gapY + o.gap / 2;
}

export function stepPlane(state: PlaneState, dt: number, rng: Rng): PlaneState {
  if (state.phase !== "flying") return state;
  const total = clamp(dt, 0, MAX_DT);
  if (total === 0) return state;
  const n = Math.ceil(total / MAX_SUBSTEP - 1e-9);
  const h = total / n;
  const s: PlaneState = { ...state, obstacles: state.obstacles.map((o) => ({ ...o })) };
  const px = planeX(s.width);
  for (let i = 0; i < n; i++) {
    s.vy = Math.min(PLANE_MAX_FALL, s.vy + PLANE_GRAVITY * h);
    s.y += s.vy * h;
    const dx = planeSpeed(s.score) * h;
    s.distance += dx;
    for (const o of s.obstacles) o.x -= dx;
    if (s.y - PLANE_HITBOX.h / 2 <= 0 || s.y + PLANE_HITBOX.h / 2 >= PLANE_WORLD_HEIGHT) return { ...s, phase: "over" };
    for (const o of s.obstacles) {
      if (hits(s, o)) return { ...s, phase: "over" };
      if (!o.scored && px - PLANE_HITBOX.w / 2 > o.x + OBSTACLE_WIDTH) {
        o.scored = true;
        s.score += 1;
      }
    }
    s.obstacles = s.obstacles.filter((o) => o.x + OBSTACLE_WIDTH >= 0);
    let last = s.obstacles.at(-1);
    while (!last || last.x < s.width) {
      const next = obstacleAfter(last, last ? last.x + OBSTACLE_SPACING : s.width, s.score, rng);
      s.obstacles.push(next);
      s.spawned += 1;
      last = next;
    }
  }
  return s;
}

export function parseSavedBest(raw: string | null): number {
  if (raw === null || raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export const PLANE_COLORS = {
  light: { paper: "#fdfbf3", line: "#c9d8ee", margin: "#e8a3a3", ink: "#3b3b3b", plane: "#ffffff", score: "#1f2937" },
  dark: { paper: "#141d33", line: "#26355a", margin: "#7a3b4a", ink: "#d9dfeb", plane: "#eef2f8", score: "#f3f4f6" },
} as const;
export const PLANE_PENCILS = ["#f2b134", "#e4572e", "#4c9f70", "#3d7dd8"] as const;
export const PLANE_RULER = "#d9b77e";
```

- [ ] **Step 5: Run the tests:** `npx --no-install vitest run src/lib/paper-plane.test.ts` → all pass. If the reachability test fails, the engine and `/tmp/ppsim/bfs.mjs` disagree: compare the collision and scoring order, do not loosen the test.
- [ ] **Step 6: Commit:** `git add shared/paper-plane.ts src/lib/paper-plane.ts src/lib/paper-plane.test.ts` then `git commit -m "feat(games): add the Paper Plane engine"`.

### Task 3: Frame loop

**Files:** Create `shared/frame-loop.ts`, `src/lib/frame-loop.ts`, `src/lib/frame-loop.test.ts`

- [ ] **Step 1: Failing test** `src/lib/frame-loop.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { startFrameLoop } from "@/lib/frame-loop";

const frames: ((now: number) => void)[] = [];
afterEach(() => {
  frames.length = 0;
  vi.unstubAllGlobals();
});
function stub() {
  vi.stubGlobal("requestAnimationFrame", (fn: (now: number) => void) => frames.push(fn));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
}
const tick = (now: number) => frames.splice(0, frames.length).forEach((fn) => fn(now));

describe("startFrameLoop", () => {
  it("hands out seconds since the last frame, 0 on the first", () => {
    stub();
    const seen: number[] = [];
    startFrameLoop((dt) => (seen.push(dt), true));
    tick(1000);
    tick(1016);
    tick(1050);
    expect(seen.map((s) => +s.toFixed(3))).toEqual([0, 0.016, 0.034]);
  });

  it("stops when the frame returns false or the loop is stopped", () => {
    stub();
    let calls = 0;
    startFrameLoop(() => (calls++, false));
    tick(0);
    tick(16);
    expect(calls).toBe(1);

    const stop = startFrameLoop(() => (calls++, true));
    tick(32);
    stop();
    tick(48);
    expect(calls).toBe(2);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** `npx --no-install vitest run src/lib/frame-loop.test.ts` → FAIL (module missing).
- [ ] **Step 3:** `src/lib/frame-loop.ts`: `export * from "../../shared/frame-loop";` and `shared/frame-loop.ts`:

```ts
/** Calls `onFrame` with the seconds since the last frame (0 on the first) until it returns false or the loop is stopped. */
export function startFrameLoop(onFrame: (dt: number) => boolean): () => void {
  let last: number | null = null;
  let stopped = false;
  let id = 0;
  const tick = (now: number) => {
    if (stopped) return;
    const dt = last === null ? 0 : (now - last) / 1000;
    last = now;
    if (onFrame(dt)) id = requestAnimationFrame(tick);
    else stopped = true;
  };
  id = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(id);
  };
}
```

- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5: Commit:** `git add shared/frame-loop.ts src/lib/frame-loop.ts src/lib/frame-loop.test.ts` then `git commit -m "feat(games): add a shared frame loop"`.

### Task 4: Translations

**Files:** Modify `shared/i18n.ts` (after `clueNewGame` in `en` at line ~721 and in `tr` at line ~1427)

- [ ] **Step 1:** Add to `en`:

```ts
    planeTitle: "Paper Plane",
    planeDesc: "Tap to climb, let go to glide. Fly through the gaps as far as you can.",
    planeBest: "Best: {n}",
    planeTapToStart: "Tap to start",
    planeTapToContinue: "Tap to continue",
    planeKeyHint: "Tap or press Space to climb.",
    planeScore: "Score",
    planeNewBest: "New best!",
    planeAgain: "Again",
    planeBackToGames: "Back to games",
```

- [ ] **Step 2:** Add to `tr`:

```ts
    planeTitle: "Kağıt Uçak",
    planeDesc: "Dokun, yüksel; bırak, süzül. Boşluklardan geçerek olabildiğince uzağa uç.",
    planeBest: "Rekor: {n}",
    planeTapToStart: "Başlamak için dokun",
    planeTapToContinue: "Devam etmek için dokun",
    planeKeyHint: "Yükselmek için dokun ya da Boşluk tuşuna bas.",
    planeScore: "Skor",
    planeNewBest: "Yeni rekor!",
    planeAgain: "Tekrar",
    planeBackToGames: "Oyunlara dön",
```

- [ ] **Step 3:** `npx --no-install tsc --noEmit -p .` → no errors (both languages must have the same keys).
- [ ] **Step 4: Commit:** `git add shared/i18n.ts` then `git commit -m "feat(games): add the Paper Plane texts"`.

### Task 5: Web drawing

**Files:** Create `src/components/games/plane/draw-plane.ts`, `src/components/games/plane/draw-plane.test.ts`

- [ ] **Step 1: Failing test** `src/components/games/plane/draw-plane.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { newPlaneGame, planeTap, planeX, PLANE_COLORS } from "@/lib/paper-plane";
import { drawPlaneScene, planeViewport } from "./draw-plane";

function recorder() {
  const calls: { name: string; args: unknown[]; fill?: unknown }[] = [];
  const ctx: Record<string, unknown> = { fillStyle: "", strokeStyle: "", lineWidth: 1 };
  const record = (name: string) => (...args: unknown[]) => calls.push({ name, args, fill: ctx.fillStyle });
  for (const name of ["save", "restore", "translate", "rotate", "scale", "beginPath", "moveTo", "lineTo", "closePath", "fill", "stroke", "fillRect", "strokeRect", "clearRect", "setTransform"]) {
    ctx[name] = record(name);
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("planeViewport", () => {
  it("fits the world's height and centres its width", () => {
    expect(planeViewport(56, 400, 500)).toEqual({ scale: 5, left: (400 - 280) / 2 });
  });
});

describe("drawPlaneScene", () => {
  it("paints the page in the theme's paper colour, then the obstacles and the plane", () => {
    const s = planeTap(newPlaneGame(56), () => 0.5);
    const near = { ...s, obstacles: [{ ...s.obstacles[0], x: 30 }] };
    const { ctx, calls } = recorder();
    drawPlaneScene(ctx, near, 400, 500, true);
    expect(calls[0]).toMatchObject({ name: "fillRect", fill: PLANE_COLORS.dark.paper });
    // Two pieces per obstacle, each a body rect.
    expect(calls.filter((c) => c.name === "fillRect").length).toBeGreaterThan(3);
    const at = calls.find((c) => c.name === "translate");
    expect(at?.args[0]).toBeCloseTo(planeViewport(56, 400, 500).left + planeX(56) * 5);
  });
});
```

- [ ] **Step 2:** Run → FAIL (module missing).
- [ ] **Step 3: Implement** `src/components/games/plane/draw-plane.ts`:

```ts
import {
  OBSTACLE_WIDTH,
  PLANE_COLORS,
  PLANE_MARGIN_EVERY,
  PLANE_PENCILS,
  PLANE_RULER,
  PLANE_WORLD_HEIGHT,
  planeAngle,
  planeX,
  type PlaneObstacle,
  type PlaneState,
} from "@/lib/paper-plane";

/** Pixels per world unit, and where the world's left edge sits. */
export function planeViewport(worldWidth: number, cssWidth: number, cssHeight: number) {
  const scale = cssHeight / PLANE_WORLD_HEIGHT;
  return { scale, left: (cssWidth - worldWidth * scale) / 2 };
}

const TIP = 5;

function drawPiece(ctx: CanvasRenderingContext2D, o: PlaneObstacle, top: boolean, ink: string, index: number) {
  const x = o.x;
  const edge = top ? o.gapY - o.gap / 2 : o.gapY + o.gap / 2;
  const from = top ? 0 : PLANE_WORLD_HEIGHT;
  if (o.kind === 1) {
    ctx.fillStyle = PLANE_RULER;
    ctx.fillRect(x, Math.min(from, edge), OBSTACLE_WIDTH, Math.abs(edge - from));
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    for (let y = Math.min(from, edge) + 2; y < Math.max(from, edge); y += 2) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.round(y) % 10 === 0 ? 3.5 : 2), y);
    }
    ctx.stroke();
    return;
  }
  const bodyEnd = top ? edge - TIP : edge + TIP;
  ctx.fillStyle = PLANE_PENCILS[index % PLANE_PENCILS.length];
  ctx.fillRect(x, Math.min(from, bodyEnd), OBSTACLE_WIDTH, Math.abs(bodyEnd - from));
  ctx.fillStyle = "#f3d9b1";
  ctx.beginPath();
  ctx.moveTo(x, bodyEnd);
  ctx.lineTo(x + OBSTACLE_WIDTH, bodyEnd);
  ctx.lineTo(x + OBSTACLE_WIDTH / 2, edge);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(x + OBSTACLE_WIDTH * 0.35, top ? edge - 1.6 : edge + 1.6);
  ctx.lineTo(x + OBSTACLE_WIDTH * 0.65, top ? edge - 1.6 : edge + 1.6);
  ctx.lineTo(x + OBSTACLE_WIDTH / 2, edge);
  ctx.closePath();
  ctx.fill();
}

/** Draws one frame. The canvas is sized in CSS pixels; the caller sets the device-pixel transform. */
export function drawPlaneScene(ctx: CanvasRenderingContext2D, s: PlaneState, cssWidth: number, cssHeight: number, dark: boolean) {
  const c = dark ? PLANE_COLORS.dark : PLANE_COLORS.light;
  ctx.fillStyle = c.paper;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  const { scale, left } = planeViewport(s.width, cssWidth, cssHeight);

  ctx.save();
  ctx.translate(left, 0);
  ctx.scale(scale, scale);
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  for (let y = 6; y < PLANE_WORLD_HEIGHT; y += 6) {
    ctx.moveTo(0, y);
    ctx.lineTo(s.width, y);
  }
  ctx.stroke();
  const margin = PLANE_MARGIN_EVERY - (s.distance % PLANE_MARGIN_EVERY) - 10;
  if (margin > -1 && margin < s.width + 1) {
    ctx.strokeStyle = c.margin;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(margin, 0);
    ctx.lineTo(margin, PLANE_WORLD_HEIGHT);
    ctx.stroke();
  }
  s.obstacles.forEach((o, i) => {
    const index = Math.round((s.distance + o.x) / 38) + i;
    drawPiece(ctx, o, true, c.ink, index);
    drawPiece(ctx, o, false, c.ink, index + 1);
  });
  ctx.restore();

  ctx.save();
  ctx.translate(left + planeX(s.width) * scale, s.y * scale);
  ctx.rotate((planeAngle(s.vy) * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.fillStyle = c.plane;
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(-5, -3);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-5, 2.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(-3, 0);
  ctx.stroke();
  ctx.restore();
}
```

Note: the obstacles are drawn after `translate(left, 0)` with world-unit coordinates; the test's first `translate` is that one, so change the assertion in Step 1 to read the second `translate` call (`calls.filter((c) => c.name === "translate")[1]`) if the plane's translate is not the first — keep the assertion about the plane's x position.

- [ ] **Step 4:** Run the test → PASS; fix the test's `translate` index as noted if needed.
- [ ] **Step 5: Commit:** `git add src/components/games/plane/draw-plane.ts src/components/games/plane/draw-plane.test.ts` then `git commit -m "feat(games): draw the Paper Plane page on a canvas"`.

### Task 6: Web game, overlay and route

**Files:** Create `src/components/games/plane/PlaneOverlay.tsx`, `src/components/games/plane/PlaneGame.tsx`, `src/components/games/plane/PlaneGame.test.ts`, `src/app/games/plane/page.tsx`, `src/app/games/plane/page.test.ts`

- [ ] **Step 1: Failing tests.** `src/app/games/plane/page.test.ts` mirrors `src/app/games/scale/page.test.ts` with `PlanePage`, `PlaneGame` and `planeTitle: "Paper Plane"`. `src/components/games/plane/PlaneGame.test.ts` uses the host-node harness of `src/components/events/Participants.closed-event.test.ts` (copy its `host` hoist, `jsx-runtime` mocks, `createRoot` and `container()`), plus:

```ts
const frames: ((now: number) => void)[] = [];
let now = 0;
const store = new Map<string, string>();
beforeEach(() => {
  frames.length = 0;
  now = 0;
  store.clear();
  host.nodes.length = 0;
  vi.stubGlobal("window", { HTMLIFrameElement: class {}, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn(), hidden: false, documentElement: { classList: { contains: () => false } } });
  vi.stubGlobal("requestAnimationFrame", (fn: (t: number) => void) => frames.push(fn));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
});
async function frame(ms = 16) {
  now += ms;
  await act(async () => frames.splice(0, frames.length).forEach((fn) => fn(now)));
}
const area = () => host.nodes.findLast((n) => n.type === "div" && typeof n.props.onPointerDown === "function")!;
const text = () => host.nodes.filter((n) => n.type === "p" || n.type === "span").map((n) => n.props.children).flat().join(" ");
```

and these cases (each renders `createElement(LanguageProvider, { initialLang: "en" }, createElement(PlaneGame))`):
  1. "shows the best score and starts on a tap": `store.set("paper-plane-best", "7")`; render; `text()` contains `Best: 7` and `Tap to start`; `act(() => area().props.onPointerDown({ preventDefault() {} }))`; after `frame()` the text no longer contains `Tap to start` and a score `0` is shown.
  2. "ends when the plane falls, saves a new best and guards the buttons for 500 ms": start, then `for (let i = 0; i < 400; i++) await frame(33)` (it falls to the bottom); text contains `New best!`... only when the score beats the stored best: set the stored best to `"0"` and expect `Score` and no crash; then the `Again` button has `disabled: true` right after the end and `false` after `await act(async () => vi.advanceTimersByTime(500))` (use `vi.useFakeTimers({ toFake: ["setTimeout"] })` in this case); clicking `Again` shows `Tap to start` again.
  3. "a wrong saved best reads as 0": `store.set("paper-plane-best", "x")` → `Best: 0`.
- [ ] **Step 2:** Run both tests → FAIL (modules missing).
- [ ] **Step 3: Implement** `src/components/games/plane/PlaneOverlay.tsx`:

```tsx
"use client";

import { fillTemplate } from "@/lib/word-game";
import { useLang } from "@/lib/i18n";
import type { PlanePhase } from "@/lib/paper-plane";

export default function PlaneOverlay({
  phase,
  score,
  best,
  newBest,
  guard,
  onAgain,
}: {
  phase: PlanePhase;
  score: number;
  best: number;
  newBest: boolean;
  guard: boolean;
  onAgain: () => void;
}) {
  const { t } = useLang();
  const digits = "font-bold italic tracking-tight drop-shadow-[0_1px_0_rgba(255,255,255,0.8)]";
  if (phase === "flying") {
    return <p className={`pointer-events-none absolute inset-x-0 top-4 text-center text-5xl ${digits} text-gray-900 dark:text-gray-100`}>{score}</p>;
  }
  if (phase === "ready" || phase === "paused") {
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-800 dark:text-gray-100">
        {phase === "ready" ? <p className="text-sm">{fillTemplate(t.planeBest, { n: String(best) })}</p> : <p className={`text-5xl ${digits}`}>{score}</p>}
        <p className="text-lg font-semibold">{phase === "ready" ? t.planeTapToStart : t.planeTapToContinue}</p>
        {phase === "ready" && <p className="text-xs opacity-70">{t.planeKeyHint}</p>}
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/20 p-6">
      <div className="w-full max-w-xs space-y-3 rounded-2xl bg-white p-5 text-center text-gray-900 shadow-lg dark:bg-gray-800 dark:text-gray-100">
        <p className="text-sm text-gray-500">{t.planeScore}</p>
        <p className={`text-5xl ${digits}`}>{score}</p>
        {newBest ? <p className="font-semibold text-sky-600 dark:text-sky-400">{t.planeNewBest}</p> : <p className="text-sm">{fillTemplate(t.planeBest, { n: String(best) })}</p>}
        <div className="flex gap-2 pt-2">
          <a href="/games" aria-disabled={guard} className={`flex-1 rounded-lg border border-gray-200 py-2 text-sm ${guard ? "pointer-events-none opacity-50" : ""}`}>
            {t.planeBackToGames}
          </a>
          <button type="button" disabled={guard} onClick={onAgain} className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {t.planeAgain}
          </button>
        </div>
      </div>
    </div>
  );
}
```

  (Check first that `fillTemplate` is re-exported by `src/lib/word-game.ts`; if not, import it from `@/lib/scale-game`, which re-exports it for the mobile screens.)

- [ ] **Step 4: Implement** `src/components/games/plane/PlaneGame.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startFrameLoop } from "@/lib/frame-loop";
import {
  PLANE_BEST_KEY,
  PLANE_OVER_GUARD_MS,
  newPlaneGame,
  parseSavedBest,
  planePause,
  planeTap,
  planeWorldWidth,
  stepPlane,
  type PlaneState,
} from "@/lib/paper-plane";
import { drawPlaneScene } from "./draw-plane";
import PlaneOverlay from "./PlaneOverlay";

function readBest(): number {
  try {
    return parseSavedBest(localStorage.getItem(PLANE_BEST_KEY));
  } catch {
    return 0;
  }
}

function writeBest(best: number) {
  try {
    localStorage.setItem(PLANE_BEST_KEY, String(best));
  } catch {
    // Private mode or full storage: the game still runs, it just forgets.
  }
}

export default function PlaneGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<PlaneState>(newPlaneGame(56));
  const [view, setView] = useState({ phase: live.current.phase, score: 0 });
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [guard, setGuard] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * ratio)) canvas.width = Math.round(w * ratio);
    if (canvas.height !== Math.round(h * ratio)) canvas.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawPlaneScene(ctx, live.current, w, h, document.documentElement.classList.contains("dark"));
  }, []);

  const publish = useCallback((next: PlaneState) => {
    live.current = next;
    setView((v) => (v.phase === next.phase && v.score === next.score ? v : { phase: next.phase, score: next.score }));
  }, []);

  const fresh = useCallback(() => {
    const canvas = canvasRef.current;
    publish(newPlaneGame(canvas ? planeWorldWidth(canvas.clientWidth, canvas.clientHeight) : 56));
    setNewBest(false);
    draw();
  }, [draw, publish]);

  useEffect(() => {
    setBest(readBest());
    fresh();
  }, [fresh]);

  const tap = useCallback(() => {
    const next = planeTap(live.current, Math.random);
    if (next !== live.current) publish(next);
  }, [publish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      tap();
    };
    const onHide = () => {
      if (document.hidden) publish(planePause(live.current));
    };
    const onBlur = () => publish(planePause(live.current));
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [tap, publish]);

  useEffect(() => {
    if (view.phase !== "flying") return;
    return startFrameLoop((dt) => {
      const next = stepPlane(live.current, dt, Math.random);
      publish(next);
      draw();
      return next.phase === "flying";
    });
  }, [view.phase, draw, publish]);

  useEffect(() => {
    if (view.phase !== "over") return;
    const score = live.current.score;
    const stored = readBest();
    if (score > stored) {
      writeBest(score);
      setNewBest(true);
    }
    setBest(Math.max(stored, score));
    setGuard(true);
    const id = setTimeout(() => setGuard(false), PLANE_OVER_GUARD_MS);
    return () => clearTimeout(id);
  }, [view.phase]);

  return (
    <div
      className="relative h-[70vh] max-h-[760px] min-h-[420px] w-full select-none overflow-hidden rounded-2xl touch-none"
      onPointerDown={(e) => {
        e.preventDefault();
        tap();
      }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <PlaneOverlay phase={view.phase} score={view.score} best={best} newBest={newBest} guard={guard} onAgain={fresh} />
    </div>
  );
}
```

  The over card's buttons sit inside the tap area: `onAgain` runs on `click`, after the area's `pointerdown` already went to the engine, which ignores taps when over, so the order does not matter.

- [ ] **Step 5: Implement** `src/app/games/plane/page.tsx`:

```tsx
"use client";

import GamesShell from "@/components/games/GamesShell";
import PlaneGame from "@/components/games/plane/PlaneGame";
import { useLang } from "@/lib/i18n";

export default function PlanePage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.planeTitle} backHref="/games">
      <PlaneGame />
    </GamesShell>
  );
}
```

- [ ] **Step 6:** Run `npx --no-install vitest run src/app/games/plane src/components/games/plane` → PASS. Then `npx --no-install eslint src/app/games/plane src/components/games/plane` and `npx --no-install tsc --noEmit -p .` → clean.
- [ ] **Step 7: Commit:** `git add src/app/games/plane/page.tsx src/app/games/plane/page.test.ts src/components/games/plane/PlaneGame.tsx src/components/games/plane/PlaneGame.test.ts src/components/games/plane/PlaneOverlay.tsx` then `git commit -m "feat(games): play Paper Plane on the web"`.

### Task 7: Web list and offline

**Files:** Modify `src/app/games/page.tsx`, `src/app/games/page.test.ts`, `src/lib/games-offline.ts`, `src/lib/games-offline.test.ts`, `public/sw.js`

- [ ] **Step 1: Tests first.** In `src/app/games/page.test.ts`, add `/games/plane` to the expected list of links (follow how `/games/clue` is asserted there). In `src/lib/games-offline.test.ts`, change the expected cache to `games-v7` and add `/games/plane` wherever the page list is asserted. Run both → FAIL.
- [ ] **Step 2:** In `src/app/games/page.tsx`, after the One Clue card, add (import `Send` from `lucide-react` next to `Lightbulb`):

```tsx
        <a
          href="/games/plane"
          className="flex items-center gap-4 rounded-xl border border-gray-100 bg-surface p-4 hover:border-sky-200 transition"
        >
          <div className="rounded-lg bg-sky-50 p-3">
            <Send className="w-6 h-6 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900">{t.planeTitle}</p>
            <p className="text-sm text-gray-500">{t.planeDesc}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </a>
```

- [ ] **Step 3:** In `src/lib/games-offline.ts` set `GAMES_CACHE = "games-v7"` and append `"/games/plane"` to `GAMES_PAGES`; in `public/sw.js` append `"/games/plane"` to its `GAMES_PAGES` (the two lists must match).
- [ ] **Step 4:** Run the two tests → PASS. Check `bg-sky-50` and `hover:border-sky-200` work in dark mode the way `bg-teal-50` does: if `tailwind.config` maps teal shades to theme vars, add the sky shades the same way; if teal is used plainly, nothing to do.
- [ ] **Step 5: Commit:** `git add src/app/games/page.tsx src/app/games/page.test.ts src/lib/games-offline.ts src/lib/games-offline.test.ts public/sw.js` then `git commit -m "feat(games): list Paper Plane and keep it offline"`.

### Task 8: Mobile best-score storage

**Files:** Create `mobile/src/lib/paper-plane-storage.ts`, `mobile/src/lib/paper-plane-storage.test.ts`

- [ ] **Step 1: Failing test:**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => ({ map: new Map<string, string>(), fail: false }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => {
      if (store.fail) throw new Error("disk");
      return store.map.get(k) ?? null;
    },
    setItem: async (k: string, v: string) => {
      if (store.fail) throw new Error("disk");
      store.map.set(k, v);
    },
  },
}));
import { getStoredPlaneBest, setStoredPlaneBest } from "@/lib/paper-plane-storage";

beforeEach(() => {
  store.map.clear();
  store.fail = false;
});

describe("paper plane best score", () => {
  it("reads back what was saved", async () => {
    await setStoredPlaneBest(12);
    expect(await getStoredPlaneBest()).toBe(12);
  });

  it("reads 0 when nothing or something wrong is saved, or storage fails", async () => {
    expect(await getStoredPlaneBest()).toBe(0);
    store.map.set("paper-plane-best", "nope");
    expect(await getStoredPlaneBest()).toBe(0);
    store.fail = true;
    expect(await getStoredPlaneBest()).toBe(0);
    await expect(setStoredPlaneBest(3)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2:** `cd mobile && npx --no-install vitest run src/lib/paper-plane-storage.test.ts` → FAIL.
- [ ] **Step 3: Implement:**

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PLANE_BEST_KEY, parseSavedBest } from "@ptracker/shared/paper-plane";

// Fail-soft like scale-game-storage.ts: a storage error means a best of 0, never a game that will not open.

export async function getStoredPlaneBest(): Promise<number> {
  try {
    return parseSavedBest(await AsyncStorage.getItem(PLANE_BEST_KEY));
  } catch {
    return 0;
  }
}

export async function setStoredPlaneBest(best: number): Promise<void> {
  try {
    await AsyncStorage.setItem(PLANE_BEST_KEY, String(best));
  } catch {
    // The score just is not remembered.
  }
}
```

- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit:** `git add mobile/src/lib/paper-plane-storage.ts mobile/src/lib/paper-plane-storage.test.ts` then `git commit -m "feat(mobile): keep the Paper Plane best score"`.

### Task 9: Mobile world and overlay

**Files:** Create `mobile/src/components/games/plane/plane-world.tsx`, `mobile/src/components/games/plane/plane-overlay.tsx`

Read the Reanimated 4 docs bundled with SDK 57 (`useSharedValue`, `useAnimatedStyle`, `Animated.View`) before writing; screens here are checked by `tsc` and the Android export, not by unit tests (mobile vitest runs only `src/lib`).

- [ ] **Step 1: Implement** `plane-world.tsx`:

```tsx
import { useMemo } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";

import {
  OBSTACLE_WIDTH,
  PLANE_COLORS,
  PLANE_MARGIN_EVERY,
  PLANE_PENCILS,
  PLANE_RULER,
  PLANE_WORLD_HEIGHT,
  planeAngle,
  planeX,
  type PlaneState,
} from "@ptracker/shared/paper-plane";

const SLOTS = 4;
const TIP = 5;

export interface PlaneView {
  y: SharedValue<number>;
  angle: SharedValue<number>;
  distance: SharedValue<number>;
  xs: SharedValue<number[]>;
  gaps: SharedValue<number[]>;
  centres: SharedValue<number[]>;
  kinds: SharedValue<number[]>;
  sync: (s: PlaneState) => void;
}

export function usePlaneView(): PlaneView {
  const y = useSharedValue(50);
  const angle = useSharedValue(0);
  const distance = useSharedValue(0);
  const xs = useSharedValue<number[]>(Array(SLOTS).fill(-1000));
  const gaps = useSharedValue<number[]>(Array(SLOTS).fill(30));
  const centres = useSharedValue<number[]>(Array(SLOTS).fill(50));
  const kinds = useSharedValue<number[]>(Array(SLOTS).fill(0));
  // Stable across renders: the screen's frame loop depends on it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ y, angle, distance, xs, gaps, centres, kinds, sync: (s: PlaneState) => {
    y.value = s.y;
    angle.value = planeAngle(s.vy);
    distance.value = s.distance;
    const o = s.obstacles;
    xs.value = Array.from({ length: SLOTS }, (_, i) => (o[i] ? o[i].x : -1000));
    gaps.value = Array.from({ length: SLOTS }, (_, i) => (o[i] ? o[i].gap : 30));
    centres.value = Array.from({ length: SLOTS }, (_, i) => (o[i] ? o[i].gapY : 50));
    kinds.value = Array.from({ length: SLOTS }, (_, i) => (o[i] ? o[i].kind : 0));
  } }), []);
}

function Piece({ view, slot, top, scale, colour }: { view: PlaneView; slot: number; top: boolean; scale: number; colour: string }) {
  const body = useAnimatedStyle(() => {
    const edge = top ? view.centres.value[slot] - view.gaps.value[slot] / 2 : view.centres.value[slot] + view.gaps.value[slot] / 2;
    const pencil = view.kinds.value[slot] === 0;
    const end = pencil ? (top ? edge - TIP : edge + TIP) : edge;
    const from = top ? 0 : PLANE_WORLD_HEIGHT;
    return {
      left: view.xs.value[slot] * scale,
      top: Math.min(from, end) * scale,
      height: Math.max(0, Math.abs(end - from)) * scale,
      backgroundColor: pencil ? colour : PLANE_RULER,
    };
  });
  const tip = useAnimatedStyle(() => {
    const edge = top ? view.centres.value[slot] - view.gaps.value[slot] / 2 : view.centres.value[slot] + view.gaps.value[slot] / 2;
    const pencil = view.kinds.value[slot] === 0;
    return {
      opacity: pencil ? 1 : 0,
      left: (view.xs.value[slot] + OBSTACLE_WIDTH * 0.2) * scale,
      top: (top ? edge - TIP : edge) * scale,
    };
  });
  return (
    <>
      <Animated.View style={[{ position: "absolute", width: OBSTACLE_WIDTH * scale }, body]} />
      <Animated.View
        style={[
          {
            position: "absolute",
            width: OBSTACLE_WIDTH * 0.6 * scale,
            height: TIP * scale,
            backgroundColor: "#f3d9b1",
            borderTopLeftRadius: top ? 0 : OBSTACLE_WIDTH * scale,
            borderTopRightRadius: top ? 0 : OBSTACLE_WIDTH * scale,
            borderBottomLeftRadius: top ? OBSTACLE_WIDTH * scale : 0,
            borderBottomRightRadius: top ? OBSTACLE_WIDTH * scale : 0,
          },
          tip,
        ]}
      />
    </>
  );
}

export function PlaneWorld({ view, width, height, worldWidth, dark }: { view: PlaneView; width: number; height: number; worldWidth: number; dark: boolean }) {
  const c = dark ? PLANE_COLORS.dark : PLANE_COLORS.light;
  const scale = height / PLANE_WORLD_HEIGHT;
  const left = (width - worldWidth * scale) / 2;
  const margin = useAnimatedStyle(() => ({
    left: (PLANE_MARGIN_EVERY - (view.distance.value % PLANE_MARGIN_EVERY) - 10) * scale,
  }));
  const plane = useAnimatedStyle(() => ({
    top: view.y.value * scale - 3 * scale,
    transform: [{ rotate: `${view.angle.value}deg` }],
  }));
  const lines = [];
  for (let y = 6; y < PLANE_WORLD_HEIGHT; y += 6) {
    lines.push(<View key={y} style={{ position: "absolute", left: 0, right: 0, top: y * scale, height: 1, backgroundColor: c.line }} />);
  }
  return (
    <View style={{ width, height, backgroundColor: c.paper, overflow: "hidden" }}>
      {lines}
      <View style={{ position: "absolute", left, top: 0, width: worldWidth * scale, height, overflow: "hidden" }}>
        <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: c.margin }, margin]} />
        {Array.from({ length: SLOTS }, (_, slot) => (
          <View key={slot} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
            <Piece view={view} slot={slot} top scale={scale} colour={PLANE_PENCILS[slot % PLANE_PENCILS.length]} />
            <Piece view={view} slot={slot} top={false} scale={scale} colour={PLANE_PENCILS[(slot + 2) % PLANE_PENCILS.length]} />
          </View>
        ))}
        <Animated.View style={[{ position: "absolute", left: (planeX(worldWidth) - 5) * scale, width: 10 * scale, height: 6 * scale }, plane]}>
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 0,
              height: 0,
              borderTopWidth: 3 * scale,
              borderBottomWidth: 3 * scale,
              borderLeftWidth: 10 * scale,
              borderTopColor: "transparent",
              borderBottomColor: "transparent",
              borderLeftColor: c.plane,
              transform: [{ scaleX: -1 }],
            }}
          />
          <View style={{ position: "absolute", left: 2 * scale, right: 0, top: 3 * scale - 0.5, height: 1, backgroundColor: c.ink }} />
        </Animated.View>
      </View>
    </View>
  );
}
```

  The plane triangle points right (nose at the right): `borderLeftWidth` draws a triangle pointing right already, so drop `transform: [{ scaleX: -1 }]` if the nose shows on the left in the Android export run in Task 11.

- [ ] **Step 2: Implement** `plane-overlay.tsx`:

```tsx
import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import type { PlanePhase } from "@ptracker/shared/paper-plane";
import { fillTemplate } from "@ptracker/shared/scale-game";
import { PrimaryButton } from "@/components/ui/primary-button";

export function PlaneOverlay({
  phase,
  score,
  best,
  newBest,
  guard,
  ink,
  onAgain,
  onBack,
}: {
  phase: PlanePhase;
  score: number;
  best: number;
  newBest: boolean;
  guard: boolean;
  ink: string;
  onAgain: () => void;
  onBack: () => void;
}) {
  const { t } = useLang();
  const digits = { color: ink, fontSize: 48, fontWeight: "800" as const, fontStyle: "italic" as const };
  if (phase === "flying") {
    return (
      <View pointerEvents="none" style={{ position: "absolute", top: 16, left: 0, right: 0, alignItems: "center" }}>
        <Text style={digits}>{score}</Text>
      </View>
    );
  }
  if (phase === "ready" || phase === "paused") {
    return (
      <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", gap: 8 }}>
        {phase === "ready" ? (
          <Text style={{ color: ink }}>{fillTemplate(t.planeBest, { n: String(best) })}</Text>
        ) : (
          <Text style={digits}>{score}</Text>
        )}
        <Text style={{ color: ink, fontSize: 18, fontWeight: "600" }}>{phase === "ready" ? t.planeTapToStart : t.planeTapToContinue}</Text>
      </View>
    );
  }
  return (
    <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.2)", padding: 24 }}>
      <View className="w-full gap-3 rounded-2xl bg-surface p-5">
        <Text className="text-center text-sm text-gray-500">{t.planeScore}</Text>
        <Text className="text-center text-5xl font-bold text-gray-900">{score}</Text>
        {newBest ? (
          <Text className="text-center font-semibold text-sky-600">{t.planeNewBest}</Text>
        ) : (
          <Text className="text-center text-sm text-gray-700">{fillTemplate(t.planeBest, { n: String(best) })}</Text>
        )}
        <PrimaryButton label={t.planeAgain} onPress={onAgain} disabled={guard} />
        <Pressable onPress={onBack} disabled={guard} className={`items-center py-2 ${guard ? "opacity-50" : ""}`}>
          <Text className="text-sm text-gray-500">{t.planeBackToGames}</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 3:** `cd mobile && npx --no-install tsc --noEmit` → clean.
- [ ] **Step 4: Commit:** `git add mobile/src/components/games/plane/plane-world.tsx mobile/src/components/games/plane/plane-overlay.tsx` then `git commit -m "feat(mobile): draw the Paper Plane page"`.

### Task 10: Mobile screen

**Files:** Create `mobile/src/app/games/plane.tsx`, `mobile/src/lib/plane-screen.test.ts`

- [ ] **Step 1: Failing test** `mobile/src/lib/plane-screen.test.ts`, using the hook harness of `mobile/src/lib/scale-screen.test.ts` (copy `hooks`, the `react` mock with `useState` / `useCallback` / `useEffect`, `nodes`, `runEffects`, `unmount`, `settle`) and add `useRef: (init: unknown) => { const i = hooks.index++; if (!(i in hooks.states)) hooks.states[i] = { current: init }; return hooks.states[i]; }` to the `react` mock. Mocks:

```ts
const env = vi.hoisted(() => ({ pinReady: true, onScreen: true, frames: [] as ((t: number) => void)[], now: 0 }));
const storage = vi.hoisted(() => ({ getStoredPlaneBest: vi.fn(async () => 5), setStoredPlaneBest: vi.fn(async (_n: number) => undefined) }));
const sync = vi.hoisted(() => vi.fn());
const leave = vi.hoisted(() => ({ active: undefined as boolean | undefined, left: 0 }));
vi.mock("react-native", () => ({ Pressable: () => null, View: () => null, useColorScheme: () => "light" }));
vi.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
vi.mock("@ptracker/shared/i18n", async (o) => ({ ...(await o<typeof import("@ptracker/shared/i18n")>()), useLang: () => ({ t: new Proxy({}, { get: (_, k) => String(k) }), lang: "en" }) }));
vi.mock("@/components/games/game-mode-entry", () => ({ GamesPinSetup: () => null, useEnterGameModeOnce: () => env.pinReady }));
vi.mock("@/components/games/game-screen", () => ({ GameScreen: () => null }));
vi.mock("@/components/games/plane/plane-world", () => ({ PlaneWorld: () => null, usePlaneView: () => ({ sync }) }));
vi.mock("@/components/games/plane/plane-overlay", () => ({ PlaneOverlay: () => null }));
vi.mock("@/lib/use-game-on-screen", () => ({ useGameOnScreen: () => env.onScreen }));
vi.mock("@/lib/paper-plane-storage", () => storage);
vi.mock("@/lib/app-lock-context", () => ({ useAppLock: () => ({ lock: { gameMode: true } }) }));
vi.mock("@/lib/leave-game", () => ({
  useConfirmLeave: (active: boolean) => (leave.active = active),
  leaveGameScreen: () => leave.left++,
}));
```

  with `requestAnimationFrame` / `cancelAnimationFrame` stubbed to push into `env.frames`, and `frame(ms)` advancing `env.now` and calling the queued callbacks. Cases:
  1. "shows the PIN setup until game mode is ready" (`env.pinReady = false` → `GamesPinSetup` rendered).
  2. "loads the best score and shows the ready page": after `settle()`, `PlaneOverlay` props `{ phase: "ready", best: 5 }`; `GameScreen` props `{ nav: true, confirmBack: false, scroll: false, tone: "game" }`; `leave.active === false`.
  3. "a tap starts the flight and hides the header; back asks": call the play area `Pressable`'s `onPressIn`; after `settle()` overlay phase `flying`, `GameScreen` `{ nav: false, confirmBack: true }`, `leave.active === true`, `sync` called.
  4. "goes off screen: pauses; a tap resumes without a flap": start, `env.onScreen = false`, `settle()` → phase `paused`; `env.onScreen = true`, tap → phase `flying`.
  5. "falls to the bottom: saves a new best and guards the buttons": `storage.getStoredPlaneBest` resolves `0`; start; run `frame(33)` 400 times with `settle()` every 20 frames; overlay phase `over`; `storage.setStoredPlaneBest` not called when the score is 0 (0 does not beat 0), overlay `guard: true`; after `vi.advanceTimersByTime(500)` and `settle()`, `guard: false`; `onAgain` → phase `ready`; `onBack` → `leave.left === 1`.
- [ ] **Step 2:** `cd mobile && npx --no-install vitest run src/lib/plane-screen.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `mobile/src/app/games/plane.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { startFrameLoop } from "@ptracker/shared/frame-loop";
import {
  PLANE_COLORS,
  PLANE_OVER_GUARD_MS,
  newPlaneGame,
  planePause,
  planeTap,
  planeWorldWidth,
  stepPlane,
  type PlaneState,
} from "@ptracker/shared/paper-plane";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { PlaneOverlay } from "@/components/games/plane/plane-overlay";
import { PlaneWorld, usePlaneView } from "@/components/games/plane/plane-world";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppLock } from "@/lib/app-lock-context";
import { leaveGameScreen, useConfirmLeave } from "@/lib/leave-game";
import { getStoredPlaneBest, setStoredPlaneBest } from "@/lib/paper-plane-storage";
import { useGameOnScreen } from "@/lib/use-game-on-screen";

export default function PlaneScreen() {
  const { t } = useLang();
  const pinReady = useEnterGameModeOnce();
  const onScreen = useGameOnScreen();
  const dark = useColorScheme() === "dark";
  const { lock } = useAppLock();
  const view = usePlaneView();
  const live = useRef<PlaneState>(newPlaneGame(56));
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [shown, setShown] = useState({ phase: live.current.phase, score: 0 });
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [guard, setGuard] = useState(false);

  const publish = useCallback(
    (next: PlaneState) => {
      live.current = next;
      view.sync(next);
      setShown((v) => (v.phase === next.phase && v.score === next.score ? v : { phase: next.phase, score: next.score }));
    },
    [view]
  );

  const fresh = useCallback(() => {
    publish(newPlaneGame(size ? planeWorldWidth(size.w, size.h) : 56));
    setNewBest(false);
  }, [publish, size]);

  useEffect(() => {
    let alive = true;
    void getStoredPlaneBest().then((b) => {
      if (alive) setBest(b);
    });
    return () => {
      alive = false;
    };
  }, []);

  // A new size changes the world's width; only a game not started yet takes it.
  useEffect(() => {
    if (live.current.phase === "ready") fresh();
  }, [fresh]);

  useEffect(() => {
    if (!onScreen) publish(planePause(live.current));
  }, [onScreen, shown.phase, publish]);

  useEffect(() => {
    if (shown.phase !== "flying") return;
    return startFrameLoop((dt) => {
      const next = stepPlane(live.current, dt, Math.random);
      publish(next);
      return next.phase === "flying";
    });
  }, [shown.phase, publish]);

  useEffect(() => {
    if (shown.phase !== "over") return;
    const score = live.current.score;
    if (score > best) {
      setNewBest(true);
      setBest(score);
      void setStoredPlaneBest(score);
    }
    setGuard(true);
    const id = setTimeout(() => setGuard(false), PLANE_OVER_GUARD_MS);
    return () => clearTimeout(id);
    // Only the end of a game saves; `best` is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.phase]);

  const playing = shown.phase === "flying" || shown.phase === "paused";
  useConfirmLeave(playing);

  if (!pinReady) return <GamesPinSetup title={t.planeTitle} />;

  const worldWidth = live.current.width;
  return (
    <GameScreen title={t.planeTitle} tone="game" scroll={false} nav={!playing} confirmBack={playing}>
      <Pressable
        className="flex-1 overflow-hidden rounded-2xl"
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        onPressIn={() => {
          const next = planeTap(live.current, Math.random);
          if (next !== live.current) publish(next);
        }}>
        {size ? <PlaneWorld view={view} width={size.w} height={size.h} worldWidth={worldWidth} dark={dark} /> : <View />}
        <PlaneOverlay
          phase={shown.phase}
          score={shown.score}
          best={best}
          newBest={newBest}
          guard={guard}
          ink={(dark ? PLANE_COLORS.dark : PLANE_COLORS.light).score}
          onAgain={fresh}
          onBack={() => leaveGameScreen(lock.gameMode)}
        />
      </Pressable>
    </GameScreen>
  );
}
```

- [ ] **Step 4:** Run the screen test → PASS; `cd mobile && npx --no-install tsc --noEmit` → clean (regenerate typed routes with `npx expo customize tsconfig.json` if `/games/plane` is reported as unknown).
- [ ] **Step 5: Commit:** `git add mobile/src/app/games/plane.tsx mobile/src/lib/plane-screen.test.ts` then `git commit -m "feat(mobile): play Paper Plane"`.

### Task 11: Mobile list, full checks

**Files:** Modify `mobile/src/app/games/index.tsx` (and its test if one lists the games: `grep -rn "games/clue" mobile/src/lib/*.test.ts`)

- [ ] **Step 1:** If a mobile test lists the game routes, add `/games/plane` there first and run it → FAIL.
- [ ] **Step 2:** After the One Clue card in `mobile/src/app/games/index.tsx`, add:

```tsx
      <Pressable
        onPress={() => router.push("/games/plane")}
        className="flex-row items-center gap-4 rounded-xl border border-gray-100 p-4">
        <View className="rounded-lg bg-sky-50 p-3">
          <Text className="text-2xl">✈️</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-gray-900">{t.planeTitle}</Text>
          <Text className="text-sm text-gray-500">{t.planeDesc}</Text>
        </View>
        <Text className="text-xl text-gray-400">›</Text>
      </Pressable>
```

- [ ] **Step 3: Full checks:**
  - `npx --no-install vitest run` (web) and `cd mobile && npx --no-install vitest run` → all pass.
  - `npx --no-install tsc --noEmit -p .`, `cd mobile && npx --no-install tsc --noEmit`, `npx --no-install eslint src shared` → clean.
  - `cd mobile && npx expo export --platform android --output-dir /tmp/ptx --no-bytecode --source-maps` succeeds and the source map's `node_modules/react` roots are `['']`.
  - Web in a browser: `npm run dev`, sign in, open `/games/plane`: tap and Space fly, the page and plane look right in light and dark, a crash shows the card, Again restarts, the tab hidden pauses.
- [ ] **Step 4: Commit:** `git add mobile/src/app/games/index.tsx` (plus the test if changed) then `git commit -m "feat(mobile): list Paper Plane"`.

### Task 12: Ship

- [ ] Push through `/push-gate:push`, open the PR with `/push-gate:create-pr` (title `feat(games): add Paper Plane`), merge once CI is green and the owner approves, then publish the EAS `preview` update after the single-React check (ask the owner first). Update `docs/roadmap.md`: list Paper Plane among the shipped games.
