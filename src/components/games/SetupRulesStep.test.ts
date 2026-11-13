import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, type ImposterSetup } from "@/lib/imposter";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));

import SetupRulesStep from "./SetupRulesStep";

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

function checkboxes(tree: Node) {
  return nodes(tree).filter((n) => n.type === "input" && n.props.type === "checkbox");
}

function button(tree: Node, label: string) {
  return nodes(tree).find((n) => n.type === "button" && text(n) === label)!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SetupRulesStep voting toggle", () => {
  it("turns the scoreboard off with voting", () => {
    const value = { ...valid, voting: true, scoreboard: true };
    const [voting] = checkboxes(render(value));
    (voting.props.onChange as (e: unknown) => void)({ target: { checked: false } });
    expect(onChange).toHaveBeenCalledWith({ ...value, voting: false, scoreboard: false });
  });

  it("disables the scoreboard checkbox only while voting is off", () => {
    expect(checkboxes(render({ ...valid, voting: false }))[1].props.disabled).toBe(true);
    expect(checkboxes(render({ ...valid, voting: true }))[1].props.disabled).toBe(false);
  });
});

describe("SetupRulesStep mode", () => {
  it("switches the mode", () => {
    (button(render(valid), "imposterModeSimilar").props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, mode: "similar-word" });
  });

  it("offers 'imposter knows their role' only in similar-word mode", () => {
    expect(text(render(valid))).not.toContain("imposterKnowsRole");
    const tree = render({ ...valid, mode: "similar-word" });
    expect(text(tree)).toContain("imposterKnowsRole");
    const [knows] = checkboxes(tree);
    (knows.props.onChange as (e: unknown) => void)({ target: { checked: true } });
    expect(onChange).toHaveBeenCalledWith({ ...valid, mode: "similar-word", imposterKnows: true });
  });
});

describe("SetupRulesStep imposter count and timer", () => {
  it("disables the counts the player count does not allow", () => {
    const three = render(valid);
    expect(button(three, "1").props.disabled).toBe(false);
    expect(button(three, "2").props.disabled).toBe(true);
    expect(button(three, "3").props.disabled).toBe(true);
    const seven = render({ ...valid, players: ["A", "B", "C", "D", "E", "F", "G"] });
    expect(button(seven, "3").props.disabled).toBe(false);
  });

  it("sets the imposter count and the timer", () => {
    const five = { ...valid, players: ["A", "B", "C", "D", "E"] };
    (button(render(five), "2").props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...five, imposterCount: 2 });
    const select = nodes(render(valid)).find((n) => n.type === "select")!;
    (select.props.onChange as (e: unknown) => void)({ target: { value: "5" } });
    expect(onChange).toHaveBeenCalledWith({ ...valid, timerMinutes: 5 });
  });
});

describe("SetupRulesStep selected state", () => {
  it("marks only the selected mode as pressed", () => {
    const noWord = render({ ...valid, mode: "no-word" });
    expect(button(noWord, "imposterModeNoWord").props["aria-pressed"]).toBe(true);
    expect(button(noWord, "imposterModeSimilar").props["aria-pressed"]).toBe(false);
    const similar = render({ ...valid, mode: "similar-word" });
    expect(button(similar, "imposterModeNoWord").props["aria-pressed"]).toBe(false);
    expect(button(similar, "imposterModeSimilar").props["aria-pressed"]).toBe(true);
  });

  it("marks only the selected imposter count as pressed", () => {
    const tree = render({ ...valid, players: ["A", "B", "C", "D", "E", "F", "G"], imposterCount: 2 });
    expect(button(tree, "1").props["aria-pressed"]).toBe(false);
    expect(button(tree, "2").props["aria-pressed"]).toBe(true);
    expect(button(tree, "3").props["aria-pressed"]).toBe(false);
  });
});
