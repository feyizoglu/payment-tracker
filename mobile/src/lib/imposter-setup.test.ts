import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, type ImposterSetup } from "@ptracker/shared/imposter";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/games/setup-players-step", () => ({ SetupPlayersStep: () => null }));
vi.mock("@/components/games/setup-category-step", () => ({ SetupCategoryStep: () => null }));
vi.mock("@/components/games/setup-rules-step", () => ({ SetupRulesStep: () => null }));

import { Pressable, View } from "react-native";
import { ImposterSetupWizard } from "@/components/games/imposter-setup";
import { SetupCategoryStep } from "@/components/games/setup-category-step";
import { SetupPlayersStep } from "@/components/games/setup-players-step";
import { SetupRulesStep } from "@/components/games/setup-rules-step";
import { PrimaryButton } from "@/components/ui/primary-button";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const onStep = vi.fn();
const onStart = vi.fn();
const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };

function render(value: ImposterSetup, step: number, quickStart = false): Node {
  return ImposterSetupWizard({ value, onChange, step, onStep, onStart, quickStart }) as Node;
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

function primary(tree: Node) {
  return nodes(tree).find((n) => n.type === PrimaryButton)!;
}

function pressable(tree: Node, label: string) {
  return nodes(tree).find((n) => n.type === Pressable && text(n) === label);
}

function has(tree: Node, type: unknown) {
  return nodes(tree).some((n) => n.type === type);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ImposterSetupWizard steps", () => {
  it("shows one step at a time and hands it the setup", () => {
    const first = render(valid, 0);
    expect([has(first, SetupPlayersStep), has(first, SetupCategoryStep), has(first, SetupRulesStep)]).toEqual([true, false, false]);
    expect(nodes(first).find((n) => n.type === SetupPlayersStep)!.props).toEqual({ value: valid, onChange });
    expect(has(render(valid, 1), SetupCategoryStep)).toBe(true);
    expect(has(render(valid, 2), SetupRulesStep)).toBe(true);
  });

  it("says which step of how many is showing", () => {
    const dots = nodes(render(valid, 1)).find((n) => n.type === View && n.props.accessibilityLabel)!;
    expect(dots.props.accessibilityLabel).toBe("imposterStep".replace("{n}", "2").replace("{total}", "3"));
    expect(dots.props.accessible).toBe(true);
  });

  it("has no Back on the first step and goes back from the others", () => {
    expect(pressable(render(valid, 0), "back")).toBeUndefined();
    (pressable(render(valid, 2), "back")!.props.onPress as () => void)();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("moves on with Next when the step has no errors", () => {
    const next = primary(render(valid, 0));
    expect(next.props.label).toBe("imposterNext");
    expect(next.props.disabled).toBe(false);
    (next.props.onPress as () => void)();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("stops on a step with errors and lists only that step's errors", () => {
    const broken = { ...DEFAULT_SETUP, players: ["Ann"], scoreboard: true };
    const tree = render(broken, 0);
    expect(text(tree)).toContain("imposterErrTooFew");
    expect(text(tree)).not.toContain("imposterErrScoreboard");
    expect(primary(tree).props.disabled).toBe(true);
    expect(text(render(broken, 1))).not.toContain("imposterErr");
    expect(primary(render(broken, 1)).props.disabled).toBe(false);
  });
});

describe("ImposterSetupWizard start gate", () => {
  it("lists the errors and disables Start for an invalid setup", () => {
    const tree = render({ ...DEFAULT_SETUP, players: ["Ann"] }, 2);
    expect(text(tree)).toContain("imposterErrTooFew");
    expect(primary(tree).props.label).toBe("imposterStart");
    expect(primary(tree).props.disabled).toBe(true);
  });

  it("starts the game from a valid setup", () => {
    const tree = render(valid, 2);
    expect(text(tree)).not.toContain("imposterErr");
    expect(primary(tree).props.disabled).toBe(false);
    expect(primary(tree).props.onPress).toBe(onStart);
  });

  it("does not offer Start before the last step", () => {
    expect(primary(render(valid, 0)).props.label).toBe("imposterNext");
    expect(primary(render(valid, 1)).props.label).toBe("imposterNext");
  });
});

describe("ImposterSetupWizard quick start", () => {
  it("starts at once from the first step when a game was played before", () => {
    expect(pressable(render(valid, 0, true), "imposterQuickStart")!.props.onPress).toBe(onStart);
  });

  it("is not offered to a first-time player, with an invalid setup, or after the first step", () => {
    expect(pressable(render(valid, 0, false), "imposterQuickStart")).toBeUndefined();
    expect(pressable(render({ ...valid, players: ["Ann"] }, 0, true), "imposterQuickStart")).toBeUndefined();
    expect(pressable(render(valid, 1, true), "imposterQuickStart")).toBeUndefined();
  });
});

describe("ImposterSetupWizard accessibility", () => {
  it("announces the errors as a polite alert", () => {
    const alert = nodes(render({ ...DEFAULT_SETUP, players: ["Ann"] }, 0)).find((n) => n.props.accessibilityRole === "alert")!;
    expect(alert.type).toBe(View);
    expect(alert.props.accessibilityLiveRegion).toBe("polite");
    expect(text(alert)).toContain("imposterErrTooFew");
    expect(nodes(render(valid, 0)).some((n) => n.props.accessibilityRole === "alert")).toBe(false);
  });

  it("gives Back and quick start a button role", () => {
    expect(pressable(render(valid, 1), "back")!.props.accessibilityRole).toBe("button");
    expect(pressable(render(valid, 0, true), "imposterQuickStart")!.props.accessibilityRole).toBe("button");
  });
});
