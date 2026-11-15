import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { defaultWhoSetup, defaultWordSetup, type WhoSetup } from "@/lib/who-game";

const lang = vi.hoisted(() => ({ value: "en" }));
const t = vi.hoisted(
  () =>
    new Proxy({} as Record<string, string>, {
      get: (_, key) => {
        if (key === "wordStep") return "step {n}/{total}";
        if (key === "whoSeconds") return "{n}s";
        return String(key);
      },
    })
);
vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  useLang: () => ({ t, lang: lang.value }),
}));
vi.mock("../SetupPlayersStep", () => ({ default: () => null }));
vi.mock("../word/WordTeamsStep", () => ({ default: () => null }));

import SetupPlayersStep from "../SetupPlayersStep";
import WordTeamsStep from "../word/WordTeamsStep";
import WhoCardsStep from "./WhoCardsStep";
import WhoChoice from "./WhoChoice";
import WhoPlayersStep from "./WhoPlayersStep";
import WhoRulesStep from "./WhoRulesStep";
import WhoSetupWizard from "./WhoSetupWizard";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

// Renders function components on the way down, so the steps' choices can be read.
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
const three: WhoSetup = { ...defaultWhoSetup("en", ["Team 1", "Team 2"]), players: ["Ann", "Bob", "Cem"] };
const teams: WhoSetup = {
  ...three,
  mode: "teams",
  teams: [
    { name: "Red", players: ["Ann", "Bob"] },
    { name: "Blue", players: ["Cem", "Dan"] },
  ],
};

const click = (node: Node | undefined) => (node!.props.onClick as () => void)();
const buttons = (tree: Node) => nodes(tree).filter((n) => n.type === "button");
const button = (tree: Node, label: string) => buttons(tree).find((n) => text(n) === label);
const startsWith = (tree: Node, label: string) => buttons(tree).find((n) => text(n).includes(label));
const group = (tree: Node, label: string) => nodes(tree).find((n) => n.props.role === "group" && n.props["aria-label"] === label);
const pressed = (tree: Node) => buttons(tree).filter((b) => b.props["aria-pressed"]).map(text);

beforeEach(() => {
  vi.clearAllMocks();
  lang.value = "en";
});

describe("WhoPlayersStep", () => {
  const render = (value: WhoSetup) => WhoPlayersStep({ value, onChange }) as Node;

  it("plays solo or in two teams, the current way pressed", () => {
    const mode = group(render(three), "whoMode")!;
    expect(buttons(mode).map(text)).toEqual(["whoModeSolo", "whoModeTeams"]);
    expect(pressed(mode)).toEqual(["whoModeSolo"]);
    click(button(mode, "whoModeTeams"));
    expect(onChange).toHaveBeenCalledWith({ ...three, mode: "teams" });
  });

  it("lists the solo players with the shared players step", () => {
    const tree = render(three);
    expect(nodes(tree).find((n) => n.type === SetupPlayersStep)!.props).toEqual({ value: three, onChange });
    expect(nodes(tree).some((n) => n.type === WordTeamsStep)).toBe(false);
  });

  it("edits the teams with Describe It's teams step and takes back only the teams", () => {
    const tree = render(teams);
    expect(nodes(tree).some((n) => n.type === SetupPlayersStep)).toBe(false);
    const step = nodes(tree).find((n) => n.type === WordTeamsStep)!;
    const word = step.props.value as ReturnType<typeof defaultWordSetup>;
    expect(word.teams).toEqual(teams.teams);
    const renamed = [{ name: "Reds", players: ["Ann", "Bob"] }, teams.teams[1]];
    (step.props.onChange as (next: unknown) => void)({ ...word, teams: renamed, mode: "mime", rounds: 3 });
    expect(onChange).toHaveBeenCalledWith({ ...teams, teams: renamed });
  });
});

describe("WhoCardsStep", () => {
  const render = (value: WhoSetup) => WhoCardsStep({ value, onChange }) as Node;

  it("turns each kind on and off, keeping their order", () => {
    const kinds = group(render(three), "whoKinds")!;
    expect(buttons(kinds).map((b) => b.props["aria-pressed"])).toEqual([true, true, false]);
    expect(text(kinds)).toContain("whoKindThingsHint");
    click(startsWith(kinds, "whoKindPeople"));
    expect(onChange).toHaveBeenLastCalledWith({ ...three, kinds: ["characters"] });
    click(startsWith(kinds, "whoKindThings"));
    expect(onChange).toHaveBeenLastCalledWith({ ...three, kinds: ["people", "characters", "things"] });
    click(startsWith(group(render({ ...three, kinds: ["things"] }), "whoKinds")!, "whoKindPeople"));
    expect(onChange).toHaveBeenLastCalledWith({ ...three, kinds: ["people", "things"] });
  });

  it("marks a chosen kind in writing, not by colour alone", () => {
    const kinds = buttons(group(render(three), "whoKinds")!);
    expect(kinds.map((b) => text(b).endsWith("✓"))).toEqual([true, true, false]);
  });

  it("picks the region for people and characters only", () => {
    const region = group(render(three), "whoRegion")!;
    expect(buttons(region).map(text)).toEqual(["whoRegionTr", "whoRegionWorld", "whoRegionMixed"]);
    expect(pressed(region)).toEqual(["whoRegionWorld"]);
    expect(text(region)).toContain("whoRegionHint");
    click(button(region, "whoRegionTr"));
    expect(onChange).toHaveBeenCalledWith({ ...three, region: "tr" });
    expect(group(render({ ...three, kinds: ["things"] }), "whoRegion")).toBeUndefined();
    expect(group(render({ ...three, kinds: ["characters", "things"] }), "whoRegion")).toBeDefined();
  });

  it("picks the level", () => {
    const level = group(render(three), "whoLevel")!;
    expect(buttons(level).map(text)).toEqual(["whoLevelEasy", "whoLevelHard", "whoLevelMixed"]);
    expect(pressed(level)).toEqual(["whoLevelMixed"]);
    click(button(level, "whoLevelHard"));
    expect(onChange).toHaveBeenCalledWith({ ...three, level: "hard" });
  });
});

