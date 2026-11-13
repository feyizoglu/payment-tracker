import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, SPECIAL_ROLES, roleSummary, type WolfSetup } from "@ptracker/shared/wolf-game";

const t = vi.hoisted(
  () =>
    new Proxy({} as Record<string, string>, {
      get: (_, key) => (key === "wolfSuggested" ? "suggested {n}" : String(key)),
    })
);
vi.mock("react-native", () => ({ Pressable: () => null, Switch: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({ useLang: () => ({ t }) }));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/ui/segmented-toggle", () => ({ SegmentedToggle: () => null }));
vi.mock("@/components/ui/select-field", () => ({ SelectField: () => null }));
vi.mock("@/components/games/setup-players-step", () => ({ SetupPlayersStep: () => null }));

import { Pressable, Switch, Text } from "react-native";
import { SetupPlayersStep } from "@/components/games/setup-players-step";
import { WolfRolesStep } from "@/components/games/wolf/wolf-roles-step";
import { WolfRulesStep } from "@/components/games/wolf/wolf-rules-step";
import { WolfSetupWizard } from "@/components/games/wolf/wolf-setup";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { SelectField } from "@/components/ui/select-field";

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

const press = (node: Node | undefined) => (node!.props.onPress as () => void)();
const labelled = (tree: Node, label: string) =>
  nodes(tree).find((n) => n.type === Pressable && n.props.accessibilityLabel === label);
const pressable = (tree: Node, label: string) => nodes(tree).find((n) => n.type === Pressable && text(n) === label);
const switches = (tree: Node) => nodes(tree).filter((n) => n.type === Switch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WolfRolesStep", () => {
  const render = (value: WolfSetup) => WolfRolesStep({ value, onChange }) as Node;

  it("shows the suggested wolf count while it follows the player count", () => {
    const tree = render(eight);
    expect(text(tree)).toContain("suggested 2");
    expect(nodes(tree).find((n) => n.type === Text && n.props.accessibilityLiveRegion)!.props.children).toBe(2);
  });

  it("sets the wolves by hand with − and +", () => {
    press(labelled(render(eight), "wolfMore"));
    expect(onChange).toHaveBeenCalledWith({ ...eight, wolves: 3 });
    press(labelled(render(eight), "wolfFewer"));
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
    const [seer, , , witch] = switches(tree);
    expect(witch.props.accessibilityLabel).toBe("wolfRoleWitch");
    (witch.props.onValueChange as (v: boolean) => void)(true);
    expect(onChange).toHaveBeenCalledWith({ ...eight, specials: ["seer", "doctor", "witch"] });
    (seer.props.onValueChange as (v: boolean) => void)(false);
    expect(onChange).toHaveBeenCalledWith({ ...eight, specials: ["doctor"] });
  });

  it("sums the roles up in one line", () => {
    expect(text(render(eight))).toContain(roleSummary(eight, t as never));
  });
});

describe("WolfRulesStep", () => {
  const render = (value: WolfSetup) => WolfRulesStep({ value, onChange }) as Node;
  const toggle = (tree: Node) => nodes(tree).find((n) => n.type === SegmentedToggle)!;

  it("chooses how the night runs and explains the narrator", () => {
    const night = toggle(render(five));
    expect([night.props.label, night.props.value, night.props.hint]).toEqual(["wolfNight", "pass", undefined]);
    (night.props.onChange as (v: string) => void)("narrator");
    expect(onChange).toHaveBeenCalledWith({ ...five, night: "narrator" });
    expect(toggle(render({ ...five, night: "narrator" })).props.hint).toBe("wolfNightNarratorHint");
  });

  it("sets the discussion timer and whether a removed player's role is shown", () => {
    const timer = nodes(render(five)).find((n) => n.type === SelectField)!;
    expect(timer.props.label).toBe("imposterTimer");
    (timer.props.onChange as (v: string) => void)("4");
    expect(onChange).toHaveBeenCalledWith({ ...five, timerMinutes: 4 });
    const [show] = switches(render(five));
    expect(show.props.value).toBe(true);
    (show.props.onValueChange as (v: boolean) => void)(false);
    expect(onChange).toHaveBeenCalledWith({ ...five, showRoles: false });
  });
});

describe("WolfSetupWizard", () => {
  const render = (value: WolfSetup, step: number, quickStart = false) =>
    WolfSetupWizard({ value, onChange, step, onStep, onStart, quickStart }) as Node;
  const has = (tree: Node, type: unknown) => nodes(tree).some((n) => n.type === type);
  const errors = (tree: Node) =>
    nodes(tree)
      .filter((n) => n.type === Text && String(n.props.className).includes("amber"))
      .map(text);
  const primary = (tree: Node) => nodes(tree).find((n) => n.type === PrimaryButton)!;

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
    expect(primary(roles).props).toMatchObject({ label: "imposterNext", disabled: true });
    expect(errors(render({ ...five, players: names(4) }, 0))).toEqual(["wolfErrTooFew"]);
  });

  it("starts from the last step only when the whole setup is valid", () => {
    expect(primary(render(five, 1)).props.label).toBe("imposterNext");
    expect(primary(render({ ...five, players: names(4) }, 2)).props).toMatchObject({ label: "imposterStart", disabled: true });
    const start = primary(render(five, 2));
    expect(start.props.disabled).toBe(false);
    press(start);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("offers Start with last settings on the first step after a game", () => {
    press(pressable(render(five, 0, true), "imposterQuickStart"));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(pressable(render(five, 0, false), "imposterQuickStart")).toBeUndefined();
    expect(pressable(render({ ...five, players: names(4) }, 0, true), "imposterQuickStart")).toBeUndefined();
  });
});
