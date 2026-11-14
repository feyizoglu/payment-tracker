import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, POTATO_BANG_COLOR, playerColor, type PotatoSetup } from "@ptracker/shared/hot-potato";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  index: 0,
}));
const storage = vi.hoisted(() => ({
  getStoredPotatoSetup: vi.fn(),
  setStoredPotatoSetup: vi.fn(async (_setup: unknown) => undefined),
}));
const entry = vi.hoisted(() => ({ pinReady: true }));
const clock = vi.hoisted(() => ({ now: 0 }));

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
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }), lang: "en" }),
}));
vi.mock("@ptracker/shared/hot-potato-prompts", () => ({
  HOT_POTATO_PROMPTS: {
    en: [{ id: "en-1", text: "Something round" }],
    tr: [{ id: "tr-1", text: "Yuvarlak bir şey" }],
  },
}));
vi.mock("@/components/games/game-mode-entry", () => ({
  GamesPinSetup: () => null,
  useEnterGameModeOnce: () => entry.pinReady,
}));
vi.mock("@/components/games/game-screen", () => ({ GameScreen: () => null }));
vi.mock("@/components/games/potato/potato-setup", () => ({ PotatoSetupWizard: () => null }));
vi.mock("@/components/games/potato/potato-ready", () => ({ PotatoReady: () => null }));
vi.mock("@/components/games/potato/potato-play", () => ({ PotatoPlay: () => null }));
vi.mock("@/components/games/potato/potato-bang", () => ({ PotatoBang: () => null }));
vi.mock("@/components/games/potato/potato-end", () => ({ PotatoEnd: () => null }));
vi.mock("@/lib/hot-potato-storage", () => storage);

import { ActivityIndicator } from "react-native";
import PotatoScreen from "@/app/games/potato";
import { GamesPinSetup } from "@/components/games/game-mode-entry";
import { PotatoBang } from "@/components/games/potato/potato-bang";
import { PotatoEnd } from "@/components/games/potato/potato-end";
import { PotatoPlay } from "@/components/games/potato/potato-play";
import { PotatoReady } from "@/components/games/potato/potato-ready";
import { PotatoSetupWizard } from "@/components/games/potato/potato-setup";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

// Math.random is 0: Ann starts, a mixed game draws a letter task first, a short fuse is 10 s.
const valid: PotatoSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"], lives: 1, fuse: "short" };

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function render(): Node {
  hooks.index = 0;
  hooks.effects = [];
  return PotatoScreen() as Node;
}

const find = (type: unknown) => nodes(render()).find((n) => n.type === type);
const has = (type: unknown) => find(type) !== undefined;
const props = (type: unknown) => find(type)!.props;
/** Moves the clock on, then taps. */
function call(type: unknown, name: string, wait = 1000) {
  clock.now += wait;
  (props(type)[name] as () => void)();
}
const screen = () => render().props;

async function load(setup: PotatoSetup) {
  storage.getStoredPotatoSetup.mockResolvedValue(setup);
  render();
  for (const effect of hooks.effects) effect();
  await Promise.resolve();
  await Promise.resolve();
}

async function start(setup: PotatoSetup = valid) {
  await load(setup);
  call(PotatoSetupWizard, "onStart");
}

function round() {
  call(PotatoReady, "onStart");
  call(PotatoPlay, "onTick", 10_000);
  call(PotatoBang, "onNext", 2000);
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.states = [];
  entry.pinReady = true;
  clock.now = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Hot Potato screen: setup", () => {
  it("asks for a PIN first when none is set", () => {
    entry.pinReady = false;
    const node = render();
    expect(node.type).toBe(GamesPinSetup);
    expect(node.props.title).toBe("potatoTitle");
  });

  it("shows no setup until the stored one has been read", () => {
    storage.getStoredPotatoSetup.mockReturnValue(new Promise(() => {}));
    render();
    for (const effect of hooks.effects) effect();
    expect(has(ActivityIndicator)).toBe(true);
    expect(has(PotatoSetupWizard)).toBe(false);
  });

  it("restores the last setup and offers to start with it", async () => {
    await load(valid);
    expect(props(PotatoSetupWizard).value).toEqual(valid);
    expect(props(PotatoSetupWizard).quickStart).toBe(true);
    await load(DEFAULT_SETUP);
    expect(props(PotatoSetupWizard).quickStart).toBe(false);
  });

  it("saves the setup on Start and names the starter on their colour", async () => {
    await start();
    expect(storage.setStoredPotatoSetup).toHaveBeenCalledWith(valid);
    expect(props(PotatoReady).name).toBe("Ann");
    expect(screen()).toMatchObject({ title: "potatoTitle", tone: "game", color: playerColor(0) });
  });
});

describe("Hot Potato screen: a round", () => {
  it("shows the task in the game's language on the holder's colour, without a scroll view", async () => {
    await start();
    call(PotatoReady, "onStart");
    expect(props(PotatoPlay)).toMatchObject({ holder: "Ann", task: "An animal starting with A", fuseMs: 10_000 });
    expect(screen()).toMatchObject({ color: playerColor(0), scroll: false });
  });

  it("draws ready-made tasks from the injected list", async () => {
    await start({ ...valid, tasks: "prompts" });
    call(PotatoReady, "onStart");
    expect(props(PotatoPlay).task).toBe("Something round");
  });

  it("passes the phone on and bangs on the holder when the fuse runs out", async () => {
    await start({ ...valid, lives: 2 });
    call(PotatoReady, "onStart");
    call(PotatoPlay, "onPass");
    expect(props(PotatoPlay).holder).toBe("Bob");
    expect(screen().color).toBe(playerColor(1));
    call(PotatoPlay, "onTick", 8_999);
    expect(has(PotatoBang)).toBe(false);
    call(PotatoPlay, "onTick", 1);
    expect(props(PotatoBang)).toMatchObject({ name: "Bob", livesLeft: 1, bangAt: clock.now });
    expect(screen().color).toBe(POTATO_BANG_COLOR);
  });

  it("holds the fuse while the app is in the background", async () => {
    await start();
    call(PotatoReady, "onStart");
    call(PotatoPlay, "onPause", 4_000);
    call(PotatoPlay, "onTick", 60_000);
    expect(has(PotatoPlay)).toBe(true);
    call(PotatoPlay, "onResume");
    call(PotatoPlay, "onTick", 5_999);
    expect(has(PotatoPlay)).toBe(true);
    call(PotatoPlay, "onTick", 1);
    expect(has(PotatoBang)).toBe(true);
  });

  it("starts the next round with the player after the one who exploded", async () => {
    await start({ ...valid, lives: 2 });
    round();
    expect(props(PotatoReady).name).toBe("Bob");
  });
});

describe("Hot Potato screen: the end", () => {
  it("shows the winner and the out order, then plays again or goes back to the setup", async () => {
    await start();
    round();
    round();
    expect(props(PotatoEnd)).toMatchObject({ players: ["Ann", "Bob", "Cem"], winner: 2, outOrder: [0, 1] });
    expect(screen().color).toBeUndefined();
    call(PotatoEnd, "onPlayAgain");
    expect(props(PotatoReady).name).toBe("Ann");
    round();
    round();
    call(PotatoEnd, "onNewGame");
    expect(props(PotatoSetupWizard).value).toEqual(valid);
    expect(props(PotatoSetupWizard).step).toBe(0);
  });
});
