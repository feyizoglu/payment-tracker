import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import {
  CATEGORY_LABEL_KEYS,
  DEFAULT_SETUP,
  GAME_THEME,
  IMPOSTER_CATEGORIES,
  IMPOSTER_WORDS,
  playerColor,
  type GameState,
  type ImposterSetup,
} from "@ptracker/shared/imposter";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  index: 0,
}));
const storage = vi.hoisted(() => ({
  getStoredSetup: vi.fn(),
  setStoredSetup: vi.fn(async (_setup: unknown) => undefined),
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
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
  };
});
vi.mock("react-native", () => ({
  ActivityIndicator: () => null,
  Pressable: () => null,
  Text: () => null,
  View: () => null,
}));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "imposterCategoryHint" ? "hint {category}" : String(key)),
    }),
    lang: "tr",
  }),
}));
vi.mock("@/components/games/game-mode-entry", () => ({
  GamesPinSetup: () => null,
  useEnterGameModeOnce: () => true,
}));
vi.mock("@/components/games/game-screen", () => ({ GameScreen: () => null }));
vi.mock("@/components/games/imposter-discuss", () => ({ ImposterDiscuss: () => null }));
vi.mock("@/components/games/imposter-result", () => ({ ImposterResult: () => null }));
vi.mock("@/components/games/imposter-setup", () => ({ ImposterSetupWizard: () => null }));
vi.mock("@/components/games/deal-turn", () => ({ DealTurn: () => null }));
vi.mock("@/components/games/pass-phone", () => ({ PassPhone: () => null }));
vi.mock("@/lib/imposter-storage", () => storage);

import { Pressable } from "react-native";
import ImposterScreen from "@/app/games/imposter";
import { DealTurn } from "@/components/games/deal-turn";
import { GameScreen } from "@/components/games/game-screen";
import { ImposterDiscuss } from "@/components/games/imposter-discuss";
import { ImposterResult } from "@/components/games/imposter-result";
import { ImposterSetupWizard } from "@/components/games/imposter-setup";
import { PassPhone } from "@/components/games/pass-phone";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };
const category = IMPOSTER_CATEGORIES[0];
const entry = IMPOSTER_WORDS[category][0].tr;

function render(): Node {
  hooks.index = 0;
  hooks.effects = [];
  return ImposterScreen() as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

function find(type: unknown): Node {
  return nodes(render()).find((n) => n.type === type)!;
}

function pass(): Node {
  return nodes(render()).find((n) => n.type === DealTurn || n.type === PassPhone)!;
}

function reveal() {
  (pass().props.onReveal as () => void)();
}

function nextPlayer() {
  (find(DealTurn).props.onNext as () => void)();
}

function ballot(): Node[] {
  return nodes(pass().props.children).filter((n) => n.type === Pressable);
}

function vote(name: string) {
  reveal();
  (ballot().find((b) => text(b) === name)!.props.onPress as () => void)();
}

async function start(setup: ImposterSetup) {
  storage.getStoredSetup.mockResolvedValue(setup);
  render();
  for (const effect of hooks.effects) effect();
  await Promise.resolve();
  await Promise.resolve();
  (find(ImposterSetupWizard).props.onStart as () => void)();
}

function dealAll(count: number) {
  for (let i = 0; i < count; i++) {
    reveal();
    nextPlayer();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.states = [];
  let clock = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => (clock += 1000));
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ImposterScreen deal card", () => {
  it("shows the imposter card with the category hint", async () => {
    await start(valid);
    reveal();
    expect(pass().props.name).toBe("Ann");
    const card = text(pass().props.children);
    expect(card).toContain("imposterYouAre");
    expect(card).toContain(`hint ${CATEGORY_LABEL_KEYS[category]}`);
    expect(card).not.toContain(entry.word);
  });

  it("shows the pair word to an imposter who knows the role", async () => {
    await start({ ...valid, mode: "similar-word", imposterKnows: true });
    reveal();
    const card = text(pass().props.children);
    expect(card).toContain("imposterYouAre");
    expect(card).toContain(entry.pair);
  });

  it("hands the phone on and shows the crew word to the next player", async () => {
    await start(valid);
    dealAll(1);
    expect(pass().props.name).toBe("Bob");
    expect(pass().props.revealed).toBe(false);
    reveal();
    const card = text(pass().props.children);
    expect(card).toContain(entry.word);
    expect(card).not.toContain("imposterYouAre");
  });
});

