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
  getStoredPlaneBest: vi.fn(async (): Promise<number | null> => 5),
  setStoredPlaneBest: vi.fn(async (_n: number) => undefined),
}));
const view = vi.hoisted(() => ({ sync: vi.fn() }));
const leave = vi.hoisted(() => ({ active: undefined as boolean | undefined, left: 0 }));
// Lets a test end the flight with a chosen score instead of flying through real gaps.
const engine = vi.hoisted(() => ({ endScore: null as number | null }));

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
vi.mock("@ptracker/shared/paper-plane", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ptracker/shared/paper-plane")>();
  return {
    ...actual,
    stepPlane: (s: import("@ptracker/shared/paper-plane").PlaneState, dt: number, rng: () => number) =>
      engine.endScore !== null && s.phase === "flying"
        ? { ...s, phase: "over" as const, score: engine.endScore }
        : actual.stepPlane(s, dt, rng),
  };
});
vi.mock("react-native", () => ({ Pressable: () => null, View: () => null }));
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
vi.mock("@/components/games/plane/plane-world", () => ({ PlaneWorld: () => null, usePlaneView: () => view }));
vi.mock("@/components/games/plane/plane-overlay", () => ({ PlaneOverlay: () => null }));
vi.mock("@/lib/use-game-on-screen", () => ({ useGameOnScreen: () => env.onScreen }));
vi.mock("@/lib/paper-plane-storage", () => storage);
vi.mock("@/lib/app-lock-context", () => ({ useAppLock: () => ({ lock: { gameMode: true } }) }));
vi.mock("@/lib/leave-game", () => ({
  useConfirmLeave: (active: boolean) => {
    leave.active = active;
  },
  leaveGameScreen: () => {
    leave.left++;
  },
}));

import { Pressable } from "react-native";
import PlaneScreen from "@/app/games/plane";
import { GamesPinSetup } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { PlaneOverlay } from "@/components/games/plane/plane-overlay";
import { PlaneWorld } from "@/components/games/plane/plane-world";
import { PLANE_COLORS } from "@ptracker/shared/paper-plane";

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
  return PlaneScreen() as Node;
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

