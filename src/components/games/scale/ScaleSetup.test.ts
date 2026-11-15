import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { defaultScaleSetup, defaultWordSetup, type ScaleSetup } from "@/lib/scale-game";

const lang = vi.hoisted(() => ({ value: "en" }));
const t = vi.hoisted(
  () =>
    new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wordStep" ? "step {n}/{total}" : String(key)),
    })
);
vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  useLang: () => ({ t, lang: lang.value }),
}));
vi.mock("../word/WordTeamsStep", () => ({ default: () => null }));

import WhoChoice from "../who/WhoChoice";
import WordTeamsStep from "../word/WordTeamsStep";
import ScaleRulesStep from "./ScaleRulesStep";
import ScaleSetupWizard from "./ScaleSetupWizard";
import ScaleTeamsStep from "./ScaleTeamsStep";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

// Renders the choice component on the way down, so the rules step's buttons can be read.
function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  if (el.type === WhoChoice) return [el, ...nodes(WhoChoice(el.props as never))];
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
const valid: ScaleSetup = {
  ...defaultScaleSetup(["Team 1", "Team 2"]),
  teams: [
    { name: "Red", players: ["Ann", "Bob"] },
    { name: "Blue", players: ["Cem", "Dan"] },
  ],
};

const click = (node: Node | undefined) => (node!.props.onClick as () => void)();
const buttons = (tree: Node) => nodes(tree).filter((n) => n.type === "button");
const button = (tree: Node, label: string) => buttons(tree).find((n) => text(n) === label);
const group = (tree: Node, label: string) => nodes(tree).find((n) => n.props.role === "group" && n.props["aria-label"] === label);
const pressed = (tree: Node) => buttons(tree).filter((b) => b.props["aria-pressed"]).map(text);

beforeEach(() => {
  vi.clearAllMocks();
  lang.value = "en";
});

describe("ScaleTeamsStep", () => {
  it("edits the teams with Describe It's teams step and takes back only the teams", () => {
    const tree = ScaleTeamsStep({ value: valid, onChange }) as Node;
    const step = nodes(tree).find((n) => n.type === WordTeamsStep)!;
    const word = step.props.value as ReturnType<typeof defaultWordSetup>;
    expect(word.teams).toEqual(valid.teams);
    const renamed = [{ name: "Reds", players: ["Ann", "Bob"] }, valid.teams[1]];
    (step.props.onChange as (next: unknown) => void)({ ...word, teams: renamed, mode: "mime", rounds: 3 });
    expect(onChange).toHaveBeenCalledWith({ ...valid, teams: renamed });
  });
});

describe("ScaleRulesStep", () => {
  it("sets 4, 6 or 8 turns per team and says who gives the clue", () => {
    const turns = group(ScaleRulesStep({ value: valid, onChange }) as Node, "scaleTurns")!;
    expect(buttons(turns).map(text)).toEqual(["4", "6", "8"]);
    expect(pressed(turns)).toEqual(["6"]);
    expect(text(turns)).toContain("scaleTurnsHint");
    click(button(turns, "8"));
    expect(onChange).toHaveBeenCalledWith({ ...valid, turns: 8 });
  });
});

describe("ScaleSetupWizard", () => {
  const render = (value: ScaleSetup, step: number, quickStart = false) =>
    ScaleSetupWizard({ value, onChange, step, onStep, onStart, quickStart }) as Node;
  const has = (tree: Node, type: unknown) => nodes(tree).some((n) => n.type === type);
  const errors = (tree: Node) => nodes(tree).filter((n) => n.type === "li").map(text);
  const dots = (tree: Node) => nodes(tree).find((n) => n.props.role === "img")!.props["aria-label"];
  const small = { ...valid, teams: [{ name: "Red", players: ["Ann"] }, valid.teams[1]] as ScaleSetup["teams"] };

  it("shows the teams and rules steps with titles and progress dots", () => {
    const first = render(valid, 0);
    expect([has(first, ScaleTeamsStep), has(first, ScaleRulesStep)]).toEqual([true, false]);
    expect(text(first)).toContain("wordStepTeams");
    expect(dots(first)).toBe("step 1/2");
    const second = render(valid, 1);
    expect([has(second, ScaleTeamsStep), has(second, ScaleRulesStep)]).toEqual([false, true]);
    expect(text(second)).toContain("wordStepRules");
    expect(dots(second)).toBe("step 2/2");
  });

  it("moves with Next and Back", () => {
    click(button(render(valid, 0), "wordNext"));
    expect(onStep).toHaveBeenCalledWith(1);
    expect(button(render(valid, 0), "back")).toBeUndefined();
    click(button(render(valid, 1), "back"));
    expect(onStep).toHaveBeenCalledWith(0);
  });

  it("lists the teams step's errors and stops there", () => {
    const tree = render(small, 0);
    expect(errors(tree)).toEqual(["wordErrTeamSize"]);
    expect(button(tree, "wordNext")!.props.disabled).toBe(true);
    expect(errors(render({ ...valid, turns: 5 }, 0))).toEqual([]);
  });

  it("compares names with the app language's rules", () => {
    const names = { ...valid, teams: [{ name: "Red", players: ["Işık", "Bob"] }, { name: "Blue", players: ["ışık", "Dan"] }] as ScaleSetup["teams"] };
    expect(errors(render(names, 0))).toEqual([]);
    lang.value = "tr";
    expect(errors(render(names, 0))).toEqual(["wordErrDuplicate"]);
  });

  it("starts from the last step only when the whole setup is valid, listing what blocks it", () => {
    expect(button(render(valid, 0), "wordStart")).toBeUndefined();
    const bad = render(small, 1);
    expect(button(bad, "wordStart")!.props.disabled).toBe(true);
    expect(errors(bad)).toEqual(["wordErrTeamSize"]);
    expect(errors(render({ ...valid, turns: 5 }, 1))).toEqual(["scaleErrRules"]);
    click(button(render(valid, 1), "wordStart"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("offers Start with last settings on the first step when the setup is valid", () => {
    click(button(render(valid, 0, true), "wordQuickStart"));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(button(render(valid, 0, false), "wordQuickStart")).toBeUndefined();
    expect(button(render(valid, 1, true), "wordQuickStart")).toBeUndefined();
    expect(button(render(small, 0, true), "wordQuickStart")).toBeUndefined();
  });
});
