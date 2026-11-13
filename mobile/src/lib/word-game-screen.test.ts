import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { defaultWordSetup, teamColor, type WordSetup } from "@ptracker/shared/word-game";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  index: 0,
}));
const storage = vi.hoisted(() => ({
  getStoredWordSetup: vi.fn(),
  setStoredWordSetup: vi.fn(async (_setup: unknown) => undefined),
  getStoredSeen: vi.fn(),
  setStoredSeen: vi.fn(async (_lang: unknown, _seen: unknown) => undefined),
}));
const entry = vi.hoisted(() => ({ pinReady: true }));

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
    useReducer: (reducer: (s: unknown, a: unknown) => unknown, arg: unknown, init?: (a: unknown) => unknown) => {
      const i = hooks.index++;
      if (!(i in hooks.states)) hooks.states[i] = init ? init(arg) : arg;
      const dispatch = (action: unknown) => {
        hooks.states[i] = reducer(hooks.states[i], action);
      };
      return [hooks.states[i], dispatch];
    },
    useCallback: (fn: unknown) => fn,
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
  };
});
vi.mock("react-native", () => ({ ActivityIndicator: () => null }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ptracker/shared/i18n")>()),
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wordTeamDefault" ? "Team {n}" : String(key)),
    }),
    lang: "tr",
  }),
}));
vi.mock("@ptracker/shared/word-game-words", async () => {
  const { WORD_CATEGORIES } = await import("@ptracker/shared/word-game-words/types");
  const animals = (lang: string) =>
    Array.from({ length: 60 }, (_, i) => ({
      id: `animals-${i + 1}`,
      word: `${lang} ${i + 1}`,
      forbidden: ["a", "b", "c", "d"],
      level: "easy",
    }));
  const list = (lang: string) => Object.fromEntries(WORD_CATEGORIES.map((c) => [c, c === "animals" ? animals(lang) : []]));
  return { WORD_GAME_WORDS: { tr: list("tr"), en: list("en") } };
});
vi.mock("@/components/games/game-mode-entry", () => ({
  GamesPinSetup: () => null,
  useEnterGameModeOnce: () => entry.pinReady,
}));
vi.mock("@/components/games/game-screen", () => ({ GameScreen: () => null }));
vi.mock("@/components/games/word/word-setup", () => ({ WordSetupWizard: () => null }));
vi.mock("@/components/games/word/word-handoff", () => ({ WordHandoff: () => null }));
vi.mock("@/components/games/word/word-turn", () => ({ WordTurn: () => null }));
vi.mock("@/components/games/word/word-summary", () => ({ WordSummary: () => null }));
vi.mock("@/components/games/word/word-end", () => ({ WordEnd: () => null }));
vi.mock("@/lib/word-game-storage", () => storage);

import { ActivityIndicator } from "react-native";
import WordScreen from "@/app/games/word";
import { GamesPinSetup } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { WordEnd } from "@/components/games/word/word-end";
import { WordHandoff } from "@/components/games/word/word-handoff";
import { WordSetupWizard } from "@/components/games/word/word-setup";
import { WordSummary } from "@/components/games/word/word-summary";
import { WordTurn } from "@/components/games/word/word-turn";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const valid: WordSetup = {
  ...defaultWordSetup(["Red", "Blue"]),
  teams: [
    { name: "Red", players: ["Ann", "Bob"] },
    { name: "Blue", players: ["Cem", "Dan"] },
  ],
};

let clock: number;

