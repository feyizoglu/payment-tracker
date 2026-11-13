import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, type WolfSetup } from "@/lib/wolf-game";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));

import WolfRulesButton from "./WolfRulesButton";
import WolfThisGame from "./WolfThisGame";

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

const button = (tree: Node, label: string) => nodes(tree).find((n) => n.type === "button" && text(n) === label);
const click = (node: Node | undefined) => (node!.props.onClick as () => void)();
const render = (props: Parameters<typeof WolfThisGame>[0]) => WolfThisGame(props) as Node;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WolfThisGame", () => {
  it("lists exactly the roles in play, wolves first, with their counts and what they do", () => {
    const items = nodes(render({ setup: nine })).filter((n) => n.type === "li").map(text);
    expect(items).toEqual([
      "wolfRoleWolf ×2wolfDescWolf",
      "wolfRoleSeer ×1wolfDescSeer",
      "wolfRoleHunter ×1wolfDescHunter",
      "wolfRoleVillager ×5wolfDescVillager",
    ]);
  });

  it("says how the game ends, that removed players stay silent, and how the night runs", () => {
    const pass = text(render({ setup: nine }));
    for (const key of ["wolfHowEnds", "wolfVillageWinsRule", "wolfWolvesWinRule", "wolfSilent", "wolfPassNote"]) {
      expect(pass).toContain(key);
    }
    expect(pass).not.toContain("wolfNarratorNote");
    expect(text(render({ setup: { ...nine, night: "narrator" } }))).toContain("wolfNarratorNote");
  });

  it("never names a player", () => {
    const out = text(render({ setup: nine }));
    for (const name of nine.players) expect(out).not.toContain(name);
  });

  it("deals from the screen before a deal and only closes during play", () => {
    const before = render({ setup: nine, onDeal, onBack });
    expect(button(before, "wolfClose")).toBeUndefined();
    click(button(before, "wolfDeal"));
    click(button(before, "back"));
    expect([onDeal.mock.calls.length, onBack.mock.calls.length]).toEqual([1, 1]);
    const during = render({ setup: nine, onClose });
    expect(button(during, "wolfDeal")).toBeUndefined();
    expect(button(during, "back")).toBeUndefined();
    click(button(during, "wolfClose"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("WolfRulesButton", () => {
  it("opens the rules", () => {
    const onClick = vi.fn();
    click(button(WolfRulesButton({ onClick }) as Node, "wolfRules"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
