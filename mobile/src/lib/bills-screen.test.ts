import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";

// Effects run, as in React, only when their dependencies changed since they last ran.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as { slot: number; effect: () => void | (() => void); deps?: unknown[] }[],
  ran: new Map<number, unknown[] | undefined>(),
  cleanups: new Map<number, () => void>(),
  index: 0,
}));
const env = vi.hoisted(() => ({ scheme: "light", pinReady: true, onScreen: true, frames: [] as ((t: number) => void)[], now: 0 }));
const storage = vi.hoisted(() => ({
  getStoredHuntBest: vi.fn(async (): Promise<number | null> => 5),
  setStoredHuntBest: vi.fn(async (_n: number) => undefined),
}));
const view = vi.hoisted(() => ({ sync: vi.fn() }));
const leave = vi.hoisted(() => ({ active: undefined as boolean | undefined, left: 0 }));
// Lets a test end the game with a chosen score instead of playing it, and counts the steps taken.
const engine = vi.hoisted(() => ({ endScore: null as number | null, steps: 0 }));

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
    useRef: (initial: unknown) => {
      const i = hooks.index++;
      if (!(i in hooks.states)) hooks.states[i] = { current: initial };
      return hooks.states[i];
    },
    useCallback: (fn: unknown) => fn,
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      hooks.effects.push({ slot: hooks.index++, effect, deps });
    },
  };
});
vi.mock("@ptracker/shared/bill-hunt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ptracker/shared/bill-hunt")>();
  return {
    ...actual,
    stepHunt: (s: import("@ptracker/shared/bill-hunt").HuntState, dt: number, rng: () => number) => {
      engine.steps++;
      if (engine.endScore !== null && s.phase === "throwing") return { ...s, phase: "over" as const, score: engine.endScore, shot: null };
      return actual.stepHunt(s, dt, rng);
    },
  };
});
vi.mock("react-native", () => ({ PanResponder: { create: (h: unknown) => ({ panHandlers: h }) }, View: () => null }));
vi.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => env.scheme }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ptracker/shared/i18n")>()),
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }), lang: "en" }),
}));
vi.mock("@/components/games/game-mode-entry", () => ({
  GamesPinSetup: () => null,
  useEnterGameModeOnce: () => env.pinReady,
}));
vi.mock("@/components/games/game-screen", () => ({ GameScreen: () => null }));
vi.mock("@/components/games/bills/hunt-world", () => ({ HuntWorld: () => null, useHuntView: () => view }));
vi.mock("@/components/games/bills/hunt-overlay", () => ({ HuntOverlay: () => null }));
vi.mock("@/lib/use-game-on-screen", () => ({ useGameOnScreen: () => env.onScreen }));
vi.mock("@/lib/bill-hunt-storage", () => storage);
vi.mock("@/lib/app-lock-context", () => ({ useAppLock: () => ({ lock: { gameMode: true } }) }));
vi.mock("@/lib/leave-game", () => ({
  useConfirmLeave: (active: boolean) => {
    leave.active = active;
  },
  leaveGameScreen: () => {
    leave.left++;
  },
}));

