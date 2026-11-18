import { describe, it, expect, vi, afterEach } from "vitest";
import { startFrameLoop } from "@/lib/frame-loop";

const frames: ((now: number) => void)[] = [];
afterEach(() => {
  frames.length = 0;
  vi.unstubAllGlobals();
});
function stub() {
  vi.stubGlobal("requestAnimationFrame", (fn: (now: number) => void) => frames.push(fn));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
}
const tick = (now: number) => frames.splice(0, frames.length).forEach((fn) => fn(now));

describe("startFrameLoop", () => {
  it("hands out seconds since the last frame, 0 on the first", () => {
    stub();
    const seen: number[] = [];
    startFrameLoop((dt) => (seen.push(dt), true));
    tick(1000);
    tick(1016);
    tick(1050);
    expect(seen.map((s) => +s.toFixed(3))).toEqual([0, 0.016, 0.034]);
  });

  it("stops when the frame returns false or the loop is stopped", () => {
    stub();
    let calls = 0;
    startFrameLoop(() => (calls++, false));
    tick(0);
    tick(16);
    expect(calls).toBe(1);

    const stop = startFrameLoop(() => (calls++, true));
    tick(32);
    stop();
    tick(48);
    expect(calls).toBe(2);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
