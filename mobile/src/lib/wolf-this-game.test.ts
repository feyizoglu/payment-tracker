import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, GAME_THEME, type WolfSetup } from "@ptracker/shared/wolf-game";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));

import { Pressable, Text } from "react-native";
import { WolfRulesButton } from "@/components/games/wolf/wolf-rules-button";
import { WolfThisGame } from "@/components/games/wolf/wolf-this-game";
import { PrimaryButton } from "@/components/ui/primary-button";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onDeal = vi.fn();
const onBack = vi.fn();
const onClose = vi.fn();
const nine: WolfSetup = {
  ...DEFAULT_SETUP,
  players: ["Ann", "Bob", "Cem", "Dan", "Eda", "Fay", "Gil", "Hal", "Ivy"],
  specials: ["seer", "hunter"],
};

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

const render = (props: Parameters<typeof WolfThisGame>[0]) => WolfThisGame(props) as Node;
const buttons = (tree: Node) => nodes(tree).filter((n) => n.type === PrimaryButton).map((n) => n.props.label);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WolfThisGame", () => {
  it("lists exactly the roles in play, wolves first, with their counts and what they do", () => {
    const tree = render({ setup: nine });
    const roles = nodes(tree)
      .filter((n) => n.type === Text && text(n).includes(" ×"))
      .map(text);
    expect(roles).toEqual(["wolfRoleWolf ×2", "wolfRoleSeer ×1", "wolfRoleHunter ×1", "wolfRoleVillager ×5"]);
    for (const key of ["wolfDescWolf", "wolfDescSeer", "wolfDescHunter", "wolfDescVillager"]) expect(text(tree)).toContain(key);
    expect(text(tree)).not.toContain("wolfDescDoctor");
  });

  it("says how the game ends, that removed players stay silent, and how the night runs", () => {
    const pass = text(render({ setup: nine }));
    for (const key of ["wolfHowEnds", "wolfVillageWinsRule", "wolfWolvesWinRule", "wolfSilent", "wolfPassNote"]) {
      expect(pass).toContain(key);
    }
    expect(text(render({ setup: { ...nine, night: "narrator" } }))).toContain("wolfNarratorNote");
  });

  it("never names a player", () => {
    const out = text(render({ setup: nine }));
    for (const name of nine.players) expect(out).not.toContain(name);
  });

  it("deals from the screen before a deal and only closes during play", () => {
    const before = render({ setup: nine, onDeal, onBack });
    expect(buttons(before)).toEqual(["wolfDeal"]);
    (nodes(before).find((n) => n.type === PrimaryButton)!.props.onPress as () => void)();
    (nodes(before).find((n) => n.type === Pressable && text(n) === "back")!.props.onPress as () => void)();
    expect([onDeal.mock.calls.length, onBack.mock.calls.length]).toEqual([1, 1]);
    const during = render({ setup: nine, onClose });
    expect(buttons(during)).toEqual(["wolfClose"]);
    expect(nodes(during).some((n) => n.type === Pressable)).toBe(false);
  });
});

describe("WolfRulesButton", () => {
  it("opens the rules, in dark text on a player's colour", () => {
    const onPress = vi.fn();
    const tree = WolfRulesButton({ onPress, ink: true }) as Node;
    expect(text(tree)).toBe("wolfRules");
    (tree.props.onPress as () => void)();
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(nodes(tree).find((n) => n.type === Text)!.props.style).toEqual({ color: GAME_THEME.ink });
  });
});
