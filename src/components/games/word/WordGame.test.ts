import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement, useEffect } from "react";
import {
  WORD_SETUP_STORAGE_KEY,
  defaultWordSetup,
  teamColor,
  type TurnResult,
  type WordCard,
  type WordResult,
  type WordSetup,
} from "@/lib/word-game";

const state = vi.hoisted(() => ({
  shown: "",
  frameColor: undefined as string | undefined,
  turnMounts: 0,
  form: null as null | {
    value: WordSetup;
    onChange: (v: WordSetup) => void;
    onStart: () => void;
    step: number;
    onStep: (step: number) => void;
    quickStart: boolean;
  },
  handoff: null as null | { describer: string; teamName: string; scores: number[]; onBegin: () => void; onEnd: () => void },
  turn: null as null | {
    card: WordCard;
    endsAt: number;
    passesLeft: number | null;
    onAnswer: (result: WordResult) => void;
    onTimeUp: () => void;
  },
  summary: null as null | { team: number; results: TurnResult[]; scores: number[]; onNext: () => void; onEnd: () => void },
  end: null as null | { scores: number[]; outOfWords: boolean; onPlayAgain: () => void; onNewGame: () => void },
}));

vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wordTeamDefault" ? "Team {n}" : String(key)),
    }),
    lang: "tr",
  }),
}));
vi.mock("@/lib/word-game-words", async () => {
  const { WORD_CATEGORIES } = await import("../../../../shared/word-game-words/types");
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
vi.mock("../GameFrame", () => ({
  default: (props: { color?: string; children?: unknown }) => {
    state.frameColor = props.color;
    return props.children;
  },
}));
vi.mock("./WordSetupWizard", () => ({
  default: (props: NonNullable<typeof state.form>) => {
    state.shown = "setup";
    state.form = props;
    return null;
  },
}));
vi.mock("./WordHandoff", () => ({
  default: (props: NonNullable<typeof state.handoff>) => {
    state.shown = "handoff";
    state.handoff = props;
    return null;
  },
}));
vi.mock("./WordTurn", () => ({
  default: function WordTurn(props: NonNullable<typeof state.turn>) {
    useEffect(() => {
      state.turnMounts++;
    }, []);
    state.shown = "turn";
    state.turn = props;
    return null;
  },
}));
vi.mock("./WordSummary", () => ({
  default: (props: NonNullable<typeof state.summary>) => {
    state.shown = "summary";
    state.summary = props;
    return null;
  },
}));
vi.mock("./WordEnd", () => ({
  default: (props: NonNullable<typeof state.end>) => {
    state.shown = "end";
    state.end = props;
    return null;
  },
}));

import WordGame from "./WordGame";

interface Root {
  render(node: unknown): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as {
  createRoot: (container: unknown) => Root;
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let store: Map<string, string>;
let clock: number;

function container() {
  const listeners = { addEventListener: () => undefined, removeEventListener: () => undefined };
  return { nodeType: 1, nodeName: "DIV", tagName: "DIV", ownerDocument: { nodeType: 9, ...listeners }, ...listeners };
}

async function render() {
  root = createRoot(container());
  await act(async () => root?.render(createElement(WordGame)));
}

const valid: WordSetup = {
  ...defaultWordSetup(["Red", "Blue"]),
  teams: [
    { name: "Red", players: ["Ann", "Bob"] },
    { name: "Blue", players: ["Cem", "Dan"] },
  ],
};

async function start(setup: WordSetup = valid) {
  await render();
  await act(async () => state.form!.onChange(setup));
  await act(async () => state.form!.onStart());
}

async function timeUp() {
  clock = state.turn!.endsAt;
  await act(async () => state.turn!.onTimeUp());
}

beforeEach(() => {
  state.shown = "";
  state.frameColor = undefined;
  state.turnMounts = 0;
  state.form = null;
  state.handoff = null;
  state.turn = null;
  state.summary = null;
  state.end = null;
  store = new Map();
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  });
  clock = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
  vi.spyOn(Math, "random").mockReturnValue(0.999999);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WordGame setup", () => {
  it("opens the wizard with the translated team names on a first visit", async () => {
    await render();
    expect(state.form?.value).toEqual(defaultWordSetup(["Team 1", "Team 2"]));
    expect(state.form?.quickStart).toBe(false);
  });

  it("offers the last settings when a valid setup was saved", async () => {
    store.set(WORD_SETUP_STORAGE_KEY, JSON.stringify(valid));
    await render();
    expect(state.form?.value).toEqual(valid);
    expect(state.form?.quickStart).toBe(true);
  });

  it("still opens and starts when storage fails", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    });
    await start();
    expect(state.shown).toBe("handoff");
  });
});

