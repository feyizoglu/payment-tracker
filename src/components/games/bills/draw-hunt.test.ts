import { describe, it, expect } from "vitest";
import { HUNT_COLORS, HUNT_H, COIN_R, huntAimEnd, huntBillShade, type HuntItem, type HuntState } from "@/lib/bill-hunt";
import { drawHuntScene } from "./draw-hunt";

function recorder() {
  const calls: { name: string; args: unknown[]; fill: unknown; stroke: unknown }[] = [];
  const state: Record<string | symbol, unknown> = { fillStyle: "", strokeStyle: "" };
  const ctx = new Proxy(state, {
    get: (t, k) => (k in t ? t[k] : (...args: unknown[]) => calls.push({ name: String(k), args, fill: t.fillStyle, stroke: t.strokeStyle })),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const item = (over: Partial<HuntItem>): HuntItem => ({ id: 1, kind: "bill", col: 0, row: 0, value: 3, double: false, used: false, ...over });
const state = (over: Partial<HuntState>): HuntState => ({
  phase: "aiming", month: 5, score: 4, coins: 3, launcher: 35, items: [], nextId: 10, shot: null, version: 0, ...over,
});
const texts = (calls: ReturnType<typeof recorder>["calls"]) => calls.filter((c) => c.name === "fillText").map((c) => c.args[0]);

describe("drawHuntScene", () => {
  it("paints the page colour first, in the theme's palette", () => {
    const light = recorder();
    drawHuntScene(light.ctx, state({}), 300, 600, false, null);
    expect(light.calls[0]).toMatchObject({ name: "fillRect", fill: HUNT_COLORS.light.bg });
    const dark = recorder();
    drawHuntScene(dark.ctx, state({}), 300, 600, true, null);
    expect(dark.calls[0]).toMatchObject({ name: "fillRect", fill: HUNT_COLORS.dark.bg });
  });

  it("draws each bill in its shade with its amount, and edges a double bill", () => {
    const { ctx, calls } = recorder();
    drawHuntScene(ctx, state({ items: [item({ value: 3 }), item({ id: 2, col: 2, value: 10, double: true })] }), 300, 600, false, null);
    expect(texts(calls)).toEqual(expect.arrayContaining(["3", "10"]));
    expect(calls.some((c) => c.name === "fillRect" && c.fill === huntBillShade(3, 5))).toBe(true);
    expect(calls.filter((c) => c.name === "strokeRect")).toHaveLength(1);
    expect(calls.find((c) => c.name === "strokeRect")!.stroke).toBe(HUNT_COLORS.light.doubleEdge);
  });

  it("marks the other items with their symbols, a used one in the paler colour", () => {
    const { ctx, calls } = recorder();
    const items = [item({ kind: "plus", value: 0 }), item({ id: 2, kind: "rowCut", col: 1, value: 0, used: true }), item({ id: 3, kind: "campaign", col: 2, value: 0 })];
    drawHuntScene(ctx, state({ items }), 300, 600, false, null);
    expect(texts(calls)).toEqual(["+1", "↔", "💥"]);
    expect(calls.some((c) => c.name === "fill" && c.fill === HUNT_COLORS.light.powerUsed)).toBe(true);
    expect(calls.some((c) => c.name === "fill" && c.fill === HUNT_COLORS.light.power)).toBe(true);
  });

  it("draws the aim line from the launcher to where the coin first bounces, only while aiming", () => {
    const s = state({});
    const { ctx, calls } = recorder();
    drawHuntScene(ctx, s, 300, 600, false, Math.PI / 3);
    const end = huntAimEnd(s, Math.PI / 3);
    expect(calls.some((c) => c.name === "setLineDash")).toBe(true);
    expect(calls.find((c) => c.name === "moveTo")!.args).toEqual([35, HUNT_H - COIN_R]);
    expect(calls.find((c) => c.name === "lineTo")!.args).toEqual([end.x, end.y]);
    const none = recorder();
    drawHuntScene(none.ctx, s, 300, 600, false, null);
    expect(none.calls.some((c) => c.name === "setLineDash")).toBe(false);
  });

  it("draws every coin of the throw and no waiting coin at the launcher", () => {
    const coins = [0, 1, 2].map((i) => ({ x: 10 + i, y: 20, vx: 0, vy: 0, down: false, cell: -1 }));
    const shot = { coins, total: 3, fired: 3, t: 1, acc: 0, speed: 1 as const, firstDown: null, gained: 0, angle: 1 };
    const { ctx, calls } = recorder();
    drawHuntScene(ctx, state({ phase: "throwing", shot }), 300, 600, false, null);
    expect(calls.filter((c) => c.name === "arc").map((c) => c.args.slice(0, 2))).toEqual([[10, 20], [11, 20], [12, 20]]);
    const waiting = recorder();
    drawHuntScene(waiting.ctx, state({}), 300, 600, false, null);
    expect(waiting.calls.filter((c) => c.name === "arc").map((c) => c.args.slice(0, 2))).toEqual([[35, HUNT_H - COIN_R]]);
  });
});
