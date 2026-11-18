import { describe, it, expect } from "vitest";
import { newPlaneGame, planePencilColour, planeTap, planeX, PLANE_COLORS, PLANE_PENCILS, PLANE_RULER, PLANE_WORLD_HEIGHT } from "@/lib/paper-plane";
import { drawPlaneScene, planeViewport } from "./draw-plane";

function recorder() {
  const calls: { name: string; args: unknown[]; fill?: unknown }[] = [];
  const ctx: Record<string, unknown> = { fillStyle: "", strokeStyle: "", lineWidth: 1 };
  const record = (name: string) => (...args: unknown[]) => calls.push({ name, args, fill: ctx.fillStyle });
  for (const name of ["save", "restore", "translate", "rotate", "scale", "beginPath", "moveTo", "lineTo", "closePath", "fill", "stroke", "fillRect", "strokeRect", "clearRect", "setTransform", "rect", "clip"]) {
    ctx[name] = record(name);
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("planeViewport", () => {
  it("fits the world's height and centres its width", () => {
    expect(planeViewport(56, 400, 500)).toEqual({ scale: 5, left: (400 - 280) / 2 });
  });
});

describe("drawPlaneScene", () => {
  it("paints the page in the theme's paper colour, then the obstacles and the plane", () => {
    const s = planeTap(newPlaneGame(56), () => 0.5);
    const near = { ...s, obstacles: [{ ...s.obstacles[0], x: 30 }] };
    const { ctx, calls } = recorder();
    drawPlaneScene(ctx, near, 400, 500, true);
    expect(calls[0]).toMatchObject({ name: "fillRect", fill: PLANE_COLORS.dark.paper });
    // The paper, then a pencil body from the top and one from the bottom.
    expect(calls.filter((c) => c.name === "fillRect")).toHaveLength(3);
    const at = calls.filter((c) => c.name === "translate")[1];
    expect(calls.filter((c) => c.name === "fillRect").slice(1).every((c) => (PLANE_PENCILS as readonly unknown[]).includes(c.fill))).toBe(true);
    expect(at?.args[0]).toBeCloseTo(planeViewport(56, 400, 500).left + planeX(56) * 5);
  });

  it("draws a ruler obstacle as two ruler bodies without a pencil tip", () => {
    const s = planeTap(newPlaneGame(56), () => 0.5);
    const near = { ...s, obstacles: [{ ...s.obstacles[0], x: 30, kind: 1 }] };
    const { ctx, calls } = recorder();
    drawPlaneScene(ctx, near, 400, 500, false);
    const bodies = calls.filter((c) => c.name === "fillRect").slice(1);
    expect(bodies).toHaveLength(2);
    expect(bodies.every((c) => c.fill === PLANE_RULER)).toBe(true);
    expect(calls.some((c) => c.fill === "#f3d9b1")).toBe(false);
  });

  it("colours a pencil by the obstacle, not by its place in the list", () => {
    const s = planeTap(newPlaneGame(56), () => 0.5);
    const pencil = { ...s.obstacles[0], x: 30, kind: 0, index: 4 };
    const ruler = { ...s.obstacles[0], x: -5, kind: 1, index: 3 };
    const bodies = (obstacles: (typeof pencil)[]) => {
      const { ctx, calls } = recorder();
      drawPlaneScene(ctx, { ...s, obstacles }, 400, 500, false);
      return calls.filter((c) => c.name === "fillRect" && c.fill !== PLANE_RULER).slice(1).map((c) => c.fill);
    };
    const expected = [planePencilColour(pencil, true), planePencilColour(pencil, false)];
    expect(bodies([ruler, pencil])).toEqual(expected);
    expect(bodies([pencil])).toEqual(expected);
  });

  it("clips the obstacles to the world, so none show in the side margins", () => {
    const s = planeTap(newPlaneGame(56), () => 0.5);
    const { ctx, calls } = recorder();
    drawPlaneScene(ctx, s, 900, 500, false);
    const rect = calls.find((c) => c.name === "rect");
    expect(rect?.args).toEqual([0, 0, 56, PLANE_WORLD_HEIGHT]);
    expect(calls.findIndex((c) => c.name === "clip")).toBeGreaterThan(calls.indexOf(rect!));
  });
});
