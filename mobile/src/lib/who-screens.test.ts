import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { WHO_ANSWER_COLORS, WHO_SUMMARY_LOCK_MS, WHO_VIBRATE_MS, playerColor, type WhoTurnCard } from "@ptracker/shared/who-game";

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
vi.mock("react-native", () => ({
  AccessibilityInfo: { announceForAccessibility: rn.announce },
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
  StyleSheet: { absoluteFill: { position: "absolute" } },
  Text: () => null,
  Vibration: { vibrate: rn.vibrate },
  View: () => null,
}));
vi.mock("expo-router", () => ({ useIsFocused: () => rn.focused }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => {
        const templates: Record<string, string> = {
          whoGuesses: "{name} guesses",
          whoTeamGuesses: "{team}: {name} guesses",
          whoRound: "round {n}/{total}",
          whoTurnPoints: "{name} +{n}",
          whoWins: "{name} wins",
        };
        return templates[String(key)] ?? String(key);
      },
    }),
  }),
}));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));

import { Pressable, Text, View } from "react-native";
import { WhoEnd } from "@/components/games/who/who-end";
import { WhoHandoff } from "@/components/games/who/who-handoff";
import { WhoScores } from "@/components/games/who/who-scores";
import { WhoSummary } from "@/components/games/who/who-summary";
import { WhoTurn } from "@/components/games/who/who-turn";
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
const pressables = (tree: Node) => nodes(tree).filter((n) => n.type === Pressable);
const flat = (style: unknown): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : ((style as Record<string, unknown>) ?? {});

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
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
});

