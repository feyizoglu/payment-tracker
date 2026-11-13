import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, type ImposterSetup } from "@/lib/imposter";

vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));
vi.mock("./SetupPlayersStep", () => ({ default: () => null }));
vi.mock("./SetupCategoryStep", () => ({ default: () => null }));
vi.mock("./SetupRulesStep", () => ({ default: () => null }));

import ImposterSetupWizard from "./ImposterSetupWizard";
import SetupPlayersStep from "./SetupPlayersStep";
import SetupCategoryStep from "./SetupCategoryStep";
import SetupRulesStep from "./SetupRulesStep";

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

function button(tree: Node, label: string) {
  return nodes(tree).find((n) => n.type === "button" && text(n) === label);
}

function errors(tree: Node) {
  return nodes(tree).filter((n) => n.type === "li").map(text);
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
    const label = nodes(render(valid, 1)).find((n) => n.props["aria-label"])!.props["aria-label"];
    expect(label).toBe("imposterStep".replace("{n}", "2").replace("{total}", "3"));
  });

  it("has no Back on the first step and goes back from the others", () => {
    expect(button(render(valid, 0), "back")).toBeUndefined();
    (button(render(valid, 2), "back")!.props.onClick as () => void)();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("moves on with Next when the step has no errors", () => {
    const next = button(render(valid, 0), "imposterNext")!;
    expect(next.props.disabled).toBe(false);
    (next.props.onClick as () => void)();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("stops on a step with errors and lists only that step's errors", () => {
    const broken = { ...DEFAULT_SETUP, players: ["Ann"], scoreboard: true };
    const tree = render(broken, 0);
    expect(errors(tree)).toEqual(["imposterErrTooFew"]);
    expect(button(tree, "imposterNext")!.props.disabled).toBe(true);
    expect(errors(render(broken, 1))).toEqual([]);
    expect(button(render(broken, 1), "imposterNext")!.props.disabled).toBe(false);
  });
});

describe("ImposterSetupWizard start gate", () => {
  it("lists the errors and disables Start for an invalid setup", () => {
    const tree = render({ ...DEFAULT_SETUP, players: ["Ann"] }, 2);
    expect(errors(tree)).toEqual(["imposterErrTooFew"]);
    expect(button(tree, "imposterStart")?.props.disabled).toBe(true);
    expect(button(tree, "imposterNext")).toBeUndefined();
  });

  it("starts the game from a valid setup", () => {
    const tree = render(valid, 2);
    expect(errors(tree)).toEqual([]);
    const start = button(tree, "imposterStart")!;
    expect(start.props.disabled).toBe(false);
    (start.props.onClick as () => void)();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("does not offer Start before the last step", () => {
    expect(button(render(valid, 0), "imposterStart")).toBeUndefined();
    expect(button(render(valid, 1), "imposterStart")).toBeUndefined();
  });
});

describe("ImposterSetupWizard quick start", () => {
  it("starts at once from the first step when a game was played before", () => {
    const quick = button(render(valid, 0, true), "imposterQuickStart")!;
    (quick.props.onClick as () => void)();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("is not offered to a first-time player, with an invalid setup, or after the first step", () => {
    expect(button(render(valid, 0, false), "imposterQuickStart")).toBeUndefined();
    expect(button(render({ ...valid, players: ["Ann"] }, 0, true), "imposterQuickStart")).toBeUndefined();
    expect(button(render(valid, 1, true), "imposterQuickStart")).toBeUndefined();
  });
});
