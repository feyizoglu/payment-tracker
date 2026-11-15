import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { CLUE_SETUP_STORAGE_KEY, clueSeenKey, defaultClueSetup, playerColor, type ClueSetup } from "@/lib/clue-game";

type Props = Record<string, unknown>;

const ui = vi.hoisted(() => ({
  screen: "",
  frameColor: undefined as string | undefined,
  lang: "en" as "en" | "tr",
  props: {} as Record<string, Props | undefined>,
  /** Every screen shown, in order, with its props and the frame's colour. */
  log: [] as { screen: string; props: Props; color: string | undefined }[],
  writeMounts: 0,
}));
// A mocked screen records that it is showing and the props it got.
const screen = vi.hoisted(() => (name: string) => (props: Props) => {
  ui.screen = name;
  ui.props[name] = props;
  ui.log.push({ screen: name, props, color: ui.frameColor });
  return null;
});
// 20 animals per language, plus an idiom that must never be dealt.
const words = vi.hoisted(() => {
  const categories = ["animals", "food", "jobs", "places", "objects", "sports", "home", "nature", "body", "transport", "arts", "actions", "idioms"];
  const list = (prefix: string) =>
    Object.fromEntries(
      categories.map((c) => [
        c,
        c === "animals"
          ? Array.from({ length: 20 }, (_, i) => ({
              id: `animals-${i + 1}`,
              word: `${prefix}${String.fromCharCode(65 + i)}`,
              level: i < 10 ? "easy" : "hard",
              forbidden: ["a", "b", "c", "d"],
            }))
          : c === "idioms"
            ? [{ id: "idioms-1", word: "Piece of cake", level: "easy", forbidden: ["a", "b", "c", "d"] }]
            : [],
      ])
    );
  return { WORD_GAME_WORDS: { en: list("Zebra"), tr: list("Zürafa") } };
});

vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => {
        const templates: Record<string, string> = { clueCheckHint: "{name}, don't look", clueGuessGate: "give it to {name}" };
        return templates[String(key)] ?? String(key);
      },
    }),
    lang: ui.lang,
  }),
}));
vi.mock("@/lib/word-game-words", () => words);
vi.mock("../GameFrame", () => ({
  default: (props: { color?: string; children?: unknown }) => {
    ui.frameColor = props.color;
    return props.children;
  },
}));
vi.mock("./ClueSetupWizard", () => ({ default: screen("form") }));
vi.mock("./ClueHandoff", () => ({ default: screen("handoff") }));
vi.mock("./ClueWrite", async () => {
  const { useState } = await import("react");
  const record = screen("write");
  return {
    default: function ClueWrite(props: Props) {
      useState(() => ++ui.writeMounts);
      return record(props);
    },
  };
});
vi.mock("./ClueGate", () => ({ default: screen("gate") }));
vi.mock("./ClueCheck", () => ({ default: screen("check") }));
vi.mock("./ClueGuess", () => ({ default: screen("guess") }));
vi.mock("./ClueResult", () => ({ default: screen("result") }));
vi.mock("./ClueEnd", () => ({ default: screen("end") }));

import ClueGame from "./ClueGame";

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

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = (name: string) => ui.props[name] as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

async function render() {
  root = createRoot(container());
  await act(async () => root?.render(createElement(ClueGame)));
}

/** Moves the clock on, then taps. */
async function call(fn: () => void, wait = 1000) {
  clock += wait;
  await act(async () => fn());
}

const valid: ClueSetup = { players: ["Ann", "Bob", "Cem"], deckSize: 8, level: "mixed" };

/** Fills the setup and presses Start on the wizard's last step. */
async function start(setup: ClueSetup = valid) {
  await render();
  await call(() => p("form").onChange(setup));
  await call(() => p("form").onStep(1));
  await call(() => p("form").onStart());
}

/** Plays the round on screen from its handoff to its result. */
async function round(clues: string[], outcome: "got" | "missed" | "passed" = "got") {
  await call(() => p("handoff").onBegin());
  for (const clue of clues) {
    await call(() => p("write").onReveal());
    await call(() => p("write").onSubmit(clue));
  }
  await call(() => p("gate").onReveal());
  await call(() => p("check").onDone());
  await call(() => p("gate").onReveal());
  await call(() => p("guess").onAnswer(outcome));
}