const overlay = () => props(PlaneOverlay);
async function tap() {
  props(Pressable).onPressIn();
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
  storage.getStoredPlaneBest.mockResolvedValue(5);
  storage.setStoredPlaneBest.mockClear();
  engine.endScore = null;
  vi.stubGlobal("requestAnimationFrame", (fn: (t: number) => void) => env.frames.push(fn));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PlaneScreen", () => {
  it("shows the PIN setup until game mode is ready", async () => {
    env.pinReady = false;
    await settle();
    expect(nodes(render()).some((n) => n.type === GamesPinSetup)).toBe(true);
  });

  it("loads the best score and shows the ready page with the header", async () => {
    await settle();
    expect(overlay()).toMatchObject({ phase: "ready", best: 5, score: 0 });
    expect(props(GameScreen)).toMatchObject({ nav: true, confirmBack: false, scroll: false, tone: "game" });
    expect(leave.active).toBe(false);
  });

  it("starts on a tap, hides the header and asks before leaving", async () => {
    await settle();
    await tap();
    expect(overlay().phase).toBe("flying");
    expect(props(GameScreen)).toMatchObject({ nav: false, confirmBack: true });
    expect(leave.active).toBe(true);
    expect(view.sync).toHaveBeenCalled();
  });

  it("sizes the world from the play area while it waits", async () => {
    await settle();
    props(Pressable).onLayout({ nativeEvent: { layout: { width: 300, height: 600 } } });
    await settle();
    expect(view.sync.mock.lastCall![0]).toMatchObject({ phase: "ready", width: 50 });
  });

  it("draws the page at the world's new width on the first layout", async () => {
    await settle();
    props(Pressable).onLayout({ nativeEvent: { layout: { width: 480, height: 600 } } });
    await settle();
    expect(props(PlaneWorld)).toMatchObject({ width: 480, height: 600, worldWidth: 80 });
  });

  it("pauses off screen, and a tap resumes", async () => {
    await settle();
    await tap();
    env.onScreen = false;
    await settle();
    expect(overlay().phase).toBe("paused");
    env.onScreen = true;
    await settle();
    expect(overlay().phase).toBe("paused");
    await tap();
    expect(overlay().phase).toBe("flying");
  });

  it("ends when the plane falls, guards the buttons, and plays again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    storage.getStoredPlaneBest.mockResolvedValue(0);
    await settle();
    await tap();
    await frames(200);
    expect(overlay()).toMatchObject({ phase: "over", score: 0, newBest: false, guard: true });
    expect(storage.setStoredPlaneBest).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    await settle();
    expect(overlay().guard).toBe(false);
    overlay().onBack();
    expect(leave.left).toBe(1);
    overlay().onAgain();
    await settle();
    expect(overlay().phase).toBe("ready");
  });

  it("saves a score above the best as the new best", async () => {
    await settle();
    await tap();
    engine.endScore = 9;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 9, best: 9, newBest: true });
    expect(storage.setStoredPlaneBest).toHaveBeenCalledWith(9);
  });

  it("keeps a higher stored best when the first read had not landed by the end of the game", async () => {
    storage.getStoredPlaneBest.mockReturnValueOnce(new Promise(() => undefined)).mockResolvedValueOnce(12);
    await settle();
    await tap();
    engine.endScore = 9;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 9, best: 12, newBest: false });
    expect(storage.setStoredPlaneBest).not.toHaveBeenCalled();
  });

  it("saves a new best even when the player leaves before the stored best is read", async () => {
    let resolve: (b: number) => void = () => undefined;
    await settle();
    storage.getStoredPlaneBest.mockReturnValueOnce(new Promise<number>((r) => (resolve = r)));
    await tap();
    engine.endScore = 9;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", best: 9, newBest: true });
    unmount();
    resolve(5);
    await Promise.resolve();
    await Promise.resolve();
    expect(storage.setStoredPlaneBest).toHaveBeenCalledWith(9);
  });

  it("carries the best of a game just played into the next game when the stored best is stale", async () => {
    await settle();
    await tap();
    engine.endScore = 9;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 9, best: 9, newBest: true });
    overlay().onAgain();
    await settle();
    expect(overlay().phase).toBe("ready");
    await tap();
    engine.endScore = 7;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 7, best: 9, newBest: false });
    expect(storage.setStoredPlaneBest).toHaveBeenCalledWith(9);
    expect(storage.setStoredPlaneBest.mock.calls.every(([b]) => b === 9)).toBe(true);
  });

  it("saves a best played while storage was unreadable once a read succeeds, without claiming a lower score", async () => {
    storage.getStoredPlaneBest.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(4);
    await settle();
    await tap();
    engine.endScore = 10;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 10, best: 10, newBest: false });
    expect(storage.setStoredPlaneBest).not.toHaveBeenCalled();
    overlay().onAgain();
    await settle();
    await tap();
    engine.endScore = 6;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 6, best: 10, newBest: false });
    expect(storage.setStoredPlaneBest).toHaveBeenCalledWith(10);
    expect(storage.setStoredPlaneBest).not.toHaveBeenCalledWith(6);
  });

  it("keeps the best already read when a read at the end of the game fails", async () => {
    storage.getStoredPlaneBest.mockResolvedValueOnce(12).mockResolvedValueOnce(null);
    await settle();
    await tap();
    engine.endScore = 9;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", best: 12, newBest: false });
    expect(storage.setStoredPlaneBest).not.toHaveBeenCalled();
  });

  it("claims no new best and saves nothing when no read of the best succeeds", async () => {
    storage.getStoredPlaneBest.mockResolvedValue(null);
    await settle();
    await tap();
    engine.endScore = 4;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 4, best: 4, newBest: false });
    expect(storage.setStoredPlaneBest).not.toHaveBeenCalled();
  });

  it("claims no new best in the next game when every read of the best has failed", async () => {
    storage.getStoredPlaneBest.mockResolvedValue(null);
    await settle();
    await tap();
    engine.endScore = 4;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 4, newBest: false });
    overlay().onAgain();
    await settle();
    expect(overlay().phase).toBe("ready");
    await tap();
    engine.endScore = 6;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 6, newBest: false });
    expect(storage.setStoredPlaneBest).not.toHaveBeenCalled();
  });

  it("keeps the session's best on the card when every read of the best fails", async () => {
    storage.getStoredPlaneBest.mockResolvedValue(null);
    await settle();
    await tap();
    engine.endScore = 10;
    await frames(2);
    overlay().onAgain();
    await settle();
    await tap();
    engine.endScore = 3;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 3, best: 10, newBest: false });
    expect(storage.setStoredPlaneBest).not.toHaveBeenCalled();
  });

  it("keeps the card's best while the first read of the best is still on its way", async () => {
    let mount: (b: number) => void = () => undefined;
    storage.getStoredPlaneBest.mockReturnValueOnce(new Promise<number>((r) => (mount = r))).mockReturnValueOnce(new Promise(() => undefined));
    await settle();
    await tap();
    engine.endScore = 10;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 10, best: 10 });
    mount(5);
    await settle();
    expect(overlay().best).toBe(10);
  });

  it("does not call a replayed score a new best while the last game's read is on its way", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    storage.getStoredPlaneBest.mockResolvedValueOnce(5).mockReturnValueOnce(new Promise(() => undefined)).mockReturnValueOnce(new Promise(() => undefined));
    await settle();
    await tap();
    engine.endScore = 9;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 9, newBest: true });
    vi.advanceTimersByTime(500);
    engine.endScore = null;
    overlay().onAgain();
    await settle();
    await tap();
    engine.endScore = 8;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 8, best: 9, newBest: false });
  });

  it("does not call a replayed score a new best when its read lands before the last game's", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let late: (b: number) => void = () => undefined;
    storage.getStoredPlaneBest
      .mockResolvedValueOnce(5)
      .mockReturnValueOnce(new Promise<number>((r) => (late = r)))
      .mockResolvedValueOnce(5);
    await settle();
    await tap();
    engine.endScore = 9;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 9, newBest: true });
    vi.advanceTimersByTime(500);
    engine.endScore = null;
    overlay().onAgain();
    await settle();
    await tap();
    engine.endScore = 8;
    await frames(2);
    expect(overlay()).toMatchObject({ phase: "over", score: 8, best: 9, newBest: false });
    expect(storage.setStoredPlaneBest).toHaveBeenCalledWith(9);
    expect(storage.setStoredPlaneBest).not.toHaveBeenCalledWith(8);
    late(5);
    await settle();
    expect(overlay()).toMatchObject({ phase: "over", score: 8, best: 9, newBest: false });
    expect(storage.setStoredPlaneBest).not.toHaveBeenCalledWith(8);
  });

  it("guards the game-over buttons from the card's first frame", async () => {
    await settle();
    await tap();
    engine.endScore = 1;
    env.now += 33;
    env.frames.splice(0, env.frames.length).forEach((fn) => fn(env.now));
    expect(overlay()).toMatchObject({ phase: "over", guard: true });
  });

  it("draws the page and its texts in the dark palette when the phone is dark", async () => {
    env.scheme = "dark";
    await settle();
    props(Pressable).onLayout({ nativeEvent: { layout: { width: 300, height: 600 } } });
    await settle();
    expect(overlay().ink).toBe(PLANE_COLORS.dark.score);
    expect(props(PlaneWorld).dark).toBe(true);
  });

  it("draws the texts in the light palette when the phone is light", async () => {
    await settle();
    expect(overlay().ink).toBe(PLANE_COLORS.light.score);
  });
});
