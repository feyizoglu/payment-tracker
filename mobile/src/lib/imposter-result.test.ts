import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, initialGameState, playerColor, type GameState, type Outcome } from "@ptracker/shared/imposter";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "imposterAccused" ? "accused {name}" : String(key)),
    }),
  }),
}));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));

import { Pressable } from "react-native";
import { ImposterResult } from "@/components/games/imposter-result";
import { PrimaryButton } from "@/components/ui/primary-button";

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
  it("starts the next round from the primary button", () => {
    const next = nodes(render(game(null))).find((n) => n.type === PrimaryButton)!;
    expect(next.props.label).toBe("imposterNextRound");
    expect(next.props.onPress).toBe(onNextRound);
  });

  it("ends the game from the End link", () => {
    const end = nodes(render(game(null))).find((n) => n.type === Pressable && text(n) === "imposterEnd")!;
    expect(end.props.onPress).toBe(onEnd);
  });
});

describe("ImposterResult colours", () => {
  it("writes each name in that player's colour, imposters and scoreboard alike", () => {
    const names = ["Ann", "Bob", "Cem"];
    const coloured = nodes(render(game(null, true))).filter((n) => (n.props.style as { color?: string })?.color);
    // Two imposters, then the three scoreboard rows (highest score first).
    expect(coloured.map(text)).toEqual(["Ann", "Cem", "Bob", "Cem", "Ann"]);
    for (const n of coloured) {
      expect((n.props.style as { color: string }).color).toBe(playerColor(names.indexOf(text(n))));
    }
  });
});
