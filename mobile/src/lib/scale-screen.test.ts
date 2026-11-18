import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { SCALE_REVEAL_LOCK_MS, defaultScaleSetup, teamColor, type ScaleSetup } from "@ptracker/shared/scale-game";

// Effects run, as in React, only when their dependencies changed since they last ran.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as { slot: number; effect: () => void | (() => void); deps?: unknown[] }[],
  ran: new Map<number, unknown[] | undefined>(),
  cleanups: new Map<number, () => void>(),
  index: 0,
}));
const storage = vi.hoisted(() => ({
  getStoredScaleSetup: vi.fn(),
  setStoredScaleSetup: vi.fn(async (_setup: unknown) => undefined),
  getStoredScaleSeen: vi.fn(),
  setStoredScaleSeen: vi.fn(async (_lang: unknown, _seen: unknown) => undefined),
}));
const entry = vi.hoisted(() => ({ pinReady: true, focused: true }));
const back = vi.hoisted(() => ({ handlers: [] as { fn: () => boolean | null | undefined; removed: boolean }[] }));
const clock = vi.hoisted(() => ({ now: 0 }));
const pairs = vi.hoisted(() => ({
  SCALE_PAIRS: {
    en: [
      { id: "en-1", left: "Cold", right: "Hot" },
      { id: "en-2", left: "Cheap", right: "Expensive" },
      { id: "en-3", left: "Boring", right: "Exciting" },
    ],
    tr: [{ id: "tr-1", left: "Soğuk", right: "Sıcak" }],
  },
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
    useReducer: (reducer: (s: unknown, a: unknown) => unknown, arg: unknown, init?: (a: unknown) => unknown) => {
      const i = hooks.index++;
      if (!(i in hooks.states)) hooks.states[i] = init ? init(arg) : arg;
      const dispatch = (action: unknown) => {
        hooks.states[i] = reducer(hooks.states[i], action);
      };
      return [hooks.states[i], dispatch];
    },
    useCallback: (fn: unknown) => fn,
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      hooks.effects.push({ slot: hooks.index++, effect, deps });
    },
  };
});
vi.mock("react-native", () => ({
  ActivityIndicator: () => null,
  BackHandler: {
    addEventListener: (_type: string, fn: () => boolean | null | undefined) => {
      const handler = { fn, removed: false };
      back.handlers.push(handler);
      return { remove: () => (handler.removed = true) };
    },
  },
}));
vi.mock("expo-router", () => ({ useIsFocused: () => entry.focused }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ptracker/shared/i18n")>()),
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => (key === "wordTeamDefault" ? "Team {n}" : String(key)) }), lang: "en" }),
}));
vi.mock("@ptracker/shared/scale-pairs", () => pairs);
vi.mock("@/components/games/game-mode-entry", () => ({
  GamesPinSetup: () => null,
  useEnterGameModeOnce: () => entry.pinReady,
}));
vi.mock("@/components/games/game-screen", () => ({ GameScreen: () => null }));
vi.mock("@/components/games/scale/scale-setup", () => ({ ScaleSetupWizard: () => null }));
vi.mock("@/components/games/scale/scale-handoff", () => ({ ScaleHandoff: () => null }));
vi.mock("@/components/games/scale/scale-secret", () => ({ ScaleSecret: () => null }));
vi.mock("@/components/games/scale/scale-guess", () => ({ ScaleGuess: () => null }));
vi.mock("@/components/games/scale/scale-reveal", () => ({ ScaleReveal: () => null }));
vi.mock("@/components/games/scale/scale-end", () => ({ ScaleEnd: () => null }));
vi.mock("@/lib/scale-game-storage", () => storage);

const leave = vi.hoisted(() => ({ active: undefined as boolean | undefined }));
vi.mock("@/lib/leave-game", () => ({
  useConfirmLeave: (active: boolean) => {
    leave.active = active;
  },
}));
import { ActivityIndicator } from "react-native";
import ScaleScreen from "@/app/games/scale";
import { GamesPinSetup } from "@/components/games/game-mode-entry";
import { ScaleEnd } from "@/components/games/scale/scale-end";
import { ScaleGuess } from "@/components/games/scale/scale-guess";
import { ScaleHandoff } from "@/components/games/scale/scale-handoff";
import { ScaleReveal } from "@/components/games/scale/scale-reveal";
import { ScaleSecret } from "@/components/games/scale/scale-secret";
import { ScaleSetupWizard } from "@/components/games/scale/scale-setup";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const valid: ScaleSetup = {
  teams: [
    { name: "Red", players: ["Ann", "Bob", "Eda"] },
    { name: "Blue", players: ["Cem", "Dan"] },
  ],
  turns: 4,
};

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function render(): Node {
  hooks.index = 0;
  hooks.effects = [];
  return ScaleScreen() as Node;
}