describe("WordGame turns", () => {
  it("saves the setup and hands the phone to team 1's first player on team 1's colour", async () => {
    await start();
    expect(store.get(WORD_SETUP_STORAGE_KEY)).toBe(JSON.stringify(valid));
    expect(state.shown).toBe("handoff");
    expect(state.handoff).toMatchObject({ describer: "Ann", teamName: "Red", scores: [0, 0] });
    expect(state.frameColor).toBe(teamColor(0));
  });

  it("plays a turn in the app language and shows the next word after each answer", async () => {
    await start();
    await act(async () => state.handoff!.onBegin());
    expect(state.shown).toBe("turn");
    expect(state.turn?.card.word).toBe("tr 1");
    expect(state.turn).toMatchObject({ teamName: "Red" });
    expect(state.frameColor).toBe(teamColor(0));
    await act(async () => state.turn!.onAnswer("correct"));
    await act(async () => state.turn!.onAnswer("pass"));
    expect(state.turn?.card.word).toBe("tr 3");
    expect(state.turn?.passesLeft).toBe(2);
  });

  it("shows the summary on the dark frame at time up and saves the words shown", async () => {
    await start();
    await act(async () => state.handoff!.onBegin());
    await act(async () => state.turn!.onAnswer("correct"));
    await timeUp();
    expect(state.shown).toBe("summary");
    expect(state.frameColor).toBeUndefined();
    expect(state.summary?.results.map((r) => r.result)).toEqual(["correct"]);
    expect(state.summary?.scores).toEqual([1, 0]);
    expect(JSON.parse(store.get("word_game_seen_tr")!)).toEqual(["animals-1", "animals-2"]);
  });

  it("hands the phone to team 2 after the summary and mounts a fresh turn", async () => {
    await start();
    await act(async () => state.handoff!.onBegin());
    await timeUp();
    await act(async () => state.summary!.onNext());
    expect(state.handoff).toMatchObject({ describer: "Cem", teamName: "Blue" });
    expect(state.frameColor).toBe(teamColor(1));
    await act(async () => state.handoff!.onBegin());
    expect(state.turnMounts).toBe(2);
  });

  it("does not deal the words this device has already seen", async () => {
    store.set("word_game_seen_tr", JSON.stringify(["animals-1", "animals-2"]));
    await start();
    await act(async () => state.handoff!.onBegin());
    expect(state.turn?.card.id).toBe("animals-3");
  });
});

describe("WordGame end", () => {
  it("ends the game from the hand-over and plays again with the same teams", async () => {
    await start();
    await act(async () => state.handoff!.onEnd());
    expect(state.shown).toBe("end");
    expect(state.end?.scores).toEqual([0, 0]);
    await act(async () => state.end!.onPlayAgain());
    expect(state.shown).toBe("handoff");
    expect(state.handoff?.describer).toBe("Ann");
  });

  it("goes back to the first setup step with the played settings on New game, with quick start on", async () => {
    await render();
    await act(async () => state.form!.onStep(2));
    await act(async () =>
      state.form!.onChange({ ...valid, teams: [{ name: " Red", players: ["Ann ", "Bob"] }, valid.teams[1]] })
    );
    await act(async () => state.form!.onStart());
    await act(async () => state.handoff!.onEnd());
    await act(async () => state.end!.onNewGame());
    expect(state.shown).toBe("setup");
    expect(state.form?.value).toEqual(valid);
    expect(state.form?.step).toBe(0);
    expect(state.form?.quickStart).toBe(true);
  });
});
