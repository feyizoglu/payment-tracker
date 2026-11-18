import { describe, it, expect } from "vitest";
import {
  MAX_GAP_STEP,
  OBSTACLE_SPACING,
  OBSTACLE_WIDTH,
  PLANE_FLAP_SPEED,
  PLANE_GRAVITY,
  PLANE_MAX_FALL,
  PLANE_PENCILS,
  drawGapY,
  newPlaneGame,
  parseSavedBest,
  newPlaneSessionBest,
  planeBestAfter,
  planeSessionRead,
  planeAngle,
  planeGap,
  planePause,
  planePencilColour,
  planeSpeed,
  planeTap,
  planeWorldWidth,
  planeX,
  stepPlane,
  type PlaneState,
  type Rng,
} from "@/lib/paper-plane";

function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const half = () => 0.5;
const flying = (width = 56): PlaneState => planeTap(newPlaneGame(width), half);

describe("world and difficulty", () => {
  it("sizes the world by the screen, within 45 to 80 units", () => {
    expect(planeWorldWidth(360, 640)).toBeCloseTo(56.25);
    expect(planeWorldWidth(300, 1000)).toBe(45);
    expect(planeWorldWidth(1600, 900)).toBe(80);
    expect(planeWorldWidth(0, 0)).toBe(56);
  });

  it("speeds up and narrows by score, and stops at 40 points", () => {
    expect([planeSpeed(0), planeGap(0)]).toEqual([30, 32]);
    expect([planeSpeed(20), planeGap(20)]).toEqual([40, 27]);
    expect([planeSpeed(40), planeGap(40)]).toEqual([50, 22]);
    expect([planeSpeed(90), planeGap(90)]).toEqual([50, 22]);
  });

  it("draws gaps away from the edges, within 30 units of the last one", () => {
    const rng = seeded(7);
    let prev: number | null = null;
    for (let i = 0; i < 500; i++) {
      const gap = planeGap(i % 50);
      const y = drawGapY(prev, gap, rng);
      expect(y - gap / 2).toBeGreaterThanOrEqual(12 - 1e-9);
      expect(y + gap / 2).toBeLessThanOrEqual(88 + 1e-9);
      if (prev !== null) expect(Math.abs(y - prev)).toBeLessThanOrEqual(MAX_GAP_STEP + 1e-9);
      prev = y;
    }
  });
});

describe("flying", () => {
  it("waits on the ready screen until the first tap, which flaps", () => {
    const ready = newPlaneGame(56);
    expect(stepPlane(ready, 1 / 30, half)).toBe(ready);
    const s = planeTap(ready, half);
    expect(s.phase).toBe("flying");
    expect(s.vy).toBe(PLANE_FLAP_SPEED);
    expect(s.obstacles).toHaveLength(1);
    expect(s.spawned).toBe(1);
    expect(s.obstacles[0].x).toBeCloseTo(56 + 30 * 1.5);
  });

  it("falls under gravity up to the fall cap, and a tap sends it up again", () => {
    let s = flying();
    s = { ...s, vy: 0 };
    s = stepPlane(s, 1 / 60, half);
    expect(s.vy).toBeCloseTo(PLANE_GRAVITY / 60);
    s = { ...s, vy: PLANE_MAX_FALL, y: 20 };
    s = stepPlane(s, 1 / 60, half);
    expect(s.vy).toBe(PLANE_MAX_FALL);
    expect(planeTap(s, half).vy).toBe(PLANE_FLAP_SPEED);
  });

  it("tilts the nose from -25 degrees climbing to 60 falling", () => {
    expect(planeAngle(PLANE_FLAP_SPEED)).toBeCloseTo(-25);
    expect(planeAngle(PLANE_MAX_FALL)).toBeCloseTo(60);
    expect(planeAngle(-500)).toBeCloseTo(-25);
  });

  it("treats a long frame as at most 1/30 s", () => {
    const s = { ...flying(), vy: 0 };
    expect(stepPlane(s, 2, half).y).toBeCloseTo(stepPlane(s, 1 / 30, half).y);
    expect(stepPlane(s, -1, half).y).toBe(s.y);
  });

  it("ends at the top and at the bottom edge", () => {
    expect(stepPlane({ ...flying(), y: 1.6, vy: -60 }, 1 / 60, half).phase).toBe("over");
    expect(stepPlane({ ...flying(), y: 98.4, vy: 60 }, 1 / 60, half).phase).toBe("over");
  });
});

