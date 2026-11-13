import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, GAME_THEME, MAX_PLAYERS, playerColor, type ImposterSetup } from "@ptracker/shared/imposter";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, TextInput: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));

import { Pressable, TextInput, View } from "react-native";
import { SetupPlayersStep } from "@/components/games/setup-players-step";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };

function render(value: ImposterSetup): Node {
  return SetupPlayersStep({ value, onChange }) as Node;
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

function addButton(tree: Node) {
  return nodes(tree).find((n) => n.type === Pressable && text(n).includes("imposterAddPlayer"))!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SetupPlayersStep players", () => {
  it("removes exactly the chosen player", () => {
    const remove = nodes(render(valid)).filter((n) => n.type === Pressable && text(n) === "✕");
    (remove[1].props.onPress as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, players: ["Ann", "Cem"] });
  });

  it("disables Add at the player limit", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i}`);
    expect(addButton(render({ ...valid, players: names(MAX_PLAYERS) })).props.disabled).toBe(true);
    expect(addButton(render({ ...valid, players: names(MAX_PLAYERS - 1) })).props.disabled).toBe(false);
  });

  it("adds an empty player at the end", () => {
    (addButton(render(valid)).props.onPress as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, players: ["Ann", "Bob", "Cem", ""] });
  });

  it("renames only the edited player", () => {
    const inputs = nodes(render(valid)).filter((n) => n.type === TextInput);
    expect(inputs.map((n) => n.props.value)).toEqual(["Ann", "Bob", "Cem"]);
    (inputs[1].props.onChangeText as (v: string) => void)("Bea");
    expect(onChange).toHaveBeenCalledWith({ ...valid, players: ["Ann", "Bea", "Cem"] });
  });
});

describe("SetupPlayersStep accessibility", () => {
  it("labels each name field, and gives the buttons a role", () => {
    const tree = render(valid);
    for (const input of nodes(tree).filter((n) => n.type === TextInput)) {
      expect(input.props.accessibilityLabel).toBe("imposterPlayerName");
    }
    for (const remove of nodes(tree).filter((n) => n.type === Pressable && text(n) === "✕")) {
      expect(remove.props.accessibilityRole).toBe("button");
    }
    expect(addButton(tree).props.accessibilityRole).toBe("button");
  });

  it("reports Add as disabled to assistive tech at the player limit", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i}`);
    expect(addButton(render({ ...valid, players: names(MAX_PLAYERS) })).props.accessibilityState).toEqual({ disabled: true });
    expect(addButton(render(valid)).props.accessibilityState).toEqual({ disabled: false });
  });
});

describe("SetupPlayersStep colours", () => {
  it("draws each player's card in that seat's colour with dark text", () => {
    const tree = render(valid);
    const cards = nodes(tree).filter((n) => n.type === View && (n.props.style as { backgroundColor?: string })?.backgroundColor);
    expect(cards.map((n) => (n.props.style as { backgroundColor: string }).backgroundColor)).toEqual([
      playerColor(0),
      playerColor(1),
      playerColor(2),
    ]);
    for (const input of nodes(tree).filter((n) => n.type === TextInput)) {
      expect(input.props.style).toEqual({ color: GAME_THEME.ink });
    }
  });
});