function render(): Node {
  hooks.index = 0;
  hooks.effects = [];
  return WordScreen() as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

const find = (type: unknown) => nodes(render()).find((n) => n.type === type);
const propsOf = (type: unknown) => find(type)!.props;
const call = (type: unknown, handler: string, ...args: unknown[]) =>
  (propsOf(type)[handler] as (...a: unknown[]) => void)(...args);

async function runEffects() {
  for (const effect of hooks.effects) effect();
  await Promise.resolve();
  await Promise.resolve();
}

async function open() {
  render();
  await runEffects();
}

async function start() {
  await open();
  call(WordSetupWizard, "onStart");
}

beforeEach(() => {
  hooks.states = [];
  vi.clearAllMocks();
  entry.pinReady = true;
  storage.getStoredWordSetup.mockResolvedValue(valid);
  storage.getStoredSeen.mockResolvedValue([]);
  clock = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
  vi.spyOn(Math, "random").mockReturnValue(0.999999);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WordScreen", () => {
  it("asks for a PIN first when none is set", () => {
    entry.pinReady = false;
    expect(propsOf(GamesPinSetup).title).toBe("wordTitle");
    expect(find(WordSetupWizard)).toBeUndefined();
  });

  it("waits for the saved setup and the seen list before showing the wizard", async () => {
    expect(find(ActivityIndicator)).toBeDefined();
    expect(find(WordSetupWizard)).toBeUndefined();
    await open();
    expect(storage.getStoredWordSetup).toHaveBeenCalledWith(["Team 1", "Team 2"]);
    expect(storage.getStoredSeen).toHaveBeenCalledWith("tr");
    expect(propsOf(WordSetupWizard)).toMatchObject({ value: valid, quickStart: true, step: 0 });
    expect(propsOf(GameScreen)).toMatchObject({ title: "wordTitle", tone: "game", color: undefined });
  });

  it("saves the setup and hands the phone to team 1 on its colour", async () => {
    await start();
    expect(storage.setStoredWordSetup).toHaveBeenCalledWith(valid);
    expect(propsOf(WordHandoff)).toMatchObject({ describer: "Ann", teamName: "Red", scores: [0, 0] });
    expect(propsOf(GameScreen).color).toBe(teamColor(0));
  });

  it("deals no word this device has seen and plays the turn without scrolling", async () => {
    storage.getStoredSeen.mockResolvedValue(["animals-1", "animals-2"]);
    await start();
    call(WordHandoff, "onBegin");
    expect((propsOf(WordTurn).card as { id: string }).id).toBe("animals-3");
    expect(propsOf(WordTurn).teamName).toBe("Red");
    expect(propsOf(GameScreen)).toMatchObject({ color: teamColor(0), scroll: false });
  });

  it("saves the seen list when the turn ends and shows the summary on the dark screen", async () => {
    await start();
    call(WordHandoff, "onBegin");
    call(WordTurn, "onAnswer", "correct");
    clock = propsOf(WordTurn).endsAt as number;
    call(WordTurn, "onTimeUp");
    render();
    await runEffects();
    expect(storage.setStoredSeen).toHaveBeenCalledWith("tr", ["animals-1", "animals-2"]);
    expect(propsOf(WordSummary)).toMatchObject({ scores: [1, 0], outOfWords: false });
    expect(propsOf(GameScreen)).toMatchObject({ color: undefined, scroll: true });
    call(WordSummary, "onNext");
    expect(propsOf(WordHandoff)).toMatchObject({ describer: "Cem", teamName: "Blue" });
    expect(propsOf(GameScreen).color).toBe(teamColor(1));
  });

  it("deals a New game after a finished one without the words that game showed", async () => {
    // The seen list is read once per language, as the real effect only runs again when it changes.
    storage.getStoredSeen.mockResolvedValueOnce([]).mockReturnValue(new Promise(() => {}));
    await start();
    call(WordHandoff, "onBegin");
    call(WordTurn, "onAnswer", "correct");
    clock = propsOf(WordTurn).endsAt as number;
    call(WordTurn, "onTimeUp");
    render();
    await runEffects();
    call(WordSummary, "onEnd");
    render();
    await runEffects();
    call(WordEnd, "onNewGame");
    render();
    await runEffects();
    call(WordSetupWizard, "onStart");
    call(WordHandoff, "onBegin");
    expect((propsOf(WordTurn).card as { id: string }).id).toBe("animals-3");
  });

  it("plays again from the end screen, and New game goes back to the first step with the played setup", async () => {
    await start();
    call(WordHandoff, "onEnd");
    expect(propsOf(WordEnd)).toMatchObject({ scores: [0, 0] });
    call(WordEnd, "onPlayAgain");
    expect(propsOf(WordHandoff)).toMatchObject({ describer: "Ann" });
    call(WordHandoff, "onEnd");
    call(WordEnd, "onNewGame");
    expect(propsOf(WordSetupWizard)).toMatchObject({ value: valid, step: 0, quickStart: true });
  });

  it("offers no quick start when the saved setup is not a valid one", async () => {
    const invalid: WordSetup = { ...valid, teams: [{ name: "Red", players: ["Ann"] }, valid.teams[1]] };
    storage.getStoredWordSetup.mockResolvedValue(invalid);
    await open();
    expect(propsOf(WordSetupWizard)).toMatchObject({ value: invalid, quickStart: false });
  });

  it("offers no quick start on a first visit with no saved setup", async () => {
    const fresh = defaultWordSetup(["Team 1", "Team 2"]);
    storage.getStoredWordSetup.mockResolvedValue(fresh);
    await open();
    expect(propsOf(WordSetupWizard)).toMatchObject({ value: fresh, quickStart: false });
  });
});
