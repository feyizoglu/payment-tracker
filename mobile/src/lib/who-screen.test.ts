import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { WHO_SUMMARY_LOCK_MS, defaultWhoSetup, playerColor, teamColor, type WhoSetup } from "@ptracker/shared/who-game";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  index: 0,
}));
const storage = vi.hoisted(() => ({
  getStoredWhoSetup: vi.fn(),
  setStoredWhoSetup: vi.fn(async (_setup: unknown) => undefined),
  getStoredWhoSeen: vi.fn(),
  setStoredWhoSeen: vi.fn(async (_lang: unknown, _seen: unknown) => undefined),
}));
const entry = vi.hoisted(() => ({ pinReady: true }));
const clock = vi.hoisted(() => ({ now: 0 }));
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
    useMemo: (fn: () => unknown) => fn(),
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
  };
});
vi.mock("react-native", () => ({ ActivityIndicator: () => null }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ptracker/shared/i18n")>()),
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => (key === "wordTeamDefault" ? "Team {n}" : String(key)) }), lang: "en" }),
}));
vi.mock("@ptracker/shared/who-cards", () => cards);
vi.mock("@ptracker/shared/who-things", () => ({
  WHO_THINGS: { en: { animals: [], jobs: [], objects: [] }, tr: { animals: [], jobs: [], objects: [] } },
}));
vi.mock("@/components/games/game-mode-entry", () => ({
  GamesPinSetup: () => null,
  useEnterGameModeOnce: () => entry.pinReady,
}));
vi.mock("@/components/games/game-screen", () => ({ GameScreen: () => null }));
vi.mock("@/components/games/who/who-setup", () => ({ WhoSetupWizard: () => null }));
vi.mock("@/components/games/who/who-handoff", () => ({ WhoHandoff: () => null }));
vi.mock("@/components/games/who/who-turn", () => ({ WhoTurn: () => null }));
vi.mock("@/components/games/who/who-summary", () => ({ WhoSummary: () => null }));
vi.mock("@/components/games/who/who-end", () => ({ WhoEnd: () => null }));
vi.mock("@/lib/who-game-storage", () => storage);

import { ActivityIndicator } from "react-native";
import WhoScreen from "@/app/games/who";
import { GamesPinSetup } from "@/components/games/game-mode-entry";
import { WhoEnd } from "@/components/games/who/who-end";
import { WhoHandoff } from "@/components/games/who/who-handoff";
import { WhoSetupWizard } from "@/components/games/who/who-setup";
import { WhoSummary } from "@/components/games/who/who-summary";
import { WhoTurn } from "@/components/games/who/who-turn";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const DEFAULT = defaultWhoSetup("en", ["Team 1", "Team 2"]);
const valid: WhoSetup = { ...DEFAULT, players: ["Ann", "Bob"], rounds: 1, turnSeconds: 30 };

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function render(): Node {
  hooks.index = 0;
  hooks.effects = [];
  return WhoScreen() as Node;
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

async function settle() {
  render();
  for (const effect of hooks.effects) effect();
  await Promise.resolve();
  await Promise.resolve();
}

async function load(setup: WhoSetup, seen: string[] = []) {
  storage.getStoredWhoSetup.mockResolvedValue(setup);
  storage.getStoredWhoSeen.mockResolvedValue(seen);
  await settle();
}

async function start(setup: WhoSetup = valid, seen: string[] = []) {
  await load(setup, seen);
  call(WhoSetupWizard, "onStart");
}

/** Starts a turn, answers, lets the clock run out and waits for the summary to open. */
function turn(answers: ("got" | "pass")[] = []) {
  call(WhoHandoff, "onStart");
  for (const result of answers) call(WhoTurn, "onAnswer", result);
  call(WhoTurn, "onTick", undefined, 30_000);
  clock.now += WHO_SUMMARY_LOCK_MS;
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Who Am I? screen: setup", () => {
  it("asks for a PIN first when none is set", () => {
    entry.pinReady = false;
    const node = render();
    expect(node.type).toBe(GamesPinSetup);
    expect(node.props.title).toBe("whoTitle");
  });

  it("shows no setup until the stored setup and seen list have been read", async () => {
    storage.getStoredWhoSetup.mockResolvedValue(valid);
    storage.getStoredWhoSeen.mockReturnValue(new Promise(() => {}));
    await settle();
    expect(has(ActivityIndicator)).toBe(true);
    expect(has(WhoSetupWizard)).toBe(false);
  });

  it("reads the setup in the screen's language and the seen list for it", async () => {
    await load(valid);
    expect(storage.getStoredWhoSetup).toHaveBeenCalledWith("en", ["Team 1", "Team 2"]);
    expect(storage.getStoredWhoSeen).toHaveBeenCalledWith("en");
  });

  it("restores the last setup with its pool size and offers to start with it", async () => {
    await load(valid);
    expect(props(WhoSetupWizard)).toMatchObject({ value: valid, poolSize: 60, quickStart: true });
    await load({ ...valid, kinds: ["characters"], region: "mixed" });
    expect(props(WhoSetupWizard)).toMatchObject({ poolSize: 10, quickStart: false });
  });

  it("saves the setup on Start and names the first guesser on their colour", async () => {
    await start();
    expect(storage.setStoredWhoSetup).toHaveBeenCalledWith(valid);
    expect(props(WhoHandoff)).toMatchObject({ guesser: "Ann", team: null, round: 1, rounds: 1 });
    expect(screen()).toMatchObject({ title: "whoTitle", tone: "game", color: playerColor(0), scroll: false, nav: true });
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
    expect(props(WhoHandoff)).toMatchObject({ guesser: "Ann", team: "Red" });
    expect(screen().color).toBe(teamColor(0));
  });
});