const find = (type: unknown) => nodes(render()).find((n) => n.type === type);
const has = (type: unknown) => find(type) !== undefined;
/* eslint-disable @typescript-eslint/no-explicit-any */
const props = (type: unknown) => find(type)!.props as any;
/* eslint-enable @typescript-eslint/no-explicit-any */
/** Moves the clock on, then calls one of the screen's callbacks. */
function call(type: unknown, name: string, arg?: unknown, wait = 1000) {
  clock.now += wait;
  (props(type)[name] as (a?: unknown) => void)(arg);
}
const screen = () => render().props;

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

/** Runs every cleanup and forgets the screen, so the next render mounts it afresh. */
function unmount() {
  for (const cleanup of hooks.cleanups.values()) cleanup();
  hooks.cleanups.clear();
  hooks.ran.clear();
  hooks.states = [];
  hooks.effects = [];
}

async function settle() {
  render();
  runEffects();
  await Promise.resolve();
  await Promise.resolve();
}

async function load(setup: ScaleSetup, seen: string[] = []) {
  storage.getStoredScaleSetup.mockResolvedValue(setup);
  storage.getStoredScaleSeen.mockResolvedValue(seen);
  await settle();
}

/** Loads the setup and presses Start on the wizard's last step. */
async function start(setup: ScaleSetup = valid, seen: string[] = []) {
  await load(setup, seen);
  call(ScaleSetupWizard, "onStep", 1);
  call(ScaleSetupWizard, "onStart");
  await settle();
}

/** Plays a turn up to the reveal with the needle on `needle`. */
function turn(needle = 50) {
  call(ScaleHandoff, "onShow");
  call(ScaleSecret, "onHide");
  call(ScaleGuess, "onMove", needle);
  call(ScaleGuess, "onLock");
  call(ScaleGuess, "onLock");
}

/** Back handlers still listening. */
const listening = () => back.handlers.filter((h) => !h.removed);

/** Plays every turn of the game. */
function playAll(turns = 2 * valid.turns) {
  for (let i = 0; i < turns; i++) {
    turn();
    call(ScaleReveal, "onNext", undefined, SCALE_REVEAL_LOCK_MS);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  unmount();
  entry.pinReady = true;
  entry.focused = true;
  back.handlers = [];
  clock.now = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Scale screen: setup", () => {
  it("asks for a PIN first when none is set", () => {
    entry.pinReady = false;
    const node = render();
    expect(node.type).toBe(GamesPinSetup);
    expect(node.props.title).toBe("scaleTitle");
  });

  it("shows no setup until the stored setup has been read", async () => {
    storage.getStoredScaleSetup.mockReturnValue(new Promise(() => {}));
    storage.getStoredScaleSeen.mockResolvedValue([]);
    await settle();
    expect(has(ActivityIndicator)).toBe(true);
    expect(has(ScaleSetupWizard)).toBe(false);
    expect(screen()).toMatchObject({ title: "scaleTitle", tone: "game", scroll: true });
  });

  it("reads the setup with the screen's default team names and offers to start with it", async () => {
    await load(valid);
    expect(storage.getStoredScaleSetup).toHaveBeenCalledWith(["Team 1", "Team 2"]);
    expect(props(ScaleSetupWizard)).toMatchObject({ value: valid, step: 0, quickStart: true });
    unmount();
    await load(defaultScaleSetup(["Team 1", "Team 2"]));
    expect(props(ScaleSetupWizard).quickStart).toBe(false);
  });

  it("edits the draft and moves through the steps", async () => {
    await load(valid);
    call(ScaleSetupWizard, "onChange", { ...valid, turns: 8 });
    call(ScaleSetupWizard, "onStep", 1);
    expect(props(ScaleSetupWizard)).toMatchObject({ value: { ...valid, turns: 8 }, step: 1 });
  });

  it("saves the setup once the game has started and names the first clue giver on the team's colour", async () => {
    await start();
    expect(storage.setStoredScaleSetup).toHaveBeenCalledWith(valid);
    expect(props(ScaleHandoff)).toMatchObject({
      team: "Red",
      giver: "Ann",
      turn: 1,
      turns: 4,
      teams: valid.teams,
      scores: [0, 0],
    });
    expect(screen()).toMatchObject({ title: "scaleTitle", tone: "game", color: teamColor(0), scroll: false });
  });

  it("saves nothing and stays on the step when Start is refused", async () => {
    await load({ ...valid, turns: 5 });
    call(ScaleSetupWizard, "onStep", 1);
    call(ScaleSetupWizard, "onStart");
    await settle();
    expect(has(ScaleSetupWizard)).toBe(true);
    expect(storage.setStoredScaleSetup).not.toHaveBeenCalled();
    expect(props(ScaleSetupWizard)).toMatchObject({ step: 1, quickStart: false });
  });
});

