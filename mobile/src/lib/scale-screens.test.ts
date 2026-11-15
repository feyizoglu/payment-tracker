import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { SCALE_REVEAL_LOCK_MS, scaleZoneColor, teamColor, type ScalePair } from "@ptracker/shared/scale-game";

const NOW = 1_800_000_000_000;

// Effects run, as in React, only when their dependencies changed since they last ran.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as { slot: number; effect: () => void | (() => void); deps?: unknown[] }[],
  ran: new Map<number, unknown[] | undefined>(),
  cleanups: new Map<number, () => void>(),
  index: 0,
}));
const rn = vi.hoisted(() => ({ create: vi.fn((config: Record<string, unknown>) => ({ panHandlers: config })) }));

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
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      hooks.effects.push({ slot: hooks.index++, effect, deps });
    },
  };
});
vi.mock("react-native", () => ({
  PanResponder: { create: rn.create },
  Pressable: () => null,
  Text: () => null,
  View: () => null,
}));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => {
        const templates: Record<string, string> = {
          scaleTurnOf: "turn {n}/{total}",
          scaleGives: "{team}: {name} gives",
          scaleOnlyLooks: "only {name} looks",
          scaleNeedleValue: "{n} of 100",
          scaleTurnPoints: "{team} +{n}",
          scaleDistance: "{n} away",
          scaleWins: "{team} wins",
        };
        return templates[String(key)] ?? String(key);
      },
    }),
  }),
}));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/games/game-button", () => ({ GameButton: () => null }));
vi.mock("@/components/games/word/word-scores", () => ({ WordScores: () => null }));

import { Pressable, Text, View } from "react-native";
import { GameButton } from "@/components/games/game-button";
import { ScaleEnd } from "@/components/games/scale/scale-end";
import { ScaleGuess } from "@/components/games/scale/scale-guess";
import { ScaleHandoff } from "@/components/games/scale/scale-handoff";
import { ScaleNeedle } from "@/components/games/scale/scale-needle";
import { ScaleReveal } from "@/components/games/scale/scale-reveal";
import { ScaleSecret } from "@/components/games/scale/scale-secret";
import { ScaleBar, ScaleEnds } from "@/components/games/scale/scale-track";
import { WordScores } from "@/components/games/word/word-scores";
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
const find = (tree: Node, type: unknown) => nodes(tree).find((n) => n.type === type)!;
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

const PAIR: ScalePair = { id: "en-2", left: "Cheap", right: "Expensive" };
const TEAMS = [
  { name: "Red", players: ["Ann", "Bob"] },
  { name: "Blue", players: ["Cem", "Dan"] },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: NOW });
  unmount();
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
});