describe("WhoRulesStep", () => {
  const render = (value: WhoSetup) => WhoRulesStep({ value, onChange }) as Node;

  it("sets the time per turn to 30, 60 or 90 s", () => {
    const time = group(render(three), "whoTurnTime")!;
    expect(buttons(time).map(text)).toEqual(["30s", "60s", "90s"]);
    expect(pressed(time)).toEqual(["60s"]);
    click(button(time, "90s"));
    expect(onChange).toHaveBeenCalledWith({ ...three, turnSeconds: 90 });
  });

  it("sets 1 to 3 rounds and says who plays one turn per round", () => {
    const rounds = group(render(three), "whoRounds")!;
    expect(buttons(rounds).map(text)).toEqual(["1", "2", "3"]);
    expect(pressed(rounds)).toEqual(["2"]);
    expect(text(rounds)).toContain("whoRoundsSolo");
    expect(text(group(render(teams), "whoRounds"))).toContain("whoRoundsTeams");
    click(button(rounds, "3"));
    expect(onChange).toHaveBeenCalledWith({ ...three, rounds: 3 });
  });
});

describe("WhoSetupWizard", () => {
  const render = (value: WhoSetup, step: number, quickStart = false, poolSize = 100) =>
    WhoSetupWizard({ value, onChange, poolSize, step, onStep, onStart, quickStart }) as Node;
  const has = (tree: Node, type: unknown) => nodes(tree).some((n) => n.type === type);
  const errors = (tree: Node) => nodes(tree).filter((n) => n.type === "li").map(text);
  const shown = (tree: Node) => [has(tree, WhoPlayersStep), has(tree, WhoCardsStep), has(tree, WhoRulesStep)];
  const dots = (tree: Node) => nodes(tree).find((n) => n.props.role === "img")!.props["aria-label"];

  it("shows the players, cards and rules steps with titles and progress dots", () => {
    expect(shown(render(three, 0))).toEqual([true, false, false]);
    expect(text(render(three, 0))).toContain("whoStepPlayers");
    expect(dots(render(three, 0))).toBe("step 1/3");
    expect(shown(render(three, 1))).toEqual([false, true, false]);
    expect(text(render(three, 1))).toContain("whoStepCards");
    expect(shown(render(three, 2))).toEqual([false, false, true]);
    expect(dots(render(three, 2))).toBe("step 3/3");
  });

  it("moves with Next and Back", () => {
    click(button(render(three, 1), "wordNext"));
    expect(onStep).toHaveBeenCalledWith(2);
    expect(button(render(three, 0), "back")).toBeUndefined();
    click(button(render(three, 1), "back"));
    expect(onStep).toHaveBeenCalledWith(0);
  });

  it("lists each step's own errors and stops there", () => {
    const one = render({ ...three, players: ["Ann"] }, 0);
    expect(errors(one)).toEqual(["whoErrTooFew"]);
    expect(button(one, "wordNext")!.props.disabled).toBe(true);
    const cards = render(three, 1, false, 49);
    expect(errors(cards)).toEqual(["whoErrSmallPool"]);
    expect(button(cards, "wordNext")!.props.disabled).toBe(true);
    expect(errors(render({ ...three, kinds: [] }, 1, false, 0))).toEqual(["whoErrNoKinds"]);
    expect(errors(render(three, 0, false, 0))).toEqual([]);
  });

  it("checks the teams in a team game", () => {
    const small = { ...teams, teams: [{ name: "Red", players: ["Ann"] }, teams.teams[1]] as WhoSetup["teams"] };
    expect(errors(render(small, 0))).toEqual(["wordErrTeamSize"]);
    expect(errors(render(teams, 0))).toEqual([]);
  });

  it("compares names with the app language's rules", () => {
    const names = { ...three, players: ["Işık", "ışık"] };
    expect(errors(render(names, 0))).toEqual([]);
    lang.value = "tr";
    expect(errors(render(names, 0))).toEqual(["imposterErrDuplicate"]);
  });

  it("starts from the last step only when the whole setup is valid", () => {
    expect(button(render(three, 0), "wordStart")).toBeUndefined();
    const bad = render(three, 2, false, 10);
    expect(button(bad, "wordStart")!.props.disabled).toBe(true);
    expect(errors(bad)).toEqual(["whoErrSmallPool"]);
    click(button(render(three, 2), "wordStart"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("offers Start with last settings on the first step when the setup and its pool are valid", () => {
    click(button(render(three, 0, true), "wordQuickStart"));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(button(render(three, 0, false), "wordQuickStart")).toBeUndefined();
    expect(button(render(three, 1, true), "wordQuickStart")).toBeUndefined();
    expect(button(render(three, 0, true, 10), "wordQuickStart")).toBeUndefined();
  });
});