import { View } from "react-native";
import BillsScreen from "@/app/games/bills";
import { GamesPinSetup } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { HuntOverlay } from "@/components/games/bills/hunt-overlay";
import { HuntWorld } from "@/components/games/bills/hunt-world";
import { HUNT_COLORS, huntViewport } from "@ptracker/shared/bill-hunt";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function render(): Node {
  hooks.index = 0;
  hooks.effects = [];
  return BillsScreen() as Node;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const props = (type: unknown) => nodes(render()).find((n) => n.type === type)!.props as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

function changed(before: unknown[] | undefined, after: unknown[] | undefined): boolean {
  if (!before || !after || before.length !== after.length) return true;
  return after.some((dep, i) => !Object.is(dep, before[i]));
}

function runEffects() {
  for (const { slot, effect, deps } of hooks.effects) {
    if (hooks.ran.has(slot) && !changed(hooks.ran.get(slot), deps)) continue;
    hooks.cleanups.get(slot)?.();
    hooks.cleanups.delete(slot);
    const cleanup = effect();
    if (cleanup) hooks.cleanups.set(slot, cleanup);
    hooks.ran.set(slot, deps);
  }
  hooks.effects = [];
}

function unmount() {
  for (const cleanup of hooks.cleanups.values()) cleanup();
  hooks.cleanups.clear();
  hooks.ran.clear();
  hooks.states = [];
  hooks.effects = [];
}

async function settle() {
  for (let i = 0; i < 3; i++) {
    render();
    runEffects();
    await Promise.resolve();
  }
}

async function frames(count: number, ms = 33) {
  for (let i = 0; i < count; i++) {
    env.now += ms;
    env.frames.splice(0, env.frames.length).forEach((fn) => fn(env.now));
    if (i % 10 === 0) await settle();
  }
  await settle();
}

const overlay = () => props(HuntOverlay);
const board = () => props(View);
const lastAim = () => view.sync.mock.calls.at(-1)?.[1];

async function start() {
  await settle();
  board().onLayout({ nativeEvent: { layout: { width: 300, height: 600 } } });
  await settle();
  overlay().onStart();
  await settle();
}
/** A pull of (dx, dy) pixels, let go. */
async function pull(dx: number, dy: number) {
  board().onPanResponderGrant();
  board().onPanResponderMove({}, { dx, dy });
  board().onPanResponderRelease({}, { dx, dy });
  await settle();
}

beforeEach(() => {
  env.scheme = "light";
  env.pinReady = true;
  env.onScreen = true;
  env.frames.length = 0;
  env.now = 0;
  leave.active = undefined;
  leave.left = 0;
  view.sync.mockClear();
  storage.getStoredHuntBest.mockResolvedValue(5);
  storage.setStoredHuntBest.mockClear();
  engine.endScore = null;
  engine.steps = 0;
  vi.stubGlobal("requestAnimationFrame", (fn: (t: number) => void) => env.frames.push(fn));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("BillsScreen", () => {
  it("shows the PIN setup until game mode is ready", async () => {
    env.pinReady = false;
    await settle();
    expect(nodes(render()).some((n) => n.type === GamesPinSetup)).toBe(true);
  });

  it("loads the best score and shows the ready page with the header", async () => {
    await settle();
    expect(overlay()).toMatchObject({ phase: "ready", best: 5, month: 1, coins: 1, ink: HUNT_COLORS.light.ink });
    expect(props(GameScreen)).toMatchObject({ nav: true, confirmBack: false, scroll: false, tone: "game" });
    expect(leave.active).toBe(false);
    expect(board().onStartShouldSetPanResponder()).toBe(false);
  });

  it("draws in the dark palette in the dark scheme", async () => {
    env.scheme = "dark";
    await start();
    expect(props(HuntWorld).dark).toBe(true);
    expect(overlay().ink).toBe(HUNT_COLORS.dark.ink);
  });

  it("draws the board once laid out, and starts on Start with the header hidden and leaving asked", async () => {
    await start();
    expect(props(HuntWorld)).toMatchObject({ width: 300, height: 600, phase: "aiming", month: 1, launcher: 35 });
    expect(props(HuntWorld).items.length).toBeGreaterThanOrEqual(2);
    expect(overlay().phase).toBe("aiming");
    expect(props(GameScreen)).toMatchObject({ nav: false, confirmBack: true });
    expect(leave.active).toBe(true);
    expect(board().onStartShouldSetPanResponder()).toBe(true);
    expect(board().onPanResponderTerminationRequest()).toBe(false);
  });

  it("shows the aim while pulling back, in world units of the laid-out board, and throws on let go", async () => {
    await start();
    board().onPanResponderGrant();
    expect(lastAim()).toBeNull();
    const scale = huntViewport(300, 600).scale;
    board().onPanResponderMove({}, { dx: 0, dy: 3 * scale });
    expect(lastAim()).toBeNull();
    board().onPanResponderMove({}, { dx: 0, dy: 100 });
    expect(lastAim()).toMatchObject({ x: expect.closeTo(35, 5) });
    board().onPanResponderRelease({}, { dx: 0, dy: 100 });
    await settle();
    expect(overlay().phase).toBe("throwing");
    expect(lastAim()).toBeNull();
    await frames(2);
    expect(engine.steps).toBeGreaterThan(0);
    expect(board().onStartShouldSetPanResponder()).toBe(false);
  });

  it("throws nothing for a short pull, or one taken over by something else", async () => {
    await start();
    await pull(0, 5);
    expect(overlay().phase).toBe("aiming");
    board().onPanResponderGrant();
    board().onPanResponderMove({}, { dx: 0, dy: 100 });
    board().onPanResponderTerminate();
    await settle();
    expect(lastAim()).toBeNull();
    expect(overlay().phase).toBe("aiming");
  });

  it("speeds a throw up, and calls it back into the next month", async () => {
    await start();
    await pull(0, 100);
    overlay().onSpeedUp();
    await settle();
    expect(overlay().sped).toBe(true);
    overlay().onCallBack();
    await settle();
    expect(overlay()).toMatchObject({ phase: "aiming", month: 2, sped: false });
  });

  it("stops the throw while the screen is not shown, and goes on when it is", async () => {
    await start();
    await pull(0, 100);
    await frames(1);
    env.onScreen = false;
    await settle();
    const before = engine.steps;
    await frames(3);
    expect(engine.steps).toBe(before);
    env.onScreen = true;
    await settle();
    await frames(2);
    expect(engine.steps).toBeGreaterThan(before);
    expect(overlay().phase).toBe("throwing");
  });

  it("ends the game, saves a new best, guards the buttons, and plays again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    storage.getStoredHuntBest.mockResolvedValue(2);
    await start();
    await pull(0, 100);
    engine.endScore = 4;
    await frames(1);
    expect(overlay()).toMatchObject({ phase: "over", score: 4, guard: true });
    expect(props(GameScreen)).toMatchObject({ nav: true, confirmBack: false });
    await settle();
    expect(storage.setStoredHuntBest).toHaveBeenCalledWith(4);
    expect(overlay().newBest).toBe(true);
    vi.advanceTimersByTime(500);
    await settle();
    expect(overlay().guard).toBe(false);
    engine.endScore = null;
    overlay().onAgain();
    await settle();
    expect(overlay()).toMatchObject({ phase: "aiming", month: 1, newBest: false });
  });

  it("goes back to the games list from the score card", async () => {
    await start();
    await pull(0, 100);
    engine.endScore = 1;
    await frames(1);
    overlay().onBack();
    expect(leave.left).toBe(1);
  });
});
