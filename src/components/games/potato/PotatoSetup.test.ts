import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, type PotatoSetup } from "@/lib/hot-potato";

const lang = vi.hoisted(() => ({ value: "en" }));
const t = vi.hoisted(
  () =>
    new Proxy({} as Record<string, string>, {
      get: (_, key) => {
        if (key === "potatoFuseRange") return "{min}-{max}";
        if (key === "imposterStep") return "step {n}/{total}";
        return String(key);
      },
    })
);
vi.mock("@/lib/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n")>()),
  useLang: () => ({ t, lang: lang.value }),
}));
vi.mock("../SetupPlayersStep", () => ({ default: () => null }));

import SetupPlayersStep from "../SetupPlayersStep";
import PotatoRulesStep from "./PotatoRulesStep";
import PotatoSetupWizard from "./PotatoSetupWizard";

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
const three: PotatoSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };

const click = (node: Node | undefined) => (node!.props.onClick as () => void)();
const buttons = (tree: Node) => nodes(tree).filter((n) => n.type === "button");
const button = (tree: Node, label: string) => buttons(tree).find((n) => text(n) === label);
const startsWith = (tree: Node, label: string) => buttons(tree).find((n) => text(n).startsWith(label));
const group = (tree: Node, label: string) => nodes(tree).find((n) => n.props.role === "group" && n.props["aria-label"] === label)!;

beforeEach(() => {
  vi.clearAllMocks();
  lang.value = "en";
});

describe("PotatoRulesStep", () => {
  const render = (value: PotatoSetup) => PotatoRulesStep({ value, onChange }) as Node;

  it("sets the lives from 1 to 5, the current one pressed", () => {
    const lives = buttons(group(render(three), "potatoLives"));
    expect(lives.map(text)).toEqual(["1", "2", "3", "4", "5"]);
    expect(lives.map((b) => b.props["aria-pressed"])).toEqual([false, false, true, false, false]);
    click(lives[4]);
    expect(onChange).toHaveBeenCalledWith({ ...three, lives: 5 });
  });

  it("offers the three fuses with their ranges and never a time left", () => {
    const fuses = group(render(three), "potatoFuse");
    expect(buttons(fuses).map(text)).toEqual(["potatoFuseShort10-30", "potatoFuseNormal20-60", "potatoFuseLong40-90"]);
    expect(startsWith(fuses, "potatoFuseNormal")!.props["aria-pressed"]).toBe(true);
    click(startsWith(fuses, "potatoFuseLong"));
    expect(onChange).toHaveBeenCalledWith({ ...three, fuse: "long" });
  });

  it("chooses mixed, letter or ready-made tasks and explains each", () => {
    const tasks = group(render(three), "potatoTasks");
    expect(text(tasks)).toContain("potatoTasksLettersHint");
    expect(startsWith(tasks, "potatoTasksMixed")!.props["aria-pressed"]).toBe(true);
    click(startsWith(tasks, "potatoTasksPrompts"));
    expect(onChange).toHaveBeenCalledWith({ ...three, tasks: "prompts" });
  });
});

describe("PotatoSetupWizard", () => {
  const render = (value: PotatoSetup, step: number, quickStart = false) =>
    PotatoSetupWizard({ value, onChange, step, onStep, onStart, quickStart }) as Node;
  const has = (tree: Node, type: unknown) => nodes(tree).some((n) => n.type === type);
  const errors = (tree: Node) => nodes(tree).filter((n) => n.type === "li").map(text);

  it("shows the players step, then the rules step, with progress dots", () => {
    const first = render(three, 0);
    expect([has(first, SetupPlayersStep), has(first, PotatoRulesStep)]).toEqual([true, false]);
    expect(nodes(first).find((n) => n.type === SetupPlayersStep)!.props).toEqual({ value: three, onChange });
    expect(nodes(first).find((n) => n.props.role === "img")!.props["aria-label"]).toBe("step 1/2");
    const second = render(three, 1);
    expect([has(second, SetupPlayersStep), has(second, PotatoRulesStep)]).toEqual([false, true]);
    expect(nodes(second).find((n) => n.props.role === "img")!.props["aria-label"]).toBe("step 2/2");
  });

  it("moves with Next and Back", () => {
    click(button(render(three, 0), "imposterNext"));
    expect(onStep).toHaveBeenCalledWith(1);
    expect(button(render(three, 0), "back")).toBeUndefined();
    click(button(render(three, 1), "back"));
    expect(onStep).toHaveBeenCalledWith(0);
  });

  it("lists the players step's errors and stops there", () => {
    const tree = render({ ...three, players: ["Ann", "Bob"] }, 0);
    expect(errors(tree)).toEqual(["imposterErrTooFew"]);
    expect(button(tree, "imposterNext")!.props.disabled).toBe(true);
  });

  it("compares names with the app language's rules", () => {
    const names = { ...three, players: ["Işık", "ışık", "Can"] };
    expect(errors(render(names, 0))).toEqual([]);
    lang.value = "tr";
    expect(errors(render(names, 0))).toEqual(["imposterErrDuplicate"]);
  });

  it("starts from the last step only when the whole setup is valid", () => {
    expect(button(render(three, 0), "imposterStart")).toBeUndefined();
    const bad = render({ ...three, players: ["Ann"] }, 1);
    expect(button(bad, "imposterStart")!.props.disabled).toBe(true);
    expect(errors(bad)).toEqual(["imposterErrTooFew"]);
    click(button(render(three, 1), "imposterStart"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("offers Start with last settings on the first step after a game", () => {
    click(button(render(three, 0, true), "imposterQuickStart"));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(button(render(three, 0, false), "imposterQuickStart")).toBeUndefined();
    expect(button(render(three, 1, true), "imposterQuickStart")).toBeUndefined();
    expect(button(render({ ...three, players: ["Ann"] }, 0, true), "imposterQuickStart")).toBeUndefined();
  });
});
