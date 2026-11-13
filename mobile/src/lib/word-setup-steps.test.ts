import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import {
  WORD_CATEGORY_CHOICES,
  WORD_CATEGORY_EMOJI,
  WORD_CATEGORY_LABEL_KEYS,
  defaultWordSetup,
  teamColor,
  type WordSetup,
  type WordTeam,
} from "@ptracker/shared/word-game";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, TextInput: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wordSeconds" ? "{n} s" : String(key)),
    }),
  }),
}));
vi.mock("@/components/ui/field", () => ({ Field: () => null }));
vi.mock("@/components/ui/segmented-toggle", () => ({ SegmentedToggle: () => null }));

import { Pressable, TextInput, View } from "react-native";
import { WordRulesStep } from "@/components/games/word/word-rules-step";
import { WordTeamsStep } from "@/components/games/word/word-teams-step";
import { WordWordsStep } from "@/components/games/word/word-words-step";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

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

const onChange = vi.fn();
const last = () => onChange.mock.calls.at(-1)![0] as WordSetup;
const press = (node: Node) => (node.props.onPress as () => void)();
const base: WordSetup = defaultWordSetup(["Red", "Blue"]);
const toggle = (tree: Node, label: string) => nodes(tree).find((n) => n.type === SegmentedToggle && n.props.label === label);
const pick = (tree: Node, label: string, value: string) => (toggle(tree, label)!.props.onChange as (v: string) => void)(value);
const options = (tree: Node, label: string) =>
  (toggle(tree, label)!.props.options as { value: string; label: string }[]).map((o) => o.label);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WordTeamsStep (mobile)", () => {
  const value: WordSetup = {
    ...base,
    teams: [
      { name: "Red", players: ["Ann", "Bob", "Cem"] },
      { name: "Blue", players: ["Dan"] },
    ],
  };
  const render = (v: WordSetup = value) => WordTeamsStep({ value: v, onChange }) as Node;
  const inputs = (tree: Node, label: string) =>
    nodes(tree).filter((n) => n.type === TextInput && n.props.accessibilityLabel === label);
  const adds = (tree: Node) => nodes(tree).filter((n) => n.type === Pressable && text(n).includes("wordAddPlayer"));

  it("draws each team on its colour with its name written on it", () => {
    const cards = nodes(render()).filter(
      (n) => n.type === View && (n.props.style as { backgroundColor?: string } | undefined)?.backgroundColor?.startsWith("#")
    );
    expect(cards.map((c) => (c.props.style as { backgroundColor: string }).backgroundColor)).toEqual([teamColor(0), teamColor(1)]);
    expect(inputs(render(), "wordTeamName").map((i) => i.props.value)).toEqual(["Red", "Blue"]);
  });

  it("renames a team and edits, removes and adds players in their own team only", () => {
    (inputs(render(), "wordTeamName")[1].props.onChangeText as (v: string) => void)("Owls");
    expect(last().teams[1]).toEqual({ name: "Owls", players: ["Dan"] });
    (inputs(render(), "wordPlayerName")[3].props.onChangeText as (v: string) => void)("Deniz");
    expect(last().teams[1].players).toEqual(["Deniz"]);
    press(nodes(render()).filter((n) => n.props.accessibilityLabel === "wordRemovePlayer")[1]);
    expect(last().teams[0].players).toEqual(["Ann", "Cem"]);
    press(adds(render())[1]);
    expect(last().teams).toEqual([value.teams[0], { name: "Blue", players: ["Dan", ""] }]);
  });

  it("stops adding players at 8 per team", () => {
    const eight: WordTeam = { name: "Red", players: Array.from({ length: 8 }, (_, i) => `P${i}`) };
    expect(adds(render({ ...value, teams: [eight, value.teams[1]] })).map((b) => b.props.disabled)).toEqual([true, false]);
  });

  it("shuffles every name over both teams", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    press(nodes(render()).find((n) => n.type === Pressable && text(n).includes("wordShuffle"))!);
    expect(last().teams.map((team) => team.players)).toEqual([
      ["Ann", "Bob"],
      ["Cem", "Dan"],
    ]);
  });
});

describe("WordWordsStep (mobile)", () => {
  const render = () => WordWordsStep({ value: base, onChange }) as Node;
  const tiles = () => nodes(render()).filter((n) => n.type === Pressable);

  it("offers Mixed and every category with its emoji and label, Mixed chosen", () => {
    expect(tiles().map(text)).toEqual(WORD_CATEGORY_CHOICES.map((c) => `${WORD_CATEGORY_EMOJI[c]}${WORD_CATEGORY_LABEL_KEYS[c]}`));
    expect(tiles().map((b) => (b.props.accessibilityState as { selected: boolean }).selected).indexOf(true)).toBe(0);
    press(tiles()[3]);
    expect(onChange).toHaveBeenCalledWith({ ...base, category: WORD_CATEGORY_CHOICES[3] });
  });

  it("picks the difficulty", () => {
    expect(toggle(render(), "wordDifficulty")!.props.value).toBe("mixed");
    expect(options(render(), "wordDifficulty")).toEqual(["wordEasy", "wordHard", "wordDifficultyMixed"]);
    pick(render(), "wordDifficulty", "hard");
    expect(onChange).toHaveBeenCalledWith({ ...base, difficulty: "hard" });
  });
});

describe("WordRulesStep (mobile)", () => {
  const render = (v: WordSetup = base) => WordRulesStep({ value: v, onChange }) as Node;

  it("shows each mode with its one-line rule and picks one", () => {
    const modes = nodes(render()).filter((n) => n.type === Pressable);
    expect(modes.map(text)).toEqual([
      "wordModeFreewordModeFreeRule",
      "wordModeForbiddenwordModeForbiddenRule",
      "wordModeMimewordModeMimeRule",
    ]);
    press(modes[1]);
    expect(last()).toEqual({ ...base, mode: "forbidden" });
  });

  it("sets the turn time and the passes", () => {
    expect(options(render(), "wordTurnTime")).toEqual(["30 s", "60 s", "90 s"]);
    pick(render(), "wordTurnTime", "90");
    expect(last()).toEqual({ ...base, turnSeconds: 90 });
    expect(toggle(render(), "wordPasses")!.props.value).toBe("3");
    expect(options(render(), "wordPasses")).toEqual(["0", "3", "wordPassesUnlimited"]);
    pick(render(), "wordPasses", "unlimited");
    expect(last()).toEqual({ ...base, passLimit: null });
    expect(toggle(render({ ...base, passLimit: null }), "wordPasses")!.props.value).toBe("unlimited");
    pick(render(), "wordPasses", "0");
    expect(last()).toEqual({ ...base, passLimit: 0 });
  });

  it("asks for the rounds or the target score, whichever ends the game", () => {
    expect(options(render(), "wordRounds")).toEqual(["1", "2", "3"]);
    expect(toggle(render(), "wordTarget")).toBeUndefined();
    pick(render(), "wordEndBy", "target");
    expect(last()).toEqual({ ...base, endBy: "target" });
    const target = render({ ...base, endBy: "target" });
    expect(options(target, "wordTarget")).toEqual(["20", "30", "50"]);
    pick(target, "wordTarget", "50");
    expect(last()).toEqual({ ...base, endBy: "target", target: 50 });
  });
});