describe("obstacles", () => {
  const at = (s: PlaneState, x: number, gapY: number, gap = 32): PlaneState => ({
    ...s,
    vy: 0,
    obstacles: [{ x, gapY, gap, kind: 0, index: 0, scored: false }],
  });

  it("hits an obstacle when the plane is outside its gap", () => {
    const s = flying();
    const px = planeX(s.width);
    expect(stepPlane(at({ ...s, y: 30 }, px - 2, 60), 1 / 60, half).phase).toBe("over");
    expect(stepPlane(at({ ...s, y: 60 }, px - 2, 60), 1 / 60, half).phase).toBe("flying");
  });

  it("forgives a graze: the hitbox is 6 x 3 units", () => {
    const s = flying();
    const px = planeX(s.width);
    // Gap top at 44: the plane's top edge at 44.6 clears it.
    expect(stepPlane(at({ ...s, y: 46.1 }, px - 2, 60), 1 / 120, half).phase).toBe("flying");
  });

  it("hits an obstacle reached during a long frame", () => {
    const s = flying();
    const px = planeX(s.width);
    const before = at({ ...s, y: 20, vy: 0, score: 40 }, px + 3.2, 60);
    expect(stepPlane(before, 1 / 30, half).phase).toBe("over");
  });

  it("scores once per obstacle, after the plane is past it", () => {
    const s = flying();
    const px = planeX(s.width);
    let w = at({ ...s, y: 60 }, px - 3 - OBSTACLE_WIDTH + 0.1, 60);
    w = stepPlane(w, 1 / 60, half);
    expect(w.score).toBe(1);
    w = stepPlane(w, 1 / 60, half);
    expect(w.score).toBe(1);
  });

  it("keeps one obstacle waiting off screen, spaced 38 units, and drops the ones gone", () => {
    let s = flying(45);
    for (let i = 0; i < 600 && s.phase === "flying"; i++) {
      const ahead = s.obstacles.find((o) => !o.scored);
      s = stepPlane({ ...s, y: ahead?.gapY ?? 50, vy: 0 }, 1 / 60, seeded(i));
      expect(s.obstacles.length).toBeLessThanOrEqual(4);
      expect(s.obstacles.at(-1)!.x).toBeGreaterThanOrEqual(s.width - 1e-9);
      for (let k = 1; k < s.obstacles.length; k++) {
        expect(s.obstacles[k].x - s.obstacles[k - 1].x).toBeCloseTo(OBSTACLE_SPACING);
      }
      expect(s.obstacles[0].x + OBSTACLE_WIDTH).toBeGreaterThanOrEqual(0);
    }
  });

  it("numbers obstacles in order, so each keeps its colours while others leave", () => {
    let s = flying(45);
    const seen = new Map<number, number>();
    let dropped = 0;
    for (let i = 0; i < 900 && s.phase === "flying"; i++) {
      const ahead = s.obstacles.find((o) => !o.scored);
      const before = s.obstacles[0].index;
      s = stepPlane({ ...s, y: ahead?.gapY ?? 50, vy: 0 }, 1 / 60, seeded(i));
      if (s.obstacles[0].index !== before) dropped += 1;
      s.obstacles.forEach((o, k) => {
        if (k > 0) expect(o.index).toBe(s.obstacles[k - 1].index + 1);
        expect(o.kind).toBe(o.index % 2);
        if (seen.has(o.index)) expect(o.x).toBeLessThan(seen.get(o.index)!);
        seen.set(o.index, o.x);
      });
      expect(s.obstacles.at(-1)!.index).toBe(s.spawned - 1);
    }
    expect(dropped).toBeGreaterThan(2);
  });

  it("gives each pencil its own colour pair, the same for its whole flight", () => {
    const pencils = [0, 2, 4, 6].map((index) => planePencilColour({ index }, true));
    expect(new Set(pencils).size).toBe(PLANE_PENCILS.length);
    expect(planePencilColour({ index: 2 }, false)).toBe(planePencilColour({ index: 4 }, true));
    expect(planePencilColour({ index: 8 }, true)).toBe(planePencilColour({ index: 0 }, true));
  });

  it("can always be flown, even when every gap swings as far as it may", () => {
    // The worst layout: each gap as far from the last as the rules allow, at full speed.
    const swing = (): Rng => {
      let i = 0;
      return () => (i++ % 2 === 0 ? 0 : 0.999);
    };
    for (const width of [45, 80]) {
      expect(flyable(newPlaneGame(width), swing(), 45), `width ${width}`).toBe(true);
      expect(flyable(newPlaneGame(width), seeded(width), 45), `width ${width}, seeded`).toBe(true);
    }
  }, 30_000);
});

