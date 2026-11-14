import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { GAME_THEME, WHO_ANSWER_COLORS, WHO_VIBRATE_MS, playerColor, type WhoTurnCard } from "@/lib/who-game";

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

import WhoEnd from "./WhoEnd";
import WhoHandoff from "./WhoHandoff";
import WhoScores from "./WhoScores";
import WhoSummary from "./WhoSummary";
import WhoTurn from "./WhoTurn";

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"], now: NOW });
  unmount();
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("WhoHandoff", () => {
  const onStart = vi.fn();

  it("names the solo guesser and the round, and starts the turn", () => {
    const tree = WhoHandoff({ guesser: "Ann", team: null, round: 1, rounds: 2, onStart }) as Node;
    expect(text(tree)).toContain("Ann guesses");
    expect(text(tree)).toContain("round 1/2");
    expect(text(tree)).toContain("whoHandoffHint");
    click(button(tree, "whoStart"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("names the team and its guesser, as typed", () => {
    const tree = WhoHandoff({ guesser: "{name} $&", team: "Red", round: 2, rounds: 3, onStart }) as Node;
    expect(text(tree)).toContain("Red: {name} $& guesses");
  });
});

describe("WhoTurn", () => {
  const onAnswer = vi.fn();
  const onTick = vi.fn();
  const onPause = vi.fn();
  const onResume = vi.fn();
  const listeners: Record<string, (() => void) | undefined> = {};
  const doc = {
    hidden: false,
    addEventListener: vi.fn((type: string, fn: () => void) => {
      listeners[type] = fn;
    }),
    removeEventListener: vi.fn((type: string) => {
      listeners[type] = undefined;
    }),
  };
  const card = { id: "p-1", name: "Marie Curie", hint: "physicist, Poland and France" };

  function render(clock: { usedMs: number; runningSince: number | null } = { usedMs: 0, runningSince: NOW }, shown = card) {
    hooks.index = 0;
    hooks.effects = [];
    return WhoTurn({ card: shown, turnMs: 60_000, ...clock, onAnswer, onTick, onPause, onResume }) as Node;
  }

  const timer = (tree: Node) => nodes(tree).find((n) => n.props.role === "timer")!;
  const cardBox = (tree: Node) => nodes(tree).find((n) => n.props["data-card"])!;

  beforeEach(() => {
    doc.hidden = false;
    vi.stubGlobal("document", doc);
  });

  it("shows the name, the hint and the time left to the table", () => {
    const tree = render();
    expect(text(cardBox(tree))).toBe("1:00Marie Curiephysicist, Poland and France");
    expect(timer(tree).props["aria-label"]).toBe("whoTimeLeft");
  });

  it("fills the screen with two labelled halves, Got it on top, that answer the card", () => {
    const tree = render();
    expect(buttons(tree).map(text)).toEqual(["whoGotIt", "whoPass"]);
    expect(style(button(tree, "whoGotIt")!).backgroundColor).toBe(WHO_ANSWER_COLORS.got);
    expect(style(button(tree, "whoPass")!).backgroundColor).toBe(WHO_ANSWER_COLORS.pass);
    expect(buttons(tree).every((b) => String(b.props.className).includes("flex-1"))).toBe(true);
    click(button(tree, "whoGotIt"));
    expect(onAnswer).toHaveBeenLastCalledWith("got");
    click(button(tree, "whoPass"));
    expect(onAnswer).toHaveBeenLastCalledWith("pass");
  });

  it("lets taps on the card through to the half under it", () => {
    expect(String(cardBox(render()).props.className)).toContain("pointer-events-none");
  });

  it("counts the time down from the game's clock, and holds it while paused", () => {
    render();
    runEffects();
    vi.advanceTimersByTime(15_000);
    expect(text(timer(render()))).toBe("0:45");
    expect(text(timer(render({ usedMs: 20_000, runningSince: null })))).toBe("0:40");
    expect(text(timer(render({ usedMs: 70_000, runningSince: null })))).toBe("0:00");
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

  it("pauses the clock when the page is hidden and resumes it when it is back", () => {
    render();
    runEffects();
    doc.hidden = true;
    listeners.visibilitychange!();
    expect(onPause).toHaveBeenCalledTimes(1);
    doc.hidden = false;
    listeners.visibilitychange!();
    expect(onResume).toHaveBeenCalledTimes(1);
    unmount();
    expect(listeners.visibilitychange).toBeUndefined();
  });

  it("writes a long name smaller", () => {
    const size = (name: string) =>
      String(nodes(cardBox(render(undefined, { ...card, name }))).find((n) => text(n) === name && n.type === "p")!.props.className);
    expect(size("Messi")).toContain("text-6xl");
    expect(size("Marie Curie")).toContain("text-5xl");
    expect(size("Wolfgang Amadeus Mozart")).toContain("text-4xl");
    expect(size("Mustafa Kemal Atatürk Kız Lisesi Müdürü")).toContain("text-3xl");
    expect(size("Mustafa Kemal Atatürk Kız Lisesi Müdürü")).toContain("break-words");
  });
});

describe("WhoSummary", () => {
  const onFlip = vi.fn();
  const onNext = vi.fn();
  const results: WhoTurnCard[] = [
    { card: { id: "a", name: "Messi", hint: "h" }, result: "got" },
    { card: { id: "b", name: "Pamuk Prenses", hint: "h" }, result: "pass" },
  ];

  function render() {
    hooks.index = 0;
    hooks.effects = [];
    return WhoSummary({
      side: 1,
      results,
      names: ["Ann", "Bob"],
      colors: [playerColor(0), playerColor(1)],
      scores: [2, 1],
      onFlip,
      onNext,
    }) as Node;
  }

  const rows = (tree: Node) => buttons(tree).filter((b) => text(b) !== "whoNext");

  it("announces the end of the turn and this turn's points", () => {
    const tree = render();
    const alert = nodes(tree).find((n) => n.props.role === "alert")!;
    expect(alert.props["aria-live"]).toBe("assertive");
    expect(text(alert)).toBe("whoTimeUp");
    const points = nodes(tree).find((n) => text(n) === "Bob +1" && n.type === "p")!;
    expect(style(points).color).toBe(playerColor(1));
  });

  it("vibrates once where the browser can, not again on the next render", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    render();
    runEffects();
    render();
    runEffects();
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(WHO_VIBRATE_MS);
  });

  it("does without vibration where the browser cannot or refuses", () => {
    vi.stubGlobal("navigator", {});
    render();
    expect(() => runEffects()).not.toThrow();
    vi.stubGlobal("navigator", {
      vibrate: () => {
        throw new Error("blocked");
      },
    });
    unmount();
    render();
    expect(() => runEffects()).not.toThrow();
  });

  it("lists the cards in order with their mark in writing, and flips one when tapped", () => {
    const tree = render();
    expect(rows(tree).map(text)).toEqual(["Messi✓ whoResultGot", "Pamuk Prenses↷ whoResultPassed"]);
    expect(text(tree)).toContain("whoFlipHint");
    click(rows(tree)[1]);
    expect(onFlip).toHaveBeenCalledWith(1);
  });

  it("shows the scores and moves on with Next", () => {
    const tree = render();
    const scores = nodes(tree).find((n) => n.type === WhoScores)!;
    expect(scores.props).toMatchObject({ names: ["Ann", "Bob"], scores: [2, 1] });
    click(button(tree, "whoNext"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe("WhoScores", () => {
  it("shows every side's name and score on a tile in its colour", () => {
    const tree = WhoScores({ names: ["Red", "Blue"], colors: ["#111111", "#222222"], scores: [3, 5] }) as Node;
    const tiles = nodes(tree).filter((n) => n.type === "div" && style(n)?.borderColor);
    expect(tiles.map(text)).toEqual(["Red3", "Blue5"]);
    expect(tiles.map((n) => style(n).borderColor)).toEqual(["#111111", "#222222"]);
    expect(style(tiles[0]).backgroundColor).toBe(GAME_THEME.bg);
  });
});

describe("WhoEnd", () => {
  const onPlayAgain = vi.fn();
  const onNewGame = vi.fn();
  const colors = [playerColor(0), playerColor(1), playerColor(2)];

  it("shows the winner in their colour", () => {
    const tree = WhoEnd({ names: ["Ann", "Bob", "Cem"], colors, scores: [1, 4, 2], onPlayAgain, onNewGame }) as Node;
    const win = nodes(tree).find((n) => text(n) === "Bob wins" && n.type === "p")!;
    expect(style(win).backgroundColor).toBe(playerColor(1));
    expect(nodes(tree).find((n) => n.type === WhoScores)!.props.scores).toEqual([1, 4, 2]);
  });

  it("calls a tie when the top score is shared", () => {
    const tree = WhoEnd({ names: ["Ann", "Bob", "Cem"], colors, scores: [4, 4, 2], onPlayAgain, onNewGame }) as Node;
    expect(text(tree)).toContain("whoTie");
    expect(text(tree)).not.toContain("wins");
  });

  it("plays again or goes back to the setup", () => {
    const tree = WhoEnd({ names: ["Ann", "Bob"], colors, scores: [1, 0], onPlayAgain, onNewGame }) as Node;
    click(button(tree, "whoPlayAgain"));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    click(button(tree, "whoNewGame"));
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });
});
