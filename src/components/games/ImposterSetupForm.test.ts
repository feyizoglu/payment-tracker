import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { DEFAULT_SETUP, MAX_PLAYERS, type ImposterSetup } from "@/lib/imposter";

vi.mock("lucide-react", () => ({ X: () => null }));
vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));

import ImposterSetupForm from "./ImposterSetupForm";

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

function checkboxes(tree: Node) {
  return nodes(tree).filter((n) => n.type === "input" && n.props.type === "checkbox");
}

function button(tree: Node, label: string) {
  return nodes(tree).find((n) => n.type === "button" && text(n).includes(label));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ImposterSetupForm voting toggle", () => {
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

describe("ImposterSetupForm start gate", () => {
  it("lists the errors and disables Start for an invalid setup", () => {
    const tree = render({ ...DEFAULT_SETUP, players: ["Ann"] });
    const errors = nodes(tree).filter((n) => n.type === "li").map(text);
    expect(errors).toEqual(["imposterErrTooFew"]);
    expect(button(tree, "imposterStart")?.props.disabled).toBe(true);
  });

  it("starts the game from a valid setup", () => {
    const tree = render(valid);
    expect(nodes(tree).some((n) => n.type === "li")).toBe(false);
    const start = button(tree, "imposterStart")!;
    expect(start.props.disabled).toBe(false);
    (start.props.onClick as () => void)();
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe("ImposterSetupForm players", () => {
  it("removes exactly the chosen player", () => {
    const remove = nodes(render(valid)).filter((n) => n.props["aria-label"] === "imposterRemovePlayer");
    (remove[1].props.onClick as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, players: ["Ann", "Cem"] });
  });

  it("disables Add at the player limit", () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i}`);
    expect(button(render({ ...valid, players: names(MAX_PLAYERS) }), "imposterAddPlayer")?.props.disabled).toBe(true);
    expect(button(render({ ...valid, players: names(MAX_PLAYERS - 1) }), "imposterAddPlayer")?.props.disabled).toBe(false);
  });
});
