import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { SCALE_REVEAL_LOCK_MS, SCALE_SETUP_STORAGE_KEY, defaultScaleSetup, teamColor, type ScaleSetup } from "@/lib/scale-game";

type Props = Record<string, unknown>;

const ui = vi.hoisted(() => ({
  screen: "",
  frameColor: undefined as string | undefined,
  lang: "en" as "en" | "tr",
  props: {} as Record<string, Props | undefined>,
}));
// A mocked screen records that it is showing and the props it got.
const screen = vi.hoisted(() => (name: string) => (props: Props) => {
  ui.screen = name;
  ui.props[name] = props;
  return null;
});
const pairs = vi.hoisted(() => {
  const list = (lang: string) =>
    Array.from({ length: 3 }, (_, i) => ({ id: `${lang}-${i + 1}`, left: `${lang} left ${i + 1}`, right: `${lang} right ${i + 1}` }));
  return { SCALE_PAIRS: { en: list("en"), tr: list("tr") } };
});

vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  useLang: () => ({
    t: new Proxy({}, { get: (_, key) => (key === "wordTeamDefault" ? (ui.lang === "tr" ? "Takım {n}" : "Team {n}") : String(key)) }),
    lang: ui.lang,
  }),
}));
vi.mock("@/lib/scale-pairs", () => pairs);
vi.mock("../GameFrame", () => ({
  default: (props: { color?: string; children?: unknown }) => {
    ui.frameColor = props.color;
    return props.children;
  },
}));
vi.mock("./ScaleSetupWizard", () => ({ default: screen("form") }));
vi.mock("./ScaleHandoff", () => ({ default: screen("handoff") }));
vi.mock("./ScaleSecret", () => ({ default: screen("secret") }));
vi.mock("./ScaleGuess", () => ({ default: screen("guess") }));
vi.mock("./ScaleReveal", () => ({ default: screen("reveal") }));
vi.mock("./ScaleEnd", () => ({ default: screen("end") }));

import ScaleGame from "./ScaleGame";

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
  await act(async () => root?.render(createElement(ScaleGame)));
}

/** Switches the app language, as the page header's flag does. */
async function switchLang(lang: "en" | "tr") {
  ui.lang = lang;
  await act(async () => root?.render(createElement(ScaleGame)));
}

/** Moves the clock on, then taps. */
async function call(fn: () => void, wait = 1000) {
  clock += wait;
  await act(async () => fn());
}

const DEFAULT = defaultScaleSetup(["Team 1", "Team 2"]);
const valid: ScaleSetup = {
  teams: [
    { name: "Red", players: ["Ann", "Bob"] },
    { name: "Blue", players: ["Cem", "Dan"] },
  ],
  turns: 4,
};

/** Fills the setup and presses Start on the wizard's last step. */
async function start(setup: ScaleSetup = valid) {
  await render();
  await call(() => p("form").onChange(setup));
  await call(() => p("form").onStep(1));
  await call(() => p("form").onStart());
}

/** Plays a turn up to its reveal with the needle on `needle`. */
async function turn(needle = 50) {
  await call(() => p("handoff").onShow());
  await call(() => p("secret").onHide());
  await call(() => p("guess").onMove(needle));
  await call(() => p("guess").onLock());
  await call(() => p("guess").onLock());
}

beforeEach(() => {
  ui.screen = "";
  ui.frameColor = undefined;
  ui.lang = "en";
  ui.props = {};
  store = new Map();
  vi.stubGlobal("window", { HTMLIFrameElement: class {} });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  });
  clock = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ScaleGame setup", () => {
  it("opens the wizard with the defaults and no quick start", async () => {
    await render();
    expect(ui.screen).toBe("form");
    expect(p("form")).toMatchObject({ value: DEFAULT, step: 0, quickStart: false });
    expect(ui.frameColor).toBeUndefined();
  });

  it("moves the default team names to the language the page switches to, keeping typed ones", async () => {
    await render();
    await switchLang("tr");
    expect(p("form").value).toEqual(defaultScaleSetup(["Takım 1", "Takım 2"]));
    await call(() => p("form").onChange({ ...p("form").value, teams: [{ name: "Reds", players: [] }, p("form").value.teams[1]] }));
    await switchLang("en");
    expect(p("form").value.teams.map((team: { name: string }) => team.name)).toEqual(["Reds", "Team 2"]);
  });

  it("restores the last setup, keeps it in any language and offers to start with it", async () => {
    store.set(SCALE_SETUP_STORAGE_KEY, JSON.stringify(valid));
    await render();
    expect(p("form").value).toEqual(valid);
    expect(p("form").quickStart).toBe(true);
    await switchLang("tr");
    expect(p("form").value).toEqual(valid);
  });

  it("offers no quick start when the saved setup is not valid", async () => {
    store.set(SCALE_SETUP_STORAGE_KEY, JSON.stringify({ ...valid, teams: [valid.teams[0], { name: "Blue", players: ["Cem"] }] }));
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
    await call(() => p("form").onStep(1));
    expect(p("form").step).toBe(1);
  });

  it("saves the setup on Start and hands the phone to the first team's first player on its colour", async () => {
    await start();
    expect(store.get(SCALE_SETUP_STORAGE_KEY)).toBe(JSON.stringify(valid));
    expect(ui.screen).toBe("handoff");
    expect(p("handoff")).toMatchObject({ team: "Red", giver: "Ann", turn: 1, turns: 4, teams: valid.teams, scores: [0, 0] });
    expect(ui.frameColor).toBe(teamColor(0));
  });

  it("saves nothing and stays on the step when Start is refused", async () => {
    await render();
    await call(() => p("form").onStep(1));
    await call(() => p("form").onChange({ ...valid, turns: 5 }));
    await call(() => p("form").onStart());
    expect(ui.screen).toBe("form");
    expect(store.has(SCALE_SETUP_STORAGE_KEY)).toBe(false);
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

});