describe("ImposterScreen vote ballot", () => {
  it("offers every player except the voter and records each vote", async () => {
    await start({ ...valid, voting: true });
    dealAll(3);
    (find(ImposterDiscuss).props.onFinish as () => void)();
    reveal();
    expect(pass().props.name).toBe("Ann");
    expect(ballot().map(text)).toEqual(["Bob", "Cem"]);
    (ballot().find((b) => text(b) === "Bob")!.props.onPress as () => void)();
    expect(pass().props.name).toBe("Bob");
    reveal();
    expect(ballot().map(text)).toEqual(["Ann", "Cem"]);
    (ballot().find((b) => text(b) === "Ann")!.props.onPress as () => void)();
    vote("Ann");
    expect((find(ImposterResult).props.state as GameState).votes).toEqual([1, 0, 0]);
  });
});

describe("ImposterScreen onEnd", () => {
  it("shows the setup form with the played setup again", async () => {
    await start({ ...valid, players: [" Ann", "Bob ", "Cem"] });
    dealAll(3);
    (find(ImposterDiscuss).props.onFinish as () => void)();
    (find(ImposterResult).props.onEnd as () => void)();
    expect(find(ImposterSetupWizard).props.value).toEqual(valid);
  });
});

describe("ImposterScreen look", () => {
  it("draws each turn on that player's colour without scrolling, and the other screens dark", async () => {
    storage.getStoredSetup.mockResolvedValue(valid);
    render();
    expect(find(GameScreen).props).toMatchObject({ tone: "game", color: undefined, scroll: true });
    await start(valid);
    expect(find(GameScreen).props).toMatchObject({ tone: "game", color: playerColor(0), scroll: false });
    dealAll(1);
    expect(find(GameScreen).props.color).toBe(playerColor(1));
    dealAll(2);
    expect(find(GameScreen).props).toMatchObject({ color: undefined, scroll: true });
    expect(find(ImposterDiscuss).props.starterColor).toBe(playerColor(0));
  });

  it("colours the vote screen by voter and each ballot button by candidate", async () => {
    await start({ ...valid, voting: true });
    dealAll(3);
    (find(ImposterDiscuss).props.onFinish as () => void)();
    expect(find(GameScreen).props).toMatchObject({ color: playerColor(0), scroll: true });
    reveal();
    expect(ballot().map((b) => (b.props.style as { backgroundColor: string }).backgroundColor)).toEqual([
      playerColor(1),
      playerColor(2),
    ]);
    const labelColours = ballot().map((b) =>
      nodes(b.props.children).map((n) => (n.props.style as { color?: string } | undefined)?.color)
    );
    expect(labelColours).toEqual([[GAME_THEME.ink], [GAME_THEME.ink]]);
  });

  it("draws the discussion starter on that player's colour, whoever starts", async () => {
    vi.mocked(Math.random).mockReturnValue(0.99);
    await start(valid);
    dealAll(3);
    const discuss = find(ImposterDiscuss).props;
    expect(discuss.starter).toBe("Cem");
    expect(discuss.starterColor).toBe(playerColor(2));
  });
});

describe("ImposterScreen wizard", () => {
  it("offers quick start only when a valid setup was saved", async () => {
    storage.getStoredSetup.mockResolvedValue(valid);
    render();
    for (const effect of hooks.effects) effect();
    await Promise.resolve();
    await Promise.resolve();
    expect(find(ImposterSetupWizard).props.quickStart).toBe(true);

    hooks.states = [];
    storage.getStoredSetup.mockResolvedValue({ ...valid, players: [] });
    render();
    for (const effect of hooks.effects) effect();
    await Promise.resolve();
    await Promise.resolve();
    expect(find(ImposterSetupWizard).props.quickStart).toBe(false);
  });

  it("keeps the step and opens on the first step again after a game", async () => {
    storage.getStoredSetup.mockResolvedValue(valid);
    render();
    for (const effect of hooks.effects) effect();
    await Promise.resolve();
    await Promise.resolve();
    (find(ImposterSetupWizard).props.onStep as (n: number) => void)(2);
    expect(find(ImposterSetupWizard).props.step).toBe(2);
    (find(ImposterSetupWizard).props.onStart as () => void)();
    dealAll(3);
    (find(ImposterDiscuss).props.onFinish as () => void)();
    (find(ImposterResult).props.onEnd as () => void)();
    expect(find(ImposterSetupWizard).props.step).toBe(0);
    expect(find(ImposterSetupWizard).props.quickStart).toBe(true);
  });

  it("offers quick start after the first game on a device with nothing saved", async () => {
    storage.getStoredSetup.mockResolvedValue(DEFAULT_SETUP);
    render();
    for (const effect of hooks.effects) effect();
    await Promise.resolve();
    await Promise.resolve();
    expect(find(ImposterSetupWizard).props.quickStart).toBe(false);
    (find(ImposterSetupWizard).props.onChange as (next: ImposterSetup) => void)(valid);
    expect(find(ImposterSetupWizard).props.quickStart).toBe(false);
    (find(ImposterSetupWizard).props.onStart as () => void)();
    dealAll(3);
    (find(ImposterDiscuss).props.onFinish as () => void)();
    (find(ImposterResult).props.onEnd as () => void)();
    expect(find(ImposterSetupWizard).props.quickStart).toBe(true);
  });
});