describe("Scale screen: a turn", () => {
  it("shows the clue giver a pair of the screen's language and the target, on the dark screen", async () => {
    await start();
    call(ScaleHandoff, "onShow");
    expect(props(ScaleSecret)).toMatchObject({ pair: { id: "en-1", left: "Cold", right: "Hot" }, target: 3 });
    expect(screen()).toMatchObject({ color: undefined, scroll: false });
  });

  it("hands the needle to the team without a scroll view, and moves it", async () => {
    await start();
    call(ScaleHandoff, "onShow");
    call(ScaleSecret, "onHide");
    expect(props(ScaleGuess)).toMatchObject({
      pair: { id: "en-1" },
      team: "Red",
      color: teamColor(0),
      needle: 50,
      confirming: false,
    });
    expect(props(ScaleGuess)).not.toHaveProperty("target");
    expect(screen()).toMatchObject({ color: undefined, scroll: false });
    call(ScaleGuess, "onMove", 12);
    expect(props(ScaleGuess).needle).toBe(12);
  });

  it("asks for a second tap, then reveals the band, the needle and the points", async () => {
    await start();
    call(ScaleHandoff, "onShow");
    call(ScaleSecret, "onHide");
    call(ScaleGuess, "onMove", 10);
    call(ScaleGuess, "onLock");
    expect(props(ScaleGuess).confirming).toBe(true);
    call(ScaleGuess, "onLock");
    expect(props(ScaleReveal)).toMatchObject({
      pair: { id: "en-1" },
      target: 3,
      needle: 10,
      team: "Red",
      color: teamColor(0),
      teams: valid.teams,
      scores: [3, 0],
      revealedAt: clock.now,
    });
    expect(find(ScaleReveal)!.key).toBe("0");
    expect(screen()).toMatchObject({ color: undefined, scroll: true });
  });

  it("ignores Next for 1 s after the reveal, then hands over to the other team", async () => {
    await start();
    turn();
    call(ScaleReveal, "onNext", undefined, SCALE_REVEAL_LOCK_MS - 1);
    expect(has(ScaleReveal)).toBe(true);
    call(ScaleReveal, "onNext", undefined, 1);
    expect(props(ScaleHandoff)).toMatchObject({ team: "Blue", giver: "Cem", turn: 1 });
    expect(screen().color).toBe(teamColor(1));
  });

  it("rotates each team's clue giver turn by turn", async () => {
    await start();
    const givers: string[] = [];
    for (let i = 0; i < 4; i++) {
      givers.push(props(ScaleHandoff).giver);
      turn();
      call(ScaleReveal, "onNext", undefined, SCALE_REVEAL_LOCK_MS);
    }
    expect(givers).toEqual(["Ann", "Cem", "Bob", "Dan"]);
    expect(props(ScaleHandoff).turn).toBe(3);
  });
});

