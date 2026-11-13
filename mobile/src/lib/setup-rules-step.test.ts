import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, type ImposterSetup } from "@ptracker/shared/imposter";

vi.mock("react-native", () => ({ Switch: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));
vi.mock("@/components/ui/segmented-toggle", () => ({ SegmentedToggle: () => null }));
vi.mock("@/components/ui/select-field", () => ({ SelectField: () => null }));

import { Switch } from "react-native";
import { SetupRulesStep } from "@/components/games/setup-rules-step";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { SelectField } from "@/components/ui/select-field";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };

function render(value: ImposterSetup): Node {
  return SetupRulesStep({ value, onChange }) as Node;
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

function switches(tree: Node) {
  return nodes(tree).filter((n) => n.type === Switch);
}

function toggle(tree: Node, label: string) {
  return nodes(tree).find((n) => n.type === SegmentedToggle && n.props.label === label)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SetupRulesStep voting switch", () => {
  it("turns the scoreboard off with voting", () => {
    const value = { ...valid, voting: true, scoreboard: true };
    const [voting] = switches(render(value));
    (voting.props.onValueChange as (v: boolean) => void)(false);
    expect(onChange).toHaveBeenCalledWith({ ...value, voting: false, scoreboard: false });
  });

  it("disables the scoreboard switch only while voting is off", () => {
    expect(switches(render({ ...valid, voting: false }))[1].props.disabled).toBe(true);
    expect(switches(render({ ...valid, voting: true }))[1].props.disabled).toBe(false);
  });
});

describe("SetupRulesStep mode", () => {
  it("switches the mode", () => {
    (toggle(render(valid), "imposterMode").props.onChange as (v: string) => void)("similar-word");
    expect(onChange).toHaveBeenCalledWith({ ...valid, mode: "similar-word" });
  });

  it("offers 'imposter knows their role' only in similar-word mode", () => {
    expect(text(render(valid))).not.toContain("imposterKnowsRole");
    const tree = render({ ...valid, mode: "similar-word" });
    expect(text(tree)).toContain("imposterKnowsRole");
    const [knows] = switches(tree);
    (knows.props.onValueChange as (v: boolean) => void)(true);
    expect(onChange).toHaveBeenCalledWith({ ...valid, mode: "similar-word", imposterKnows: true });
  });
});

describe("SetupRulesStep imposter count and timer", () => {
  it("offers only the counts the player count allows", () => {
    const options = (tree: Node) => (toggle(tree, "imposterCount").props.options as { value: string }[]).map((o) => o.value);
    expect(options(render({ ...valid, players: ["A", "B"] }))).toEqual(["1"]);
    expect(options(render(valid))).toEqual(["1"]);
    expect(options(render({ ...valid, players: ["A", "B", "C", "D", "E", "F", "G"] }))).toEqual(["1", "2", "3"]);
  });

  it("sets the imposter count and the timer", () => {
    const five = { ...valid, players: ["A", "B", "C", "D", "E"] };
    (toggle(render(five), "imposterCount").props.onChange as (v: string) => void)("2");
    expect(onChange).toHaveBeenCalledWith({ ...five, imposterCount: 2 });
    const timer = nodes(render(valid)).find((n) => n.type === SelectField)!;
    expect(timer.props.label).toBe("imposterTimer");
    (timer.props.onChange as (v: string) => void)("5");
    expect(onChange).toHaveBeenCalledWith({ ...valid, timerMinutes: 5 });
  });
});
