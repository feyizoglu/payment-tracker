import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { defaultClueSetup, type ClueSetup } from "@ptracker/shared/clue-game";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, TextInput: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ptracker/shared/i18n")>()),
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, { get: (_, key) => (key === "wordStep" ? "step {n}/{total}" : String(key)) }),
    lang: "en",
  }),
}));
vi.mock("@/components/ui/field", () => ({ Field: () => null }));
vi.mock("@/components/ui/segmented-toggle", () => ({ SegmentedToggle: () => null }));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/games/setup-players-step", () => ({ SetupPlayersStep: () => null }));

import { Pressable } from "react-native";
import { ClueRulesStep } from "@/components/games/clue/clue-rules-step";
import { ClueSetupWizard } from "@/components/games/clue/clue-setup";
import { SetupPlayersStep } from "@/components/games/setup-players-step";
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
const three: ClueSetup = { ...defaultClueSetup(), players: ["Ann", "Bob", "Cem"] };

const press = (node: Node) => (node.props.onPress as () => void)();
const toggle = (tree: Node, label: string) => nodes(tree).find((n) => n.type === SegmentedToggle && n.props.label === label);
const pick = (tree: Node, label: string, value: string) => (toggle(tree, label)!.props.onChange as (v: string) => void)(value);
const options = (tree: Node, label: string) =>
  (toggle(tree, label)!.props.options as { value: string; label: string }[]).map((o) => o.label);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ClueRulesStep (mobile)", () => {
  const render = (value: ClueSetup) => ClueRulesStep({ value, onChange }) as Node;

  it("deals 8, 13 or 20 words", () => {
    expect(options(render(three), "clueDeck")).toEqual(["8", "13", "20"]);
    expect(toggle(render(three), "clueDeck")!.props.value).toBe("13");
    pick(render(three), "clueDeck", "20");
    expect(onChange).toHaveBeenCalledWith({ ...three, deckSize: 20 });
  });

  it("picks easy, hard or mixed words", () => {
    expect(options(render(three), "clueLevel")).toEqual(["clueLevelEasy", "clueLevelHard", "clueLevelMixed"]);
    expect(toggle(render(three), "clueLevel")!.props.value).toBe("mixed");
    pick(render(three), "clueLevel", "easy");
    expect(onChange).toHaveBeenCalledWith({ ...three, level: "easy" });
  });
});

describe("ClueSetupWizard (mobile)", () => {
  const render = (value: ClueSetup, step: number, quickStart = false) =>
    ClueSetupWizard({ value, onChange, step, onStep, onStart, quickStart }) as Node;
  const has = (tree: Node, type: unknown) => nodes(tree).some((n) => n.type === type);
  const primary = (tree: Node) => nodes(tree).find((n) => n.type === PrimaryButton)!;
  const errors = (tree: Node) =>
    nodes(nodes(tree).find((n) => n.props.accessibilityRole === "alert"))
      .filter((n) => typeof n.props.children === "string")
      .map(text);
  const pressable = (tree: Node, label: string) => nodes(tree).find((n) => n.type === Pressable && text(n) === label);

  it("shows the players and rules steps with titles and progress dots", () => {
    expect([has(render(three, 0), SetupPlayersStep), has(render(three, 0), ClueRulesStep)]).toEqual([true, false]);
    expect(nodes(render(three, 0)).find((n) => n.type === SetupPlayersStep)!.props).toEqual({ value: three, onChange, max: 10 });
    expect(text(render(three, 0))).toContain("clueStepPlayers");
    expect([has(render(three, 1), SetupPlayersStep), has(render(three, 1), ClueRulesStep)]).toEqual([false, true]);
    expect(text(render(three, 1))).toContain("clueStepRules");
    expect(nodes(render(three, 1)).find((n) => n.props.accessible)!.props.accessibilityLabel).toBe("step 2/2");
  });

  it("moves with Next and Back, and stops at the players' errors", () => {
    expect(primary(render(three, 0)).props.label).toBe("wordNext");
    press(primary(render(three, 0)));
    expect(onStep).toHaveBeenCalledWith(1);
    expect(pressable(render(three, 0), "back")).toBeUndefined();
    press(pressable(render(three, 1), "back")!);
    expect(onStep).toHaveBeenCalledWith(0);
    expect(primary(render({ ...three, players: ["Ann"] }, 0)).props.disabled).toBe(true);
    expect(errors(render({ ...three, players: ["Ann"] }, 0))).toEqual(["imposterErrTooFew"]);
    const eleven = Array.from({ length: 11 }, (_, i) => `P${i}`);
    expect(errors(render({ ...three, players: eleven }, 0))).toEqual(["clueErrTooMany"]);
  });

  it("starts from the last step only when the whole setup is valid", () => {
    expect(primary(render(three, 1)).props).toMatchObject({ label: "wordStart", disabled: false });
    expect(primary(render({ ...three, deckSize: 9 }, 1)).props.disabled).toBe(true);
    expect(errors(render({ ...three, players: ["Ann"], deckSize: 9 }, 1))).toEqual(["imposterErrTooFew", "clueErrRules"]);
    press(primary(render(three, 1)));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("offers Start with last settings on the first step when the setup is valid", () => {
    press(pressable(render(three, 0, true), "wordQuickStart")!);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(pressable(render(three, 0, false), "wordQuickStart")).toBeUndefined();
    expect(pressable(render(three, 1, true), "wordQuickStart")).toBeUndefined();
    expect(pressable(render({ ...three, players: ["Ann"] }, 0, true), "wordQuickStart")).toBeUndefined();
  });
});
