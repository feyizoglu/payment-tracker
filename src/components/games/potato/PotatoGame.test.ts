import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import { DEFAULT_SETUP, POTATO_BANG_COLOR, SETUP_STORAGE_KEY, playerColor, type PotatoSetup } from "@/lib/hot-potato";

type Props = Record<string, unknown>;

const ui = vi.hoisted(() => ({
  screen: "",
  frameColor: undefined as string | undefined,
  props: {} as Record<string, Props | undefined>,
}));
// A mocked screen records that it is showing and the props it got.
const screen = vi.hoisted(() => (name: string) => (props: Props) => {
  ui.screen = name;
  ui.props[name] = props;
  return null;
});

vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }), lang: "en" }),
}));
vi.mock("@/lib/hot-potato-prompts", () => ({
  HOT_POTATO_PROMPTS: {
    en: [
      { id: "en-1", text: "Something round" },
      { id: "en-2", text: "Something cold" },
    ],
    tr: [{ id: "tr-1", text: "Yuvarlak bir şey" }],
  },
}));
vi.mock("../GameFrame", () => ({
  default: (props: { color?: string; children?: unknown }) => {
    ui.frameColor = props.color;
    return props.children;
  },
}));
vi.mock("./PotatoSetupWizard", () => ({ default: screen("form") }));
vi.mock("./PotatoReady", () => ({ default: screen("ready") }));
vi.mock("./PotatoPlay", () => ({ default: screen("play") }));
vi.mock("./PotatoBang", () => ({ default: screen("bang") }));
vi.mock("./PotatoEnd", () => ({ default: screen("end") }));

import PotatoGame from "./PotatoGame";

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
  await act(async () => root?.render(createElement(PotatoGame)));
}

/** Moves the clock on, then taps. */
async function call(fn: () => void, wait = 1000) {
  clock += wait;
  await act(async () => fn());
}

// Math.random is 0: Ann starts, a mixed game draws a letter task first, a short fuse is 10 s.
const valid: PotatoSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"], lives: 1, fuse: "short" };

async function start(setup: PotatoSetup = valid) {
  await render();
  await call(() => p("form").onChange(setup));
  await call(() => p("form").onStart());
}

async function light() {
  await call(() => p("ready").onStart());
}

async function explode() {
  await call(() => p("play").onTick(), 10_000);
}

beforeEach(() => {
  ui.screen = "";
  ui.frameColor = undefined;
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

describe("PotatoGame setup", () => {
  it("opens the wizard with nothing saved and no quick start", async () => {
    await render();
    expect(ui.screen).toBe("form");
    expect(p("form").value).toEqual(DEFAULT_SETUP);
    expect(p("form").quickStart).toBe(false);
    expect(ui.frameColor).toBeUndefined();
  });

  it("restores the last setup and offers to start with it", async () => {
    store.set(SETUP_STORAGE_KEY, JSON.stringify(valid));
    await render();
    expect(p("form").value).toEqual(valid);
    expect(p("form").quickStart).toBe(true);
  });

  it("opens even when storage cannot be read", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
    });
    await render();
    expect(p("form").value).toEqual(DEFAULT_SETUP);
  });

  it("moves through the wizard's steps", async () => {
    await render();
    await call(() => p("form").onStep(1));
    expect(p("form").step).toBe(1);
  });

  it("saves the setup on Start and names the starter on their colour", async () => {
    await start();
    expect(store.get(SETUP_STORAGE_KEY)).toBe(JSON.stringify(valid));
    expect(ui.screen).toBe("ready");
    expect(p("ready").name).toBe("Ann");
    expect(ui.frameColor).toBe(playerColor(0));
  });

  it("starts even when storage cannot be written", async () => {
    const setItem = vi.fn(() => {
      throw new Error("quota");
    });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem });
    await start();
    expect(setItem).toHaveBeenCalledWith(SETUP_STORAGE_KEY, JSON.stringify(valid));
    expect(ui.screen).toBe("ready");
    expect(p("ready").name).toBe("Ann");
  });
});

describe("PotatoGame round", () => {
  it("shows the task in the game's language and the holder on their colour", async () => {
    await start();
    await light();
    expect(ui.screen).toBe("play");
    expect(p("play").holder).toBe("Ann");
    expect(p("play").task).toBe("An animal starting with A");
    expect(p("play").fuseMs).toBe(10_000);
    expect(ui.frameColor).toBe(playerColor(0));
  });

  it("draws ready-made tasks from the injected list", async () => {
    await start({ ...valid, tasks: "prompts" });
    await light();
    expect(p("play").task).toBe("Something round");
  });

  it("passes the phone to the next player", async () => {
    await start();
    await light();
    await call(() => p("play").onPass());
    expect(p("play").holder).toBe("Bob");
    expect(ui.frameColor).toBe(playerColor(1));
  });

  it("bangs on the holder when the fuse runs out", async () => {
    await start({ ...valid, lives: 2 });
    await light();
    await call(() => p("play").onPass());
    await call(() => p("play").onTick(), 8_999);
    expect(ui.screen).toBe("play");
    await call(() => p("play").onTick(), 1);
    expect(ui.screen).toBe("bang");
    expect(p("bang")).toMatchObject({ name: "Bob", livesLeft: 1, bangAt: clock });
    expect(ui.frameColor).toBe(POTATO_BANG_COLOR);
  });

  it("holds the fuse while the page is hidden", async () => {
    await start();
    await light();
    await call(() => p("play").onPause(), 4_000);
    await call(() => p("play").onTick(), 60_000);
    expect(ui.screen).toBe("play");
    await call(() => p("play").onResume());
    await call(() => p("play").onTick(), 5_999);
    expect(ui.screen).toBe("play");
    await call(() => p("play").onTick(), 1);
    expect(ui.screen).toBe("bang");
  });

  it("starts the next round with the player after the one who exploded", async () => {
    await start({ ...valid, lives: 2 });
    await light();
    await explode();
    await call(() => p("bang").onNext(), 2000);
    expect(ui.screen).toBe("ready");
    expect(p("ready").name).toBe("Bob");
  });
});

describe("PotatoGame end", () => {
  async function playToEnd() {
    await start();
    for (let i = 0; i < 2; i++) {
      await light();
      await explode();
      await call(() => p("bang").onNext(), 2000);
    }
  }

  it("ends with the last player left and the order the others went out in", async () => {
    await playToEnd();
    expect(ui.screen).toBe("end");
    expect(p("end")).toMatchObject({ players: ["Ann", "Bob", "Cem"], winner: 2, outOrder: [0, 1] });
    expect(ui.frameColor).toBeUndefined();
  });

  it("plays again with the same players", async () => {
    await playToEnd();
    await call(() => p("end").onPlayAgain());
    expect(ui.screen).toBe("ready");
    expect(p("ready").name).toBe("Ann");
  });

  it("goes back to the setup with the last game's players on New game", async () => {
    await playToEnd();
    await call(() => p("end").onNewGame());
    expect(ui.screen).toBe("form");
    expect(p("form").value).toEqual(valid);
    expect(p("form").step).toBe(0);
  });
});
