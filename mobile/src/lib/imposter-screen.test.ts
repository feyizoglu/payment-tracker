import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import {
  CATEGORY_LABEL_KEYS,
  DEFAULT_SETUP,
  IMPOSTER_CATEGORIES,
  IMPOSTER_WORDS,
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
vi.mock("@/components/games/imposter-setup", () => ({ ImposterSetupForm: () => null }));
vi.mock("@/components/games/pass-phone", () => ({ PassPhone: () => null }));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/lib/imposter-storage", () => storage);

import { Pressable } from "react-native";
import ImposterScreen from "@/app/games/imposter";
import { ImposterDiscuss } from "@/components/games/imposter-discuss";
import { ImposterResult } from "@/components/games/imposter-result";
import { ImposterSetupForm } from "@/components/games/imposter-setup";
import { PassPhone } from "@/components/games/pass-phone";
import { PrimaryButton } from "@/components/ui/primary-button";

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
  return find(PassPhone);
}

function reveal() {
  (pass().props.onReveal as () => void)();
}

function hideNext() {
  const next = nodes(pass().props.children).find((n) => n.type === PrimaryButton && n.props.label === "imposterHideNext")!;
  (next.props.onPress as () => void)();
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
  (find(ImposterSetupForm).props.onStart as () => void)();
}

function dealAll(count: number) {
  for (let i = 0; i < count; i++) {
    reveal();
    hideNext();
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
    expect(find(ImposterSetupForm).props.value).toEqual(valid);
  });
});
