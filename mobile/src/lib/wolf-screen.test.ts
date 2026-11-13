import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, NARRATOR_COLOR, canPick, playerColor, type GameState, type WolfSetup } from "@ptracker/shared/wolf-game";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  index: 0,
}));
const storage = vi.hoisted(() => ({
  getStoredWolfSetup: vi.fn(),
  setStoredWolfSetup: vi.fn(async (_setup: unknown) => undefined),
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
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
  };
});
vi.mock("react-native", () => ({ ActivityIndicator: () => null, Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }), lang: "tr" }),
}));
vi.mock("@/components/games/game-mode-entry", () => ({
  GamesPinSetup: () => null,
  useEnterGameModeOnce: () => entry.pinReady,
}));
vi.mock("@/components/games/game-screen", () => ({ GameScreen: () => null }));
vi.mock("@/components/games/deal-turn", () => ({ DealTurn: () => null }));
vi.mock("@/components/games/pass-phone", () => ({ PassPhone: () => null }));
vi.mock("@/components/games/wolf/wolf-card", () => ({ WolfCard: () => null }));
vi.mock("@/components/games/wolf/wolf-choose", () => ({ WolfChoose: () => null }));
vi.mock("@/components/games/wolf/wolf-day", () => ({ WolfDay: () => null }));
vi.mock("@/components/games/wolf/wolf-end", () => ({ WolfEnd: () => null }));
vi.mock("@/components/games/wolf/wolf-narrator", () => ({ WolfNarrator: () => null }));
vi.mock("@/components/games/wolf/wolf-removal", () => ({ WolfRemoval: () => null }));
vi.mock("@/components/games/wolf/wolf-roster", () => ({ WolfRoster: () => null }));
vi.mock("@/components/games/wolf/wolf-rules-button", () => ({ WolfRulesButton: () => null }));
vi.mock("@/components/games/wolf/wolf-setup", () => ({ WolfSetupWizard: () => null }));
vi.mock("@/components/games/wolf/wolf-this-game", () => ({ WolfThisGame: () => null }));
vi.mock("@/lib/wolf-game-storage", () => storage);

import { ActivityIndicator } from "react-native";
import WolfScreen from "@/app/games/wolf";
import { GamesPinSetup } from "@/components/games/game-mode-entry";
import { DealTurn } from "@/components/games/deal-turn";
import { PassPhone } from "@/components/games/pass-phone";
import { WolfChoose } from "@/components/games/wolf/wolf-choose";
import { WolfDay } from "@/components/games/wolf/wolf-day";
import { WolfEnd } from "@/components/games/wolf/wolf-end";
import { WolfNarrator } from "@/components/games/wolf/wolf-narrator";
import { WolfRemoval } from "@/components/games/wolf/wolf-removal";
import { WolfRoster } from "@/components/games/wolf/wolf-roster";
import { WolfRulesButton } from "@/components/games/wolf/wolf-rules-button";
import { WolfSetupWizard } from "@/components/games/wolf/wolf-setup";
import { WolfThisGame } from "@/components/games/wolf/wolf-this-game";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

// Math.random is 0: the deal seats Ann seer, Bob doctor, Cem and Dan villagers, Eda wolf.
const valid: WolfSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem", "Dan", "Eda"] };

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function render(): Node {
  hooks.index = 0;
  hooks.effects = [];
  return WolfScreen() as Node;
}

const find = (type: unknown) => nodes(render()).find((n) => n.type === type);
const has = (type: unknown) => find(type) !== undefined;
const call = (type: unknown, name: string, ...args: unknown[]) => (find(type)!.props[name] as (...a: unknown[]) => void)(...args);
const screen = () => render().props;

async function load(setup: WolfSetup) {
  storage.getStoredWolfSetup.mockResolvedValue(setup);
  render();
  for (const effect of hooks.effects) effect();
  await Promise.resolve();
  await Promise.resolve();
}

async function start(setup: WolfSetup = valid) {
  await load(setup);
  call(WolfSetupWizard, "onStart");
}

function dealAll(count: number) {
  for (let i = 0; i < count; i++) {
    call(DealTurn, "onReveal");
    call(DealTurn, "onNext");
  }
}

