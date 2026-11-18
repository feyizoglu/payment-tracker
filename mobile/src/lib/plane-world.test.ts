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
import {
  PLANE_COLORS,
  PLANE_MAX_FALL,
  PLANE_RULER,
  newPlaneGame,
  planePencilColour,
  planeTap,
  planeX,
  type PlaneState,
} from "@ptracker/shared/paper-plane";
import { PlaneWorld, usePlaneView } from "@/components/games/plane/plane-world";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;
type Style = Record<string, unknown>;

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function flying(): PlaneState {
  const s = planeTap(newPlaneGame(56), () => 0.5);
  const o = s.obstacles[0];
  return {
    ...s,
    y: 42,
    vy: PLANE_MAX_FALL,
    distance: 250,
    obstacles: [
      { ...o, x: 12, gap: 26, gapY: 44, kind: 0, index: 4 },
      { ...o, x: 50, gap: 28, gapY: 61, kind: 1, index: 5 },
    ],
  };
}

function world(view = usePlaneView()) {
  return nodes(PlaneWorld({ view, width: 400, height: 500, worldWidth: 56, dark: true }));
}

function piece(view: ReturnType<typeof usePlaneView>) {
  const all = world(view);
  const first = all.find((n) => typeof n.type === "function" && n.props.slot === 0 && n.props.top === true)!;
  const parts = nodes((first.type as (p: Props) => unknown)(first.props));
  const [body, tip] = parts.filter((n) => n.type === animated.View);
  return { body: (body.props.style as Style[])[1], tip: (tip.props.style as Style[])[1] };
}

describe("usePlaneView", () => {
  it("copies the state into the shared values and parks the unused slots", () => {
    const view = usePlaneView();
    view.sync(flying());
    expect(view.y.value).toBe(42);
    expect(view.angle.value).toBe(60);
    expect(view.distance.value).toBe(250);
    expect(view.xs.value).toEqual([12, 50, -1000, -1000]);
    expect(view.gaps.value).toEqual([26, 28, 30, 30]);
    expect(view.centres.value).toEqual([44, 61, 50, 50]);
    expect(view.kinds.value).toEqual([0, 1, 0, 0]);
  });

  it("keeps each obstacle's pencil colours when the one before it leaves", () => {
    const view = usePlaneView();
    const s = flying();
    view.sync(s);
    const first = planePencilColour(s.obstacles[0], true);
    expect(view.colours.value.slice(0, 2)).toEqual([first, planePencilColour(s.obstacles[0], false)]);
    const next = { ...s.obstacles[0], x: 88, index: 6 };
    view.sync({ ...s, obstacles: [s.obstacles[1], next] });
    expect(view.colours.value.slice(2, 4)).toEqual([planePencilColour(next, true), planePencilColour(next, false)]);
    view.sync({ ...s, obstacles: [next] });
    expect(view.colours.value.slice(0, 2)).toEqual([planePencilColour(next, true), planePencilColour(next, false)]);
  });
});

describe("PlaneWorld", () => {
  it("paints the page in the dark paper colour", () => {
    const root = world()[0];
    expect(root.type).toBe(View);
    expect((root.props.style as Style).backgroundColor).toBe(PLANE_COLORS.dark.paper);
  });

  it("centres the world at the page's scale", () => {
    const inner = world().find((n) => n.type === View && (n.props.style as Style).top === 0 && (n.props.style as Style).height === 500)!;
    expect((inner.props.style as Style).left).toBe((400 - 56 * 5) / 2);
    expect((inner.props.style as Style).width).toBe(280);
  });

  it("places the plane at its column", () => {
    const plane = world().find((n) => n.type === animated.View && (n.props.style as Style[])[0].height === 30)!;
    expect((plane.props.style as Style[])[0].left).toBe((planeX(56) - 5) * 5);
  });

  it("outlines the plane in ink behind its paper-white body", () => {
    const triangles = world().filter((n) => n.type === View && (n.props.style as Style).borderLeftWidth !== undefined);
    expect(triangles.map((n) => (n.props.style as Style).borderLeftColor)).toEqual([PLANE_COLORS.dark.ink, PLANE_COLORS.dark.plane]);
    const [outline, body] = triangles.map((n) => n.props.style as Style);
    expect(outline.borderLeftWidth as number).toBeGreaterThan(body.borderLeftWidth as number);
    expect(outline.borderTopWidth as number).toBeGreaterThan(body.borderTopWidth as number);
  });

  it("scrolls the margin line with the distance flown", () => {
    const view = usePlaneView();
    view.sync(flying());
    const margin = world(view).find((n) => n.type === animated.View && (n.props.style as Style[])[0].width === 2)!;
    expect((margin.props.style as Style[])[1].left).toBe((120 - (250 % 120) - 10) * 5);
  });
});

describe("Piece", () => {
  it("draws a ruler to the gap's edge without a tip", () => {
    const view = usePlaneView();
    view.centres.value = [50, 50, 50, 50];
    view.gaps.value = [30, 30, 30, 30];
    view.kinds.value = [1, 0, 0, 0];
    const { body, tip } = piece(view);
    expect(body.backgroundColor).toBe(PLANE_RULER);
    expect(body.top).toBe(0);
    expect(body.height).toBe(35 * 5);
    expect(tip.opacity).toBe(0);
  });

  it("draws a pencil body that stops a tip short of the edge, and shows the tip", () => {
    const view = usePlaneView();
    view.centres.value = [50, 50, 50, 50];
    view.gaps.value = [30, 30, 30, 30];
    view.kinds.value = [0, 0, 0, 0];
    view.colours.value = ["#a", "#b", "#c", "#d", "#e", "#f", "#g", "#h"];
    const { body, tip } = piece(view);
    expect(body.backgroundColor).toBe("#a");
    expect(body.height).toBe((35 - 5) * 5);
    expect(tip.opacity).toBe(1);
  });
});
