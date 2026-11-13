import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { WORD_RESULT_LOOK, teamColor, type TurnResult, type WordCard, type WordTeam } from "@/lib/word-game";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wordTurnPoints" ? "{team}: {points}" : String(key)),
    }),
  }),
}));

import WordSummary from "./WordSummary";
import WordScores from "./WordScores";

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
const onNext = vi.fn();
const onEnd = vi.fn();

function render(patch: { results?: TurnResult[]; outOfWords?: boolean } = {}): Node {
  return WordSummary({ team: 1, teams, scores: [4, 1], results, outOfWords: false, onNext, onEnd, ...patch }) as Node;
}

const button = (label: string) => nodes(render()).find((n) => n.type === "button" && text(n) === label)!;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WordSummary", () => {
  it("says the time ran out, or that the words ran out", () => {
    expect(text(render())).toContain("wordTimeUp");
    const out = text(render({ outOfWords: true }));
    expect(out).toContain("wordNoWordsLeft");
    expect(out).not.toContain("wordTimeUp");
  });

  it("lists the turn's words with their result written next to its colour", () => {
    const rows = nodes(render()).filter((n) => n.type === "li");
    expect(rows.map(text)).toEqual([
      "Cat✓ wordResultCorrect",
      "Dog↷ wordResultPass",
      "Owl✕ wordResultFoul",
      "Cow✓ wordResultCorrect",
    ]);
    const foul = nodes(rows[2]).find((n) => (n.props.style as { color?: string } | undefined)?.color)!;
    expect(foul.props.style).toEqual({ color: WORD_RESULT_LOOK.foul.color });
  });

  it("writes a team name that looks like a placeholder as it was typed", () => {
    const named: [WordTeam, WordTeam] = [teams[0], { name: "{points}", players: ["Cem", "Dan"] }];
    const tree = WordSummary({ team: 1, teams: named, scores: [4, 1], results, outOfWords: false, onNext, onEnd }) as Node;
    expect(text(tree)).toContain("{points}: +1");
  });

  it("gives the team's points for the turn in its colour", () => {
    const line = nodes(render()).find((n) => text(n) === "Blue: +1")!;
    expect(line.props.style).toEqual({ color: teamColor(1) });
  });

  it("shows both scores and lists nothing for a turn without words", () => {
    const tree = render({ results: [] });
    expect(nodes(tree).filter((n) => n.type === "li")).toEqual([]);
    expect(nodes(tree).find((n) => n.type === WordScores)!.props).toEqual({ teams, scores: [4, 1] });
  });

  it("moves on with Next and ends the game with End game", () => {
    (button("wordNext").props.onClick as () => void)();
    expect(onNext).toHaveBeenCalledTimes(1);
    (button("wordEndGame").props.onClick as () => void)();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
