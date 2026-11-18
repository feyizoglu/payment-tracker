import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ptracker/shared/i18n")>();
  return { ...actual, useLang: () => ({ t: actual.translationsFor("en"), lang: "en" }) };
});
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));

import { Pressable, Text, View } from "react-native";
import { PlaneOverlay } from "@/components/games/plane/plane-overlay";
import { PrimaryButton } from "@/components/ui/primary-button";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

const INK = "#123456";
const base = { score: 7, best: 4, newBest: false, guard: false, ink: INK, onAgain: () => undefined, onBack: () => undefined };

function render(overrides: Partial<Parameters<typeof PlaneOverlay>[0]> & { phase: Parameters<typeof PlaneOverlay>[0]["phase"] }) {
  return nodes(PlaneOverlay({ ...base, ...overrides }));
}
const texts = (all: Node[]) => all.filter((n) => n.type === Text);
const words = (all: Node[]) => texts(all).map((n) => String(n.props.children));

describe("PlaneOverlay", () => {
  it("shows only the score in the page's ink while flying, without catching taps", () => {
    const all = render({ phase: "flying" });
    expect(all[0].type).toBe(View);
    expect(all[0].props.pointerEvents).toBe("none");
    expect(words(all)).toEqual(["7"]);
    expect(texts(all).every((n) => (n.props.style as { color: string }).color === INK)).toBe(true);
  });

  it("shows the best score and the start hint in the page's ink when ready", () => {
    const all = render({ phase: "ready" });
    expect(all[0].props.pointerEvents).toBe("none");
    expect(words(all)).toEqual(["Best: 4", "Tap to start"]);
    expect(texts(all).every((n) => (n.props.style as { color: string }).color === INK)).toBe(true);
  });

  it("shows the score and the continue hint in the page's ink when paused", () => {
    const all = render({ phase: "paused" });
    expect(all[0].props.pointerEvents).toBe("none");
    expect(words(all)).toEqual(["7", "Tap to continue"]);
    expect(texts(all).every((n) => (n.props.style as { color: string }).color === INK)).toBe(true);
  });

  it("shows the new best line instead of the best score", () => {
    const all = render({ phase: "over", newBest: true });
    expect(words(all)).toContain("New best!");
    expect(words(all)).not.toContain("Best: 4");
  });

  it("shows the best score when it was not beaten", () => {
    const all = render({ phase: "over", newBest: false });
    expect(words(all)).toContain("Best: 4");
    expect(words(all)).not.toContain("New best!");
  });

  it("disables and dims both buttons during the guard", () => {
    const all = render({ phase: "over", guard: true });
    const again = all.find((n) => n.type === PrimaryButton)!;
    const back = all.find((n) => n.type === Pressable)!;
    expect(again.props.disabled).toBe(true);
    expect(back.props.disabled).toBe(true);
    expect(String(back.props.className)).toContain("opacity-50");
  });

  it("enables both buttons after the guard, wired to play again and to go back", () => {
    const onAgain = vi.fn();
    const onBack = vi.fn();
    const all = render({ phase: "over", guard: false, onAgain, onBack });
    const again = all.find((n) => n.type === PrimaryButton)!;
    const back = all.find((n) => n.type === Pressable)!;
    expect(again.props.disabled).toBe(false);
    expect(back.props.disabled).toBe(false);
    expect(String(back.props.className)).not.toContain("opacity-50");
    (again.props.onPress as () => void)();
    expect(onAgain).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
    (back.props.onPress as () => void)();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
