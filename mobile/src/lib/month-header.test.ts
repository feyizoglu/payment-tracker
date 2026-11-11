import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("expo-symbols", () => ({ SymbolView: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({ useLang: () => ({ t: { games: "GAMES" }, lang: "tr" }) }));
vi.mock("@/lib/calendar", () => ({ formatMonthYear: () => "March 2026" }));

import { Pressable } from "react-native";
import { MonthHeader } from "@/components/month-header";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

function render(onOpenGames?: () => void): Node {
  return MonthHeader({
    year: 2026,
    month: 2,
    view: "list",
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onToggleView: vi.fn(),
    onOpenGames,
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