beforeEach(() => {
  ui.screen = "";
  ui.frameColor = undefined;
  ui.lang = "en";
  ui.props = {};
  ui.log = [];
  ui.writeMounts = 0;
  store = new Map();
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  });
  clock = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ClueGame setup", () => {
  it("opens the wizard with the defaults and no quick start", async () => {
    await render();
    expect(ui.screen).toBe("form");
    expect(p("form").value).toEqual(defaultClueSetup());
    expect(p("form").quickStart).toBe(false);
    expect(ui.frameColor).toBeUndefined();
  });

  it("restores the last setup and offers to start with it", async () => {
    store.set(CLUE_SETUP_STORAGE_KEY, JSON.stringify(valid));
    await render();
    expect(p("form").value).toEqual(valid);
    expect(p("form").quickStart).toBe(true);
  });

  it("offers no quick start for a saved setup that cannot start", async () => {
    store.set(CLUE_SETUP_STORAGE_KEY, JSON.stringify({ ...valid, players: ["Ann", "Bob"] }));
    await render();
    expect(p("form").quickStart).toBe(false);
  });

  it("opens even when storage cannot be read", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
    });
    await render();
    expect(p("form").value).toEqual(defaultClueSetup());
  });

  it("saves the setup on Start and names the first guesser on their colour", async () => {
    await start();
    expect(store.get(CLUE_SETUP_STORAGE_KEY)).toBe(JSON.stringify(valid));
    expect(ui.screen).toBe("handoff");
    expect(p("handoff")).toMatchObject({ guesser: "Ann", next: "Bob", round: 1, total: 8, score: 0 });
    expect(ui.frameColor).toBe(playerColor(0));
    expect(p("form").step).toBe(1);
  });

  it("saves nothing and stays on the step when Start is refused", async () => {
    await start({ ...valid, players: ["Ann", "Bob"] });
    expect(ui.screen).toBe("form");
    expect(store.has(CLUE_SETUP_STORAGE_KEY)).toBe(false);
    expect(p("form")).toMatchObject({ step: 1, quickStart: false });
  });

  it("starts even when storage cannot be written", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    });
    await start();
    expect(ui.screen).toBe("handoff");
  });

  it("deals the app language's words, without idioms, and the seen words last", async () => {
    ui.lang = "tr";
    store.set(clueSeenKey("tr"), JSON.stringify(["animals-2"]));
    await start();
    await call(() => p("handoff").onBegin());
    expect(p("write").word.startsWith("Zürafa")).toBe(true);
    expect(p("write").word).not.toBe("ZürafaB");
  });
});

