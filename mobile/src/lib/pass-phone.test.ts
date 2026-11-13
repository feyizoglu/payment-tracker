import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactElement } from "react";

vi.mock("react-native", () => ({ Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: { imposterPassTo: "Pass to {name}", imposterPassHint: "HINT" } }),
}));
vi.mock("@/components/games/game-button", () => ({ GameButton: () => null }));

import { PassPhone } from "@/components/games/pass-phone";
import { GameButton } from "@/components/games/game-button";
import { GAME_THEME } from "@ptracker/shared/imposter";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onReveal = vi.fn();

function render(revealed: boolean): Node {
  return PassPhone({
    name: "Ann",
    revealed,
    revealLabel: "REVEAL",
    onReveal,
    children: createElement("p", null, "SECRET"),
  }) as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

function button(tree: Node) {
  return nodes(tree).find((n) => n.type === GameButton);
}

describe("PassPhone reveal gate", () => {
  it("hides the secret until the player reveals it", () => {
    const tree = render(false);
    expect(text(tree)).not.toContain("SECRET");
    expect(text(tree)).toContain("Pass to Ann");
  });

  it("reveals through the button", () => {
    const reveal = button(render(false))!;
    expect(reveal.props.label).toBe("REVEAL");
    expect(reveal.props.onPress).toBe(onReveal);
  });

  it("shows the secret once revealed", () => {
    const tree = render(true);
    expect(text(tree)).toContain("SECRET");
    expect(button(tree)).toBeUndefined();
  });

  it("writes on the voter's colour in the fixed dark ink, not a themed colour", () => {
    const texts = nodes(render(false)).filter((n) => typeof n.props.children === "string");
    expect(texts).toHaveLength(2);
    for (const n of texts) expect(n.props.style).toMatchObject({ color: GAME_THEME.ink });
  });
});
