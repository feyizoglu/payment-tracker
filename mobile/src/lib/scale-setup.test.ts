import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { defaultScaleSetup, defaultWordSetup, type ScaleSetup } from "@ptracker/shared/scale-game";

const lang = vi.hoisted(() => ({ value: "en" }));

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, TextInput: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ptracker/shared/i18n")>()),
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wordStep" ? "step {n}/{total}" : String(key)),
    }),
    lang: lang.value,
  }),
}));
vi.mock("@/components/ui/field", () => ({ Field: () => null }));
vi.mock("@/components/ui/segmented-toggle", () => ({ SegmentedToggle: () => null }));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/games/word/word-teams-step", () => ({ WordTeamsStep: () => null }));

import { Pressable } from "react-native";
import { ScaleRulesStep } from "@/components/games/scale/scale-rules-step";
import { ScaleSetupWizard } from "@/components/games/scale/scale-setup";
import { ScaleTeamsStep } from "@/components/games/scale/scale-teams-step";
import { WordTeamsStep } from "@/components/games/word/word-teams-step";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

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
const onStep = vi.fn();
const onStart = vi.fn();
const valid: ScaleSetup = {
  teams: [
    { name: "Red", players: ["Ann", "Bob"] },
    { name: "Blue", players: ["Cem", "Dan"] },
  ],
  turns: 6,
};

const press = (node: Node) => (node.props.onPress as () => void)();
const toggle = (tree: Node, label: string) => nodes(tree).find((n) => n.type === SegmentedToggle && n.props.label === label);

beforeEach(() => {
  vi.clearAllMocks();
  lang.value = "en";
});

describe("ScaleTeamsStep (mobile)", () => {
  it("edits the teams with Describe It's teams step and takes back only the teams", () => {
    const step = nodes(ScaleTeamsStep({ value: valid, onChange }) as Node).find((n) => n.type === WordTeamsStep)!;
    const word = step.props.value as ReturnType<typeof defaultWordSetup>;
    expect(word.teams).toEqual(valid.teams);
    const renamed = [{ name: "Reds", players: ["Ann", "Bob"] }, valid.teams[1]];
    (step.props.onChange as (next: unknown) => void)({ ...word, teams: renamed, mode: "mime" });
    expect(onChange).toHaveBeenCalledWith({ ...valid, teams: renamed });
  });
});

describe("ScaleRulesStep (mobile)", () => {
  it("picks 4, 6 or 8 turns per team", () => {
    const choice = toggle(ScaleRulesStep({ value: valid, onChange }) as Node, "scaleTurns")!;
    expect((choice.props.options as { label: string }[]).map((o) => o.label)).toEqual(["4", "6", "8"]);
    expect(choice.props).toMatchObject({ value: "6", hint: "scaleTurnsHint" });
    (choice.props.onChange as (v: string) => void)("8");
    expect(onChange).toHaveBeenCalledWith({ ...valid, turns: 8 });
  });
});

describe("ScaleSetupWizard (mobile)", () => {
  const render = (value: ScaleSetup, step: number, quickStart = false) =>
    ScaleSetupWizard({ value, onChange, step, onStep, onStart, quickStart }) as Node;
  const has = (tree: Node, type: unknown) => nodes(tree).some((n) => n.type === type);
  const primary = (tree: Node) => nodes(tree).find((n) => n.type === PrimaryButton)!;
  const errors = (tree: Node) =>
    nodes(nodes(tree).find((n) => n.props.accessibilityRole === "alert"))
      .filter((n) => n.props.children && typeof n.props.children === "string")
      .map(text);
  const pressable = (tree: Node, label: string) => nodes(tree).find((n) => n.type === Pressable && text(n) === label);
  const oneShort: ScaleSetup = { ...valid, teams: [{ name: "Red", players: ["Ann"] }, valid.teams[1]] };

  it("shows the two steps, their titles and progress dots", () => {
    const shown = (tree: Node) => [has(tree, ScaleTeamsStep), has(tree, ScaleRulesStep)];
    expect(shown(render(valid, 0))).toEqual([true, false]);
    expect(shown(render(valid, 1))).toEqual([false, true]);
    expect(text(render(valid, 0))).toContain("wordStepTeams");
    expect(text(render(valid, 1))).toContain("wordStepRules");
    expect(nodes(render(valid, 1)).find((n) => n.props.accessible)!.props.accessibilityLabel).toBe("step 2/2");
  });

  it("moves with Next and Back, and stops at a step's errors", () => {
    expect(primary(render(valid, 0)).props.label).toBe("wordNext");
    press(primary(render(valid, 0)));
    expect(onStep).toHaveBeenCalledWith(1);
    press(pressable(render(valid, 1), "back")!);
    expect(onStep).toHaveBeenCalledWith(0);
    expect(pressable(render(valid, 0), "back")).toBeUndefined();
    expect(primary(render(oneShort, 0)).props.disabled).toBe(true);
    expect(errors(render(oneShort, 0))).toEqual(["wordErrTeamSize"]);
    expect(errors(render({ ...valid, turns: 5 }, 0))).toEqual([]);
  });

  it("starts from the last step only when the whole setup is valid, listing every error", () => {
    expect(primary(render(valid, 1)).props).toMatchObject({ label: "wordStart", disabled: false });
    press(primary(render(valid, 1)));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(primary(render({ ...valid, turns: 5 }, 1)).props.disabled).toBe(true);
    expect(errors(render({ ...oneShort, turns: 5 }, 1))).toEqual(["wordErrTeamSize", "scaleErrRules"]);
  });

  it("offers Start with last settings on the first step when the setup is valid", () => {
    press(pressable(render(valid, 0, true), "wordQuickStart")!);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(pressable(render(valid, 0, false), "wordQuickStart")).toBeUndefined();
    expect(pressable(render(valid, 1, true), "wordQuickStart")).toBeUndefined();
    expect(pressable(render(oneShort, 0, true), "wordQuickStart")).toBeUndefined();
  });

  it("compares names with the app language's rules", () => {
    const names: ScaleSetup = { ...valid, teams: [{ name: "Red", players: ["Işık", "Bob"] }, { name: "Blue", players: ["ışık", "Dan"] }] };
    expect(primary(render(names, 0)).props.disabled).toBe(false);
    lang.value = "tr";
    expect(primary(render(names, 0)).props.disabled).toBe(true);
  });

  it("offers no quick start with the empty default teams", () => {
    expect(pressable(render(defaultScaleSetup(["Team 1", "Team 2"]), 0, true), "wordQuickStart")).toBeUndefined();
  });
});
