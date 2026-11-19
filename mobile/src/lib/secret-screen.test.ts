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
const env = vi.hoisted(() => ({ scheme: "light", pinReady: true, lang: "en" as "en" | "tr", clock: 1_000_000 }));
const storage = vi.hoisted(() => ({
  getStoredSecretBest: vi.fn(async (): Promise<number | null> => 3),
  setStoredSecretBest: vi.fn(async (_n: number) => undefined),
  getStoredSecretSeen: vi.fn(async (_lang: string): Promise<string[]> => []),
  setStoredSecretSeen: vi.fn(async (_lang: string, _seen: readonly string[]) => undefined),
}));
const leave = vi.hoisted(() => ({ active: undefined as boolean | undefined, left: 0 }));

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
vi.mock("react-native", () => ({ Text: () => null, View: () => null }));
vi.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => env.scheme }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ptracker/shared/i18n")>()),
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }), lang: env.lang }),
}));
vi.mock("@/components/games/game-mode-entry", () => ({
  GamesPinSetup: () => null,
  useEnterGameModeOnce: () => env.pinReady,
}));
vi.mock("@/components/games/game-screen", () => ({ GameScreen: () => null }));
vi.mock("@/components/games/secret/secret-parts", () => ({
  SecretBoard: () => null,
  SecretKeyboard: () => null,
  SecretLegend: () => null,
  SecretResult: () => null,
}));
vi.mock("@/lib/secret-word-storage", () => storage);
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
import SecretScreen from "@/app/games/secret";
import { GamesPinSetup } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { SecretBoard, SecretKeyboard, SecretResult } from "@/components/games/secret/secret-parts";
import { SECRET_COLORS, secretCardsFor } from "@ptracker/shared/secret-word";

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
  return SecretScreen() as Node;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const find = (type: unknown) => nodes(render()).find((n) => n.type === type)?.props as any;
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
  for (let i = 0; i < 4; i++) {
    render();
    runEffects();
    await Promise.resolve();
    await Promise.resolve();
  }
}

const EN = secretCardsFor("en");
const FIRST = EN[0].word;
const WRONG = FIRST === "ZZZZZ" ? "YYYYY" : "ZZZZZ";

async function typeWord(word: string) {
  for (const l of word) {
    find(SecretKeyboard).onKey(l);
    await settle();
  }
  find(SecretKeyboard).onKey("Enter");
  await settle();
}

beforeEach(() => {
  env.scheme = "light";
  env.pinReady = true;
  env.lang = "en";
  env.clock = 1_000_000;
  leave.active = undefined;
  leave.left = 0;
  storage.getStoredSecretBest.mockReset().mockResolvedValue(3);
  storage.setStoredSecretBest.mockClear();
  storage.getStoredSecretSeen.mockReset().mockResolvedValue([]);
  storage.setStoredSecretSeen.mockClear();
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.spyOn(Date, "now").mockImplementation(() => env.clock);
});

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

