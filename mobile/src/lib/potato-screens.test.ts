import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { POTATO_NEXT_LOCK_MS, POTATO_VIBRATE_MS, playerColor } from "@ptracker/shared/hot-potato";

const NOW = 1_800_000_000_000;

// Effects run, as in React, only when their dependencies changed since they last ran.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as { slot: number; effect: () => void | (() => void); deps?: unknown[] }[],
  ran: new Map<number, unknown[] | undefined>(),
  cleanups: new Map<number, () => void>(),
  index: 0,
}));
const rn = vi.hoisted(() => ({
  vibrate: vi.fn(),
  announce: vi.fn(),
  appState: undefined as undefined | ((next: string) => void),
  currentState: "active" as string | null,
  focused: true,
  removeAppState: vi.fn(),
  loops: [] as { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; half: number }[],
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
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      hooks.effects.push({ slot: hooks.index++, effect, deps });
    },
  };
});
vi.mock("react-native", () => {
  class Value {
    setValue = vi.fn();
    interpolate = () => 0;
  }
  return {
    AccessibilityInfo: { announceForAccessibility: rn.announce },
    Animated: {
      View: () => null,
      Value,
      timing: (_value: unknown, config: { duration: number }) => ({ duration: config.duration }),
      sequence: (steps: { duration: number }[]) => steps,
      loop: (steps: { duration: number }[]) => {
        const loop = { start: vi.fn(), stop: vi.fn(), half: steps[0].duration };
        rn.loops.push(loop);
        return loop;
      },
    },
    AppState: {
      get currentState() {
        return rn.currentState;
      },
      addEventListener: (_type: string, fn: (next: string) => void) => {
        rn.appState = fn;
        return { remove: rn.removeAppState };
      },
    },
    Pressable: () => null,
    StyleSheet: { absoluteFill: {} },
    Text: () => null,
    Vibration: { vibrate: rn.vibrate },
    View: () => null,
  };
});
vi.mock("expo-router", () => ({ useIsFocused: () => rn.focused }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => {
        const templates: Record<string, string> = {
          potatoStarts: "{name} starts",
          potatoPassLabel: "pass from {name}",
          potatoLivesLeft: "{n} lives left",
          potatoWins: "{name} wins",
        };
        return templates[String(key)] ?? String(key);
      },
    }),
  }),
}));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/games/game-button", () => ({ GameButton: () => null }));

import { Animated, Pressable } from "react-native";
import { GameButton } from "@/components/games/game-button";
import { PotatoBang } from "@/components/games/potato/potato-bang";
import { PotatoEnd } from "@/components/games/potato/potato-end";
import { PotatoPlay } from "@/components/games/potato/potato-play";
import { PotatoReady } from "@/components/games/potato/potato-ready";
import { PrimaryButton } from "@/components/ui/primary-button";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

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

const press = (node: Node | undefined) => (node!.props.onPress as () => void)();
const gameButton = (tree: Node) => nodes(tree).find((n) => n.type === GameButton)!;

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

/** Runs every cleanup and forgets the component, so the next render mounts it afresh. */
function unmount() {
  for (const cleanup of hooks.cleanups.values()) cleanup();
  hooks.cleanups.clear();
  hooks.ran.clear();
  hooks.states = [];
  hooks.effects = [];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"], now: NOW });
  unmount();
  rn.appState = undefined;
  rn.currentState = "active";
  rn.focused = true;
  rn.loops = [];
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
});

describe("PotatoReady (mobile)", () => {
  it("names the player who starts and lights the fuse on Start", () => {
    const onStart = vi.fn();
    const tree = PotatoReady({ name: "Ann", onStart }) as Node;
    expect(text(tree)).toContain("Ann starts");
    expect(gameButton(tree).props.label).toBe("potatoStart");
    expect(gameButton(tree).props.onPress).toBe(onStart);
  });
});

