import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { GAME_THEME, WORD_COLORS, WORD_TIME_UP_MS, type WordCard, type WordMode } from "@/lib/word-game";

const NOW = 1_800_000_000_000;

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
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
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
  };
});
vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wordSecondsLeft" || key === "wordPassesLeft" ? `${String(key)} {n}` : String(key)),
    }),
  }),
}));

import WordTurn from "./WordTurn";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const card: WordCard = { id: "animals-1", word: "Cat", forbidden: ["meow", "pet", "whiskers", "mouse"], level: "easy" };
const onAnswer = vi.fn();
const onTimeUp = vi.fn();

function render(props: { mode?: WordMode; passLimit?: number | null; passesLeft?: number | null } = {}): Node {
  hooks.index = 0;
  hooks.effects = [];
  const { mode = "forbidden", passLimit = 3, passesLeft = passLimit } = props;
  return WordTurn({ card, mode, endsAt: NOW + 60_000, passLimit, passesLeft, onAnswer, onTimeUp }) as Node;
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

const buttons = (tree: Node) => nodes(tree).filter((n) => n.type === "button");
const button = (tree: Node, label: string) => buttons(tree).find((n) => text(n) === label);
const clock = (tree: Node) => nodes(tree).find((n) => n.props.role === "timer")!;
const live = (tree: Node) => text(nodes(tree).find((n) => n.props["aria-live"])!);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"], now: NOW });
  hooks.states = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WordTurn card", () => {
  it("shows the word with its 4 forbidden words in forbidden-words mode", () => {
    const out = text(render());
    expect(out).toContain("Cat");
    for (const word of card.forbidden) expect(out).toContain(word);
    expect(out).toContain("wordForbiddenLabel");
  });

  it.each([
    ["free", "wordFreeHint"],
    ["mime", "wordNoTalking"],
  ] as const)("shows the %s mode's rule instead of forbidden words", (mode, rule) => {
    const out = text(render({ mode }));
    expect(out).toContain("Cat");
    expect(out).toContain(rule);
    expect(out).not.toContain("meow");
  });
});

describe("WordTurn buttons", () => {
  it("answers Foul, Pass and Correct", () => {
    const tree = render();
    expect(buttons(tree).map(text)).toEqual(["wordFoul", "wordPass (3)", "wordCorrect"]);
    for (const b of buttons(tree)) (b.props.onClick as () => void)();
    expect(onAnswer.mock.calls).toEqual([["foul"], ["pass"], ["correct"]]);
  });

  it("reads out the passes left and disables Pass when none are left", () => {
    const pass = button(render({ passesLeft: 2 }), "wordPass (2)")!;
    expect(pass.props["aria-label"]).toBe("wordPassesLeft 2");
    expect(pass.props.disabled).toBe(false);
    expect(button(render({ passesLeft: 0 }), "wordPass (0)")!.props.disabled).toBe(true);
  });

  it("hides Pass with a limit of 0 and shows no count when passes are unlimited", () => {
    expect(buttons(render({ passLimit: 0 })).map(text)).toEqual(["wordFoul", "wordCorrect"]);
    expect(button(render({ passLimit: null }), "wordPass")!.props["aria-label"]).toBe("wordPass");
  });
});

describe("WordTurn clock", () => {
  it("counts down, then turns red and pulses for the last 10 seconds", () => {
    expect(text(clock(render()))).toBe("1:00");
    runEffects();
    vi.advanceTimersByTime(49_000);
    let c = clock(render());
    expect(text(c)).toBe("0:11");
    expect(c.props.style).toMatchObject({ color: GAME_THEME.text });
    expect(String(c.props.className)).not.toContain("animate-pulse");
    vi.advanceTimersByTime(1000);
    c = clock(render());
    expect(text(c)).toBe("0:10");
    expect(c.props.style).toMatchObject({ color: WORD_COLORS.warn });
    expect(String(c.props.className)).toContain("animate-pulse");
  });

  it("announces the time only when the last 10 seconds start and at zero", () => {
    expect(live(render())).toBe("");
    runEffects();
    vi.advanceTimersByTime(30_000);
    expect(live(render())).toBe("");
    vi.advanceTimersByTime(20_000);
    expect(live(render())).toBe("wordSecondsLeft 10");
    vi.advanceTimersByTime(5_000);
    expect(live(render())).toBe("wordSecondsLeft 10");
    vi.advanceTimersByTime(5_000);
    expect(live(render())).toBe("wordTimeUp");
  });

  it("replaces the card with Time's up at zero and ends the turn after a pause", () => {
    render();
    runEffects();
    vi.advanceTimersByTime(60_000);
    const tree = render();
    expect(text(nodes(tree).find((n) => n.props["data-card"]))).toBe("wordTimeUp");
    expect(buttons(tree).every((b) => b.props.disabled === true)).toBe(true);
    runEffects();
    vi.advanceTimersByTime(WORD_TIME_UP_MS - 1);
    expect(onTimeUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });
});
