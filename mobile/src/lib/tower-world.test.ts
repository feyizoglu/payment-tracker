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

  it("draws the slider where the drop lands", () => {
    const view = useTowerView();
    view.slider.value = 40;
    const shown = world(books(2), true, view).find(
      (n) => n.type === animated.View && styleOf(n).backgroundColor === towerBookColour(2)
    )!;
    expect(styleOf(shown).left).toBe((40 - 25) * 4);
  });

  it("draws a falling piece at its place, in its colour, turned by its angle", () => {
    const view = useTowerView();
    view.sync({ ...newTowerGame(), pieces: [{ x: 10, w: 8, y: 14, vy: 0, angle: 30, spin: 90, index: 1 }] });
    const slot = world(books(2), false, view).find((n) => typeof n.type === "function" && n.props.slot === 0)!;
    const piece = (slot.type as (p: Props) => Node)(slot.props);
    expect(styleOf(piece)).toMatchObject({
      left: 40,
      width: 32,
      bottom: 56,
      height: BOOK_H * 4,
      backgroundColor: towerBookColour(1),
      transform: [{ rotate: "30deg" }],
    });
  });

  it("draws a book at its level, in its colour, with a stripe near each end", () => {
    const shown = world(books(3), false).find((n) => typeof n.type === "function" && n.props.level === 2)!;
    const book = (shown.type as (p: Props) => Node)(shown.props);
    expect(book.props.style).toMatchObject({ left: 100, bottom: 2 * BOOK_H * 4, width: 200, height: 28, backgroundColor: towerBookColour(2) });
    const [leftStripe, rightStripe] = (book.props.children as Node).props.children as Node[];
    expect((leftStripe.props.style as Style).left).toBe(12);
    expect((rightStripe.props.style as Style).right).toBe(12);
  });

  it("leaves the spine stripes off a book too narrow for them", () => {
    const narrow = [...books(1), { x: 40, w: 3, index: 1 }];
    const shown = world(narrow, false).find((n) => typeof n.type === "function" && n.props.level === 1)!;
    const book = (shown.type as (p: Props) => Node)(shown.props);
    expect(book.props.children).toBeNull();
  });

  it("keeps the shown books at their own levels once the stack passes forty", () => {
    const levels = world(books(55), false)
      .filter((n) => typeof n.type === "function" && "book" in n.props)
      .map((n) => n.props.level);
    expect(levels[0]).toBe(15);
    expect(levels[levels.length - 1]).toBe(54);
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
