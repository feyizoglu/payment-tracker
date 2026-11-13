import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { GAME_THEME, WORD_COLORS, WORD_TIME_UP_MS, teamColor, type WordCard, type WordMode } from "@ptracker/shared/word-game";

const NOW = 1_800_000_000_000;

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  index: 0,
}));
const rn = vi.hoisted(() => ({ announce: vi.fn() }));

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
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
  };
});
vi.mock("react-native", () => ({
  AccessibilityInfo: { announceForAccessibility: rn.announce },
  Pressable: () => null,
  Text: () => null,
  View: () => null,
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: () => null },
  ZoomIn: { duration: () => ({}) },
}));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wordSecondsLeft" || key === "wordPassesLeft" ? `${String(key)} {n}` : String(key)),
    }),
  }),
}));

import Animated from "react-native-reanimated";
import { Pressable, Text } from "react-native";
import { WordTurn } from "@/components/games/word/word-turn";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const card: WordCard = { id: "animals-1", word: "Cat", forbidden: ["meow", "pet", "whiskers", "mouse"], level: "easy" };
const onAnswer = vi.fn();
const onTimeUp = vi.fn();

function render(props: { mode?: WordMode; passLimit?: number | null; passesLeft?: number | null } = {}): Node {
  hooks.index = 0;
  hooks.effects = [];
  const { mode = "forbidden", passLimit = 3, passesLeft = passLimit } = props;
  return WordTurn({ card, teamName: "Red", mode, endsAt: NOW + 60_000, passLimit, passesLeft, onAnswer, onTimeUp }) as Node;
}

function runEffects() {
  for (const effect of hooks.effects) effect();
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

const buttons = (tree: Node) => nodes(tree).filter((n) => n.type === Pressable);
const clock = (tree: Node) => nodes(tree).find((n) => n.type === Text && n.props.accessibilityRole === "timer")!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"], now: NOW });
  hooks.states = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WordTurn (mobile) card", () => {
  it("shows the word with its 4 forbidden words in forbidden-words mode", () => {
    const out = text(render());
    expect(out).toContain("Cat");
    for (const word of card.forbidden) expect(out).toContain(word);
  });

  it.each([
    ["free", "wordFreeHint"],
    ["mime", "wordNoTalking"],
  ] as const)("shows the %s mode's rule instead of forbidden words", (mode, rule) => {
    const out = text(render({ mode }));
    expect(out).toContain(rule);
    expect(out).not.toContain("meow");
  });
});

describe("WordTurn (mobile) buttons", () => {
  it("writes the team on turn, as its colour fills the screen", () => {
    expect(text(render())).toContain("Red");
  });

  it("fills no button with a team colour, so each one stands out on either team's screen", () => {
    const fills = buttons(render()).map((b) => (b.props.style as { backgroundColor: string }).backgroundColor);
    expect(fills).toHaveLength(3);
    for (const fill of fills) expect([teamColor(0), teamColor(1)]).not.toContain(fill);
  });

  it("answers Foul, Pass and Correct, and reads out the passes left", () => {
    const tree = render();
    expect(buttons(tree).map((b) => b.props.accessibilityLabel)).toEqual(["wordFoul", "wordPassesLeft 3", "wordCorrect"]);
    expect(text(buttons(tree)[1])).toBe("wordPass (3)");
    for (const b of buttons(tree)) (b.props.onPress as () => void)();
    expect(onAnswer.mock.calls).toEqual([["foul"], ["pass"], ["correct"]]);
  });

  it("disables Pass at none left, hides it with a limit of 0 and shows no count when unlimited", () => {
    expect(buttons(render({ passesLeft: 0 }))[1].props.disabled).toBe(true);
    expect(buttons(render({ passLimit: 0 })).map((b) => b.props.accessibilityLabel)).toEqual(["wordFoul", "wordCorrect"]);
    expect(buttons(render({ passLimit: null }))[1].props.accessibilityLabel).toBe("wordPass");
  });
});

describe("WordTurn (mobile) clock", () => {
  it("counts down, then turns red and pulses for the last 10 seconds", () => {
    expect(text(clock(render()))).toBe("1:00");
    runEffects();
    vi.advanceTimersByTime(49_000);
    let tree = render();
    expect(text(clock(tree))).toBe("0:11");
    expect(clock(tree).props.style).toMatchObject({ color: GAME_THEME.text });
    expect(nodes(tree).some((n) => n.type === Animated.View)).toBe(false);
    vi.advanceTimersByTime(1000);
    tree = render();
    expect(text(clock(tree))).toBe("0:10");
    expect(clock(tree).props.style).toMatchObject({ color: WORD_COLORS.warn });
    expect(nodes(tree).some((n) => n.type === Animated.View)).toBe(true);
  });

  it("announces the time once when the last 10 seconds start and once at zero", () => {
    render();
    runEffects();
    expect(rn.announce).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50_000);
    render();
    runEffects();
    expect(rn.announce).toHaveBeenCalledTimes(1);
    expect(rn.announce).toHaveBeenLastCalledWith("wordSecondsLeft 10");
    vi.advanceTimersByTime(5_000);
    render();
    runEffects();
    expect(rn.announce).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_000);
    render();
    runEffects();
    expect(rn.announce).toHaveBeenCalledTimes(2);
    expect(rn.announce).toHaveBeenLastCalledWith("wordTimeUp");
  });

  it("replaces the card with Time's up at zero and ends the turn after a pause", () => {
    render();
    runEffects();
    vi.advanceTimersByTime(60_000);
    const tree = render();
    expect(text(tree)).toContain("wordTimeUp");
    expect(text(tree)).not.toContain("Cat");
    expect(buttons(tree).every((b) => b.props.disabled === true)).toBe(true);
    runEffects();
    vi.advanceTimersByTime(WORD_TIME_UP_MS - 1);
    expect(onTimeUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });
});
