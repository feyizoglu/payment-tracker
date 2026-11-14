import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { defaultWhoSetup, defaultWordSetup, type WhoSetup } from "@ptracker/shared/who-game";

const lang = vi.hoisted(() => ({ value: "en" }));

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, TextInput: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ptracker/shared/i18n")>()),
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => {
        if (key === "wordStep") return "step {n}/{total}";
        if (key === "whoSeconds") return "{n}s";
        return String(key);
      },
    }),
    lang: lang.value,
  }),
}));
vi.mock("@/components/ui/field", () => ({ Field: () => null }));
vi.mock("@/components/ui/segmented-toggle", () => ({ SegmentedToggle: () => null }));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/games/setup-players-step", () => ({ SetupPlayersStep: () => null }));
vi.mock("@/components/games/word/word-teams-step", () => ({ WordTeamsStep: () => null }));

import { Pressable } from "react-native";
import { SetupPlayersStep } from "@/components/games/setup-players-step";
import { WhoCardsStep } from "@/components/games/who/who-cards-step";
import { WhoPlayersStep } from "@/components/games/who/who-players-step";
import { WhoRulesStep } from "@/components/games/who/who-rules-step";
import { WhoSetupWizard } from "@/components/games/who/who-setup";
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
const three: WhoSetup = { ...defaultWhoSetup("en", ["Team 1", "Team 2"]), players: ["Ann", "Bob", "Cem"] };
const teams: WhoSetup = {
  ...three,
  mode: "teams",
  teams: [
    { name: "Red", players: ["Ann", "Bob"] },
    { name: "Blue", players: ["Cem", "Dan"] },
  ],
};

const press = (node: Node) => (node.props.onPress as () => void)();
const toggle = (tree: Node, label: string) => nodes(tree).find((n) => n.type === SegmentedToggle && n.props.label === label);
const pick = (tree: Node, label: string, value: string) => (toggle(tree, label)!.props.onChange as (v: string) => void)(value);
const options = (tree: Node, label: string) =>
  (toggle(tree, label)!.props.options as { value: string; label: string }[]).map((o) => o.label);

beforeEach(() => {
  vi.clearAllMocks();
  lang.value = "en";
});

describe("WhoPlayersStep (mobile)", () => {
  const render = (value: WhoSetup) => WhoPlayersStep({ value, onChange }) as Node;

  it("plays solo or in two teams", () => {
    expect(options(render(three), "whoMode")).toEqual(["whoModeSolo", "whoModeTeams"]);
    expect(toggle(render(three), "whoMode")!.props.value).toBe("solo");
    pick(render(three), "whoMode", "teams");
    expect(onChange).toHaveBeenCalledWith({ ...three, mode: "teams" });
  });

  it("lists the solo players with the shared players step", () => {
    const tree = render(three);
    expect(nodes(tree).find((n) => n.type === SetupPlayersStep)!.props).toEqual({ value: three, onChange });
    expect(nodes(tree).some((n) => n.type === WordTeamsStep)).toBe(false);
  });

  it("edits the teams with Describe It's teams step and takes back only the teams", () => {
    const step = nodes(render(teams)).find((n) => n.type === WordTeamsStep)!;
    const word = step.props.value as ReturnType<typeof defaultWordSetup>;
    expect(word.teams).toEqual(teams.teams);
    const renamed = [{ name: "Reds", players: ["Ann", "Bob"] }, teams.teams[1]];
    (step.props.onChange as (next: unknown) => void)({ ...word, teams: renamed, mode: "mime" });
    expect(onChange).toHaveBeenCalledWith({ ...teams, teams: renamed });
  });
});

describe("WhoCardsStep (mobile)", () => {
  const render = (value: WhoSetup) => WhoCardsStep({ value, onChange }) as Node;
  const kinds = (tree: Node) => nodes(tree).filter((n) => n.type === Pressable);

  it("turns each kind on and off, marked in writing and for screen readers", () => {
    const list = kinds(render(three));
    expect(list.map((k) => k.props.accessibilityLabel)).toEqual([
      "whoKindPeople, whoKindPeopleHint",
      "whoKindCharacters, whoKindCharactersHint",
      "whoKindThings, whoKindThingsHint",
    ]);
    expect(list.map((k) => (k.props.accessibilityState as { checked: boolean }).checked)).toEqual([true, true, false]);
    expect(list.map((k) => text(k).endsWith("✓"))).toEqual([true, true, false]);
    press(list[0]);
    expect(onChange).toHaveBeenLastCalledWith({ ...three, kinds: ["characters"] });
    press(list[2]);
    expect(onChange).toHaveBeenLastCalledWith({ ...three, kinds: ["people", "characters", "things"] });
  });

  it("picks the region for people and characters only, and the level", () => {
    expect(options(render(three), "whoRegion")).toEqual(["whoRegionTr", "whoRegionWorld", "whoRegionMixed"]);
    expect(toggle(render(three), "whoRegion")!.props.hint).toBe("whoRegionHint");
    pick(render(three), "whoRegion", "tr");
    expect(onChange).toHaveBeenLastCalledWith({ ...three, region: "tr" });
    expect(toggle(render({ ...three, kinds: ["things"] }), "whoRegion")).toBeUndefined();
    expect(options(render(three), "whoLevel")).toEqual(["whoLevelEasy", "whoLevelHard", "whoLevelMixed"]);
    pick(render(three), "whoLevel", "easy");
    expect(onChange).toHaveBeenLastCalledWith({ ...three, level: "easy" });
  });
});

