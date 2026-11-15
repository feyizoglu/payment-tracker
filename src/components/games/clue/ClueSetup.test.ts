import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { defaultClueSetup, playerColor, type ClueSetup } from "@/lib/clue-game";

const t = vi.hoisted(
  () =>
    new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wordStep" ? "step {n}/{total}" : String(key)),
    })
);
vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  useLang: () => ({ t, lang: "en" }),
}));
vi.mock("../SetupPlayersStep", () => ({ default: () => null }));

import SetupPlayersStep from "../SetupPlayersStep";
import WhoChoice from "../who/WhoChoice";
import ClueRulesStep from "./ClueRulesStep";
import ClueSetupWizard from "./ClueSetupWizard";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

// Renders function components on the way down, so the rules' choices can be read.
function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  if (el.type === WhoChoice) return [el, ...nodes(WhoChoice(el.props as never))];
  if (el.type === ClueRulesStep) return [el, ...nodes(ClueRulesStep(el.props as never))];
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

const onChange = vi.fn();
const onStep = vi.fn();
const onStart = vi.fn();
const three: ClueSetup = { ...defaultClueSetup(), players: ["Ann", "Bob", "Cem"] };

const click = (node: Node | undefined) => (node!.props.onClick as () => void)();
const buttons = (tree: Node) => nodes(tree).filter((n) => n.type === "button");
const button = (tree: Node, label: string) => buttons(tree).find((n) => text(n) === label);
const group = (tree: Node, label: string) => nodes(tree).find((n) => n.props.role === "group" && n.props["aria-label"] === label);
const pressed = (tree: Node) => buttons(tree).filter((b) => b.props["aria-pressed"]).map(text);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ClueRulesStep", () => {
  const render = (value: ClueSetup) => ClueRulesStep({ value, onChange }) as Node;

  it("deals 8, 13 or 20 words", () => {
    const deck = group(render(three), "clueDeck")!;
    expect(buttons(deck).map(text)).toEqual(["8", "13", "20"]);
    expect(pressed(deck)).toEqual(["13"]);
    click(button(deck, "20"));
    expect(onChange).toHaveBeenCalledWith({ ...three, deckSize: 20 });
  });

  it("picks easy, hard or mixed words", () => {
    const level = group(render(three), "clueLevel")!;
    expect(buttons(level).map(text)).toEqual(["clueLevelEasy", "clueLevelHard", "clueLevelMixed"]);
    expect(pressed(level)).toEqual(["clueLevelMixed"]);
    click(button(level, "clueLevelEasy"));
    expect(onChange).toHaveBeenCalledWith({ ...three, level: "easy" });
  });
});

describe("ClueSetupWizard", () => {
  const render = (value: ClueSetup, step: number, quickStart = false) =>
    ClueSetupWizard({ value, onChange, step, onStep, onStart, quickStart }) as Node;
  const has = (tree: Node, type: unknown) => nodes(tree).some((n) => n.type === type);
  const errors = (tree: Node) => nodes(tree).filter((n) => n.type === "li").map(text);
  const dots = (tree: Node) => nodes(tree).find((n) => n.props.role === "img")!.props["aria-label"];

  it("shows the players and rules steps with titles and progress dots", () => {
    const players = render(three, 0);
    expect([has(players, SetupPlayersStep), has(players, ClueRulesStep)]).toEqual([true, false]);
    expect(nodes(players).find((n) => n.type === SetupPlayersStep)!.props).toEqual({ value: three, onChange, max: 10 });
    expect(text(players)).toContain("clueStepPlayers");
    expect(dots(players)).toBe("step 1/2");
    const rules = render(three, 1);
    expect([has(rules, SetupPlayersStep), has(rules, ClueRulesStep)]).toEqual([false, true]);
    expect(text(rules)).toContain("clueStepRules");
    expect(dots(rules)).toBe("step 2/2");
  });

  it("moves with Next and Back", () => {
    click(button(render(three, 0), "wordNext"));
    expect(onStep).toHaveBeenCalledWith(1);
    expect(button(render(three, 0), "back")).toBeUndefined();
    click(button(render(three, 1), "back"));
    expect(onStep).toHaveBeenCalledWith(0);
  });

  it("lists the players step's errors and stops there", () => {
    const few = render({ ...three, players: ["Ann", "Bob"] }, 0);
    expect(errors(few)).toEqual(["imposterErrTooFew"]);
    expect(button(few, "wordNext")!.props.disabled).toBe(true);
    const many = render({ ...three, players: Array.from({ length: 11 }, (_, i) => `P${i}`) }, 0);
    expect(errors(many)).toEqual(["clueErrTooMany"]);
    expect(errors(render({ ...three, players: ["Ann", "ann", ""] }, 0))).toEqual(["imposterErrBlank", "imposterErrDuplicate"]);
    expect(errors(render({ ...three, deckSize: 9 }, 0))).toEqual([]);
  });

  it("shows every error on the last step and starts only without one", () => {
    const bad = render({ ...three, players: ["Ann"], deckSize: 9 }, 1);
    expect(errors(bad)).toEqual(["imposterErrTooFew", "clueErrRules"]);
    expect(button(bad, "wordStart")!.props.disabled).toBe(true);
    const good = render(three, 1);
    expect(errors(good)).toEqual([]);
    click(button(good, "wordStart"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("offers to start with the last settings on the first step when they are valid", () => {
    const quick = button(render(three, 0, true), "wordQuickStart")!;
    expect(quick.props.style).toMatchObject({ backgroundColor: playerColor(2) });
    click(quick);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(button(render(three, 0, false), "wordQuickStart")).toBeUndefined();
    expect(button(render(three, 1, true), "wordQuickStart")).toBeUndefined();
    expect(button(render({ ...three, players: ["Ann"] }, 0, true), "wordQuickStart")).toBeUndefined();
  });
});
