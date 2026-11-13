import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import {
  GAME_THEME,
  WORD_RESULT_LOOK,
  teamColor,
  type TurnResult,
  type WordCard,
  type WordTeam,
} from "@ptracker/shared/word-game";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => {
  const strings: Record<string, string> = {
    wordGiveTo: "Give to {name} ({team})",
    wordTurnPoints: "{team}: {points}",
    wordWins: "{team} wins",
  };
  return {
    useLang: () => ({
      t: new Proxy({} as Record<string, string>, { get: (_, key) => strings[String(key)] ?? String(key) }),
    }),
  };
});
vi.mock("@/components/games/game-button", () => ({ GameButton: () => null }));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));

import { Pressable, View } from "react-native";
import { GameButton } from "@/components/games/game-button";
import { WordEnd } from "@/components/games/word/word-end";
import { WordHandoff } from "@/components/games/word/word-handoff";
import { WordScores } from "@/components/games/word/word-scores";
import { WordSummary } from "@/components/games/word/word-summary";
import { PrimaryButton } from "@/components/ui/primary-button";

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

const teams: [WordTeam, WordTeam] = [
  { name: "Red", players: ["Ann", "Bob"] },
  { name: "Blue", players: ["Cem", "Dan"] },
];
const card = (word: string): WordCard => ({ id: word, word, forbidden: ["a", "b", "c", "d"], level: "easy" });
const results: TurnResult[] = [
  { card: card("Cat"), result: "correct" },
  { card: card("Dog"), result: "pass" },
  { card: card("Owl"), result: "foul" },
  { card: card("Cow"), result: "correct" },
];
const handlers = { onBegin: vi.fn(), onEnd: vi.fn(), onNext: vi.fn(), onPlayAgain: vi.fn(), onNewGame: vi.fn() };

const press = (tree: Node, label: string) =>
  (nodes(tree).find((n) => n.type === Pressable && text(n) === label)!.props.onPress as () => void)();
const scoresOf = (tree: Node) => nodes(tree).find((n) => n.type === WordScores)!.props;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WordScores (mobile)", () => {
  it("writes each team's name in its colour next to its score, on a dark tile", () => {
    const tiles = nodes(WordScores({ teams, scores: [3, -1] })).filter(
      (n) => n.type === View && (n.props.style as { borderColor?: string } | undefined)?.borderColor
    );
    expect(tiles.map(text)).toEqual(["Red3", "Blue-1"]);
    expect(tiles.map((n) => n.props.style)).toEqual([
      { backgroundColor: GAME_THEME.bg, borderColor: teamColor(0) },
      { backgroundColor: GAME_THEME.bg, borderColor: teamColor(1) },
    ]);
  });
});

describe("WordHandoff (mobile)", () => {
  const render = () =>
    WordHandoff({ describer: "Ann", teamName: "Red", teams, scores: [3, 1], onBegin: handlers.onBegin, onEnd: handlers.onEnd }) as Node;

  it("names the describer and their team and shows both scores", () => {
    expect(text(render())).toContain("Give to Ann (Red)");
    expect(scoresOf(render())).toEqual({ teams, scores: [3, 1] });
  });

  it("starts the turn with Start and ends the game with End game", () => {
    const start = nodes(render()).find((n) => n.type === GameButton)!;
    expect(start.props.label).toBe("wordBegin");
    (start.props.onPress as () => void)();
    expect(handlers.onBegin).toHaveBeenCalledTimes(1);
    press(render(), "wordEndGame");
    expect(handlers.onEnd).toHaveBeenCalledTimes(1);
  });
});

describe("WordSummary (mobile)", () => {
  const render = (patch: { results?: TurnResult[]; outOfWords?: boolean } = {}) =>
    WordSummary({ team: 1, teams, scores: [4, 1], results, outOfWords: false, onNext: handlers.onNext, onEnd: handlers.onEnd, ...patch }) as Node;

  it("says the time ran out, or that the words ran out", () => {
    expect(text(render())).toContain("wordTimeUp");
    expect(text(render({ outOfWords: true }))).toContain("wordNoWordsLeft");
    expect(text(render({ outOfWords: true }))).not.toContain("wordTimeUp");
  });

  it("lists the turn's words with their result written next to its colour", () => {
    const rows = nodes(render()).filter((n) => n.type === View && n.props.accessible);
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      "Cat, wordResultCorrect",
      "Dog, wordResultPass",
      "Owl, wordResultFoul",
      "Cow, wordResultCorrect",
    ]);
    expect(text(rows[2])).toBe("Owl✕ wordResultFoul");
    const mark = nodes(rows[2]).find((n) => (n.props.style as { color?: string } | undefined)?.color)!;
    expect(mark.props.style).toEqual({ color: WORD_RESULT_LOOK.foul.color });
  });

  it("gives the team's points in its colour and shows both scores", () => {
    const line = nodes(render()).find((n) => text(n) === "Blue: +1")!;
    expect(line.props.style).toEqual({ color: teamColor(1) });
    expect(scoresOf(render({ results: [] }))).toEqual({ teams, scores: [4, 1] });
    expect(nodes(render({ results: [] })).filter((n) => n.type === View && n.props.accessible)).toEqual([]);
  });

  it("moves on with Next and ends the game with End game", () => {
    const next = nodes(render()).find((n) => n.type === PrimaryButton)!;
    expect(next.props.label).toBe("wordNext");
    (next.props.onPress as () => void)();
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
    press(render(), "wordEndGame");
    expect(handlers.onEnd).toHaveBeenCalledTimes(1);
  });
});

describe("WordEnd (mobile)", () => {
  const render = (scores: [number, number], outOfWords = false) =>
    WordEnd({ teams, scores, outOfWords, onPlayAgain: handlers.onPlayAgain, onNewGame: handlers.onNewGame }) as Node;
  const headline = (tree: Node, label: string) => nodes(tree).find((n) => text(n) === label && n.props.style)!;

  it("names the winner in the winner's colour, or calls a draw", () => {
    expect(headline(render([5, 3]), "Red wins").props.style).toEqual({ color: teamColor(0) });
    expect(headline(render([3, 5]), "Blue wins").props.style).toEqual({ color: teamColor(1) });
    expect(headline(render([4, 4]), "wordDraw").props.style).toEqual({ color: GAME_THEME.text });
  });

  it("shows both scores, and the note when the words ran out", () => {
    expect(scoresOf(render([2, 1]))).toEqual({ teams, scores: [2, 1] });
    expect(text(render([2, 1]))).not.toContain("wordNoWordsLeft");
    expect(text(render([2, 1], true))).toContain("wordNoWordsLeft");
  });

  it("plays again or starts a new game", () => {
    const again = nodes(render([1, 0])).find((n) => n.type === PrimaryButton)!;
    expect(again.props.label).toBe("wordPlayAgain");
    (again.props.onPress as () => void)();
    expect(handlers.onPlayAgain).toHaveBeenCalledTimes(1);
    press(render([1, 0]), "wordNewGame");
    expect(handlers.onNewGame).toHaveBeenCalledTimes(1);
  });
});