describe("ScaleGame turn", () => {
  it("shows a pair of the game's language and a target to the clue giver", async () => {
    await start();
    await call(() => p("handoff").onShow());
    expect(ui.screen).toBe("secret");
    expect(p("secret").pair.id).toMatch(/^en-/);
    expect(p("secret").target).toBe(50);
    expect(ui.frameColor).toBeUndefined();
  });

  it("deals the pairs of the language the game started in", async () => {
    await render();
    await switchLang("tr");
    await call(() => p("form").onChange(valid));
    await call(() => p("form").onStep(1));
    await call(() => p("form").onStart());
    await call(() => p("handoff").onShow());
    expect(p("secret").pair.id).toMatch(/^tr-/);
  });

  it("lets the team move the needle and lock it in with a second tap", async () => {
    await start();
    await call(() => p("handoff").onShow());
    await call(() => p("secret").onHide());
    expect(ui.screen).toBe("guess");
    expect(p("guess")).toMatchObject({ team: "Red", color: teamColor(0), needle: 50, confirming: false });
    expect(p("guess")).not.toHaveProperty("target");
    expect(p("guess").pair).toEqual(p("secret").pair);
    await call(() => p("guess").onMove(61));
    expect(p("guess").needle).toBe(61);
    await call(() => p("guess").onLock());
    expect(p("guess").confirming).toBe(true);
    await call(() => p("guess").onLock());
    expect(ui.screen).toBe("reveal");
    expect(p("reveal")).toMatchObject({ target: 50, needle: 61, team: "Red", color: teamColor(0), scores: [2, 0], revealedAt: clock });
  });

  it("opens Next 1 s after the needle is locked and hands the phone to the other team", async () => {
    await start();
    await turn();
    await call(() => p("reveal").onNext(), SCALE_REVEAL_LOCK_MS - 1);
    expect(ui.screen).toBe("reveal");
    await call(() => p("reveal").onNext(), 1);
    expect(ui.screen).toBe("handoff");
    expect(p("handoff")).toMatchObject({ team: "Blue", giver: "Cem", turn: 1, scores: [4, 0] });
    expect(ui.frameColor).toBe(teamColor(1));
  });
});

describe("ScaleGame end", () => {
  const three: ScaleSetup = { ...valid, teams: [{ name: "Team 1", players: ["Ann", "Bob", "Eda"] }, valid.teams[1]] };

  async function playToEnd() {
    await start(three);
    for (let i = 0; i < 8; i++) {
      await turn(i % 2 === 0 ? 50 : 80);
      await call(() => p("reveal").onNext());
    }
  }

  it("ends after every team's turns with the scores", async () => {
    await playToEnd();
    expect(ui.screen).toBe("end");
    expect(p("end")).toMatchObject({ teams: three.teams, scores: [16, 0] });
    expect(ui.frameColor).toBeUndefined();
  });

  it("plays again with the same teams, the clue givers moving on", async () => {
    await playToEnd();
    await call(() => p("end").onPlayAgain());
    expect(ui.screen).toBe("handoff");
    expect(p("handoff")).toMatchObject({ team: "Team 1", giver: "Bob", turn: 1, scores: [0, 0] });
  });

  it("goes back to the setup with the last game's settings on New game, no longer following the language", async () => {
    await playToEnd();
    await call(() => p("end").onNewGame());
    expect(ui.screen).toBe("form");
    expect(p("form").value).toEqual(three);
    expect(p("form").step).toBe(0);
    await switchLang("tr");
    expect(p("form").value).toEqual(three);
  });
});
