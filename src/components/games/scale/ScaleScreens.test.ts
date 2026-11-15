import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { GAME_THEME, SCALE_REVEAL_LOCK_MS, scaleZoneColor, teamColor, type ScalePair, type WordTeam } from "@/lib/scale-game";

const NOW = 1_800_000_000_000;

// Effects run, as in React, only when their dependencies changed since they last ran.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as { slot: number; effect: () => void | (() => void); deps?: unknown[] }[],
  ran: new Map<number, unknown[] | undefined>(),
  cleanups: new Map<number, () => void>(),
  index: 0,
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
vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => {
        const templates: Record<string, string> = {
          scaleTurnOf: "turn {n}/{total}",
          scaleGives: "{team}: {name} gives",
          scaleOnlyLooks: "only {name} looks",
          scaleNeedleValue: "{n}/100",
          scaleTurnPoints: "{team} +{n}",
          scaleDistance: "{n} away",
          scaleDistanceOne: "one away",
          scaleWins: "{team} wins",
        };
        return templates[String(key)] ?? String(key);
      },
    }),
  }),
}));

import WordScores from "../word/WordScores";
import ScaleEnd from "./ScaleEnd";
import ScaleGuess from "./ScaleGuess";
import ScaleHandoff from "./ScaleHandoff";
import ScaleNeedle from "./ScaleNeedle";
import ScaleReveal from "./ScaleReveal";
import ScaleSecret from "./ScaleSecret";
import { ScaleBar, ScaleEnds } from "./ScaleTrack";

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

const click = (node: Node | undefined) => (node!.props.onClick as () => void)();
const buttons = (tree: Node) => nodes(tree).filter((n) => n.type === "button");
const button = (tree: Node, label: string) => buttons(tree).find((n) => text(n) === label);
const labelled = (tree: Node, label: string) => buttons(tree).find((n) => n.props["aria-label"] === label);
const find = (tree: Node, type: unknown) => nodes(tree).find((n) => n.type === type);
const style = (node: Node) => node.props.style as Record<string, string>;

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