describe("WhoRulesStep (mobile)", () => {
  const render = (value: WhoSetup) => WhoRulesStep({ value, onChange }) as Node;

  it("sets the time per turn and the rounds, and says who plays one turn per round", () => {
    expect(options(render(three), "whoTurnTime")).toEqual(["30s", "60s", "90s"]);
    expect(toggle(render(three), "whoTurnTime")!.props.value).toBe("60");
    pick(render(three), "whoTurnTime", "30");
    expect(onChange).toHaveBeenLastCalledWith({ ...three, turnSeconds: 30 });
    expect(options(render(three), "whoRounds")).toEqual(["1", "2", "3"]);
    expect(toggle(render(three), "whoRounds")!.props.hint).toBe("whoRoundsSolo");
    expect(toggle(render(teams), "whoRounds")!.props.hint).toBe("whoRoundsTeams");
    pick(render(three), "whoRounds", "1");
    expect(onChange).toHaveBeenLastCalledWith({ ...three, rounds: 1 });
  });
});

describe("WhoSetupWizard (mobile)", () => {
  const render = (value: WhoSetup, step: number, quickStart = false, poolSize = 100) =>
    WhoSetupWizard({ value, onChange, poolSize, step, onStep, onStart, quickStart }) as Node;
  const has = (tree: Node, type: unknown) => nodes(tree).some((n) => n.type === type);
  const primary = (tree: Node) => nodes(tree).find((n) => n.type === PrimaryButton)!;
  const errors = (tree: Node) =>
    nodes(nodes(tree).find((n) => n.props.accessibilityRole === "alert")).filter((n) => n.props.children && typeof n.props.children === "string").map(text);
  const pressable = (tree: Node, label: string) => nodes(tree).find((n) => n.type === Pressable && text(n) === label);

  it("shows the three steps with progress dots", () => {
    const shown = (tree: Node) => [has(tree, WhoPlayersStep), has(tree, WhoCardsStep), has(tree, WhoRulesStep)];
    expect(shown(render(three, 0))).toEqual([true, false, false]);
    expect(shown(render(three, 1))).toEqual([false, true, false]);
    expect(shown(render(three, 2))).toEqual([false, false, true]);
    expect(nodes(render(three, 1)).find((n) => n.props.accessible)!.props.accessibilityLabel).toBe("step 2/3");
  });

  it("moves with Next and Back, and stops at a step's errors", () => {
    expect(primary(render(three, 0)).props.label).toBe("wordNext");
    press(primary(render(three, 0)));
    expect(onStep).toHaveBeenCalledWith(1);
    press(pressable(render(three, 1), "back")!);
    expect(onStep).toHaveBeenCalledWith(0);
    expect(primary(render({ ...three, players: ["Ann"] }, 0)).props.disabled).toBe(true);
    expect(errors(render({ ...three, players: ["Ann"] }, 0))).toEqual(["whoErrTooFew"]);
    expect(primary(render(three, 1, false, 49)).props.disabled).toBe(true);
    expect(errors(render(three, 1, false, 49))).toEqual(["whoErrSmallPool"]);
  });

  it("starts from the last step only when the whole setup is valid", () => {
    expect(primary(render(three, 2)).props).toMatchObject({ label: "wordStart", disabled: false });
    expect(primary(render(three, 2, false, 10)).props.disabled).toBe(true);
    press(primary(render(three, 2)));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("offers Start with last settings on the first step when the setup and its pool are valid", () => {
    press(pressable(render(three, 0, true), "wordQuickStart")!);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(pressable(render(three, 0, false), "wordQuickStart")).toBeUndefined();
    expect(pressable(render(three, 1, true), "wordQuickStart")).toBeUndefined();
    expect(pressable(render(three, 0, true, 10), "wordQuickStart")).toBeUndefined();
  });

  it("compares names with the app language's rules", () => {
    const names = { ...three, players: ["Işık", "ışık"] };
    expect(primary(render(names, 0)).props.disabled).toBe(false);
    lang.value = "tr";
    expect(primary(render(names, 0)).props.disabled).toBe(true);
  });
});
