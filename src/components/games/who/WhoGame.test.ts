import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { WHO_SETUP_STORAGE_KEY, WHO_SUMMARY_LOCK_MS, defaultWhoSetup, playerColor, teamColor, type WhoSetup } from "@/lib/who-game";

type Props = Record<string, unknown>;

const ui = vi.hoisted(() => ({
  screen: "",
  frameColor: undefined as string | undefined,
  frameCover: undefined as boolean | undefined,
  props: {} as Record<string, Props | undefined>,
}));
// A mocked screen records that it is showing and the props it got.
const screen = vi.hoisted(() => (name: string) => (props: Props) => {
  ui.screen = name;
  ui.props[name] = props;
  return null;
});
// 60 world people and 10 Turkish characters: a default English game (world) has 60 cards,
// characters alone are too few.
const cards = vi.hoisted(() => {
  const card = (id: string, region: "tr" | "world") => ({
    id,
    name: { tr: `TR ${id}`, en: `EN ${id}` },
    hint: { tr: "ipucu", en: "hint" },
    region,
    level: "easy" as const,
  });
  return {
    WHO_PEOPLE: Array.from({ length: 60 }, (_, i) => card(`p-${i + 1}`, "world")),
    WHO_CHARACTERS: Array.from({ length: 10 }, (_, i) => card(`c-${i + 1}`, "tr")),
  };
});

vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => (key === "wordTeamDefault" ? "Team {n}" : String(key)) }), lang: "en" }),
}));
vi.mock("@/lib/who-cards", () => cards);
vi.mock("@/lib/who-things", () => ({
  WHO_THINGS: { en: { animals: [], jobs: [], objects: [] }, tr: { animals: [], jobs: [], objects: [] } },
}));
vi.mock("../GameFrame", () => ({
  default: (props: { color?: string; cover?: boolean; children?: unknown }) => {
    ui.frameColor = props.color;
    ui.frameCover = props.cover;
    return props.children;
  },
}));
vi.mock("./WhoSetupWizard", () => ({ default: screen("form") }));
vi.mock("./WhoHandoff", () => ({ default: screen("handoff") }));
vi.mock("./WhoTurn", () => ({ default: screen("turn") }));
vi.mock("./WhoSummary", () => ({ default: screen("summary") }));
vi.mock("./WhoEnd", () => ({ default: screen("end") }));

import WhoGame from "./WhoGame";

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
  await act(async () => root?.render(createElement(WhoGame)));
}

/** Moves the clock on, then taps. */
async function call(fn: () => void, wait = 1000) {
  clock += wait;
  await act(async () => fn());
}

const DEFAULT = defaultWhoSetup("en", ["Team 1", "Team 2"]);
const valid: WhoSetup = { ...DEFAULT, players: ["Ann", "Bob"], rounds: 1, turnSeconds: 30 };

async function start(setup: WhoSetup = valid) {
  await render();
  await call(() => p("form").onChange(setup));
  await call(() => p("form").onStart());
}

/** Starts a turn, answers, lets the clock run out and waits for the summary to open. */
async function turn(answers: ("got" | "pass")[] = []) {
  await call(() => p("handoff").onStart());
  for (const result of answers) await call(() => p("turn").onAnswer(result));
  await call(() => p("turn").onTick(), 30_000);
  clock += WHO_SUMMARY_LOCK_MS;
}

beforeEach(() => {
  ui.screen = "";
  ui.frameColor = undefined;
  ui.frameCover = undefined;
  ui.props = {};
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

describe("WhoGame setup", () => {
  it("opens the wizard with the English defaults, the size of their pool and no quick start", async () => {
    await render();
    expect(ui.screen).toBe("form");
    expect(p("form").value).toEqual(DEFAULT);
    expect(p("form").poolSize).toBe(60);
    expect(p("form").quickStart).toBe(false);
    expect(ui.frameColor).toBeUndefined();
  });

  it("counts the pool again when the cards change", async () => {
    await render();
    await call(() => p("form").onChange({ ...DEFAULT, kinds: ["characters"], region: "mixed" }));
    expect(p("form").poolSize).toBe(10);
  });

  it("restores the last setup and offers to start with it", async () => {
    store.set(WHO_SETUP_STORAGE_KEY, JSON.stringify(valid));
    await render();
    expect(p("form").value).toEqual(valid);
    expect(p("form").quickStart).toBe(true);
  });

  it("offers no quick start when the saved cards are too few", async () => {
    store.set(WHO_SETUP_STORAGE_KEY, JSON.stringify({ ...valid, kinds: ["characters"] }));
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
    expect(p("form").value).toEqual(DEFAULT);
  });

  it("moves through the wizard's steps", async () => {
    await render();
    await call(() => p("form").onStep(2));
    expect(p("form").step).toBe(2);
  });

  it("saves the setup on Start and names the first guesser on their colour", async () => {
    await start();
    expect(store.get(WHO_SETUP_STORAGE_KEY)).toBe(JSON.stringify(valid));
    expect(ui.screen).toBe("handoff");
    expect(p("handoff")).toMatchObject({ guesser: "Ann", team: null, round: 1, rounds: 1 });
    expect(ui.frameColor).toBe(playerColor(0));
  });

  it("starts even when storage cannot be written", async () => {
    const setItem = vi.fn(() => {
      throw new Error("quota");
    });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem });
    await start();
    expect(ui.screen).toBe("handoff");
  });

  it("names the team and its guesser on the team's colour", async () => {
    await start({
      ...valid,
      mode: "teams",
      teams: [
        { name: "Red", players: ["Ann", "Bob"] },
        { name: "Blue", players: ["Cem", "Dan"] },
      ],
    });
    expect(p("handoff")).toMatchObject({ guesser: "Ann", team: "Red" });
    expect(ui.frameColor).toBe(teamColor(0));
  });
});