const PAIR: ScalePair = { id: "en-1", left: "Cold", right: "Hot" };
const TEAMS: WordTeam[] = [
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

describe("ScaleEnds and ScaleBar", () => {
  it("writes the pair's two ends with arrows", () => {
    expect(text(ScaleEnds({ pair: PAIR }))).toBe("← ColdHot →");
  });

  it("draws the band's zones on the line with their points written, and no needle unless given", () => {
    const tree = ScaleBar({ target: 50 }) as Node;
    const zones = nodes(tree).filter((n) => n.props["data-zone"] !== undefined);
    expect(zones.map(text)).toEqual(["2", "3", "4", "3", "2"]);
    expect(zones.map((z) => style(z).left)).toEqual(["35.5%", "41.5%", "46.5%", "53.5%", "58.5%"]);
    expect(style(zones[2])).toMatchObject({ width: "7%", backgroundColor: scaleZoneColor(4), color: GAME_THEME.ink });
    expect(nodes(tree).some((n) => n.props["data-needle"] !== undefined)).toBe(false);
  });

  it("leaves a zone clipped too thin to read without its number", () => {
    const zones = nodes(ScaleBar({ target: 10 }) as Node).filter((n) => n.props["data-zone"] !== undefined);
    expect(zones.map(text)).toEqual(["", "3", "4", "3", "2"]);
  });

  it("draws the needle where it stands and lets every touch through to the slider", () => {
    const tree = ScaleBar({ needle: 30 }) as Node;
    expect(style(nodes(tree).find((n) => n.props["data-needle"] !== undefined)!).left).toBe("30%");
    expect(String(tree.props.className)).toContain("pointer-events-none");
    expect(nodes(tree).some((n) => n.props["data-zone"] !== undefined)).toBe(false);
  });

  it("names the band for screen readers when asked", () => {
    expect(ScaleBar({ target: 40, label: "band" }) as Node).toMatchObject({ props: { role: "img", "aria-label": "band" } });
    expect((ScaleBar({ needle: 40 }) as Node).props.role).toBeUndefined();
  });
});

describe("ScaleNeedle", () => {
  const onMove = vi.fn();
  const render = (value = 50) => ScaleNeedle({ value, onMove }) as Node;
  const slider = (tree: Node) => nodes(tree).find((n) => n.props.role === "slider")!;
  const pointer = (clientX: number, captured = true) => ({
    clientX,
    pointerId: 7,
    currentTarget: {
      getBoundingClientRect: () => ({ left: 100, width: 200 }),
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => captured),
    },
  });

  it("is a slider from 0 to 100 with its value written for screen readers", () => {
    const s = slider(render(42));
    expect(s.props).toMatchObject({
      tabIndex: 0,
      "aria-label": "scaleNeedle",
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": 42,
      "aria-valuetext": "42/100",
    });
    expect(find(s, ScaleBar)!.props.needle).toBe(42);
    expect(find(s, ScaleBar)!.props.target).toBeUndefined();
    expect(String(s.props.className)).toContain("touch-none");
  });

  it("puts the needle where the line is pressed and keeps the pointer for the drag", () => {
    const down = pointer(150);
    (slider(render()).props.onPointerDown as (e: unknown) => void)(down);
    expect(down.currentTarget.setPointerCapture).toHaveBeenCalledWith(7);
    expect(onMove).toHaveBeenLastCalledWith(25);
  });

  it("follows a drag only while the pointer is held, past the ends included", () => {
    const move = slider(render()).props.onPointerMove as (e: unknown) => void;
    move(pointer(250));
    expect(onMove).toHaveBeenLastCalledWith(75);
    move(pointer(400));
    expect(onMove).toHaveBeenLastCalledWith(100);
    onMove.mockClear();
    move(pointer(200, false));
    expect(onMove).not.toHaveBeenCalled();
  });

  it.each([
    ["ArrowRight", 51],
    ["ArrowUp", 51],
    ["ArrowLeft", 49],
    ["ArrowDown", 49],
    ["PageUp", 60],
    ["PageDown", 40],
    ["Home", 0],
    ["End", 100],
  ])("moves with %s", (key, value) => {
    const preventDefault = vi.fn();
    (slider(render()).props.onKeyDown as (e: unknown) => void)({ key, preventDefault });
    expect(onMove).toHaveBeenCalledWith(value);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("leaves other keys to the page", () => {
    const preventDefault = vi.fn();
    (slider(render()).props.onKeyDown as (e: unknown) => void)({ key: "Tab", preventDefault });
    expect(onMove).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("nudges by one with ◀ ▶, each off at its end", () => {
    click(labelled(render(), "scaleNudgeLeft"));
    expect(onMove).toHaveBeenLastCalledWith(49);
    click(labelled(render(), "scaleNudgeRight"));
    expect(onMove).toHaveBeenLastCalledWith(51);
    expect(labelled(render(0), "scaleNudgeLeft")!.props.disabled).toBe(true);
    expect(labelled(render(0), "scaleNudgeRight")!.props.disabled).toBe(false);
    expect(labelled(render(100), "scaleNudgeRight")!.props.disabled).toBe(true);
  });

  it("keeps ◀ ▶ out of the slider", () => {
    expect(buttons(slider(render()))).toEqual([]);
  });
});

describe("ScaleHandoff", () => {
  it("names the team, the clue giver and the turn, and shows the target on tap", () => {
    const onShow = vi.fn();
    const tree = ScaleHandoff({ team: "Red", giver: "Ann", turn: 2, turns: 6, teams: TEAMS, scores: [3, 1], onShow }) as Node;
    expect(text(tree)).toContain("turn 2/6");
    expect(text(tree)).toContain("Red: Ann gives");
    expect(text(tree)).toContain("only Ann looks");
    expect(find(tree, WordScores)!.props).toMatchObject({ teams: TEAMS, scores: [3, 1] });
    click(button(tree, "scaleShowTarget"));
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it("writes names that look like placeholders as typed", () => {
    const tree = ScaleHandoff({ team: "{name}", giver: "$&", turn: 1, turns: 4, teams: TEAMS, scores: [0, 0], onShow: vi.fn() }) as Node;
    expect(text(tree)).toContain("{name}: $& gives");
  });
});

describe("ScaleSecret", () => {
  it("shows the pair and the target's band, then hides it", () => {
    const onHide = vi.fn();
    const tree = ScaleSecret({ pair: PAIR, target: 64, onHide }) as Node;
    expect(find(tree, ScaleEnds)!.props.pair).toBe(PAIR);
    const bar = find(tree, ScaleBar)!;
    expect(bar.props).toMatchObject({ target: 64, label: "scaleTarget, 64/100" });
    expect(bar.props.needle).toBeUndefined();
    expect(text(tree)).toContain("scaleBandHint");
    click(button(tree, "scaleHide"));
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});

describe("ScaleGuess", () => {
  const onMove = vi.fn();
  const onLock = vi.fn();
  const render = (confirming: boolean) =>
    ScaleGuess({ pair: PAIR, team: "Blue", color: teamColor(1), needle: 33, confirming, onMove, onLock }) as Node;

  it("shows the pair and the needle without the target", () => {
    const tree = render(false);
    expect(find(tree, ScaleEnds)!.props.pair).toBe(PAIR);
    const needle = find(tree, ScaleNeedle)!;
    expect(needle.props).toEqual({ value: 33, onMove });
    expect(find(tree, ScaleBar)).toBeUndefined();
    const line = find(ScaleNeedle(needle.props as never) as Node, ScaleBar)!;
    expect(line.props.needle).toBe(33);
    expect(line.props.target).toBeUndefined();
    expect(text(tree)).toContain("Blue");
  });

  it("asks for a second tap on Lock in", () => {
    click(button(render(false), "scaleLockIn"));
    expect(onLock).toHaveBeenCalledTimes(1);
    const asked = render(true);
    expect(button(asked, "scaleLockIn")).toBeUndefined();
    click(button(asked, "scaleConfirm"));
    expect(onLock).toHaveBeenCalledTimes(2);
  });
});

describe("ScaleReveal", () => {
  const onNext = vi.fn();
  function render(needle = 45, target = 50, revealedAt = NOW) {
    hooks.index = 0;
    hooks.effects = [];
    return ScaleReveal({ pair: PAIR, target, needle, team: "Red", color: teamColor(0), teams: TEAMS, scores: [3, 0], revealedAt, onNext }) as Node;
  }
  const next = (tree: Node) => button(tree, "scaleNext")!;

  it("draws the band with the needle and writes the points, the distance and how close it was", () => {
    const tree = render();
    expect(find(tree, ScaleBar)!.props).toMatchObject({ target: 50, needle: 45 });
    expect(text(tree)).toContain("scaleVeryClose");
    expect(text(tree)).toContain("Red +3");
    expect(text(tree)).toContain("5 away");
    expect(find(tree, WordScores)!.props.scores).toEqual([3, 0]);
  });

  it.each([
    [53, "scaleSpotOn", "Red +4", "3 away"],
    [49, "scaleSpotOn", "Red +4", "one away"],
    [50, "scaleSpotOn", "Red +4", "scaleBullseye"],
    [36, "scaleClose", "Red +2", "14 away"],
    [35, "scaleMiss", "Red +0", "15 away"],
  ])("says how close a needle on %i was", (needle, line, points, distance) => {
    const tree = render(needle);
    expect(text(tree)).toContain(line);
    expect(text(tree)).toContain(points);
    expect(text(tree)).toContain(distance);
    if (needle === 50) expect(text(tree)).not.toContain("away");
  });

  it("keeps Next off until 1 s after the needle was locked", () => {
    expect(next(render()).props.disabled).toBe(true);
    runEffects();
    vi.advanceTimersByTime(SCALE_REVEAL_LOCK_MS - 1);
    expect(next(render()).props.disabled).toBe(true);
    vi.advanceTimersByTime(1);
    const tree = render();
    expect(next(tree).props.disabled).toBe(false);
    click(next(tree));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("counts the lock from the lock, not from when the screen appeared", () => {
    vi.setSystemTime(NOW + 600);
    render();
    runEffects();
    vi.advanceTimersByTime(SCALE_REVEAL_LOCK_MS - 600);
    expect(next(render()).props.disabled).toBe(false);
  });
});

describe("ScaleEnd", () => {
  const onPlayAgain = vi.fn();
  const onNewGame = vi.fn();
  const render = (scores: [number, number]) => ScaleEnd({ teams: TEAMS, scores, onPlayAgain, onNewGame }) as Node;

  it("names the winning team on its colour with the scores", () => {
    const tree = render([5, 9]);
    const win = nodes(tree).find((n) => text(n) === "Blue wins" && n.props.style)!;
    expect(style(win)).toMatchObject({ backgroundColor: teamColor(1), color: GAME_THEME.ink });
    expect(find(tree, WordScores)!.props).toMatchObject({ teams: TEAMS, scores: [5, 9] });
  });

  it("calls a tie a tie", () => {
    const tree = render([4, 4]);
    expect(text(tree)).toContain("scaleTie");
    expect(text(tree)).not.toContain("wins");
  });

  it("plays again or goes back to the setup", () => {
    const tree = render([1, 0]);
    click(button(tree, "scalePlayAgain"));
    click(button(tree, "scaleNewGame"));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });
});
