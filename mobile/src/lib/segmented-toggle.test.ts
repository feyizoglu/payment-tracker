import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@/components/ui/field", () => ({ Field: () => null }));

import { Pressable } from "react-native";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import type { SelectOption } from "@/components/ui/select-field";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();

function render(value: string, options: SelectOption[]): Node {
  return SegmentedToggle({ value, options, onChange }) as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

const segments = (tree: Node) => nodes(tree).filter((n) => n.type === Pressable);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SegmentedToggle", () => {
  it("marks every segment as a button and the chosen one as selected", () => {
    const [a, b] = segments(render("b", [{ value: "a", label: "A" }, { value: "b", label: "B" }]));
    expect(a.props.accessibilityRole).toBe("button");
    expect(a.props.accessibilityState).toEqual({ selected: false });
    expect(a.props.disabled).toBeFalsy();
    expect(b.props.accessibilityState).toEqual({ selected: true });
    (a.props.onPress as () => void)();
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("dims a disabled option and keeps it from being pressed", () => {
    const [, b] = segments(render("a", [{ value: "a", label: "A" }, { value: "b", label: "B", disabled: true }]));
    expect(b.props.disabled).toBe(true);
    expect(b.props.accessibilityState).toEqual({ disabled: true, selected: false });
    expect(String(b.props.className)).toContain("opacity-40");
  });

  it("still shows a disabled option as the chosen one when it is the value", () => {
    const [a, b] = segments(render("b", [{ value: "a", label: "A" }, { value: "b", label: "B", disabled: true }]));
    expect(b.props.accessibilityState).toEqual({ disabled: true, selected: true });
    expect(String(b.props.className)).toContain("bg-surface");
    expect(String(b.props.className)).toContain("opacity-40");
    expect(String(a.props.className)).not.toContain("opacity-40");
  });
});
