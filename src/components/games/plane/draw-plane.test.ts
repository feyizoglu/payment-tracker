import { describe, it, expect } from "vitest";
import { newPlaneGame, planeTap, planeX, PLANE_COLORS, PLANE_PENCILS } from "@/lib/paper-plane";
import { drawPlaneScene, planeViewport } from "./draw-plane";

function recorder() {
  const calls: { name: string; args: unknown[]; fill?: unknown }[] = [];
  const ctx: Record<string, unknown> = { fillStyle: "", strokeStyle: "", lineWidth: 1 };
  const record = (name: string) => (...args: unknown[]) => calls.push({ name, args, fill: ctx.fillStyle });
  for (const name of ["save", "restore", "translate", "rotate", "scale", "beginPath", "moveTo", "lineTo", "closePath", "fill", "stroke", "fillRect", "strokeRect", "clearRect", "setTransform"]) {
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
});
