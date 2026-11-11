import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, initialGameState, type GameState, type Outcome } from "@/lib/imposter";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "imposterAccused" ? "accused {name}" : String(key)),
    }),
  }),
}));

import ImposterResult from "./ImposterResult";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onEnd = vi.fn();
const onNextRound = vi.fn();

function game(outcome: Outcome | null, scoreboard = false): GameState {
  return {
    ...initialGameState({ ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"], voting: true, scoreboard }),
    phase: "result",
    round: { entryId: "animals:0", category: "animals", word: "CAT", pair: "DOG", imposters: [0, 2], cards: [], starter: 0 },
    scores: [1, 3, 2],
    outcome,
  };
}

function render(state: GameState): Node {
  return ImposterResult({ state, onEnd, onNextRound }) as Node;
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

function button(tree: Node, label: string) {
  return nodes(tree).find((n) => n.type === "button" && text(n) === label);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ImposterResult outcome", () => {
  it("shows a tie when no one was accused", () => {
    const out = text(render(game({ accused: null, crewWins: false })));
    expect(out).toContain("imposterTie");
    expect(out).not.toContain("accused");
  });

  it("names the accused player", () => {
    const out = text(render(game({ accused: 1, crewWins: false })));
    expect(out).toContain("accused Bob");
    expect(out).not.toContain("imposterTie");
  });

  it("reveals the imposters", () => {
    expect(text(render(game(null)))).toContain("Ann, Cem");
  });

  it("shows the scoreboard only when it is on", () => {
    expect(text(render(game(null, true)))).toContain("imposterScores");
    expect(text(render(game(null, false)))).not.toContain("imposterScores");
  });
});

describe("ImposterResult buttons", () => {
  it("ends the game", () => {
    (button(render(game(null)), "imposterEnd")!.props.onClick as () => void)();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onNextRound).not.toHaveBeenCalled();
  });

  it("starts the next round", () => {
    (button(render(game(null)), "imposterNextRound")!.props.onClick as () => void)();
    expect(onNextRound).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
  });
});
