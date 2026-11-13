import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import type { WordTeam } from "@/lib/word-game";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wordGiveTo" ? "Give to {name} ({team})" : String(key)),
    }),
  }),
}));

import WordHandoff from "./WordHandoff";
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
const onBegin = vi.fn();
const onEnd = vi.fn();

function render(): Node {
  return WordHandoff({ describer: "Ann", teamName: "Red", teams, scores: [3, 1], onBegin, onEnd }) as Node;
}

const button = (label: string) => nodes(render()).find((n) => n.type === "button" && text(n) === label)!;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WordHandoff", () => {
  it("writes a name that looks like a placeholder as it was typed", () => {
    const tree = WordHandoff({ describer: "{team}", teamName: "Red", teams, scores: [0, 0], onBegin, onEnd }) as Node;
    expect(text(tree)).toContain("Give to {team} (Red)");
  });

  it("names the describer and their team", () => {
    expect(text(render())).toContain("Give to Ann (Red)");
    expect(text(render())).toContain("wordHandoffHint");
  });

  it("shows both teams' scores", () => {
    expect(nodes(render()).find((n) => n.type === WordScores)!.props).toEqual({ teams, scores: [3, 1] });
  });

  it("starts the turn with Start and ends the game with End game", () => {
    (button("wordBegin").props.onClick as () => void)();
    expect(onBegin).toHaveBeenCalledTimes(1);
    (button("wordEndGame").props.onClick as () => void)();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
