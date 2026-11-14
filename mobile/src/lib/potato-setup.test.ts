import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, type PotatoSetup } from "@ptracker/shared/hot-potato";

const i18n = vi.hoisted(() => ({ lang: "en" }));

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ptracker/shared/i18n")>()),
  useLang: () => ({
    t: new Proxy({} as Record<string, string>, {
      get: (_, key) => {
        if (key === "potatoFuseRange") return "{min}-{max}";
        if (key === "imposterStep") return "step {n}/{total}";
        return String(key);
      },
    }),
    lang: i18n.lang,
  }),
}));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/ui/field", () => ({ Field: () => null }));
vi.mock("@/components/ui/segmented-toggle", () => ({ SegmentedToggle: () => null }));
vi.mock("@/components/games/setup-players-step", () => ({ SetupPlayersStep: () => null }));

import { Pressable } from "react-native";
import { Field } from "@/components/ui/field";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { SetupPlayersStep } from "@/components/games/setup-players-step";
import { PotatoRulesStep } from "@/components/games/potato/potato-rules-step";
import { PotatoSetupWizard } from "@/components/games/potato/potato-setup";

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

const press = (node: Node | undefined) => (node!.props.onPress as () => void)();
const pressable = (tree: Node, label: string) =>
  nodes(tree).find((n) => n.type === Pressable && text(n).startsWith(label));
const field = (tree: Node, label: string) => nodes(tree).find((n) => n.type === Field && n.props.label === label)!;

beforeEach(() => {
  vi.clearAllMocks();
  i18n.lang = "en";
});

describe("PotatoRulesStep (mobile)", () => {
  const render = (value: PotatoSetup) => PotatoRulesStep({ value, onChange }) as Node;

  it("sets the lives from 1 to 5", () => {
    const toggle = nodes(render(three)).find((n) => n.type === SegmentedToggle)!;
    expect(toggle.props.label).toBe("potatoLives");
    expect(toggle.props.value).toBe("3");
    expect((toggle.props.options as { value: string }[]).map((o) => o.value)).toEqual(["1", "2", "3", "4", "5"]);
    (toggle.props.onChange as (v: string) => void)("5");
    expect(onChange).toHaveBeenCalledWith({ ...three, lives: 5 });
  });

  it("offers the three fuses with their ranges", () => {
    const fuses = field(render(three), "potatoFuse");
    expect(nodes(fuses).filter((n) => n.type === Pressable).map(text)).toEqual([
      "potatoFuseShort10-30",
      "potatoFuseNormal20-60",
      "potatoFuseLong40-90",
    ]);
    expect(pressable(fuses, "potatoFuseNormal")!.props.accessibilityState).toEqual({ selected: true });
    press(pressable(fuses, "potatoFuseShort"));
    expect(onChange).toHaveBeenCalledWith({ ...three, fuse: "short" });
  });

  it("chooses mixed, letter or ready-made tasks and explains each", () => {
    const tasks = field(render(three), "potatoTasks");
    expect(text(tasks)).toContain("potatoTasksPromptsHint");
    expect(pressable(tasks, "potatoTasksMixed")!.props.accessibilityState).toEqual({ selected: true });
    press(pressable(tasks, "potatoTasksLetters"));
    expect(onChange).toHaveBeenCalledWith({ ...three, tasks: "letters" });
  });
});

describe("PotatoSetupWizard (mobile)", () => {
  const render = (value: PotatoSetup, step: number, quickStart = false) =>
    PotatoSetupWizard({ value, onChange, step, onStep, onStart, quickStart }) as Node;
  const has = (tree: Node, type: unknown) => nodes(tree).some((n) => n.type === type);
  const primary = (tree: Node) => nodes(tree).find((n) => n.type === PrimaryButton)!;

  it("shows the players step, then the rules step, with progress dots", () => {
    const first = render(three, 0);
    expect([has(first, SetupPlayersStep), has(first, PotatoRulesStep)]).toEqual([true, false]);
    expect(nodes(first).find((n) => n.props.accessibilityLabel === "step 1/2")).toBeDefined();
    const second = render(three, 1);
    expect([has(second, SetupPlayersStep), has(second, PotatoRulesStep)]).toEqual([false, true]);
  });

  it("moves with Next and Back, and stops on the step's own errors", () => {
    press(primary(render(three, 0)));
    expect(onStep).toHaveBeenCalledWith(1);
    press(pressable(render(three, 1), "back"));
    expect(onStep).toHaveBeenCalledWith(0);
    const short = render({ ...three, players: ["Ann"] }, 0);
    expect(primary(short).props.disabled).toBe(true);
    expect(text(short)).toContain("imposterErrTooFew");
  });

  it("compares names with the case rules of the app language", () => {
    const names = { ...three, players: ["Işık", "ışık", "Can"] };
    expect(text(render(names, 0))).not.toContain("imposterErrDuplicate");
    i18n.lang = "tr";
    expect(text(render(names, 0))).toContain("imposterErrDuplicate");
  });

  it("starts from the last step only when the whole setup is valid", () => {
    expect(primary(render(three, 1)).props.label).toBe("imposterStart");
    expect(primary(render({ ...three, players: ["Ann"] }, 1)).props.disabled).toBe(true);
    press(primary(render(three, 1)));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("offers Start with last settings on the first step after a game", () => {
    press(pressable(render(three, 0, true), "imposterQuickStart"));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(pressable(render(three, 0, false), "imposterQuickStart")).toBeUndefined();
    expect(pressable(render({ ...three, players: ["Ann"] }, 0, true), "imposterQuickStart")).toBeUndefined();
  });
});
