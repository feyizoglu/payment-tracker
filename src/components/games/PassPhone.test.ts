import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactElement } from "react";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: { imposterPassTo: "Pass to {name}", imposterPassHint: "HINT" } }),
}));

import PassPhone from "./PassPhone";

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
  return nodes(tree).find((n) => n.type === "button");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PassPhone reveal gate", () => {
  it("hides the secret until the player reveals it", () => {
    const tree = render(false);
    expect(text(tree)).not.toContain("SECRET");
    expect(text(tree)).toContain("Pass to Ann");
  });

  it("reveals through the button", () => {
    const reveal = button(render(false))!;
    expect(text(reveal)).toBe("REVEAL");
    (reveal.props.onClick as () => void)();
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("shows the secret once revealed", () => {
    const tree = render(true);
    expect(text(tree)).toContain("SECRET");
    expect(button(tree)).toBeUndefined();
  });
});
