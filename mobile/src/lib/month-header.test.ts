import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("expo-symbols", () => ({ SymbolView: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({ useLang: () => ({ t: { games: "GAMES", wordsTitle: "WORDS" }, lang: "tr" }) }));
vi.mock("@/lib/calendar", () => ({ formatMonthYear: () => "March 2026" }));

import { Pressable } from "react-native";
import { MonthHeader } from "@/components/month-header";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

function render(onOpenGames?: () => void, onOpenWords?: () => void): Node {
  return MonthHeader({
    year: 2026,
    month: 2,
    view: "list",
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onToggleView: vi.fn(),
    onOpenGames,
    onOpenWords,
  }) as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function gamesButton(tree: Node) {
  return nodes(tree).find((n) => n.type === Pressable && n.props.accessibilityLabel === "GAMES");
}

describe("MonthHeader games button", () => {
  it("shows no games button without onOpenGames", () => {
    expect(gamesButton(render())).toBeUndefined();
  });

  it("opens the games from the button", () => {
    const onOpenGames = vi.fn();
    const button = gamesButton(render(onOpenGames))!;
    (button.props.onPress as () => void)();
    expect(onOpenGames).toHaveBeenCalledTimes(1);
  });
});

describe("MonthHeader words button", () => {
  const wordsButton = (tree: Node) => nodes(tree).find((n) => n.type === Pressable && n.props.accessibilityLabel === "WORDS");

  it("shows no words button without onOpenWords", () => {
    expect(wordsButton(render(vi.fn()))).toBeUndefined();
  });

  it("opens My Words from the button, beside the games button", () => {
    const onOpenWords = vi.fn();
    const tree = render(vi.fn(), onOpenWords);
    expect(gamesButton(tree)).toBeDefined();
    (wordsButton(tree)!.props.onPress as () => void)();
    expect(onOpenWords).toHaveBeenCalledTimes(1);
  });

  it("shows the words button on its own", () => {
    const tree = render(undefined, vi.fn());
    expect(wordsButton(tree)).toBeDefined();
    expect(gamesButton(tree)).toBeUndefined();
  });
});