describe("WhoHandoff (mobile)", () => {
  it("names the guesser, their team and the round, and starts the turn", () => {
    const onStart = vi.fn();
    const solo = WhoHandoff({ guesser: "Ann", team: null, round: 1, rounds: 2, onStart }) as Node;
    expect(text(solo)).toContain("Ann guesses");
    expect(text(solo)).toContain("round 1/2");
    expect(text(solo)).toContain("whoHandoffHint");
    expect(text(WhoHandoff({ guesser: "Ann", team: "Red", round: 2, rounds: 3, onStart }))).toContain("Red: Ann guesses");
    const start = pressables(solo)[0];
    expect(text(start)).toBe("whoStart");
    press(start);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe("WhoTurn (mobile)", () => {
  const onAnswer = vi.fn();
  const onTick = vi.fn();
  const onPause = vi.fn();
  const onResume = vi.fn();
  const card = { id: "p-1", name: "Marie Curie", hint: "physicist, Poland and France" };

  function render(clock: { usedMs: number; runningSince: number | null } = { usedMs: 0, runningSince: NOW }, shown = card) {
    hooks.index = 0;
    hooks.effects = [];
    return WhoTurn({ card: shown, turnMs: 60_000, ...clock, onAnswer, onTick, onPause, onResume }) as Node;
  }

  const timer = (tree: Node) => nodes(tree).find((n) => n.props.accessibilityRole === "timer")!;
  const nameText = (tree: Node) => nodes(tree).find((n) => n.type === Text && n.props.adjustsFontSizeToFit)!;

  it("shows the name, the hint and the time left to the table", () => {
    const tree = render();
    expect(text(timer(tree))).toBe("1:00");
    expect(timer(tree).props.accessibilityLabel).toBe("whoTimeLeft 1:00");
    expect(text(nameText(tree))).toBe("Marie Curie");
    expect(text(tree)).toContain("physicist, Poland and France");
  });

  it("fills the screen with two labelled halves, Got it on top, that answer the card", () => {
    const halves = pressables(render());
    expect(halves.map((h) => h.props.accessibilityLabel)).toEqual(["whoGotIt", "whoPass"]);
    expect(halves.map(text)).toEqual(["whoGotIt", "whoPass"]);
    expect(halves.map((h) => flat(h.props.style).backgroundColor)).toEqual([WHO_ANSWER_COLORS.got, WHO_ANSWER_COLORS.pass]);
    expect(halves.every((h) => String(h.props.className).includes("flex-1"))).toBe(true);
    press(halves[0]);
    expect(onAnswer).toHaveBeenLastCalledWith("got");
    press(halves[1]);
    expect(onAnswer).toHaveBeenLastCalledWith("pass");
  });

  it("lets touches on the card through to the half under it", () => {
    const overlay = nodes(render()).find((n) => n.type === View && flat(n.props.style).position === "absolute")!;
    expect(flat(overlay.props.style).pointerEvents).toBe("none");
    expect(text(overlay)).toContain("Marie Curie");
  });

  it("shrinks a long name to fit", () => {
    const size = (name: string) => flat(nameText(render(undefined, { ...card, name })).props.style).fontSize as number;
    expect(size("Messi")).toBeGreaterThan(size("Marie Curie"));
    expect(size("Marie Curie")).toBeGreaterThan(size("Wolfgang Amadeus Mozart"));
    expect(size("Wolfgang Amadeus Mozart")).toBeGreaterThan(size("Mustafa Kemal Atatürk Kız Lisesi Müdürü"));
    expect(nameText(render()).props.numberOfLines).toBe(3);
  });

  it("counts the time down from the game's clock, and holds it while paused", () => {
    render();
    runEffects();
    vi.advanceTimersByTime(15_000);
    expect(text(timer(render()))).toBe("0:45");
    expect(text(timer(render({ usedMs: 20_000, runningSince: null })))).toBe("0:40");
  });

  it("asks the game to check the clock while it runs, and stops when it leaves", () => {
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

  it("pauses the clock when the app leaves the screen and resumes it when it is back", () => {
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

  it("pauses the clock while the game-mode PIN screen covers the game", () => {
    expect(settle()).toBe("resume");
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
});

describe("WhoSummary (mobile)", () => {
  const onFlip = vi.fn();
  const onNext = vi.fn();
  const results: WhoTurnCard[] = [
    { card: { id: "a", name: "Messi", hint: "h" }, result: "got" },
    { card: { id: "b", name: "Pamuk Prenses", hint: "h" }, result: "pass" },
  ];

  function render(endedAt = NOW) {
    hooks.index = 0;
    hooks.effects = [];
    return WhoSummary({
      side: 1,
      endedAt,
      results,
      names: ["Ann", "Bob"],
      colors: [playerColor(0), playerColor(1)],
      scores: [2, 1],
      onFlip,
      onNext,
    }) as Node;
  }

  it("vibrates and reads the end of the turn out once, not again on the next render", () => {
    render();
    runEffects();
    render();
    runEffects();
    expect(rn.vibrate).toHaveBeenCalledTimes(1);
    expect(rn.vibrate).toHaveBeenCalledWith(WHO_VIBRATE_MS);
    expect(rn.announce).toHaveBeenCalledTimes(1);
    expect(rn.announce).toHaveBeenCalledWith("whoTimeUp");
  });

  it("shows this turn's points in the side's colour", () => {
    const tree = render();
    expect(text(tree)).toContain("whoTimeUp");
    const points = nodes(tree).find((n) => n.type === Text && text(n) === "Bob +1")!;
    expect(flat(points.props.style).color).toBe(playerColor(1));
  });

  it("keeps the cards and Next off until 1.5 s after the turn ended", () => {
    const off = (tree: Node) => [
      ...pressables(tree).map((r) => [r.props.disabled, (r.props.accessibilityState as { disabled: boolean }).disabled]),
      nodes(tree).find((n) => n.type === PrimaryButton)!.props.disabled,
    ];
    expect(off(render())).toEqual([[true, true], [true, true], true]);
    runEffects();
    vi.advanceTimersByTime(WHO_SUMMARY_LOCK_MS - 1);
    expect(off(render())).toEqual([[true, true], [true, true], true]);
    vi.advanceTimersByTime(1);
    expect(off(render())).toEqual([[false, false], [false, false], false]);
  });

  it("counts the lock from the turn's end, not from when the screen appeared", () => {
    render(NOW - 1000);
    runEffects();
    vi.advanceTimersByTime(500);
    expect(nodes(render(NOW - 1000)).find((n) => n.type === PrimaryButton)!.props.disabled).toBe(false);
  });

  it("lists the cards with their mark in writing, and flips one when pressed", () => {
    const rows = pressables(render());
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual(["Messi, whoResultGot", "Pamuk Prenses, whoResultPassed"]);
    expect(rows.map(text)).toEqual(["Messi✓ whoResultGot", "Pamuk Prenses↷ whoResultPassed"]);
    press(rows[1]);
    expect(onFlip).toHaveBeenCalledWith(1);
  });

  it("shows the scores and moves on with Next", () => {
    const tree = render();
    expect(nodes(tree).find((n) => n.type === WhoScores)!.props).toMatchObject({ names: ["Ann", "Bob"], scores: [2, 1] });
    const next = nodes(tree).find((n) => n.type === PrimaryButton)!;
    expect(next.props.label).toBe("whoNext");
    press(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe("WhoScores (mobile)", () => {
  it("shows every side's name and score on a tile in its colour", () => {
    const tree = WhoScores({ names: ["Red", "Blue"], colors: ["#111111", "#222222"], scores: [3, 5] }) as Node;
    const tiles = nodes(tree).filter((n) => n.type === View && flat(n.props.style).borderColor);
    expect(tiles.map(text)).toEqual(["Red3", "Blue5"]);
    expect(tiles.map((n) => flat(n.props.style).borderColor)).toEqual(["#111111", "#222222"]);
  });
});

describe("WhoEnd (mobile)", () => {
  const onPlayAgain = vi.fn();
  const onNewGame = vi.fn();
  const colors = [playerColor(0), playerColor(1), playerColor(2)];

  it("shows the winner on their colour, or a tie", () => {
    const win = WhoEnd({ names: ["Ann", "Bob", "Cem"], colors, scores: [1, 4, 2], onPlayAgain, onNewGame }) as Node;
    expect(text(win)).toContain("Bob wins");
    expect(nodes(win).some((n) => n.type === View && flat(n.props.style).backgroundColor === playerColor(1))).toBe(true);
    const tie = WhoEnd({ names: ["Ann", "Bob", "Cem"], colors, scores: [4, 4, 2], onPlayAgain, onNewGame }) as Node;
    expect(text(tie)).toContain("whoTie");
    expect(text(tie)).not.toContain("wins");
  });

  it("plays again or goes back to the setup", () => {
    const tree = WhoEnd({ names: ["Ann", "Bob"], colors, scores: [1, 0], onPlayAgain, onNewGame }) as Node;
    press(nodes(tree).find((n) => n.type === PrimaryButton));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    press(pressables(tree).find((n) => text(n) === "whoNewGame"));
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });
});