describe("ScaleHandoff (mobile)", () => {
  it("names the team, its clue giver and the turn, and shows the target on press", () => {
    const onShow = vi.fn();
    const tree = ScaleHandoff({ team: "Red", giver: "Ann", turn: 2, turns: 6, teams: TEAMS, scores: [3, 1], onShow }) as Node;
    expect(text(tree)).toContain("turn 2/6");
    expect(text(tree)).toContain("Red: Ann gives");
    expect(text(tree)).toContain("only Ann looks");
    expect(find(tree, WordScores).props).toMatchObject({ teams: TEAMS, scores: [3, 1] });
    const show = find(tree, GameButton);
    expect(show.props.label).toBe("scaleShowTarget");
    press(show);
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("writes a name that looks like a placeholder as it was typed", () => {
    const tree = ScaleHandoff({ team: "{name}", giver: "$&", turn: 1, turns: 4, teams: TEAMS, scores: [0, 0], onShow: vi.fn() }) as Node;
    expect(text(tree)).toContain("{name}: $& gives");
  });
});

describe("ScaleEnds and ScaleBar (mobile)", () => {
  const zones = (tree: Node) => nodes(tree).filter((n) => n.type === View && flat(n.props.style).backgroundColor);

  it("writes the pair's two ends", () => {
    expect(text(ScaleEnds({ pair: PAIR }) as Node)).toBe("← CheapExpensive →");
  });

  it("draws the band's zones with their points written on them, and lets touches through", () => {
    const tree = ScaleBar({ target: 50 }) as Node;
    expect(tree.props.pointerEvents).toBe("none");
    const drawn = zones(tree);
    expect(drawn.map(text)).toEqual(["2", "3", "4", "3", "2"]);
    expect(drawn.map((z) => flat(z.props.style).left)).toEqual(["35.5%", "41.5%", "46.5%", "53.5%", "58.5%"]);
    expect(drawn.map((z) => flat(z.props.style).width)).toEqual(["6%", "5%", "7%", "5%", "6%"]);
    expect(drawn.map((z) => flat(z.props.style).backgroundColor)).toEqual([2, 3, 4, 3, 2].map(scaleZoneColor));
    expect(nodes(tree).some((n) => n.props.testID === "needle")).toBe(false);
  });

  it("clips the band at the line's end and leaves a sliver too narrow to write on blank", () => {
    const drawn = zones(ScaleBar({ target: 10 }) as Node);
    expect(drawn.map(text)).toEqual(["", "3", "4", "3", "2"]);
    expect(flat(drawn[0].props.style)).toMatchObject({ left: "0%", width: "1.5%" });
  });

  it("draws the needle where it stands, without a band", () => {
    const tree = ScaleBar({ needle: 30 }) as Node;
    expect(zones(tree).filter((n) => n.props.testID !== "needle")).toEqual([]);
    expect(flat(nodes(tree).find((n) => n.props.testID === "needle")!.props.style).left).toBe("30%");
  });

  it("can be read out as a whole", () => {
    const tree = ScaleBar({ target: 42, label: "target 42" }) as Node;
    expect(tree.props).toMatchObject({ accessible: true, accessibilityLabel: "target 42" });
    expect((ScaleBar({ needle: 1 }) as Node).props.accessible).toBeFalsy();
  });
});

describe("ScaleNeedle (mobile)", () => {
  function render(value: number, onMove: (n: number) => void) {
    hooks.index = 0;
    hooks.effects = [];
    return ScaleNeedle({ value, onMove }) as Node;
  }
  const control = (tree: Node) => nodes(tree).find((n) => n.props.accessibilityRole === "adjustable")!;
  const handler = (tree: Node, name: string) => control(tree).props[name] as (...args: unknown[]) => unknown;
  const layout = (tree: Node, width: number) => handler(tree, "onLayout")({ nativeEvent: { layout: { width, height: 64 } } });
  const nudge = (tree: Node, label: string) => pressables(tree).find((n) => n.props.accessibilityLabel === label)!;

  it("is an adjustable control from 0 to 100 that reads out its value", () => {
    const tree = render(40, vi.fn());
    expect(control(tree).props).toMatchObject({
      accessible: true,
      accessibilityLabel: "scaleNeedle",
      accessibilityValue: { min: 0, max: 100, now: 40, text: "40 of 100" },
      accessibilityActions: [{ name: "increment" }, { name: "decrement" }],
    });
    expect(find(control(tree), ScaleBar).props).toMatchObject({ needle: 40 });
    expect(find(control(tree), ScaleBar).props.target).toBeUndefined();
  });

  it("moves by one on the screen reader's increment and decrement", () => {
    const onMove = vi.fn();
    const act = handler(render(40, onMove), "onAccessibilityAction");
    act({ nativeEvent: { actionName: "increment" } });
    act({ nativeEvent: { actionName: "decrement" } });
    act({ nativeEvent: { actionName: "activate" } });
    expect(onMove.mock.calls).toEqual([[41], [39]]);
  });

  it("puts the needle where the line is touched and follows the drag from there", () => {
    const onMove = vi.fn();
    const tree = render(50, onMove);
    layout(tree, 200);
    expect(handler(tree, "onStartShouldSetPanResponder")()).toBe(true);
    expect(handler(tree, "onMoveShouldSetPanResponder")()).toBe(true);
    handler(tree, "onPanResponderGrant")({ nativeEvent: { locationX: 50 } }, { dx: 0 });
    handler(tree, "onPanResponderMove")({ nativeEvent: { locationX: 3 } }, { dx: 100 });
    handler(tree, "onPanResponderMove")({ nativeEvent: { locationX: 3 } }, { dx: 400 });
    handler(tree, "onPanResponderMove")({ nativeEvent: { locationX: 3 } }, { dx: -90 });
    expect(onMove.mock.calls).toEqual([[25], [75], [100], [0]]);
  });

  it("keeps the drag when a parent asks for it", () => {
    expect(handler(render(50, vi.fn()), "onPanResponderTerminationRequest")()).toBe(false);
  });

  it("creates its responder once and always reports to the latest callback", () => {
    const first = vi.fn();
    const latest = vi.fn();
    let tree = render(50, first);
    runEffects();
    layout(tree, 100);
    tree = render(60, latest);
    runEffects();
    handler(tree, "onPanResponderGrant")({ nativeEvent: { locationX: 20 } }, { dx: 0 });
    expect(rn.create).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(20);
  });

  it("nudges by one with ◀ ▶, each off at its end of the line", () => {
    const onMove = vi.fn();
    const tree = render(50, onMove);
    press(nudge(tree, "scaleNudgeLeft"));
    press(nudge(tree, "scaleNudgeRight"));
    expect(onMove.mock.calls).toEqual([[49], [51]]);
    expect(text(nudge(tree, "scaleNudgeLeft"))).toBe("◀");
    expect(text(nudge(tree, "scaleNudgeRight"))).toBe("▶");
    const off = (t: Node, label: string) => [nudge(t, label).props.disabled, (nudge(t, label).props.accessibilityState as { disabled: boolean }).disabled];
    expect(off(tree, "scaleNudgeLeft")).toEqual([false, false]);
    expect(off(render(0, onMove), "scaleNudgeLeft")).toEqual([true, true]);
    expect(off(render(0, onMove), "scaleNudgeRight")).toEqual([false, false]);
    expect(off(render(100, onMove), "scaleNudgeRight")).toEqual([true, true]);
  });
});

describe("ScaleSecret (mobile)", () => {
  it("shows the pair and the target band to the clue giver, then hides it", () => {
    const onHide = vi.fn();
    const tree = ScaleSecret({ pair: PAIR, target: 42, onHide }) as Node;
    expect(find(tree, ScaleEnds).props.pair).toEqual(PAIR);
    expect(find(tree, ScaleBar).props).toMatchObject({ target: 42, label: "scaleTarget, 42 of 100" });
    expect(text(tree)).toContain("scaleSecretHint");
    expect(text(tree)).toContain("scaleBandHint");
    const hide = find(tree, PrimaryButton);
    expect(hide.props.label).toBe("scaleHide");
    press(hide);
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});

describe("ScaleGuess (mobile)", () => {
  const onMove = vi.fn();
  const onLock = vi.fn();
  const render = (confirming: boolean) =>
    ScaleGuess({ pair: PAIR, team: "Blue", color: teamColor(1), needle: 64, confirming, onMove, onLock }) as Node;

  it("names the guessing team in its colour and hands the needle to it", () => {
    const tree = render(false);
    const team = nodes(tree).find((n) => n.type === Text && text(n) === "Blue")!;
    expect(flat(team.props.style).color).toBe(teamColor(1));
    expect(text(tree)).toContain("scaleGuessHint");
    expect(find(tree, ScaleEnds).props.pair).toEqual(PAIR);
    expect(find(tree, ScaleNeedle).props).toEqual({ value: 64, onMove });
  });

  it("never draws the target: the needle's line has no band", () => {
    const needle = find(render(false), ScaleNeedle);
    hooks.index = 0;
    hooks.effects = [];
    const line = find(ScaleNeedle(needle.props as never) as Node, ScaleBar);
    expect(line.props.needle).toBe(64);
    expect(line.props.target).toBeUndefined();
  });

  it("asks for a second tap before locking in", () => {
    expect(find(render(false), PrimaryButton).props.label).toBe("scaleLockIn");
    expect(find(render(true), PrimaryButton).props.label).toBe("scaleConfirm");
    press(find(render(true), PrimaryButton));
    expect(onLock).toHaveBeenCalledTimes(1);
  });
});

describe("ScaleReveal (mobile)", () => {
  const onNext = vi.fn();
  function render(needle = 50, revealedAt = NOW) {
    hooks.index = 0;
    hooks.effects = [];
    return ScaleReveal({
      pair: PAIR,
      target: 43,
      needle,
      team: "Red",
      color: teamColor(0),
      teams: TEAMS,
      scores: [3, 0],
      revealedAt,
      onNext,
    }) as Node;
  }
  const next = (tree: Node) => find(tree, PrimaryButton);

  it("shows the band and the needle together", () => {
    const tree = render();
    expect(find(tree, ScaleEnds).props.pair).toEqual(PAIR);
    expect(find(tree, ScaleBar).props).toMatchObject({ target: 43, needle: 50 });
  });

  it("writes the points, how close the needle was and the distance", () => {
    const tree = render();
    const points = nodes(tree).find((n) => n.type === Text && text(n) === "Red +3")!;
    expect(flat(points.props.style).color).toBe(teamColor(0));
    expect(text(tree)).toContain("scaleVeryClose");
    expect(text(tree)).toContain("7 away");
    expect(text(render(43))).toContain("scaleBullseye");
    expect(text(render(43))).toContain("Red +4");
    expect(text(render(90))).toContain("scaleMiss");
    expect(text(render(90))).toContain("Red +0");
    expect(find(tree, WordScores).props).toMatchObject({ teams: TEAMS, scores: [3, 0] });
  });

  it("keeps Next off until 1 s after the needle was locked", () => {
    expect(next(render()).props).toMatchObject({ label: "scaleNext", disabled: true });
    runEffects();
    vi.advanceTimersByTime(SCALE_REVEAL_LOCK_MS - 1);
    expect(next(render()).props.disabled).toBe(true);
    vi.advanceTimersByTime(1);
    expect(next(render()).props.disabled).toBe(false);
    press(next(render()));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("counts the lock from the reveal, not from when the screen appeared", () => {
    render(50, NOW - 800);
    runEffects();
    vi.advanceTimersByTime(200);
    expect(next(render(50, NOW - 800)).props.disabled).toBe(false);
  });
});

describe("ScaleEnd (mobile)", () => {
  const onPlayAgain = vi.fn();
  const onNewGame = vi.fn();

  it("shows the winner on their team's colour, or a tie", () => {
    const win = ScaleEnd({ teams: TEAMS, scores: [4, 9], onPlayAgain, onNewGame }) as Node;
    expect(text(win)).toContain("Blue wins");
    expect(nodes(win).some((n) => n.type === View && flat(n.props.style).backgroundColor === teamColor(1))).toBe(true);
    expect(find(win, WordScores).props).toMatchObject({ teams: TEAMS, scores: [4, 9] });
    const tie = ScaleEnd({ teams: TEAMS, scores: [5, 5], onPlayAgain, onNewGame }) as Node;
    expect(text(tie)).toContain("scaleTie");
    expect(text(tie)).not.toContain("wins");
  });

  it("plays again or goes back to the setup", () => {
    const tree = ScaleEnd({ teams: TEAMS, scores: [1, 0], onPlayAgain, onNewGame }) as Node;
    expect(find(tree, PrimaryButton).props.label).toBe("scalePlayAgain");
    press(find(tree, PrimaryButton));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    press(pressables(tree).find((n) => text(n) === "scaleNewGame"));
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });
});
