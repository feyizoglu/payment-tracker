import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import {
  CATEGORY_CHOICES,
  CATEGORY_EMOJI,
  CATEGORY_LABEL_KEYS,
  DEFAULT_SETUP,
  playerColor,
  type ImposterSetup,
} from "@ptracker/shared/imposter";

vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
vi.mock("@ptracker/shared/i18n", () => ({
  useLang: () => ({ t: new Proxy({}, { get: (_, key) => String(key) }) }),
}));

import { Pressable } from "react-native";
import { SetupCategoryStep } from "@/components/games/setup-category-step";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onChange = vi.fn();
const valid: ImposterSetup = { ...DEFAULT_SETUP, players: ["Ann", "Bob", "Cem"], category: "food" };

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

function tiles(value: ImposterSetup): Node[] {
  return nodes(SetupCategoryStep({ value, onChange })).filter((n) => n.type === Pressable);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SetupCategoryStep", () => {
  it("shows one tile per category with its emoji and name", () => {
    const all = tiles(valid);
    expect(all).toHaveLength(CATEGORY_CHOICES.length);
    CATEGORY_CHOICES.forEach((c, i) => {
      expect(text(all[i])).toBe(`${CATEGORY_EMOJI[c]}${CATEGORY_LABEL_KEYS[c]}`);
      expect(all[i].props.style).toEqual({ backgroundColor: playerColor(i) });
    });
  });

  it("marks only the chosen category as selected", () => {
    const selected = tiles(valid).map((n) => (n.props.accessibilityState as { selected: boolean }).selected);
    expect(selected).toEqual(CATEGORY_CHOICES.map((c) => c === "food"));
  });

  it("outlines the selected tile in white and dims the others", () => {
    const classes = tiles(valid).map((n) => String(n.props.className));
    CATEGORY_CHOICES.forEach((c, i) => {
      if (c === "food") {
        expect(classes[i]).toContain("border-white");
        expect(classes[i]).not.toContain("opacity-60");
      } else {
        expect(classes[i]).toContain("opacity-60");
        expect(classes[i]).toContain("border-transparent");
      }
    });
  });

  it("picks the category of the tile that was pressed", () => {
    const animals = CATEGORY_CHOICES.indexOf("animals");
    (tiles(valid)[animals].props.onPress as () => void)();
    expect(onChange).toHaveBeenCalledWith({ ...valid, category: "animals" });
  });
});