describe("Who Am I? screen: a turn", () => {
  it("shows a card with the turn's clock, without colour or a scroll view", async () => {
    await start();
    call(WhoHandoff, "onStart");
    expect(props(WhoTurn).card.name.startsWith("EN p-")).toBe(true);
    expect(props(WhoTurn)).toMatchObject({ turnMs: 30_000, usedMs: 0, runningSince: clock.now });
    expect(screen()).toMatchObject({ color: undefined, scroll: false });
  });

  it("hides the header's back and exit while the turn runs and until the summary opens", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await load(valid);
    expect(screen().nav).toBe(true);
    call(WhoSetupWizard, "onStart");
    expect(screen().nav).toBe(true);
    call(WhoHandoff, "onStart");
    expect(screen().nav).toBe(false);
    call(WhoTurn, "onTick", undefined, 30_000);
    expect(has(WhoSummary)).toBe(true);
    expect(screen().nav).toBe(false);
    for (const effect of hooks.effects) effect();
    vi.advanceTimersByTime(WHO_SUMMARY_LOCK_MS - 1);
    expect(screen().nav).toBe(false);
    vi.advanceTimersByTime(1);
    expect(screen().nav).toBe(true);
  });

  it("deals the cards this device has not shown yet first", async () => {
    const seen = Array.from({ length: 5 }, (_, i) => `p-${i + 1}`);
    await start(valid, seen);
    call(WhoHandoff, "onStart");
    expect(seen).not.toContain(props(WhoTurn).card.id);
  });

  it("holds the clock while the app is in the background or covered", async () => {
    await start();
    call(WhoHandoff, "onStart");
    call(WhoTurn, "onPause", undefined, 10_000);
    call(WhoTurn, "onTick", undefined, 60_000);
    expect(has(WhoTurn)).toBe(true);
    call(WhoTurn, "onResume");
    call(WhoTurn, "onTick", undefined, 19_999);
    expect(has(WhoTurn)).toBe(true);
    call(WhoTurn, "onTick", undefined, 1);
    expect(has(WhoSummary)).toBe(true);
  });

  it("ends the turn when the time is up, shows its cards and saves the seen list", async () => {
    await start();
    call(WhoHandoff, "onStart");
    const first = props(WhoTurn).card;
    call(WhoTurn, "onAnswer", "got");
    const second = props(WhoTurn).card;
    call(WhoTurn, "onTick", undefined, 30_000);
    expect(props(WhoSummary)).toMatchObject({
      side: 0,
      endedAt: clock.now,
      names: ["Ann", "Bob"],
      scores: [1, 0],
      results: [
        { card: first, result: "got" },
        { card: second, result: "pass" },
      ],
    });
    expect(screen()).toMatchObject({ color: undefined, scroll: true });
    await settle();
    expect(storage.setStoredWhoSeen).toHaveBeenCalledWith("en", [first.id, second.id]);
  });

  it("ignores the summary's buttons for 1.5 s after the turn ends", async () => {
    await start();
    call(WhoHandoff, "onStart");
    call(WhoTurn, "onTick", undefined, 30_000);
    call(WhoSummary, "onNext", undefined, WHO_SUMMARY_LOCK_MS - 1);
    expect(has(WhoSummary)).toBe(true);
    call(WhoSummary, "onNext", undefined, 1);
    expect(has(WhoHandoff)).toBe(true);
  });

  it("flips a card in the summary and hands the phone to the next player", async () => {
    await start();
    turn(["got"]);
    call(WhoSummary, "onFlip", 0);
    expect(props(WhoSummary).scores).toEqual([0, 0]);
    call(WhoSummary, "onNext");
    expect(props(WhoHandoff).guesser).toBe("Bob");
    expect(screen().color).toBe(playerColor(1));
  });
});

describe("Who Am I? screen: the end", () => {
  it("shows the scores, then plays again or goes back to the setup", async () => {
    await start();
    turn(["got"]);
    call(WhoSummary, "onNext");
    turn(["got", "got"]);
    call(WhoSummary, "onNext");
    expect(props(WhoEnd)).toMatchObject({ names: ["Ann", "Bob"], scores: [1, 2] });
    expect(screen().color).toBeUndefined();
    call(WhoEnd, "onPlayAgain");
    expect(props(WhoHandoff).guesser).toBe("Ann");
    turn();
    call(WhoSummary, "onNext");
    turn();
    call(WhoSummary, "onNext");
    call(WhoEnd, "onNewGame");
    expect(props(WhoSetupWizard).value).toEqual(valid);
    expect(props(WhoSetupWizard).step).toBe(0);
  });
});