describe("ImposterScreen roles", () => {
  const colourUtility = /\b(?:text|bg)-(?:red|green)\b|\b(?:text|bg)-[a-z]+-\d+\b/;

  function card() {
    const all = nodes(pass().props.children);
    return {
      imposter: text(pass().props.children).includes("imposterYouAre"),
      classes: all.map((n) => String(n.props.className ?? "")),
      colours: all.flatMap((n) => {
        const colour = (n.props.style as { color?: string } | undefined)?.color;
        return colour === undefined ? [] : [colour];
      }),
    };
  }

  it("draws the imposter card and the crew card the same way", async () => {
    await start(valid);
    reveal();
    const first = card();
    dealAll(1);
    reveal();
    const second = card();
    expect([first.imposter, second.imposter]).toEqual([true, false]);
    for (const { classes, colours } of [first, second]) {
      expect(classes.length).toBeGreaterThan(0);
      for (const cls of classes) expect(cls).not.toMatch(colourUtility);
      expect(colours.length).toBeGreaterThan(0);
      for (const colour of colours) expect([GAME_THEME.text, GAME_THEME.muted]).toContain(colour);
    }
  });

  it("colours a turn by the player's place, whatever the role", async () => {
    await start(valid);
    reveal();
    expect(card().imposter).toBe(true);
    expect(find(GameScreen).props.color).toBe(playerColor(0));
    dealAll(1);
    reveal();
    expect(card().imposter).toBe(false);
    expect(find(GameScreen).props.color).toBe(playerColor(1));

    // The same seats with the roles dealt the other way round.
    hooks.states = [];
    vi.mocked(Math.random).mockReturnValue(0.99);
    await start(valid);
    reveal();
    expect(card().imposter).toBe(false);
    expect(find(GameScreen).props.color).toBe(playerColor(0));
    dealAll(2);
    reveal();
    expect(card().imposter).toBe(true);
    expect(find(GameScreen).props.color).toBe(playerColor(2));
  });
});

describe("ImposterScreen deal turn", () => {
  it("mounts a fresh deal turn for each player", async () => {
    await start(valid);
    expect(find(DealTurn).key).toBe("0");
    reveal();
    expect(find(DealTurn).key).toBe("0");
    nextPlayer();
    expect(find(DealTurn).key).toBe("1");
    dealAll(1);
    expect(find(DealTurn).key).toBe("2");
  });
});

describe("ImposterScreen start", () => {
  it("saves the setup on screen when a game starts", async () => {
    await start(valid);
    expect(storage.setStoredSetup).toHaveBeenCalledTimes(1);
    expect(storage.setStoredSetup).toHaveBeenCalledWith(valid);
  });

  it("starts with the setup on screen, not the saved one", async () => {
    storage.getStoredSetup.mockResolvedValue(valid);
    render();
    for (const effect of hooks.effects) effect();
    await Promise.resolve();
    await Promise.resolve();
    expect(find(ImposterSetupWizard).props.quickStart).toBe(true);
    const edited: ImposterSetup = { ...valid, players: ["Ann", "Zed", "Cem"] };
    (find(ImposterSetupWizard).props.onChange as (next: ImposterSetup) => void)(edited);
    (find(ImposterSetupWizard).props.onStart as () => void)();
    expect(storage.setStoredSetup).toHaveBeenCalledWith(edited);
    dealAll(1);
    expect(pass().props.name).toBe("Zed");
    dealAll(2);
    (find(ImposterDiscuss).props.onFinish as () => void)();
    expect((find(ImposterResult).props.state as GameState).setup.players).toEqual(["Ann", "Zed", "Cem"]);
  });
});

describe("ImposterScreen vote and result look", () => {
  it("draws each voter's turn on that voter's colour and the result dark", async () => {
    await start({ ...valid, voting: true });
    dealAll(3);
    (find(ImposterDiscuss).props.onFinish as () => void)();
    for (let voter = 0; voter < 3; voter++) {
      expect(find(GameScreen).props).toMatchObject({ tone: "game", color: playerColor(voter), scroll: true });
      reveal();
      expect(find(GameScreen).props.color).toBe(playerColor(voter));
      (ballot()[0].props.onPress as () => void)();
    }
    expect(find(ImposterResult)).toBeDefined();
    const screen = find(GameScreen).props;
    expect(screen.tone).toBe("game");
    expect(screen.color).toBeUndefined();
    expect(screen.scroll).toBe(true);
  });
});