describe("ClueGame round", () => {
  it("passes the phone to each clue giver in turn, on their colour, the word behind their own tap", async () => {
    await start();
    await call(() => p("handoff").onBegin());
    expect(ui.screen).toBe("write");
    expect(p("write")).toMatchObject({ giver: "Bob", revealed: false });
    expect(ui.frameColor).toBe(playerColor(1));
    await call(() => p("write").onReveal());
    expect(p("write").revealed).toBe(true);
    const mounts = ui.writeMounts;
    await call(() => p("write").onSubmit("Night"));
    expect(p("write")).toMatchObject({ giver: "Cem", revealed: false });
    expect(ui.frameColor).toBe(playerColor(2));
    expect(ui.writeMounts).toBe(mounts + 1);
  });

  it("ignores a second tap on Show the word right after Done", async () => {
    await start();
    await call(() => p("handoff").onBegin());
    await call(() => p("write").onReveal());
    await call(() => p("write").onSubmit("Night"));
    await call(() => p("write").onReveal(), 100);
    expect(p("write")).toMatchObject({ giver: "Cem", revealed: false });
  });

  it("checks the clues with the givers behind a gate, then hands them to the guesser behind another", async () => {
    await start();
    await call(() => p("handoff").onBegin());
    const word = p("write").word;
    for (const clue of ["Night", "night"]) {
      await call(() => p("write").onReveal());
      await call(() => p("write").onSubmit(clue));
    }
    expect(ui.screen).toBe("gate");
    expect(p("gate")).toMatchObject({ title: "clueCheckTitle", hint: "Ann, don't look", label: "clueShowClues" });
    expect(p("gate").onColor).toBeFalsy();
    expect(ui.frameColor).toBeUndefined();
    await call(() => p("gate").onReveal());
    expect(ui.screen).toBe("check");
    expect(p("check")).toMatchObject({ word, guesser: "Ann" });
    expect(p("check").clues.map((c: { struck: boolean }) => c.struck)).toEqual([true, true]);
    await call(() => p("check").onStrike(0));
    expect(p("check").clues.map((c: { struck: boolean }) => c.struck)).toEqual([false, true]);
    await call(() => p("check").onDone());
    expect(ui.screen).toBe("gate");
    expect(p("gate")).toMatchObject({ title: "give it to Ann", onColor: true });
    expect(ui.frameColor).toBe(playerColor(0));
    await call(() => p("gate").onReveal());
    expect(ui.screen).toBe("guess");
    expect(p("guess")).toEqual({ guesser: "Ann", clues: ["Night"], onAnswer: expect.any(Function) });
  });

  it("never gives the word to a screen the guesser sees before the result", async () => {
    await start();
    await round(["Night", "Sky"], "got");
    const word = p("result").result.word.word as string;
    const shown = ui.log.slice(0, ui.log.findIndex((e) => e.screen === "result"));
    const guesserSees = shown.filter(
      (e) => e.screen === "handoff" || e.screen === "guess" || (e.screen === "gate" && e.color === playerColor(0))
    );
    expect(guesserSees.map((e) => e.screen)).toEqual(expect.arrayContaining(["handoff", "gate", "guess"]));
    for (const e of guesserSees) expect(JSON.stringify(e.props)).not.toContain(word);
    for (const e of shown.filter((x) => x.screen === "gate")) expect(JSON.stringify(e.props)).not.toContain(word);
  });

  it("shows the result to everyone, saves the seen word and goes on to the next guesser", async () => {
    await start();
    await round(["Night", "Sky"], "got");
    expect(ui.screen).toBe("result");
    expect(ui.frameColor).toBeUndefined();
    const result = p("result");
    expect(result).toMatchObject({ round: 1, total: 8, score: 1 });
    expect(result.result).toMatchObject({ guesser: "Ann", outcome: "got" });
    expect(JSON.parse(store.get(clueSeenKey("en"))!)).toEqual([result.result.word.id]);
    await call(() => p("result").onNext());
    expect(p("handoff")).toMatchObject({ guesser: "Bob", next: "Cem", round: 2, score: 1 });
    expect(ui.frameColor).toBe(playerColor(1));
  });

  it("ends after the deck, plays again with the rotation carried on, and goes back to the setup on New game", async () => {
    await start({ ...valid, level: "hard" });
    for (let i = 0; i < 8; i++) {
      await round(["Night", "Sky"], i % 2 === 0 ? "got" : "missed");
      await call(() => p("result").onNext());
    }
    expect(ui.screen).toBe("end");
    expect(p("end").results).toHaveLength(8);
    expect(JSON.parse(store.get(clueSeenKey("en"))!)).toHaveLength(8);
    await call(() => p("end").onPlayAgain());
    expect(p("handoff")).toMatchObject({ guesser: "Cem", next: "Ann", round: 1, score: 0 });
    for (let i = 0; i < 8; i++) {
      await round(["Night", "Sky"], "passed");
      await call(() => p("result").onNext());
    }
    await call(() => p("end").onNewGame());
    expect(ui.screen).toBe("form");
    expect(p("form").value).toEqual({ ...valid, level: "hard" });
    // Start was pressed on the last step: the wizard opens again on the first, with the quick start.
    expect(p("form").step).toBe(0);
    expect(p("form").quickStart).toBe(true);
  });
});
