import { describe, it, expect } from "vitest";
import { TOWER_COLORS, TOWER_WIDTH, newTowerGame, towerBookColour, towerTap } from "@/lib/book-tower";
import { MIN_STRIPED, drawTowerScene, towerViewport } from "./draw-tower";

function recorder() {
  const calls: { name: string; args: unknown[]; fill?: unknown }[] = [];
  const ctx: Record<string, unknown> = { fillStyle: "", strokeStyle: "", lineWidth: 1 };
  const record = (name: string) => (...args: unknown[]) => calls.push({ name, args, fill: ctx.fillStyle });
  for (const name of ["save", "restore", "translate", "rotate", "scale", "beginPath", "moveTo", "lineTo", "closePath", "fill", "stroke", "fillRect", "strokeRect", "clearRect", "setTransform", "rect", "clip"]) {
    ctx[name] = record(name);
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("towerViewport", () => {
  it("fits the world's width, or its height on a wide screen, and puts the desk at the bottom", () => {
    expect(towerViewport(400, 500)).toEqual({ scale: 4, left: 0, desk: 500 - 12 * 4 });
    expect(towerViewport(1000, 550)).toEqual({ scale: 5, left: 250, desk: 550 - 60 });
  });
});

describe("drawTowerScene", () => {
  it("paints the wall first, then the desk book in its colour", () => {
    const { ctx, calls } = recorder();
    drawTowerScene(ctx, newTowerGame(), 400, 500, true);
    expect(calls[0]).toMatchObject({ name: "fillRect", fill: TOWER_COLORS.dark.wall });
    expect(calls.some((c) => c.name === "fillRect" && c.fill === towerBookColour(0))).toBe(true);
    expect(calls.some((c) => c.name === "fillRect" && c.fill === towerBookColour(1))).toBe(false);
  });

  it("draws the sliding book while playing, in the next book's colour", () => {
    const { ctx, calls } = recorder();
    drawTowerScene(ctx, towerTap(newTowerGame()), 400, 500, false);
    expect(calls.some((c) => c.name === "fillRect" && c.fill === towerBookColour(1))).toBe(true);
  });

  it("clips the drawing to the world, so nothing shows in the side margins", () => {
    const { ctx, calls } = recorder();
    drawTowerScene(ctx, newTowerGame(), 1000, 550, false);
    const rect = calls.find((c) => c.name === "rect");
    expect(rect?.args[0]).toBe(0);
    expect(rect?.args[2]).toBe(TOWER_WIDTH);
    expect(calls.findIndex((c) => c.name === "clip")).toBeGreaterThan(calls.indexOf(rect!));
  });

  it("moves the world down by the camera, in pixels", () => {
    const { ctx, calls } = recorder();
    drawTowerScene(ctx, { ...newTowerGame(), camera: 21 }, 400, 500, false);
    expect(calls.find((c) => c.name === "translate")?.args).toEqual([0, 452 + 21 * 4]);
  });

  it("draws a falling piece turned by its angle", () => {
    const { ctx, calls } = recorder();
    const s = { ...newTowerGame(), pieces: [{ x: 10, w: 8, y: 7, vy: 0, angle: 30, spin: 90, index: 1 }] };
    drawTowerScene(ctx, s, 400, 500, false);
    expect(calls.find((c) => c.name === "rotate")?.args[0]).toBeCloseTo(Math.PI / 6);
  });

  it("draws the bottom books still on screen while the camera eases up", () => {
    const { ctx, calls } = recorder();
    const s = { ...newTowerGame(), stack: Array.from({ length: 9 }, (_, i) => ({ x: 25, w: 50, index: i === 0 ? 0 : 1 })), camera: 15.27 };
    drawTowerScene(ctx, s, 400, 500, false);
    expect(calls.some((c) => c.name === "fillRect" && c.fill === towerBookColour(0))).toBe(true);
  });

  it("leaves the spine stripes off a book too narrow for them", () => {
    const stripes = (w: number) => {
      const { ctx, calls } = recorder();
      drawTowerScene(ctx, { ...newTowerGame(), stack: [{ x: 40, w, index: 0 }] }, 400, 500, false);
      return calls.filter((c) => c.name === "fillRect" && c.fill === TOWER_COLORS.light.stripe).length;
    };
    expect(stripes(3)).toBe(0);
    expect(stripes(MIN_STRIPED)).toBe(2);
  });
});