describe("Scale screen: pairs played", () => {
  it("shows no setup until the pairs played in the screen's language have been read", async () => {
    storage.getStoredScaleSetup.mockResolvedValue(valid);
    storage.getStoredScaleSeen.mockReturnValue(new Promise(() => {}));
    await settle();
    expect(has(ScaleSetupWizard)).toBe(false);
    expect(has(ActivityIndicator)).toBe(true);
    expect(storage.getStoredScaleSeen).toHaveBeenCalledWith("en");
  });

  it("deals the pairs this device has not played first", async () => {
    await start(valid, ["en-1", "en-2"]);
    vi.spyOn(Math, "random").mockReturnValue(0.9999);
    call(ScaleHandoff, "onShow");
    expect(props(ScaleSecret).pair.id).toBe("en-3");
  });

  it("saves the pairs played in the game's language once the needle is locked", async () => {
    await start(valid, ["en-2"]);
    call(ScaleHandoff, "onShow");
    await settle();
    expect(storage.setStoredScaleSeen).not.toHaveBeenCalled();
    call(ScaleSecret, "onHide");
    call(ScaleGuess, "onLock");
    call(ScaleGuess, "onLock");
    await settle();
    expect(storage.setStoredScaleSeen).toHaveBeenCalledWith("en", ["en-2", "en-1"]);
  });

  it("starts the next game after the last one's pairs even when they could not be saved", async () => {
    storage.setStoredScaleSeen.mockRejectedValue(new Error("full"));
    await start({ ...valid, turns: 4 });
    for (let i = 0; i < 8; i++) {
      turn();
      await settle();
      call(ScaleReveal, "onNext", undefined, SCALE_REVEAL_LOCK_MS);
      await settle();
    }
    const last = storage.setStoredScaleSeen.mock.calls.at(-1)![1] as string[];
    call(ScaleEnd, "onNewGame");
    await settle();
    call(ScaleSetupWizard, "onStep", 1);
    call(ScaleSetupWizard, "onStart");
    await settle();
    call(ScaleHandoff, "onShow");
    expect(last).not.toContain(props(ScaleSecret).pair.id);
  });
});

describe("Scale screen: Android back", () => {
  it("is swallowed while the target is shown and the needle is moved, and only then", async () => {
    await start();
    expect(listening()).toHaveLength(0);
    call(ScaleHandoff, "onShow");
    await settle();
    expect(listening()).toHaveLength(1);
    expect(listening()[0].fn()).toBe(true);
    call(ScaleSecret, "onHide");
    await settle();
    expect(listening()).toHaveLength(1);
    expect(listening()[0].fn()).toBe(true);
    call(ScaleGuess, "onLock");
    call(ScaleGuess, "onLock");
    await settle();
    expect(has(ScaleReveal)).toBe(true);
    expect(listening()).toHaveLength(0);
    call(ScaleReveal, "onNext", undefined, SCALE_REVEAL_LOCK_MS);
    await settle();
    expect(has(ScaleHandoff)).toBe(true);
    expect(listening()).toHaveLength(0);
  });

  it("is left alone while another screen covers the game, and released on unmount", async () => {
    await start();
    call(ScaleHandoff, "onShow");
    entry.focused = false;
    await settle();
    expect(listening()).toHaveLength(0);
    entry.focused = true;
    await settle();
    expect(listening()).toHaveLength(1);
    unmount();
    expect(listening()).toHaveLength(0);
  });
});

describe("Scale screen: end", () => {
  it("ends after every team's turns with the scores", async () => {
    await start();
    playAll();
    expect(props(ScaleEnd)).toMatchObject({ teams: valid.teams, scores: [0, 0] });
    expect(screen()).toMatchObject({ color: undefined, scroll: true });
  });

  it("plays again with the clue givers carrying on", async () => {
    await start();
    playAll();
    call(ScaleEnd, "onPlayAgain");
    expect(props(ScaleHandoff)).toMatchObject({ team: "Red", giver: "Bob", turn: 1, scores: [0, 0] });
  });

  it("goes back to the setup with the last game's settings on New game", async () => {
    await start();
    playAll();
    call(ScaleEnd, "onNewGame");
    expect(props(ScaleSetupWizard)).toMatchObject({ value: valid, step: 0, quickStart: true });
  });
});

describe("Scale screen: leaving the game", () => {
  it("asks before leaving once the game starts, and hides back and exit while the turn is on screen", async () => {
    await load(valid);
    expect([screen().confirmBack, screen().nav, leave.active]).toEqual([false, true, false]);
    await start();
    expect([screen().confirmBack, screen().nav, leave.active]).toEqual([true, true, true]);
    call(ScaleHandoff, "onShow");
    // The turn blocks back outright, so it does not ask.
    expect([screen().confirmBack, screen().nav, leave.active]).toEqual([true, false, false]);
  });
});
