import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { defaultWordSetup, type WordSetup } from "@/lib/word-game";

const i18n = vi.hoisted(() => ({ lang: "en" }));

vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }), lang: i18n.lang }),
}));
vi.mock("./WordTeamsStep", () => ({ default: () => null }));
vi.mock("./WordWordsStep", () => ({ default: () => null }));
vi.mock("./WordRulesStep", () => ({ default: () => null }));

import WordSetupWizard from "./WordSetupWizard";
import WordTeamsStep from "./WordTeamsStep";
import WordWordsStep from "./WordWordsStep";
import WordRulesStep from "./WordRulesStep";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const onStep = vi.fn();
const onStart = vi.fn();
const valid: WordSetup = {
  ...defaultWordSetup(["Red", "Blue"]),
  teams: [
    { name: "Red", players: ["Ann", "Bob"] },
    { name: "Blue", players: ["Cem", "Dan"] },
  ],
};
const broken: WordSetup = { ...valid, teams: [{ name: "Red", players: ["Ann"] }, valid.teams[1]] };

function render(value: WordSetup, step: number, quickStart = false): Node {
  return WordSetupWizard({ value, onChange, step, onStep, onStart, quickStart }) as Node;
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

const button = (tree: Node, label: string) => nodes(tree).find((n) => n.type === "button" && text(n) === label);
const errors = (tree: Node) => nodes(tree).filter((n) => n.type === "li").map(text);
const has = (tree: Node, type: unknown) => nodes(tree).some((n) => n.type === type);

beforeEach(() => {
  vi.clearAllMocks();
  i18n.lang = "en";
});

describe("WordSetupWizard steps", () => {
  it("compares names with the case rules of the app language", () => {
    const irem: WordSetup = {
      ...valid,
      teams: [
        { name: "Red", players: ["İrem", "Bob"] },
        { name: "Blue", players: ["irem", "Dan"] },
      ],
    };
    i18n.lang = "tr";
    expect(errors(render(irem, 0))).toEqual(["wordErrDuplicate"]);
    i18n.lang = "en";
    expect(errors(render(irem, 0))).toEqual([]);
  });

  it("shows one step at a time under its title and hands it the setup", () => {
    const first = render(valid, 0);
    expect([has(first, WordTeamsStep), has(first, WordWordsStep), has(first, WordRulesStep)]).toEqual([true, false, false]);
    expect(nodes(first).find((n) => n.type === WordTeamsStep)!.props).toEqual({ value: valid, onChange });
    expect(text(first)).toContain("wordStepTeams");
    expect(has(render(valid, 1), WordWordsStep)).toBe(true);
    expect(text(render(valid, 1))).toContain("wordStepWords");
    expect(has(render(valid, 2), WordRulesStep)).toBe(true);
  });

  it("says which step of how many is showing", () => {
    const label = nodes(render(valid, 1)).find((n) => n.props.role === "img")!.props["aria-label"];
    expect(label).toBe("wordStep");
  });

  it("goes back from every step but the first", () => {
    expect(button(render(valid, 0), "back")).toBeUndefined();
    (button(render(valid, 2), "back")!.props.onClick as () => void)();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("stops on the teams step until its errors are fixed and lists them", () => {
    const tree = render(broken, 0);
    expect(errors(tree)).toEqual(["wordErrTeamSize"]);
    expect(nodes(tree).filter((n) => n.props.role === "alert")).toHaveLength(1);
    expect(button(tree, "wordNext")!.props.disabled).toBe(true);
    expect(errors(render(broken, 1))).toEqual([]);
    (button(render(valid, 0), "wordNext")!.props.onClick as () => void)();
    expect(onStep).toHaveBeenCalledWith(1);
  });
});

describe("WordSetupWizard start", () => {
  it("lists every error and disables Start on the last step", () => {
    const tree = render(broken, 2);
    expect(errors(tree)).toEqual(["wordErrTeamSize"]);
    expect(button(tree, "wordStart")!.props.disabled).toBe(true);
    expect(button(tree, "wordNext")).toBeUndefined();
  });

  it("starts a valid game from the last step", () => {
    (button(render(valid, 2), "wordStart")!.props.onClick as () => void)();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("offers the last settings on the first step only, after a game, for a valid setup", () => {
    (button(render(valid, 0, true), "wordQuickStart")!.props.onClick as () => void)();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(button(render(valid, 0, false), "wordQuickStart")).toBeUndefined();
    expect(button(render(broken, 0, true), "wordQuickStart")).toBeUndefined();
    expect(button(render(valid, 1, true), "wordQuickStart")).toBeUndefined();
  });
});
