import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { defaultWordSetup, type WordSetup } from "@ptracker/shared/word-game";

const i18n = vi.hoisted(() => ({ lang: "en" }));

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ptracker/shared/i18n")>()),
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }), lang: i18n.lang }),
}));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/games/word/word-teams-step", () => ({ WordTeamsStep: () => null }));
vi.mock("@/components/games/word/word-words-step", () => ({ WordWordsStep: () => null }));
vi.mock("@/components/games/word/word-rules-step", () => ({ WordRulesStep: () => null }));

import { Pressable, View } from "react-native";
import { WordRulesStep } from "@/components/games/word/word-rules-step";
import { WordSetupWizard } from "@/components/games/word/word-setup";
import { WordTeamsStep } from "@/components/games/word/word-teams-step";
import { WordWordsStep } from "@/components/games/word/word-words-step";
import { PrimaryButton } from "@/components/ui/primary-button";

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

const primary = (tree: Node) => nodes(tree).find((n) => n.type === PrimaryButton)!;
const pressable = (tree: Node, label: string) => nodes(tree).find((n) => n.type === Pressable && text(n) === label);
const has = (tree: Node, type: unknown) => nodes(tree).some((n) => n.type === type);

beforeEach(() => {
  vi.clearAllMocks();
  i18n.lang = "en";
});

describe("WordSetupWizard (mobile) steps", () => {
  it("compares names with the case rules of the app language", () => {
    const irem: WordSetup = {
      ...valid,
      teams: [
        { name: "Red", players: ["İrem", "Bob"] },
        { name: "Blue", players: ["irem", "Dan"] },
      ],
    };
    i18n.lang = "tr";
    expect(text(render(irem, 0))).toContain("wordErrDuplicate");
    i18n.lang = "en";
    expect(text(render(irem, 0))).not.toContain("wordErrDuplicate");
  });

  it("shows one step at a time under its title and hands it the setup", () => {
    const first = render(valid, 0);
    expect([has(first, WordTeamsStep), has(first, WordWordsStep), has(first, WordRulesStep)]).toEqual([true, false, false]);
    expect(nodes(first).find((n) => n.type === WordTeamsStep)!.props).toEqual({ value: valid, onChange });
    expect(text(first)).toContain("wordStepTeams");
    expect(has(render(valid, 1), WordWordsStep)).toBe(true);
    expect(has(render(valid, 2), WordRulesStep)).toBe(true);
  });

  it("says which step of how many is showing", () => {
    const dots = nodes(render(valid, 1)).find((n) => n.type === View && n.props.accessibilityLabel)!;
    expect(dots.props.accessibilityLabel).toBe("wordStep");
    expect(dots.props.accessible).toBe(true);
  });

  it("goes back from every step but the first", () => {
    expect(pressable(render(valid, 0), "back")).toBeUndefined();
    (pressable(render(valid, 2), "back")!.props.onPress as () => void)();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("stops on the teams step until its errors are fixed and lists them", () => {
    const tree = render(broken, 0);
    expect(text(tree)).toContain("wordErrTeamSize");
    expect(primary(tree).props.label).toBe("wordNext");
    expect(primary(tree).props.disabled).toBe(true);
    expect(text(render(broken, 1))).not.toContain("wordErr");
    (primary(render(valid, 0)).props.onPress as () => void)();
    expect(onStep).toHaveBeenCalledWith(1);
  });
});

describe("WordSetupWizard (mobile) start", () => {
  it("lists every error and disables Start on the last step", () => {
    const tree = render(broken, 2);
    expect(text(tree)).toContain("wordErrTeamSize");
    expect(primary(tree).props.label).toBe("wordStart");
    expect(primary(tree).props.disabled).toBe(true);
  });

  it("starts a valid game from the last step", () => {
    expect(primary(render(valid, 2)).props.disabled).toBe(false);
    expect(primary(render(valid, 2)).props.onPress).toBe(onStart);
  });

  it("offers the last settings on the first step only, after a game, for a valid setup", () => {
    (pressable(render(valid, 0, true), "wordQuickStart")!.props.onPress as () => void)();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(pressable(render(valid, 0, false), "wordQuickStart")).toBeUndefined();
    expect(pressable(render(broken, 0, true), "wordQuickStart")).toBeUndefined();
    expect(pressable(render(valid, 1, true), "wordQuickStart")).toBeUndefined();
  });
});
