import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { defaultClueSetup, playerColor, type ClueSetup } from "@ptracker/shared/clue-game";

// Effects run, as in React, only when their dependencies changed since they last ran.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as { slot: number; effect: () => void | (() => void); deps?: unknown[] }[],
  ran: new Map<number, unknown[] | undefined>(),
  cleanups: new Map<number, () => void>(),
  index: 0,
}));
const storage = vi.hoisted(() => ({
  getStoredClueSetup: vi.fn(),
  setStoredClueSetup: vi.fn(async (_setup: unknown) => undefined),
  getStoredClueSeen: vi.fn(),
  setStoredClueSeen: vi.fn(async (_lang: unknown, _seen: unknown) => undefined),
}));
const entry = vi.hoisted(() => ({ pinReady: true, focused: true, lang: "en" as "en" | "tr" }));
const back = vi.hoisted(() => ({ handlers: [] as { fn: () => boolean | null | undefined; removed: boolean }[] }));
const clock = vi.hoisted(() => ({ now: 0 }));
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
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => {
        const templates: Record<string, string> = { clueCheckHint: "{name}, don't look", clueGuessGate: "give it to {name}" };
        return templates[String(key)] ?? String(key);
      },
    }),
    lang: entry.lang,
  }),
}));
vi.mock("@ptracker/shared/word-game-words", () => words);
vi.mock("@/components/games/game-mode-entry", () => ({
  GamesPinSetup: () => null,
  useEnterGameModeOnce: () => entry.pinReady,
}));
vi.mock("@/components/games/game-screen", () => ({ GameScreen: () => null }));
vi.mock("@/components/games/clue/clue-setup", () => ({ ClueSetupWizard: () => null }));
vi.mock("@/components/games/clue/clue-handoff", () => ({ ClueHandoff: () => null }));
vi.mock("@/components/games/clue/clue-write", () => ({ ClueWrite: () => null }));
vi.mock("@/components/games/clue/clue-gate", () => ({ ClueGate: () => null }));
vi.mock("@/components/games/clue/clue-check", () => ({ ClueCheck: () => null }));
vi.mock("@/components/games/clue/clue-guess", () => ({ ClueGuess: () => null }));
vi.mock("@/components/games/clue/clue-result", () => ({ ClueResult: () => null }));
vi.mock("@/components/games/clue/clue-end", () => ({ ClueEnd: () => null }));
vi.mock("@/lib/clue-game-storage", () => storage);

const leave = vi.hoisted(() => ({ active: undefined as boolean | undefined }));
vi.mock("@/lib/leave-game", () => ({
  useConfirmLeave: (active: boolean) => {
    leave.active = active;
  },
}));
import { ActivityIndicator } from "react-native";
import ClueScreen from "@/app/games/clue";
import { ClueCheck } from "@/components/games/clue/clue-check";
import { ClueEnd } from "@/components/games/clue/clue-end";
import { ClueGate } from "@/components/games/clue/clue-gate";
import { ClueGuess } from "@/components/games/clue/clue-guess";
import { ClueHandoff } from "@/components/games/clue/clue-handoff";
import { ClueResult } from "@/components/games/clue/clue-result";
import { ClueSetupWizard } from "@/components/games/clue/clue-setup";
import { ClueWrite } from "@/components/games/clue/clue-write";
import { GamesPinSetup } from "@/components/games/game-mode-entry";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const valid: ClueSetup = { players: ["Ann", "Bob", "Cem"], deckSize: 8, level: "mixed" };
const SCREENS = new Map<unknown, string>([
  [ClueHandoff, "handoff"],
  [ClueWrite, "write"],
  [ClueGate, "gate"],
  [ClueCheck, "check"],
  [ClueGuess, "guess"],
  [ClueResult, "result"],
  [ClueEnd, "end"],
]);

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

/** Every game screen rendered, with its props and the screen's colour. */
let log: { screen: string; props: Props; color: unknown }[] = [];

