import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { GAME_THEME, teamColor, type WordTeam } from "@/lib/word-game";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wordWins" ? "{team} wins" : String(key)),
    }),
  }),
}));

import WordEnd from "./WordEnd";
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
const onPlayAgain = vi.fn();
const onNewGame = vi.fn();

function render(scores: [number, number], outOfWords = false): Node {
  return WordEnd({ teams, scores, outOfWords, onPlayAgain, onNewGame }) as Node;
}

const headline = (tree: Node, label: string) => nodes(tree).find((n) => n.type === "p" && text(n) === label)!;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WordEnd", () => {
  it("names the winner in the winner's colour", () => {
    expect(headline(render([5, 3]), "Red wins").props.style).toEqual({ color: teamColor(0) });
    expect(headline(render([3, 5]), "Blue wins").props.style).toEqual({ color: teamColor(1) });
  });

  it("calls equal scores a draw", () => {
    expect(headline(render([4, 4]), "wordDraw").props.style).toEqual({ color: GAME_THEME.text });
  });

  it("shows both scores, and the note when the words ran out", () => {
    expect(nodes(render([2, 1])).find((n) => n.type === WordScores)!.props).toEqual({ teams, scores: [2, 1] });
    expect(text(render([2, 1]))).not.toContain("wordNoWordsLeft");
    expect(text(render([2, 1], true))).toContain("wordNoWordsLeft");
  });

  it("plays again or starts a new game", () => {
    const tree = render([1, 0]);
    const button = (label: string) => nodes(tree).find((n) => n.type === "button" && text(n) === label)!;
    (button("wordPlayAgain").props.onClick as () => void)();
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    (button("wordNewGame").props.onClick as () => void)();
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });
});
