import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { GAME_THEME, teamColor, type WordTeam } from "@/lib/word-game";
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

const teams: WordTeam[] = [
  { name: "Red", players: ["Ann", "Bob"] },
  { name: "Blue", players: ["Cem", "Dan"] },
];

describe("WordScores", () => {
  it("writes each team's name in its colour next to its score, on a dark tile", () => {
    const tiles = nodes(WordScores({ teams, scores: [3, -1] })).filter(
      (n) => (n.props.style as { borderColor?: string } | undefined)?.borderColor
    );
    expect(tiles.map(text)).toEqual(["Red3", "Blue-1"]);
    expect(tiles.map((n) => n.props.style)).toEqual([
      { backgroundColor: GAME_THEME.bg, borderColor: teamColor(0) },
      { backgroundColor: GAME_THEME.bg, borderColor: teamColor(1) },
    ]);
  });
});
