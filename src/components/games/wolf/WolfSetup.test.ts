import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, SPECIAL_ROLES, roleSummary, type WolfSetup } from "@/lib/wolf-game";

const t = vi.hoisted(
  () =>
    new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wolfSuggested" ? "suggested {n}" : String(key)),
    })
);
vi.mock("@/lib/i18n", () => ({ useLang: () => ({ t }) }));
vi.mock("../SetupPlayersStep", () => ({ default: () => null }));

import SetupPlayersStep from "../SetupPlayersStep";
import WolfRolesStep from "./WolfRolesStep";
import WolfRulesStep from "./WolfRulesStep";
import WolfSetupWizard from "./WolfSetupWizard";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const onStep = vi.fn();
const onStart = vi.fn();
const names = (n: number) => ["Ann", "Bob", "Cem", "Dan", "Eda", "Fay", "Gil", "Hal"].slice(0, n);
const five: WolfSetup = { ...DEFAULT_SETUP, players: names(5) };
const eight: WolfSetup = { ...DEFAULT_SETUP, players: names(8) };

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

const click = (node: Node | undefined) => (node!.props.onClick as () => void)();
const button = (tree: Node, label: string) => nodes(tree).find((n) => n.type === "button" && text(n) === label);
const labelled = (tree: Node, label: string) =>
  nodes(tree).find((n) => n.type === "button" && n.props["aria-label"] === label);
const checkboxes = (tree: Node) => nodes(tree).filter((n) => n.type === "input" && n.props.type === "checkbox");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WolfRolesStep", () => {
  const render = (value: WolfSetup) => WolfRolesStep({ value, onChange }) as Node;

  it("shows the suggested wolf count while it follows the player count", () => {
    const tree = render(eight);
    expect(text(tree)).toContain("suggested 2");
    expect(nodes(tree).find((n) => n.props["aria-live"])!.props.children).toBe(2);
  });

  it("sets the wolves by hand with − and +", () => {
    click(labelled(render(eight), "wolfMore"));
    expect(onChange).toHaveBeenCalledWith({ ...eight, wolves: 3 });
    click(labelled(render(eight), "wolfFewer"));
    expect(onChange).toHaveBeenCalledWith({ ...eight, wolves: 1 });
  });

  it("stops at one wolf and at fewer wolves than other players", () => {
    expect(labelled(render({ ...five, wolves: 1 }), "wolfFewer")!.props.disabled).toBe(true);
    expect(labelled(render({ ...five, wolves: 1 }), "wolfMore")!.props.disabled).toBe(false);
    expect(labelled(render({ ...five, wolves: 2 }), "wolfMore")!.props.disabled).toBe(true);
  });

  it("switches each special role, says what it does and keeps the roles in order", () => {
    const tree = render(eight);
    for (const key of ["wolfDescSeer", "wolfDescDoctor", "wolfDescHunter", "wolfDescWitch"]) {
      expect(text(tree)).toContain(key);
    }
    const [seer, , , witch] = checkboxes(tree);
    (witch.props.onChange as (e: unknown) => void)({ target: { checked: true } });
    expect(onChange).toHaveBeenCalledWith({ ...eight, specials: ["seer", "doctor", "witch"] });
    (seer.props.onChange as (e: unknown) => void)({ target: { checked: false } });
    expect(onChange).toHaveBeenCalledWith({ ...eight, specials: ["doctor"] });
  });

  it("sums the roles up in one line", () => {
    expect(text(render(eight))).toContain(roleSummary(eight, t as never));
  });
});

describe("WolfRulesStep", () => {
  const render = (value: WolfSetup) => WolfRulesStep({ value, onChange }) as Node;

  it("chooses how the night runs and explains the narrator", () => {
    const tree = render(five);
    expect(button(tree, "wolfNightPass")!.props["aria-pressed"]).toBe(true);
    expect(text(tree)).not.toContain("wolfNightNarratorHint");
    click(button(tree, "wolfNightNarrator"));
    expect(onChange).toHaveBeenCalledWith({ ...five, night: "narrator" });
    expect(text(render({ ...five, night: "narrator" }))).toContain("wolfNightNarratorHint");
  });

  it("sets the discussion timer and whether a removed player's role is shown", () => {
    const select = nodes(render(five)).find((n) => n.type === "select")!;
    (select.props.onChange as (e: unknown) => void)({ target: { value: "4" } });
    expect(onChange).toHaveBeenCalledWith({ ...five, timerMinutes: 4 });
    const [show] = checkboxes(render(five));
    expect(show.props.checked).toBe(true);
    (show.props.onChange as (e: unknown) => void)({ target: { checked: false } });
    expect(onChange).toHaveBeenCalledWith({ ...five, showRoles: false });
  });
});

describe("WolfSetupWizard", () => {
  const render = (value: WolfSetup, step: number, quickStart = false) =>
    WolfSetupWizard({ value, onChange, step, onStep, onStart, quickStart }) as Node;
  const has = (tree: Node, type: unknown) => nodes(tree).some((n) => n.type === type);
  const errors = (tree: Node) => nodes(tree).filter((n) => n.type === "li").map(text);

  it("shows the players, roles and rules steps one at a time", () => {
    const first = render(five, 0);
    expect([has(first, SetupPlayersStep), has(first, WolfRolesStep), has(first, WolfRulesStep)]).toEqual([true, false, false]);
    expect(nodes(first).find((n) => n.type === SetupPlayersStep)!.props).toEqual({ value: five, onChange });
    expect(has(render(five, 1), WolfRolesStep)).toBe(true);
    expect(has(render(five, 2), WolfRulesStep)).toBe(true);
  });

  it("lists only the step's own errors and stops there", () => {
    const crowded: WolfSetup = { ...five, wolves: 2, specials: [...SPECIAL_ROLES] };
    expect(errors(render(crowded, 0))).toEqual([]);
    const roles = render(crowded, 1);
    expect(errors(roles)).toEqual(["wolfErrRoles"]);
    expect(button(roles, "imposterNext")!.props.disabled).toBe(true);
    expect(errors(render({ ...five, players: names(4) }, 0))).toEqual(["wolfErrTooFew"]);
  });

  it("starts from the last step only when the whole setup is valid", () => {
    expect(button(render(five, 1), "imposterStart")).toBeUndefined();
    expect(button(render({ ...five, players: names(4) }, 2), "imposterStart")!.props.disabled).toBe(true);
    click(button(render(five, 2), "imposterStart"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("offers Start with last settings on the first step after a game", () => {
    click(button(render(five, 0, true), "imposterQuickStart"));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(button(render(five, 0, false), "imposterQuickStart")).toBeUndefined();
    expect(button(render({ ...five, players: names(4) }, 0, true), "imposterQuickStart")).toBeUndefined();
  });
});