// Every state that survives, kept once per (height, speed) bucket. The obstacles do not depend
// on the path flown: obstacle n always gets the n-th number, so every branch replays the same
// sequence from its own `spawned`.
function flyable(start: PlaneState, rng: Rng, target: number): boolean {
  const draws: number[] = [];
  const from = (i: number): Rng => () => {
    while (draws.length <= i) draws.push(rng());
    return draws[i++];
  };
  let states = [planeTap(start, from(0))];
  for (let t = 0; t < 200; t += 1 / 30) {
    const next = new Map<string, PlaneState>();
    for (const s of states) {
      for (const flap of [false, true]) {
        const after = stepPlane(flap ? planeTap(s, from(s.spawned)) : s, 1 / 30, from(s.spawned));
        if (after.phase !== "flying") continue;
        if (after.score >= target) return true;
        const key = `${Math.round(after.y)}:${Math.round(after.vy / 6)}`;
        if (!next.has(key)) next.set(key, after);
      }
    }
    if (next.size === 0) return false;
    states = [...next.values()];
  }
  return false;
}

describe("pause", () => {
  it("stops the world while paused and resumes on a tap without flapping", () => {
    const s = { ...flying(), vy: 20 };
    const paused = planePause(s);
    expect(paused.phase).toBe("paused");
    expect(stepPlane(paused, 1 / 30, half)).toBe(paused);
    const resumed = planeTap(paused, half);
    expect(resumed).toMatchObject({ phase: "flying", vy: 20 });
  });

  it("ignores pause outside a flight and taps after the end", () => {
    const ready = newPlaneGame(56);
    expect(planePause(ready)).toBe(ready);
    const over = { ...flying(), phase: "over" as const };
    expect(planeTap(over, half)).toBe(over);
  });
});

describe("planeBestAfter", () => {
  const read = (stored: number | null) => planeSessionRead(newPlaneSessionBest(), stored);

  it("claims and saves a score above every best known", () => {
    expect(planeBestAfter(9, read(5), 5)).toEqual({ session: { best: 9, known: true }, isNew: true, save: 9 });
    expect(planeBestAfter(9, read(5), 12)).toEqual({ session: { best: 12, known: true }, isNew: false, save: null });
    expect(planeBestAfter(5, read(5), 5)).toEqual({ session: { best: 5, known: true }, isNew: false, save: null });
    expect(planeBestAfter(3, read(0), 0)).toEqual({ session: { best: 3, known: true }, isNew: true, save: 3 });
  });

  it("claims and saves nothing while no read has succeeded, but remembers the score", () => {
    expect(planeBestAfter(10, read(null), null)).toEqual({ session: { best: 10, known: false }, isNew: false, save: null });
  });

  it("saves the session's best once a read succeeds, without claiming a lower score", () => {
    const after = planeBestAfter(10, newPlaneSessionBest(), null).session;
    expect(planeBestAfter(6, after, 4)).toEqual({ session: { best: 10, known: true }, isNew: false, save: 10 });
  });

  it("keeps claiming against an earlier read when the read at the end fails", () => {
    expect(planeBestAfter(25, read(20), null)).toEqual({ session: { best: 25, known: true }, isNew: true, save: 25 });
    expect(planeBestAfter(15, read(20), null)).toEqual({ session: { best: 20, known: true }, isNew: false, save: null });
  });

  it("does not claim again a best this session already played", () => {
    const first = planeBestAfter(10, read(0), 0);
    expect(first.save).toBe(10);
    expect(planeBestAfter(5, first.session, 0)).toEqual({ session: { best: 10, known: true }, isNew: false, save: 10 });
  });
});

describe("parseSavedBest", () => {
  it("accepts a non-negative whole number and nothing else", () => {
    expect(parseSavedBest("23")).toBe(23);
    expect(parseSavedBest(null)).toBe(0);
    expect(parseSavedBest("-4")).toBe(0);
    expect(parseSavedBest("2.5")).toBe(0);
    expect(parseSavedBest("abc")).toBe(0);
    expect(parseSavedBest("")).toBe(0);
  });
});
