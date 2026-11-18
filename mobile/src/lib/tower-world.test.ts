import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

const animated = vi.hoisted(() => ({ View: () => null }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useMemo: (fn: () => unknown) => fn() };
});
vi.mock("react-native", () => ({ View: () => null }));
vi.mock("react-native-reanimated", () => ({
  default: { View: animated.View },
  useSharedValue: (value: unknown) => ({ value }),
  useAnimatedStyle: (fn: () => unknown) => fn(),
}));

import { View } from "react-native";
import { BOOK_H, TOWER_COLORS, newTowerGame, towerBookColour, type TowerBook, type TowerState } from "@ptracker/shared/book-tower";
import { TowerWorld, useTowerView } from "@/components/games/tower/tower-world";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;
type Style = Record<string, unknown>;

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

const books = (n: number): TowerBook[] => Array.from({ length: n }, (_, i) => ({ x: 25, w: 50, index: i }));

function world(stack: TowerBook[], sliding: boolean, view = useTowerView()) {
  return nodes(TowerWorld({ view, stack, sliding, width: 400, height: 800, dark: true }));
}

const styleOf = (n: Node): Style => {
  const s = n.props.style;
  return (Array.isArray(s) ? Object.assign({}, ...s) : s) as Style;
};

describe("useTowerView", () => {
  it("copies the slider, the camera and the last three pieces, and parks empty slots", () => {
    const view = useTowerView();
    const s: TowerState = {
      ...newTowerGame(),
      slider: { x: 40, dir: 1 },
      camera: 14,
      pieces: [1, 2, 3, 4].map((i) => ({ x: i, w: 5, y: 7 * i, vy: 0, angle: 10 * i, spin: 90, index: i })),
    };
    view.sync(s);
    expect(view.slider.value).toBe(40);
    expect(view.camera.value).toBe(14);
    expect(view.pieces.value).toEqual([
      [2, 5, 14, 20],
      [3, 5, 21, 30],
      [4, 5, 28, 40],
    ]);
    expect(view.colours.value).toEqual([towerBookColour(2), towerBookColour(3), towerBookColour(4)]);
    view.sync(newTowerGame());
    expect(view.pieces.value.every((p) => p[2] === -1000)).toBe(true);
  });
});

describe("TowerWorld", () => {
  it("paints the wall in the theme's colour", () => {
    const root = world(books(1), false)[0];
    expect(root.type).toBe(View);
    expect((root.props.style as Style).backgroundColor).toBe(TOWER_COLORS.dark.wall);
  });

  it("draws one book per book in the stack, and only the last forty", () => {
    const count = (stack: TowerBook[]) => world(stack, false).filter((n) => typeof n.type === "function" && "book" in n.props).length;
    expect(count(books(3))).toBe(3);
    expect(count(books(55))).toBe(40);
  });

  it("shows the slider only while a book slides, in the next book's colour", () => {
    const slider = (sliding: boolean) =>
      world(books(2), sliding).find((n) => n.type === animated.View && styleOf(n).backgroundColor === towerBookColour(2));
    expect(slider(false)).toBeUndefined();
    const shown = slider(true)!;
    expect(styleOf(shown).bottom).toBe(2 * BOOK_H * 4);
    expect(styleOf(shown).width).toBe(50 * 4);
  });

  it("moves the world down by the camera", () => {
    const view = useTowerView();
    view.camera.value = 21;
    const moved = world(books(2), false, view).find(
      (n) => n.type === animated.View && Array.isArray((styleOf(n).transform as unknown[]) ?? null)
    )!;
    expect(styleOf(moved).transform).toEqual([{ translateY: 21 * 4 }]);
  });
});