describe("WhoGame turn", () => {
  it("shows a card in the game's language with the turn's clock", async () => {
    await start();
    await call(() => p("handoff").onStart());
    expect(ui.screen).toBe("turn");
    expect(p("turn").card.name.startsWith("EN p-")).toBe(true);
    expect(p("turn")).toMatchObject({ turnMs: 30_000, usedMs: 0, runningSince: clock });
    expect(ui.frameColor).toBeUndefined();
  });

  it("covers the page's header links only while the turn runs", async () => {
    await start();
    expect(ui.frameCover).toBeFalsy();
    await call(() => p("handoff").onStart());
    expect(ui.frameCover).toBe(true);
    await call(() => p("turn").onTick(), 30_000);
    expect(ui.screen).toBe("summary");
    expect(ui.frameCover).toBeFalsy();
  });

  it("shows the next card after an answer", async () => {
    await start();
    await call(() => p("handoff").onStart());
    const first = p("turn").card;
    await call(() => p("turn").onAnswer("got"));
    expect(p("turn").card.id).not.toBe(first.id);
  });

  it("ends the turn when the time is up and shows its cards and the scores", async () => {
    await start();
    await call(() => p("handoff").onStart());
    const first = p("turn").card;
    await call(() => p("turn").onAnswer("got"));
    const second = p("turn").card;
    await call(() => p("turn").onTick(), 28_999);
    expect(ui.screen).toBe("turn");
    await call(() => p("turn").onTick(), 1);
    expect(ui.screen).toBe("summary");
    expect(p("summary")).toMatchObject({
      side: 0,
      endedAt: clock,
      names: ["Ann", "Bob"],
      colors: [playerColor(0), playerColor(1)],
      scores: [1, 0],
      results: [
        { card: first, result: "got" },
        { card: second, result: "pass" },
      ],
    });
  });

  it("holds the clock while the page is hidden", async () => {
    await start();
    await call(() => p("handoff").onStart());
    await call(() => p("turn").onPause(), 10_000);
    await call(() => p("turn").onTick(), 60_000);
    expect(ui.screen).toBe("turn");
    await call(() => p("turn").onResume());
    await call(() => p("turn").onTick(), 19_999);
    expect(ui.screen).toBe("turn");
    await call(() => p("turn").onTick(), 1);
    expect(ui.screen).toBe("summary");
  });

  it("remembers the cards shown in this language when a turn ends", async () => {
    await start();
    await turn(["got"]);
    const seen = JSON.parse(store.get("who_seen_en")!);
    expect(seen).toEqual(p("summary").results.map((r: { card: { id: string } }) => r.card.id));
  });

  it("deals the cards this device has not shown yet first", async () => {
    const seen = Array.from({ length: 5 }, (_, i) => `p-${i + 1}`);
    store.set("who_seen_en", JSON.stringify(seen));
    await start();
    await call(() => p("handoff").onStart());
    expect(seen).not.toContain(p("turn").card.id);
  });

  it("flips a card in the summary and counts the score again", async () => {
    await start();
    await turn(["got", "got"]);
    expect(p("summary").scores).toEqual([2, 0]);
    await call(() => p("summary").onFlip(0));
    expect(p("summary").results[0].result).toBe("pass");
    expect(p("summary").scores).toEqual([1, 0]);
  });

  it("ignores the summary's buttons for 1.5 s after the turn ends", async () => {
    await start();
    await call(() => p("handoff").onStart());
    await call(() => p("turn").onTick(), 30_000);
    await call(() => p("summary").onFlip(0), WHO_SUMMARY_LOCK_MS - 1);
    expect(p("summary").results[0].result).toBe("pass");
    await call(() => p("summary").onNext(), 0);
    expect(ui.screen).toBe("summary");
    await call(() => p("summary").onNext(), 1);
    expect(ui.screen).toBe("handoff");
  });

  it("hands the phone to the next player after the summary", async () => {
    await start();
    await turn();
    await call(() => p("summary").onNext());
    expect(ui.screen).toBe("handoff");
    expect(p("handoff").guesser).toBe("Bob");
    expect(ui.frameColor).toBe(playerColor(1));
  });
});

describe("WhoGame end", () => {
  async function playToEnd() {
    await start();
    await turn(["got"]);
    await call(() => p("summary").onNext());
    await turn(["got", "got"]);
    await call(() => p("summary").onNext());
  }

  it("ends after every player's turn with the scores", async () => {
    await playToEnd();
    expect(ui.screen).toBe("end");
    expect(p("end")).toMatchObject({ names: ["Ann", "Bob"], colors: [playerColor(0), playerColor(1)], scores: [1, 2] });
    expect(ui.frameColor).toBeUndefined();
  });

  it("plays again with the same players", async () => {
    await playToEnd();
    await call(() => p("end").onPlayAgain());
    expect(ui.screen).toBe("handoff");
    expect(p("handoff").guesser).toBe("Ann");
  });

  it("goes back to the setup with the last game's settings on New game", async () => {
    await playToEnd();
    await call(() => p("end").onNewGame());
    expect(ui.screen).toBe("form");
    expect(p("form").value).toEqual(valid);
    expect(p("form").step).toBe(0);
  });
});
