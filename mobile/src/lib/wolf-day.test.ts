import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, initialGameState, type GameState, type Role, type WolfSetup } from "@ptracker/shared/wolf-game";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  index: 0,
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
    useEffect: (effect: () => void | (() => void)) => {
      hooks.effects.push(effect);
    },
  };
});

const KEYS: Record<string, string> = {
  wolfDayN: "day {n}",
  wolfHunterShoots: "shoots {name}",
  wolfHunterShot: "{name} took {target}",
};
vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => KEYS[String(key)] ?? String(key) }) }),
}));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));

import { Pressable, View } from "react-native";
import { WolfDay } from "@/components/games/wolf/wolf-day";
import { WolfEnd } from "@/components/games/wolf/wolf-end";
import { WolfPicker } from "@/components/games/wolf/wolf-picker";
import { WolfRemoval } from "@/components/games/wolf/wolf-removal";
import { WolfRulesButton } from "@/components/games/wolf/wolf-rules-button";
import { PrimaryButton } from "@/components/ui/primary-button";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onShoot = vi.fn();
const onContinue = vi.fn();
const onRules = vi.fn();
const onVote = vi.fn();
const onTalk = vi.fn();
const onVoteOut = vi.fn();
const onPlayAgain = vi.fn();
const onNewGame = vi.fn();
const NAMES = ["Ann", "Bob", "Cem", "Dan", "Eda"];
// Ann wolf, Bob hunter, Cem villager, Dan seer, Eda villager.
const roles: Role[] = ["wolf", "hunter", "villager", "seer", "villager"];

