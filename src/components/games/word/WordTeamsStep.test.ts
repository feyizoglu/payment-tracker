import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { defaultWordSetup, teamColor, type WordSetup, type WordTeam } from "@/lib/word-game";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wordSeconds" ? "{n} s" : String(key)),
    }),
  }),
}));

import WordTeamsStep from "./WordTeamsStep";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

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

const onChange = vi.fn();
const value: WordSetup = {
  ...defaultWordSetup(["Red", "Blue"]),
  teams: [
    { name: "Red", players: ["Ann", "Bob", "Cem"] },
    { name: "Blue", players: ["Dan"] },
  ],
};

const render = (v: WordSetup = value) => WordTeamsStep({ value: v, onChange }) as Node;
const inputs = (tree: Node, label: string) =>
  nodes(tree).filter((n) => n.type === "input" && n.props["aria-label"] === label);
const buttonsWith = (tree: Node, label: string) =>
  nodes(tree).filter((n) => n.type === "button" && (text(n).includes(label) || n.props["aria-label"] === label));
const change = (input: Node, next: string) => (input.props.onChange as (e: unknown) => void)({ target: { value: next } });
const click = (node: Node) => (node.props.onClick as () => void)();
const last = () => onChange.mock.calls.at(-1)![0] as WordSetup;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WordTeamsStep", () => {
  it("draws each team on its colour with its name written on it", () => {
    const cards = nodes(render()).filter((n) => n.type === "section");
    expect(cards.map((c) => (c.props.style as { backgroundColor: string }).backgroundColor)).toEqual([
      teamColor(0),
      teamColor(1),
    ]);
    expect(inputs(render(), "wordTeamName").map((i) => i.props.value)).toEqual(["Red", "Blue"]);
  });

  it("renames a team", () => {
    change(inputs(render(), "wordTeamName")[1], "Owls");
    expect(last().teams[1]).toEqual({ name: "Owls", players: ["Dan"] });
  });

  it("edits, removes and adds players in their own team only", () => {
    change(inputs(render(), "wordPlayerName")[3], "Deniz");
    expect(last().teams[1].players).toEqual(["Deniz"]);
    click(buttonsWith(render(), "wordRemovePlayer")[1]);
    expect(last().teams[0].players).toEqual(["Ann", "Cem"]);
    click(buttonsWith(render(), "wordAddPlayer")[1]);
    expect(last().teams).toEqual([value.teams[0], { name: "Blue", players: ["Dan", ""] }]);
  });

  it("stops adding players at 8 per team", () => {
    const eight: WordTeam = { name: "Red", players: Array.from({ length: 8 }, (_, i) => `P${i}`) };
    const full: WordSetup = { ...value, teams: [eight, value.teams[1]] };
    expect(buttonsWith(render(full), "wordAddPlayer").map((b) => b.props.disabled)).toEqual([true, false]);
  });

  it("shuffles every name over both teams", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    click(buttonsWith(render(), "wordShuffle")[0]);
    expect(last().teams.map((team) => team.players)).toEqual([
      ["Ann", "Bob"],
      ["Cem", "Dan"],
    ]);
  });
});