// The phone goes round once: every visitor holds the card and picks the first player allowed.
function passNight() {
  for (let guard = 0; has(DealTurn) || has(WolfChoose); guard++) {
    if (guard > 30) throw new Error("the night did not end");
    if (has(DealTurn)) {
      call(DealTurn, "onReveal");
      call(DealTurn, "onNext");
    } else {
      const s = find(WolfChoose)!.props.state as GameState;
      call(WolfChoose, "onPick", s.alive.findIndex((_, i) => canPick(s, i)));
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.states = [];
  entry.pinReady = true;
  let clock = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Wolf Night screen: This game", () => {
  it("comes after the wizard, before any card is dealt, and the setup is saved", async () => {
    await start();
    expect(storage.setStoredWolfSetup).toHaveBeenCalledWith(valid);
    expect(find(WolfThisGame)!.props.setup).toEqual(valid);
    expect(find(WolfThisGame)!.props.onClose).toBeUndefined();
    expect(has(DealTurn)).toBe(false);
    call(WolfThisGame, "onDeal");
    expect(find(DealTurn)!.props.name).toBe("Ann");
  });

  it("comes after Start with last settings", async () => {
    await load(valid);
    expect(find(WolfSetupWizard)!.props.quickStart).toBe(true);
    call(WolfSetupWizard, "onStart");
    expect(has(WolfThisGame)).toBe(true);
  });

  it("comes again before the deal of Play again", async () => {
    await start();
    call(WolfThisGame, "onDeal");
    dealAll(5);
    passNight();
    call(WolfRemoval, "onContinue");
    call(WolfDay, "onVote");
    call(WolfDay, "onVoteOut", 4);
    call(WolfRemoval, "onContinue");
    expect((find(WolfEnd)!.props.state as GameState).winner).toBe("village");
    call(WolfEnd, "onPlayAgain");
    expect(find(WolfThisGame)!.props.onDeal).toBeTypeOf("function");
  });

  it("shows no setup until the stored one has been read", () => {
    storage.getStoredWolfSetup.mockReturnValue(new Promise(() => {}));
    render();
    for (const effect of hooks.effects) effect();
    expect(has(ActivityIndicator)).toBe(true);
    expect(has(WolfSetupWizard)).toBe(false);
  });
});

describe("Wolf Night screen: PIN", () => {
  it("asks for a PIN first when none is set", () => {
    entry.pinReady = false;
    const node = render();
    expect(node.type).toBe(GamesPinSetup);
    expect(node.props.title).toBe("wolfTitle");
    expect(has(WolfSetupWizard)).toBe(false);
  });
});

describe("Wolf Night screen: back to the setup", () => {
  it("hands the played names back to the wizard", async () => {
    await start({ ...valid, players: ["Ann ", "Bob", "Cem", "Dan", "Eda"] });
    call(WolfThisGame, "onBack");
    expect((find(WolfSetupWizard)!.props.value as WolfSetup).players[0]).toBe("Ann");
  });

  it("offers the quick start on the way back after a first game", async () => {
    await load(DEFAULT_SETUP);
    expect(find(WolfSetupWizard)!.props.quickStart).toBe(false);
    call(WolfSetupWizard, "onChange", valid);
    call(WolfSetupWizard, "onStart");
    call(WolfThisGame, "onBack");
    expect(find(WolfSetupWizard)!.props.quickStart).toBe(true);
  });

  it("opens the wizard on its first step on the way back", async () => {
    await load(valid);
    call(WolfSetupWizard, "onStep", 2);
    expect(find(WolfSetupWizard)!.props.step).toBe(2);
    call(WolfSetupWizard, "onStart");
    call(WolfThisGame, "onBack");
    expect(find(WolfSetupWizard)!.props.step).toBe(0);
  });
});

describe("Wolf Night screen: morning and vote result", () => {
  it("lets the hunter shoot a player out and ends the game when the wolf is shot", async () => {
    await start({ ...valid, specials: ["hunter"] });
    call(WolfThisGame, "onDeal");
    dealAll(5);
    passNight();
    call(WolfRemoval, "onShoot", 4);
    const s = find(WolfRemoval)!.props.state as GameState;
    expect([s.removal?.shot, s.alive[4]]).toEqual([4, false]);
    call(WolfRemoval, "onContinue");
    expect((find(WolfEnd)!.props.state as GameState).winner).toBe("village");
  });

  it("offers the rules in the morning but not on the vote result", async () => {
    await start();
    call(WolfThisGame, "onDeal");
    dealAll(5);
    passNight();
    expect(find(WolfRemoval)!.props.onRules).toBeTypeOf("function");
    call(WolfRemoval, "onContinue");
    call(WolfDay, "onVote");
    call(WolfDay, "onVoteOut", 2);
    expect(has(WolfRemoval)).toBe(true);
    expect(find(WolfRemoval)!.props.onRules).toBeUndefined();
  });
});

describe("Wolf Night screen: narrator night", () => {
  it("records the narrator's pick as the wolves' victim", async () => {
    await start({ ...valid, night: "narrator" });
    call(WolfThisGame, "onDeal");
    dealAll(5);
    call(PassPhone, "onReveal");
    call(WolfRoster, "onStart");
    call(WolfNarrator, "onNext");
    call(WolfNarrator, "onPick", 1);
    expect((find(WolfNarrator)!.props.state as GameState).night?.victim).toBe(1);
  });

  it("turns the witch's Heal on for the wolves' victim", async () => {
    await start({ ...valid, night: "narrator", specials: ["witch"] });
    call(WolfThisGame, "onDeal");
    dealAll(5);
    call(PassPhone, "onReveal");
    call(WolfRoster, "onStart");
    call(WolfNarrator, "onNext");
    const s = find(WolfNarrator)!.props.state as GameState;
    call(WolfNarrator, "onPick", s.alive.findIndex((_, i) => canPick(s, i)));
    call(WolfNarrator, "onNext");
    expect((find(WolfNarrator)!.props.state as GameState).night?.heal).toBe(false);
    call(WolfNarrator, "onHeal");
    expect((find(WolfNarrator)!.props.state as GameState).night?.heal).toBe(true);
  });
});

describe("Wolf Night screen: day", () => {
  it("goes back from the vote to the talk", async () => {
    await start();
    call(WolfThisGame, "onDeal");
    dealAll(5);
    passNight();
    call(WolfRemoval, "onContinue");
    call(WolfDay, "onVote");
    expect((find(WolfDay)!.props.state as GameState).dayStep).toBe("vote");
    call(WolfDay, "onTalk");
    expect((find(WolfDay)!.props.state as GameState).dayStep).toBe("talk");
  });
});

describe("Wolf Night screen: turns", () => {
  it("deals each card on that player's colour, on a screen that does not scroll", async () => {
    await start();
    call(WolfThisGame, "onDeal");
    expect(screen()).toMatchObject({ title: "wolfTitle", tone: "game", color: playerColor(0), scroll: false });
    expect(find(DealTurn)!.key).toBe("deal-0");
    dealAll(1);
    expect([find(DealTurn)!.props.name, screen().color, find(DealTurn)!.key]).toEqual(["Bob", playerColor(1), "deal-1"]);
  });

  it("opens the rules over a card without the Deal button and comes back to the same card", async () => {
    await start();
    call(WolfThisGame, "onDeal");
    dealAll(1);
    expect(find(WolfRulesButton)!.props.ink).toBe(true);
    call(WolfRulesButton, "onPress");
    expect(find(WolfThisGame)!.props.onDeal).toBeUndefined();
    expect(screen().color).toBeUndefined();
    call(WolfThisGame, "onClose");
    expect(find(DealTurn)!.props.name).toBe("Bob");
  });

  it("goes on from a night card with Continue to the choice on the visitor's colour", async () => {
    await start();
    call(WolfThisGame, "onDeal");
    dealAll(5);
    expect([find(DealTurn)!.props.nextLabel, find(DealTurn)!.key, screen().scroll]).toEqual([
      "wolfContinue",
      "night-1-main-0-card",
      false,
    ]);
    call(DealTurn, "onReveal");
    call(DealTurn, "onNext");
    expect(has(WolfChoose)).toBe(true);
    expect([screen().color, screen().scroll]).toEqual([playerColor(0), true]);
  });

  it("shows the pick's result on a second held card under the visitor's name, then the next player", async () => {
    await start();
    call(WolfThisGame, "onDeal");
    dealAll(5);
    call(DealTurn, "onReveal");
    call(DealTurn, "onNext");
    call(WolfChoose, "onPick", 1);
    const result = find(DealTurn)!;
    expect([result.props.name, result.props.title, result.props.nextLabel, result.key]).toEqual([
      "Ann",
      "Ann",
      "wolfContinue",
      "night-1-main-0-result",
    ]);
    expect([screen().color, screen().scroll, find(WolfRulesButton)!.props.ink]).toEqual([playerColor(0), false, true]);
    call(DealTurn, "onReveal");
    call(DealTurn, "onNext");
    expect([find(DealTurn)!.props.name, find(DealTurn)!.props.title]).toEqual(["Bob", undefined]);
  });

  it("gives the narrator the phone and the roster after the last card", async () => {
    await start({ ...valid, night: "narrator" });
    call(WolfThisGame, "onDeal");
    dealAll(5);
    expect([find(PassPhone)!.props.name, screen().color]).toEqual(["wolfTheNarrator", NARRATOR_COLOR]);
    expect(find(WolfRulesButton)!.props.ink).toBe(true);
    call(PassPhone, "onReveal");
    call(WolfRoster, "onStart");
    expect(has(WolfNarrator)).toBe(true);
    expect(screen().color).toBeUndefined();
  });
});