describe("SecretScreen", () => {
  it("shows the PIN setup until game mode is ready", async () => {
    env.pinReady = false;
    await settle();
    expect(nodes(render()).some((n) => n.type === GamesPinSetup)).toBe(true);
  });

  it("deals no word until the best and both seen lists were read", async () => {
    let finish: (v: number | null) => void = () => undefined;
    storage.getStoredSecretBest.mockReturnValue(new Promise((r) => (finish = r)));
    await settle();
    expect(find(SecretKeyboard)).toBeUndefined();
    expect(storage.setStoredSecretSeen).not.toHaveBeenCalled();
    expect(storage.getStoredSecretSeen.mock.calls.map((c) => c[0]).sort()).toEqual(["en", "tr"]);
    finish(3);
    await settle();
    expect(find(SecretKeyboard).round.card.word).toBe(FIRST);
    expect(storage.setStoredSecretSeen).toHaveBeenCalledWith("en", [EN[0].id]);
  });

  it("deals an unseen word from the stored seen list, in the app's language and scheme", async () => {
    storage.getStoredSecretSeen.mockImplementation(async (lang: string) => (lang === "en" ? [EN[0].id] : []));
    env.scheme = "dark";
    await settle();
    const keyboard = find(SecretKeyboard);
    expect(keyboard.round.card.id).toBe(EN[1].id);
    expect(keyboard.round.lang).toBe("en");
    expect(keyboard.palette).toBe(SECRET_COLORS.dark);
    expect(storage.setStoredSecretSeen).toHaveBeenLastCalledWith("en", [EN[0].id, EN[1].id]);
  });

  it("keeps the header and back free until a guess is made, then asks before leaving", async () => {
    await settle();
    expect(find(GameScreen)).toMatchObject({ nav: true, confirmBack: false, scroll: false, tone: "game" });
    expect(leave.active).toBe(false);
    await typeWord(WRONG);
    expect(find(GameScreen)).toMatchObject({ nav: false, confirmBack: true });
    expect(leave.active).toBe(true);
  });

  it("wins, saves the new best streak, and asks before leaving while the streak runs, on the result panel too", async () => {
    storage.getStoredSecretBest.mockResolvedValue(0);
    await settle();
    await typeWord(FIRST);
    expect(find(SecretResult)).toMatchObject({ streak: 1, best: 1, newBest: true });
    expect(storage.setStoredSecretBest).toHaveBeenCalledWith(1);
    // The streak would be lost, so back still asks on the result panel.
    expect(find(GameScreen)).toMatchObject({ nav: false, confirmBack: true });

    env.clock += 399;
    find(SecretResult).onNext();
    await settle();
    expect(find(SecretResult)).toBeDefined();
    env.clock += 1;
    find(SecretResult).onNext();
    await settle();
    expect(find(SecretKeyboard).round.card.id).toBe(EN[1].id);
    expect(find(GameScreen).confirmBack).toBe(true);
  });

  it("does not claim or save a best that was not beaten", async () => {
    await settle();
    await typeWord(FIRST);
    expect(find(SecretResult)).toMatchObject({ streak: 1, best: 3, newBest: false });
    expect(storage.setStoredSecretBest).not.toHaveBeenCalled();
  });

  it("does not claim or save a best when the stored best could not be read", async () => {
    storage.getStoredSecretBest.mockResolvedValue(null);
    await settle();
    await typeWord(FIRST);
    expect(find(SecretResult)).toMatchObject({ streak: 1, newBest: false });
    expect(storage.setStoredSecretBest).not.toHaveBeenCalled();
  });

  it("loses after six misses and resets the streak", async () => {
    await settle();
    await typeWord(FIRST);
    env.clock += 400;
    find(SecretResult).onNext();
    await settle();
    for (let i = 0; i < 6; i++) await typeWord(WRONG);
    expect(find(SecretResult)).toMatchObject({ streak: 0 });
    expect(find(SecretResult).round.phase).toBe("lost");
    expect(leave.active).toBe(false);
  });

  it("goes back to the games from the result once the guard is off", async () => {
    await settle();
    await typeWord(FIRST);
    find(SecretResult).onBack();
    expect(leave.left).toBe(0);
    env.clock += 400;
    find(SecretResult).onBack();
    expect(leave.left).toBe(1);
  });

  it("keeps a round in the language it started in", async () => {
    await settle();
    env.lang = "tr";
    await settle();
    expect(find(SecretKeyboard).round.lang).toBe("en");
  });

  it("deletes the last typed letter on Backspace", async () => {
    await settle();
    find(SecretKeyboard).onKey("A");
    await settle();
    find(SecretKeyboard).onKey("B");
    await settle();
    find(SecretKeyboard).onKey("Backspace");
    await settle();
    expect(find(SecretKeyboard).round.typed).toBe("A");
  });

  it("writes no state when the stored reads land after the screen closed", async () => {
    let finish: (v: number | null) => void = () => undefined;
    storage.getStoredSecretBest.mockReturnValue(new Promise((r) => (finish = r)));
    await settle();
    unmount();
    finish(3);
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(Object.keys(hooks.states)).toEqual([]);
    expect(storage.setStoredSecretSeen).not.toHaveBeenCalled();
  });

  it("sizes the board to the space it is laid out in", async () => {
    await settle();
    expect(find(SecretBoard)).toBeUndefined();
    const area = nodes(render()).find((n) => n.type === View && typeof n.props.onLayout === "function")!;
    (area.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { width: 320, height: 240 } } });
    expect(find(SecretBoard)).toMatchObject({ width: 320, height: 240, palette: SECRET_COLORS.light });
  });
});
