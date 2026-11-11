import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, MAX_PLAYERS, type ImposterSetup } from "@ptracker/shared/imposter";

vi.mock("react-native", () => ({
  Pressable: () => null,
  Switch: () => null,
  Text: () => null,
  TextInput: () => null,
  View: () => null,
}));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));
vi.mock("@/components/ui/field", () => ({ Field: () => null, inputBoxClass: "" }));
vi.mock("@/components/ui/primary-button", () => ({ PrimaryButton: () => null }));
vi.mock("@/components/ui/segmented-toggle", () => ({ SegmentedToggle: () => null }));
vi.mock("@/components/ui/select-field", () => ({ SelectField: () => null }));

import { Pressable, Switch } from "react-native";
import { ImposterSetupForm } from "@/components/games/imposter-setup";
import { PrimaryButton } from "@/components/ui/primary-button";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const onStart = vi.fn();
const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"] };

function render(value: ImposterSetup): Node {
  return ImposterSetupForm({ value, onChange, onStart }) as Node;
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

function startButton(tree: Node) {
  return nodes(tree).find((n) => n.type === PrimaryButton)!;
}

function addButton(tree: Node) {
  return nodes(tree).find((n) => n.type === Pressable && text(n).includes("imposterAddPlayer"))!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ImposterSetupForm voting switch", () => {
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

describe("ImposterSetupForm start gate", () => {
  it("lists the errors and disables Start for an invalid setup", () => {
    const tree = render({ ...DEFAULT_SETUP, players: ["Ann"] });
    expect(text(tree)).toContain("imposterErrTooFew");
    expect(startButton(tree).props.disabled).toBe(true);
  });

  it("starts the game from a valid setup", () => {
    const tree = render(valid);
    expect(text(tree)).not.toContain("imposterErr");
    expect(startButton(tree).props.disabled).toBe(false);
    expect(startButton(tree).props.onPress).toBe(onStart);
  });
});

describe("ImposterSetupForm players", () => {
  it("removes exactly the chosen player", () => {
    const remove = nodes(render(valid)).filter((n) => n.type === Pressable && text(n) === "✕");
    (remove[1].props.onPress as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, players: ["Ann", "Cem"] });
  });

  it("disables Add at the player limit", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i}`);
    expect(addButton(render({ ...valid, players: names(MAX_PLAYERS) })).props.disabled).toBe(true);
    expect(addButton(render({ ...valid, players: names(MAX_PLAYERS - 1) })).props.disabled).toBe(false);
  });
});