function render(): Node {
  hooks.index = 0;
  hooks.effects = [];
  const tree = ClueScreen() as Node;
  for (const n of nodes(tree)) {
    const name = SCREENS.get(n.type);
    if (name) log.push({ screen: name, props: n.props, color: tree.props.color });
  }
  return tree;
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

async function load(setup: ClueSetup, seen: string[] = []) {
  storage.getStoredClueSetup.mockResolvedValue(setup);
  storage.getStoredClueSeen.mockResolvedValue(seen);
  await settle();
}

async function start(setup: ClueSetup = valid, seen: string[] = []) {
  await load(setup, seen);
  call(ClueSetupWizard, "onStep", 1);
  call(ClueSetupWizard, "onStart");
  await settle();
}

/** Plays the round on screen from its handoff to its result. */
async function round(clues: string[], outcome: "got" | "missed" | "passed" = "got") {
  call(ClueHandoff, "onBegin");
  for (const clue of clues) {
    call(ClueWrite, "onReveal");
    call(ClueWrite, "onSubmit", clue);
  }
  call(ClueGate, "onReveal");
  call(ClueCheck, "onDone");
  call(ClueGate, "onReveal");
  call(ClueGuess, "onAnswer", outcome);
  await settle();
}

beforeEach(() => {
  vi.clearAllMocks();
  unmount();
  log = [];
  entry.pinReady = true;
  entry.focused = true;
  entry.lang = "en";
  back.handlers = [];
  clock.now = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock.now);
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("One Clue screen: setup", () => {
  it("asks for a PIN first when none is set", () => {
    entry.pinReady = false;
    const node = render();
    expect(node.type).toBe(GamesPinSetup);
    expect(node.props.title).toBe("clueTitle");
  });

  it("shows no setup until the stored setup and seen list have been read", async () => {
    storage.getStoredClueSetup.mockResolvedValue(valid);
    storage.getStoredClueSeen.mockReturnValue(new Promise(() => {}));
    await settle();
    expect(has(ActivityIndicator)).toBe(true);
    expect(has(ClueSetupWizard)).toBe(false);
  });

  it("restores the last setup and offers to start with it", async () => {
    await load(valid);
    expect(storage.getStoredClueSeen).toHaveBeenCalledWith("en");
    expect(props(ClueSetupWizard)).toMatchObject({ value: valid, quickStart: true, step: 0 });
    expect(screen()).toMatchObject({ title: "clueTitle", tone: "game", color: undefined, scroll: true });
    unmount();
    await load({ ...valid, players: ["Ann"] });
    expect(props(ClueSetupWizard).quickStart).toBe(false);
  });

  it("saves the setup on Start and names the first guesser on their colour", async () => {
    await start();
    await settle();
    expect(storage.setStoredClueSetup).toHaveBeenCalledWith(valid);
    expect(props(ClueHandoff)).toMatchObject({ guesser: "Ann", next: "Bob", round: 1, total: 8, score: 0 });
    expect(screen()).toMatchObject({ color: playerColor(0), scroll: false });
  });

  it("saves nothing and stays on the step when Start is refused", async () => {
    await start({ ...valid, players: ["Ann", "Bob"] });
    expect(has(ClueSetupWizard)).toBe(true);
    expect(storage.setStoredClueSetup).not.toHaveBeenCalled();
    expect(props(ClueSetupWizard)).toMatchObject({ step: 1, quickStart: false });
  });

  it("deals the app language's words, the seen ones last", async () => {
    entry.lang = "tr";
    await start(valid, ["animals-2"]);
    call(ClueHandoff, "onBegin");
    expect(props(ClueWrite).word.startsWith("Zürafa")).toBe(true);
    expect(props(ClueWrite).word).not.toBe("ZürafaB");
  });
});

describe("One Clue screen: a round", () => {
  it("passes the phone to each clue giver in turn, on their colour, remounting the clue field", async () => {
    await start();
    call(ClueHandoff, "onBegin");
    expect(props(ClueWrite)).toMatchObject({ giver: "Bob", revealed: false });
    expect(screen().color).toBe(playerColor(1));
    const first = find(ClueWrite)!.key;
    call(ClueWrite, "onReveal");
    expect(props(ClueWrite).revealed).toBe(true);
    call(ClueWrite, "onSubmit", "Night");
    expect(props(ClueWrite)).toMatchObject({ giver: "Cem", revealed: false });
    expect(screen().color).toBe(playerColor(2));
    expect(find(ClueWrite)!.key).not.toBe(first);
    call(ClueWrite, "onReveal", undefined, 100);
    expect(props(ClueWrite).revealed).toBe(false);
  });

  it("checks the clues behind a gate, then hands them to the guesser behind another", async () => {
    await start();
    call(ClueHandoff, "onBegin");
    for (const clue of ["Night", "night"]) {
      call(ClueWrite, "onReveal");
      call(ClueWrite, "onSubmit", clue);
    }
    expect(props(ClueGate)).toMatchObject({ title: "clueCheckTitle", hint: "Ann, don't look", label: "clueShowClues" });
    expect(props(ClueGate).onColor).toBeFalsy();
    expect(screen().color).toBeUndefined();
    call(ClueGate, "onReveal");
    expect(props(ClueCheck).clues.map((c: { struck: boolean }) => c.struck)).toEqual([true, true]);
    call(ClueCheck, "onStrike", 1);
    call(ClueCheck, "onDone");
    expect(props(ClueGate)).toMatchObject({ title: "give it to Ann", onColor: true });
    expect(screen().color).toBe(playerColor(0));
    call(ClueGate, "onReveal");
    expect(props(ClueGuess)).toEqual({ guesser: "Ann", clues: ["night"], onAnswer: expect.any(Function) });
  });

  it("never gives the word to a screen the guesser sees before the result", async () => {
    await start();
    await round(["Night", "Sky"]);
    const word = props(ClueResult).result.word.word as string;
    const shown = log.slice(0, log.findIndex((e) => e.screen === "result"));
    const guesserSees = shown.filter(
      (e) => e.screen === "handoff" || e.screen === "guess" || (e.screen === "gate" && e.color === playerColor(0))
    );
    expect(new Set(guesserSees.map((e) => e.screen))).toEqual(new Set(["handoff", "gate", "guess"]));
    for (const e of guesserSees) expect(JSON.stringify(e.props)).not.toContain(word);
  });

  it("shows the result, saves the seen word and goes on to the next guesser", async () => {
    await start();
    await round(["Night", "Sky"]);
    const result = props(ClueResult);
    expect(result).toMatchObject({ round: 1, total: 8, score: 1 });
    expect(storage.setStoredClueSeen).toHaveBeenCalledWith("en", [result.result.word.id]);
    expect(screen().color).toBeUndefined();
    call(ClueResult, "onNext");
    expect(props(ClueHandoff)).toMatchObject({ guesser: "Bob", next: "Cem", round: 2, score: 1 });
  });

  it("ends after the deck, plays again with the rotation carried on, and goes back to the setup on New game", async () => {
    await start({ ...valid, level: "hard" });
    for (let i = 0; i < 8; i++) {
      await round(["Night", "Sky"], i % 2 === 0 ? "got" : "missed");
      call(ClueResult, "onNext");
      await settle();
    }
    expect(props(ClueEnd).results).toHaveLength(8);
    call(ClueEnd, "onPlayAgain");
    await settle();
    expect(props(ClueHandoff)).toMatchObject({ guesser: "Cem", next: "Ann", round: 1, score: 0 });
    for (let i = 0; i < 8; i++) {
      await round(["Night", "Sky"], "passed");
      call(ClueResult, "onNext");
      await settle();
    }
    call(ClueEnd, "onNewGame");
    await settle();
    // Start was pressed on the last step: the wizard opens again on the first, with the quick start.
    expect(props(ClueSetupWizard)).toMatchObject({ value: { ...valid, level: "hard" }, step: 0, quickStart: true });
  });

  it("starts the next game after the last one's words", async () => {
    await start();
    for (let i = 0; i < 8; i++) {
      await round(["Night", "Sky"]);
      call(ClueResult, "onNext");
      await settle();
    }
    const last = (props(ClueEnd).results as { word: { word: string } }[]).map((r) => r.word.word);
    expect(last).toHaveLength(8);
    call(ClueEnd, "onNewGame");
    await settle();
    call(ClueSetupWizard, "onStep", 1);
    call(ClueSetupWizard, "onStart");
    await settle();
    call(ClueHandoff, "onBegin");
    expect(last).not.toContain(props(ClueWrite).word);
  });
});

/** Back handlers still listening. */
const listening = () => back.handlers.filter((h) => !h.removed);

describe("One Clue screen: Android back", () => {
  it("is swallowed while the clues are written, checked and guessed, and only then", async () => {
    await start();
    expect(listening()).toHaveLength(0);
    call(ClueHandoff, "onBegin");
    await settle();
    expect(listening()).toHaveLength(1);
    expect(listening()[0].fn()).toBe(true);
    for (const clue of ["Night", "Sky"]) {
      call(ClueWrite, "onReveal");
      call(ClueWrite, "onSubmit", clue);
    }
    await settle();
    expect(has(ClueGate)).toBe(true);
    expect(listening()).toHaveLength(1);
    call(ClueGate, "onReveal");
    call(ClueCheck, "onDone");
    await settle();
    expect(has(ClueGate)).toBe(true);
    expect(listening()).toHaveLength(1);
    expect(listening()[0].fn()).toBe(true);
    call(ClueGate, "onReveal");
    call(ClueGuess, "onAnswer", "got");
    await settle();
    expect(has(ClueResult)).toBe(true);
    expect(listening()).toHaveLength(0);
    call(ClueResult, "onNext");
    await settle();
    expect(has(ClueHandoff)).toBe(true);
    expect(listening()).toHaveLength(0);
  });

  it("is left alone while another screen covers the game, and released on unmount", async () => {
    await start();
    call(ClueHandoff, "onBegin");
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

describe("One Clue screen: leaving the game", () => {
  it("asks before leaving once the game starts, and hides back and exit while the round is on screen", async () => {
    await load(valid);
    expect([screen().confirmBack, screen().nav, leave.active]).toEqual([false, true, false]);
    await start();
    expect([screen().confirmBack, screen().nav, leave.active]).toEqual([true, true, true]);
    call(ClueHandoff, "onBegin");
    // The round blocks back outright, so it does not ask.
    expect([screen().confirmBack, screen().nav, leave.active]).toEqual([true, false, false]);
  });
});
