import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, GAME_THEME, MAX_PLAYERS, playerColor, type ImposterSetup } from "@/lib/imposter";

vi.mock("lucide-react", () => ({ X: () => null }));
vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));

import SetupPlayersStep from "./SetupPlayersStep";

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

function button(tree: Node, label: string) {
  return nodes(tree).find((n) => n.type === "button" && text(n).includes(label));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SetupPlayersStep players", () => {
  it("removes exactly the chosen player", () => {
    const remove = nodes(render(valid)).filter((n) => n.props["aria-label"] === "imposterRemovePlayer");
    (remove[1].props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, players: ["Ann", "Cem"] });
  });

  it("disables Add at the player limit", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i}`);
    expect(button(render({ ...valid, players: names(MAX_PLAYERS) }), "imposterAddPlayer")?.props.disabled).toBe(true);
    expect(button(render({ ...valid, players: names(MAX_PLAYERS - 1) }), "imposterAddPlayer")?.props.disabled).toBe(false);
  });

  it("adds an empty player at the end", () => {
    (button(render(valid), "imposterAddPlayer")!.props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, players: ["Ann", "Bob", "Cem", ""] });
  });

  it("renames only the edited player", () => {
    const inputs = nodes(render(valid)).filter((n) => n.type === "input");
    expect(inputs.map((n) => n.props.value)).toEqual(["Ann", "Bob", "Cem"]);
    (inputs[1].props.onChange as (e: unknown) => void)({ target: { value: "Bea" } });
    expect(onChange).toHaveBeenCalledWith({ ...valid, players: ["Ann", "Bea", "Cem"] });
  });
});

describe("SetupPlayersStep colours", () => {
  it("draws each player's card in that seat's colour with dark text", () => {
    const tree = render(valid);
    const cards = nodes(tree).filter((n) => n.type === "div" && (n.props.style as { backgroundColor?: string })?.backgroundColor);
    expect(cards.map((n) => (n.props.style as { backgroundColor: string }).backgroundColor)).toEqual([
      playerColor(0),
      playerColor(1),
      playerColor(2),
    ]);
    for (const input of nodes(tree).filter((n) => n.type === "input")) {
      expect(input.props.style).toEqual({ color: GAME_THEME.ink });
    }
  });
});

describe("SetupPlayersStep accessibility", () => {
  it("names every player input and gives it a visible focus ring", () => {
    const inputs = nodes(render(valid)).filter((n) => n.type === "input");
    expect(inputs).toHaveLength(3);
    for (const input of inputs) {
      expect(input.props["aria-label"]).toBe("imposterPlayerName");
      expect(String(input.props.className)).toContain("focus-visible:ring-2");
    }
  });
});

describe("SetupPlayersStep with another game's setup", () => {
  it("keeps the other fields of any setup with a player list", () => {
    const other = { players: ["Ann"], wolves: 2, night: "pass" };
    const add = button(SetupPlayersStep({ value: other, onChange }) as Node, "imposterAddPlayer")!;
    (add.props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith({ players: ["Ann", ""], wolves: 2, night: "pass" });
  });
});