describe("PotatoPlay (mobile)", () => {
  const onPass = vi.fn();
  const onTick = vi.fn();
  const onPause = vi.fn();
  const onResume = vi.fn();

  function render(fuse: { fuseMs: number; burntMs: number; litAt: number | null } = { fuseMs: 10_000, burntMs: 0, litAt: NOW }) {
    hooks.index = 0;
    hooks.effects = [];
    return PotatoPlay({ holder: "Ann", task: "An animal starting with S", ...fuse, onPass, onTick, onPause, onResume }) as Node;
  }

  const pulse = (tree: Node) => nodes(tree).find((n) => n.type === Animated.View);

  it("shows the holder and the task, and passes with a button that names the holder", () => {
    const tree = render();
    expect(text(tree)).toContain("Ann");
    expect(text(tree)).toContain("An animal starting with S");
    const pass = nodes(tree).find((n) => n.type === Pressable)!;
    expect(pass.props.accessibilityLabel).toBe("pass from Ann");
    expect(text(pass)).toBe("potatoPass");
    press(pass);
    expect(onPass).toHaveBeenCalledTimes(1);
  });

  it("asks the game to check the fuse while it runs, and stops when it leaves", () => {
    render();
    runEffects();
    vi.advanceTimersByTime(1000);
    expect(onTick.mock.calls.length).toBeGreaterThanOrEqual(4);
    unmount();
    const calls = onTick.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(calls);
  });

  /** Renders again, runs the effects, and reports which of pause and resume the game got last. */
  function settle(): "pause" | "resume" | null {
    vi.clearAllMocks();
    render();
    runEffects();
    if (onResume.mock.calls.length > 0 && onPause.mock.calls.length === 0) return "resume";
    if (onPause.mock.calls.length > 0 && onResume.mock.calls.length === 0) return "pause";
    return null;
  }

  it("pauses the fuse when the app leaves the screen and resumes it when it is back", () => {
    expect(settle()).toBe("resume");
    rn.appState!("inactive");
    expect(settle()).toBe("pause");
    rn.appState!("background");
    expect(settle()).toBeNull();
    rn.appState!("active");
    expect(settle()).toBe("resume");
    unmount();
    expect(rn.removeAppState).toHaveBeenCalledTimes(1);
  });

  it("pauses the fuse while the game-mode PIN screen covers the game", () => {
    expect(settle()).toBe("resume");
    rn.focused = false;
    expect(settle()).toBe("pause");
    rn.appState!("background");
    expect(settle()).toBe("pause");
    rn.appState!("active");
    expect(settle()).toBe("pause");
    rn.focused = true;
    expect(settle()).toBe("resume");
  });

  it("stays paused when the screen comes back while the app is in the background", () => {
    rn.focused = false;
    expect(settle()).toBe("pause");
    rn.appState!("background");
    rn.focused = true;
    expect(settle()).toBe("pause");
    rn.appState!("active");
    expect(settle()).toBe("resume");
  });

  it("takes an app that has not reported its state yet as active", () => {
    rn.currentState = null;
    expect(settle()).toBe("resume");
    unmount();
    rn.currentState = "background";
    expect(settle()).toBe("pause");
  });

  it("pulses only in the last quarter of the fuse, faster in the last tenth, hidden from screen readers", () => {
    expect(pulse(render({ fuseMs: 10_000, burntMs: 0, litAt: NOW - 7_000 }))).toBeUndefined();
    runEffects();
    expect(rn.loops).toEqual([]);

    const slow = pulse(render({ fuseMs: 10_000, burntMs: 0, litAt: NOW - 8_000 }))!;
    expect(slow.props.accessibilityElementsHidden).toBe(true);
    expect(slow.props.importantForAccessibility).toBe("no-hide-descendants");
    runEffects();
    expect(rn.loops).toHaveLength(1);
    expect(rn.loops[0].start).toHaveBeenCalled();

    render({ fuseMs: 10_000, burntMs: 9_500, litAt: null });
    runEffects();
    expect(rn.loops).toHaveLength(2);
    expect(rn.loops[0].stop).toHaveBeenCalled();
    expect(rn.loops[1].half).toBeLessThan(rn.loops[0].half);
    render({ fuseMs: 10_000, burntMs: 9_600, litAt: null });
    runEffects();
    expect(rn.loops).toHaveLength(2);
    unmount();
    expect(rn.loops[1].stop).toHaveBeenCalled();
  });
});

describe("PotatoBang (mobile)", () => {
  const onNext = vi.fn();

  function render(livesLeft: number, bangAt = NOW) {
    hooks.index = 0;
    hooks.effects = [];
    return PotatoBang({ name: "Ann", livesLeft, bangAt, onNext }) as Node;
  }

  it("shows the bang, the holder and their lives left", () => {
    expect(text(render(2))).toBe("potatoBangAnn2 lives left");
    expect(text(render(1))).toBe("potatoBangAnnpotatoLifeLeft");
    expect(text(render(0))).toBe("potatoBangAnnpotatoOut");
  });

  it("vibrates and reads the bang out once, not again when Next opens", () => {
    expect(gameButton(render(2)).props.disabled).toBe(true);
    runEffects();
    vi.advanceTimersByTime(POTATO_NEXT_LOCK_MS);
    expect(gameButton(render(2)).props.disabled).toBe(false);
    runEffects();
    expect(rn.vibrate).toHaveBeenCalledTimes(1);
    expect(rn.vibrate).toHaveBeenCalledWith(POTATO_VIBRATE_MS);
    expect(rn.announce).toHaveBeenCalledTimes(1);
    expect(rn.announce).toHaveBeenCalledWith("potatoBang Ann. 2 lives left");
  });

  it("keeps Next off until 1.5 s after the bang", () => {
    expect(gameButton(render(1)).props.disabled).toBe(true);
    runEffects();
    vi.advanceTimersByTime(POTATO_NEXT_LOCK_MS - 1);
    expect(gameButton(render(1)).props.disabled).toBe(true);
    vi.advanceTimersByTime(1);
    const next = gameButton(render(1));
    expect(next.props.disabled).toBe(false);
    expect(next.props.label).toBe("potatoNext");
    press(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe("PotatoEnd (mobile)", () => {
  const onPlayAgain = vi.fn();
  const onNewGame = vi.fn();
  const players = ["Ann", "Bob", "Cem", "Dan"];

  function render() {
    return PotatoEnd({ players, winner: 2, outOrder: [3, 0, 1], onPlayAgain, onNewGame }) as Node;
  }

  const filled = (tree: Node) =>
    nodes(tree).filter((n) => (n.props.style as { backgroundColor?: string } | undefined)?.backgroundColor);

  it("shows the winner in their colour, then the others in the order they went out", () => {
    const rows = filled(render());
    expect(rows.map(text)).toEqual(["Cem wins", "1. Dan", "2. Ann", "3. Bob"]);
    expect(rows.map((n) => (n.props.style as { backgroundColor: string }).backgroundColor)).toEqual([
      playerColor(2),
      playerColor(3),
      playerColor(0),
      playerColor(1),
    ]);
  });

  it("plays again or goes back to the setup", () => {
    const tree = render();
    const again = nodes(tree).find((n) => n.type === PrimaryButton)!;
    expect(again.props.label).toBe("potatoPlayAgain");
    press(again);
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    press(nodes(tree).find((n) => n.type === Pressable && text(n) === "potatoNewGame"));
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });
});