function game(over: Partial<GameState>, setup: Partial<WolfSetup> = {}): GameState {
  const s = { ...DEFAULT_SETUP, players: NAMES, ...setup };
  return { ...initialGameState(s), roles, alive: roles.map(() => true), ...over };
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

const press = (node: Node | undefined) => (node!.props.onPress as () => void)();
const find = (tree: Node, type: unknown) => nodes(tree).find((n) => n.type === type);
const pressable = (tree: Node, label: string) => nodes(tree).find((n) => n.type === Pressable && text(n) === label);
const rows = (tree: Node) =>
  nodes(tree)
    .filter((n) => n.type === View && (n.props.style as { backgroundColor?: string } | undefined)?.backgroundColor)
    .map(text);

beforeEach(() => {
  vi.clearAllMocks();
  hooks.states = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WolfRemoval", () => {
  const render = (s: GameState, rules = true) =>
    WolfRemoval({ state: s, onShoot, onContinue, onRules: rules ? onRules : undefined }) as Node;

  it("says nobody was removed tonight and goes on", () => {
    const tree = render(game({ phase: "morning", removal: { removed: [], hunter: null, shot: null } }));
    expect(text(tree)).toContain("wolfMorning");
    expect(text(tree)).toContain("wolfNobodyRemoved");
    expect(find(tree, WolfRulesButton)!.props.onPress).toBe(onRules);
    expect(find(tree, PrimaryButton)!.props).toMatchObject({ label: "wolfContinue", onPress: onContinue });
  });

  it("lists the removed players, with their roles only when that setting is on", () => {
    const over = { phase: "morning" as const, alive: [true, true, false, true, false], removal: { removed: [2, 4], hunter: null, shot: null } };
    expect(rows(render(game(over)))).toEqual(["CemwolfRoleVillager", "EdawolfRoleVillager"]);
    expect(rows(render(game(over, { showRoles: false })))).toEqual(["Cem", "Eda"]);
  });

  it("has the hunter shoot one of the players still in the game before going on", () => {
    const tree = render(game({ phase: "morning", alive: [true, false, true, true, true], removal: { removed: [1], hunter: 1, shot: null } }));
    expect(text(tree)).toContain("shoots Bob");
    const picker = find(tree, WolfPicker)!;
    expect(picker.props.options).toEqual([0, 2, 3, 4].map((seat) => ({ seat, enabled: true })));
    expect(picker.props.onPick).toBe(onShoot);
    expect(find(tree, PrimaryButton)).toBeUndefined();
    const shot = render(game({ phase: "morning", alive: [false, false, true, true, true], removal: { removed: [1], hunter: 1, shot: 0 } }));
    expect(text(shot)).toContain("Bob took Ann");
    expect(find(shot, PrimaryButton)).toBeDefined();
  });

  it("shows the vote's result", () => {
    const tree = render(game({ phase: "day", dayStep: "result", removal: { removed: [], hunter: null, shot: null } }), false);
    expect(text(tree)).toContain("wolfVote");
    expect(text(tree)).toContain("wolfNobodyVotedOut");
    expect(find(tree, WolfRulesButton)).toBeUndefined();
  });

  it("lists who the vote put out under the voted-out heading", () => {
    const tree = render(game({ phase: "day", dayStep: "result", alive: [true, true, false, true, true], removal: { removed: [2], hunter: null, shot: null } }));
    expect(text(tree)).toContain("wolfVotedOut");
    expect(text(tree)).not.toContain("wolfRemovedTonight");
    expect(rows(tree)).toEqual(["CemwolfRoleVillager"]);
  });
});

describe("WolfDay", () => {
  function render(s: GameState): Node {
    hooks.index = 0;
    hooks.effects = [];
    return WolfDay({ state: s, onVote, onTalk, onVoteOut, onRules }) as Node;
  }
  const day = (over: Partial<GameState> = {}, setup: Partial<WolfSetup> = {}) =>
    game({ phase: "day", dayStep: "talk", alive: [true, false, true, true, false], ...over }, setup);

  it("lists the players still in the game and the removed ones, with roles when that setting is on", () => {
    const out = text(render(day()));
    expect(out).toContain("wolfInGame");
    expect(out).toContain("AnnCemDan");
    expect(out).toContain("Bob · wolfRoleHunter");
    expect(text(render(day({}, { showRoles: false })))).not.toContain("wolfRoleHunter");
  });

  it("counts the discussion time down to the day's end time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const s = day({ dayEndsAt: 1_090_000 }, { timerMinutes: 2 });
    expect(text(render(s))).toContain("1:30");
    for (const effect of hooks.effects) effect();
    vi.advanceTimersByTime(30_000);
    expect(text(render(s))).toContain("1:00");
    vi.advanceTimersByTime(60_000);
    expect(text(render(s))).toContain("imposterTimeUp");
  });

  it("shows the time left at once when the talk comes back from the vote screen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const talk = day({ dayEndsAt: 1_090_000 }, { timerMinutes: 2 });
    expect(text(render(talk))).toContain("1:30");
    const vote = render({ ...talk, dayStep: "vote" });
    vi.setSystemTime(1_030_000);
    press(pressable(vote, "back"));
    expect(onTalk).toHaveBeenCalledTimes(1);
    // No effect has run and no timer has fired: the first talk render is already right.
    expect(text(render(talk))).toContain("1:00");
  });

  it("shows no timer when it is off", () => {
    const tree = render(day());
    expect(text(tree)).not.toMatch(/\d:\d\d/);
    expect(text(tree)).not.toContain("imposterTimeUp");
  });

  it("opens the rules and the vote", () => {
    const tree = render(day());
    expect(find(tree, WolfRulesButton)!.props.onPress).toBe(onRules);
    expect(find(tree, PrimaryButton)!.props).toMatchObject({ label: "wolfVote", onPress: onVote });
  });

  it("lets the phone holder enter the table's vote: a living player or Nobody, or go back", () => {
    const tree = render(day({ dayStep: "vote" }));
    expect(text(tree)).toContain("wolfVoteQuestion");
    const picker = find(tree, WolfPicker)!;
    expect(picker.props.options).toEqual([0, 2, 3].map((seat) => ({ seat, enabled: true })));
    expect(picker.props.onPick).toBe(onVoteOut);
    press(pressable(tree, "wolfNobody"));
    expect(onVoteOut).toHaveBeenCalledWith(null);
    press(pressable(tree, "back"));
    expect(onTalk).toHaveBeenCalledTimes(1);
  });
});

describe("WolfEnd", () => {
  const render = (s: GameState) => WolfEnd({ state: s, onPlayAgain, onNewGame }) as Node;

  it("shows the winning side and every player's role", () => {
    const tree = render(game({ phase: "end", winner: "wolves", alive: [true, false, true, false, false] }));
    expect(text(tree)).toContain("wolfWolvesWin");
    expect(rows(tree)).toEqual([
      "AnnwolfRoleWolf",
      "BobwolfRoleHunter",
      "CemwolfRoleVillager",
      "DanwolfRoleSeer",
      "EdawolfRoleVillager",
    ]);
    expect(text(render(game({ phase: "end", winner: "village" })))).toContain("wolfVillageWins");
  });

  it("plays again with the same players or starts a new game", () => {
    const tree = render(game({ phase: "end", winner: "village" }));
    expect(find(tree, PrimaryButton)!.props).toMatchObject({ label: "wolfPlayAgain", onPress: onPlayAgain });
    press(pressable(tree, "wolfNewGame"));
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });
});
