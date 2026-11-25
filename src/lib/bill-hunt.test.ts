import { describe, it, expect } from "vitest";
import {
  BILL_GAP,
  COIN_CAP,
  COIN_R,
  COIN_SPEED,
  HUNT_CELL,
  HUNT_COLS,
  HUNT_FOOT,
  HUNT_H,
  HUNT_ROWS,
  HUNT_W,
  MIN_ANGLE,
  SUB_DT,
  THROW_CAP,
  huntAim,
  huntAimEnd,
  huntBillShade,
  huntCallBack,
  huntFire,
  huntSpeedUp,
  huntStart,
  huntViewport,
  newHuntGame,
  spawnHuntRow,
  stepHunt,
  type HuntCoin,
  type HuntItem,
  type HuntItemKind,
  type HuntState,
} from "@/lib/bill-hunt";

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fixed = (v: number) => () => v;
const DEG = Math.PI / 180;

let ids = 100;
function item(kind: HuntItemKind, col: number, row: number, value = 0): HuntItem {
  return { id: ids++, kind, col, row, value, double: false, used: false };
}
const bill = (col: number, row: number, value: number) => item("bill", col, row, value);

function aiming(items: HuntItem[], over: Partial<HuntState> = {}): HuntState {
  return { phase: "aiming", month: 3, score: 2, coins: 1, launcher: 35, items, nextId: 1000, shot: null, version: 0, ...over };
}

/** A throw in progress with the given coins already in the air. */
function flying(items: HuntItem[], coins: Partial<HuntCoin>[], over: Partial<HuntState> = {}): HuntState {
  const s = aiming(items, over);
  const list = coins.map((c) => ({ x: 35, y: 50, vx: 0, vy: -COIN_SPEED, down: false, cell: -1, ...c }));
  return { ...s, phase: "throwing", shot: { coins: list, total: list.length, fired: list.length, t: 1, acc: 0, speed: 1, firstDown: null, gained: 0, angle: Math.PI / 2 } };
}

const sub = (s: HuntState, n = 1, rng = fixed(0.5)) => {
  for (let i = 0; i < n; i++) s = stepHunt(s, SUB_DT, rng);
  return s;
};
const find = (s: HuntState, id: number) => s.items.find((i) => i.id === id);

describe("a new game", () => {
  it("waits on month 1 with one coin in the middle and one row at the top", () => {
    const s = newHuntGame(seeded(1));
    expect(s).toMatchObject({ phase: "ready", month: 1, score: 0, coins: 1, launcher: HUNT_W / 2, shot: null });
    expect(s.items.every((i) => i.row === 0)).toBe(true);
    const started = huntStart(s);
    expect(started.phase).toBe("aiming");
    expect(huntStart(started)).toBe(started);
  });
});

describe("a new row", () => {
  it("has 1 to 2 bills in month 1, exactly one +1 coin, at most one power-up, in distinct columns", () => {
    for (let seed = 1; seed < 200; seed++) {
      const row = spawnHuntRow(1, seeded(seed), 1);
      const bills = row.filter((i) => i.kind === "bill");
      expect(bills.length).toBeGreaterThanOrEqual(1);
      expect(bills.length).toBeLessThanOrEqual(2);
      expect(row.filter((i) => i.kind === "plus")).toHaveLength(1);
      expect(row.length - bills.length - 1).toBeLessThanOrEqual(1);
      expect(new Set(row.map((i) => i.col)).size).toBe(row.length);
      expect(row.every((i) => i.row === 0 && i.col >= 0 && i.col < HUNT_COLS)).toBe(true);
      for (const b of bills) expect(b.value).toBe(b.double ? 2 : 1);
      expect(row.map((i) => i.id)).toEqual(row.map((_, k) => 1 + k));
    }
  });

  it("allows up to 4 bills later on, worth the month or double", () => {
    let most = 0;
    for (let seed = 1; seed < 200; seed++) {
      const bills = spawnHuntRow(16, seeded(seed), 1).filter((i) => i.kind === "bill");
      most = Math.max(most, bills.length);
      for (const b of bills) expect(b.value).toBe(b.double ? 32 : 16);
    }
    expect(most).toBe(4);
  });

  it("brings a power-up about 40% of the time, campaigns about half as often as each other kind", () => {
    const counts: Record<string, number> = { rowCut: 0, colCut: 0, deflect: 0, campaign: 0 };
    let doubles = 0;
    let bills = 0;
    const n = 4000;
    for (let seed = 1; seed <= n; seed++) {
      for (const i of spawnHuntRow(5, seeded(seed), 1)) {
        if (i.kind in counts) counts[i.kind]++;
        if (i.kind === "bill") {
          bills++;
          if (i.double) doubles++;
        }
      }
    }
    const powers = counts.rowCut + counts.colCut + counts.deflect + counts.campaign;
    expect(powers / n).toBeGreaterThan(0.36);
    expect(powers / n).toBeLessThan(0.44);
    for (const k of ["rowCut", "colCut", "deflect"]) expect(counts[k] / counts.campaign).toBeGreaterThan(1.6);
    expect(doubles / bills).toBeGreaterThan(0.17);
    expect(doubles / bills).toBeLessThan(0.23);
  });
});

describe("aiming", () => {
  it("throws the opposite way of the pull", () => {
    expect(huntAim(0, 10)).toBeCloseTo(Math.PI / 2);
    expect(huntAim(-10, 10)).toBeCloseTo(Math.PI / 4);
    expect(huntAim(10, 10)).toBeCloseTo((3 * Math.PI) / 4);
  });

  it("keeps the throw at least 8 degrees above the horizontal", () => {
    expect(huntAim(-10, 0.1)).toBeCloseTo(MIN_ANGLE);
    expect(huntAim(10, 0.1)).toBeCloseTo(Math.PI - MIN_ANGLE);
  });

  it("aims nothing for a short pull or one that would throw downwards", () => {
    expect(huntAim(0, 3.9)).toBeNull();
    expect(huntAim(0, -10)).toBeNull();
    expect(huntAim(10, 0)).toBeNull();
  });

  it("ends the aim line where the coin first bounces", () => {
    const up = huntAimEnd(aiming([]), Math.PI / 2);
    expect(up.x).toBeCloseTo(35);
    expect(up.y).toBeLessThan(COIN_R + 0.5);
    const b = bill(3, 4, 5);
    const under = huntAimEnd(aiming([b]), Math.PI / 2);
    expect(under.y).toBeGreaterThan(5 * HUNT_CELL - BILL_GAP + COIN_R - 0.01);
    expect(under.y).toBeLessThan(5 * HUNT_CELL - BILL_GAP + COIN_R + 0.5);
  });

  it("matches where the thrown coin really bounces first", () => {
    const b = bill(5, 3, 9);
    const angle = 70 * DEG;
    const end = huntAimEnd(aiming([b]), angle);
    let s = huntFire(aiming([b]), angle);
    for (let i = 0; i < 4000 && find(s, b.id)!.value === 9; i++) s = sub(s);
    expect(find(s, b.id)!.value).toBe(8);
    const coin = s.shot!.coins[0];
    // The bounce sub-step leaves the coin where it was; the step after it has moved it at most once.
    expect(Math.hypot(coin.x - end.x, coin.y - end.y)).toBeLessThan(0.4);
  });
});

describe("throwing", () => {
  it("fires only while aiming, with every coin to come", () => {
    const s = huntFire(aiming([], { coins: 5 }), Math.PI / 3);
    expect(s.phase).toBe("throwing");
    expect(s.shot).toMatchObject({ total: 5, fired: 0, coins: [], speed: 1, firstDown: null, gained: 0 });
    expect(huntFire(s, 1)).toBe(s);
    expect(huntFire(newHuntGame(seeded(1)), 1).phase).toBe("ready");
  });

  it("launches the coins 0.08 s apart from the launcher", () => {
    let s = huntFire(aiming([], { coins: 3 }), Math.PI / 2);
    s = stepHunt(s, 1 / 30, fixed(0.5));
    expect(s.shot!.fired).toBe(1);
    s = stepHunt(stepHunt(s, 1 / 30, fixed(0.5)), 1 / 30, fixed(0.5));
    expect(s.shot!.t).toBeCloseTo(0.1, 5);
    expect(s.shot!.fired).toBe(2);
    expect(s.shot!.coins[1].x).toBe(35);
  });

  it("never takes a step longer than 1/30 s", () => {
    const s = stepHunt(huntFire(aiming([], { coins: 10 }), Math.PI / 2), 5, fixed(0.5));
    expect(s.shot!.t).toBeCloseTo(1 / 30, 5);
  });

  it("bounces off the walls and the ceiling", () => {
    let s = sub(flying([], [{ x: COIN_R + 0.1, y: 50, vx: -60, vy: -60 }]));
    expect(s.shot!.coins[0].vx).toBeGreaterThan(0);
    s = sub(flying([], [{ x: HUNT_W - COIN_R - 0.1, y: 50, vx: 60, vy: -60 }]));
    expect(s.shot!.coins[0].vx).toBeLessThan(0);
    s = sub(flying([], [{ x: 30, y: COIN_R + 0.1, vx: 0, vy: -COIN_SPEED }]));
    expect(s.shot!.coins[0].vy).toBeGreaterThan(0);
  });

  it("takes 1 off a bill it bounces off, and removes a bill at 0", () => {
    const b = bill(3, 4, 2);
    let s = flying([b], [{ x: 35, y: 52, vy: -COIN_SPEED }]);
    s = sub(s, 40);
    expect(find(s, b.id)!.value).toBe(1);
    expect(s.shot!.coins[0].vy).toBeGreaterThan(0);
    expect(s.version).toBe(1);
    s = flying(s.items, [{ x: 35, y: 52, vy: -COIN_SPEED }], { version: s.version });
    s = sub(s, 40);
    expect(find(s, b.id)).toBeUndefined();
    expect(s.version).toBe(2);
  });

  it("takes only 1 off a bill hit on its corner in one sub-step", () => {
    const b = bill(3, 4, 5);
    const right = 3 * HUNT_CELL + HUNT_CELL - BILL_GAP;
    const bottom = 4 * HUNT_CELL + HUNT_CELL - BILL_GAP;
    const s = sub(flying([b], [{ x: right + 0.85, y: bottom + 0.9, vx: -COIN_SPEED * Math.SQRT1_2, vy: -COIN_SPEED * Math.SQRT1_2 }]));
    expect(find(s, b.id)!.value).toBe(4);
    expect(s.shot!.coins[0].vx).toBeGreaterThan(0);
    expect(s.shot!.coins[0].vy).toBeGreaterThan(0);
  });

  it("turns a coin bouncing flatter than 8 degrees to 8 degrees, at the same speed", () => {
    const vx = COIN_SPEED * Math.cos(2 * DEG);
    const vy = -COIN_SPEED * Math.sin(2 * DEG);
    const coin = sub(flying([], [{ x: HUNT_W - COIN_R - 0.1, y: 50, vx, vy }])).shot!.coins[0];
    expect(Math.abs(coin.vy)).toBeCloseTo(COIN_SPEED * Math.sin(MIN_ANGLE));
    expect(Math.hypot(coin.vx, coin.vy)).toBeCloseTo(COIN_SPEED);
    expect(coin.vx).toBeLessThan(0);
  });

  it("stops a coin on the floor and moves the launcher to the first one down at the month's end", () => {
    let s = flying([], [{ x: 12, y: HUNT_H - COIN_R - 0.2, vx: 0, vy: COIN_SPEED }, { x: 50, y: 40, vx: 0, vy: COIN_SPEED }]);
    s = sub(s);
    expect(s.shot!.coins[0]).toMatchObject({ down: true, y: HUNT_H - COIN_R });
    expect(s.shot!.firstDown).toBe(12);
    expect(s.phase).toBe("throwing");
    s = sub(s, 200);
    expect(s.phase).toBe("aiming");
    expect(s.launcher).toBe(12);
  });
});

describe("items", () => {
  it("collects a +1 coin for the next month and removes it", () => {
    const p = item("plus", 3, 4);
    let s = sub(flying([p], [{ x: 35, y: 52, vy: -COIN_SPEED }]), 20);
    expect(find(s, p.id)).toBeUndefined();
    expect(s.shot!.gained).toBe(1);
    s = huntCallBack(s, seeded(1));
    expect(s.coins).toBe(2);
  });

  it("adds nothing past the coin cap", () => {
    const p = item("plus", 3, 4);
    const s = huntCallBack(sub(flying([p], [{ x: 35, y: 52, vy: -COIN_SPEED }], { coins: COIN_CAP }), 20), seeded(1));
    expect(s.coins).toBe(COIN_CAP);
    expect(find(s, p.id)).toBeUndefined();
  });

  it("row cut takes 1 off every bill in its row, every time a coin enters it, and goes at the month's end", () => {
    const cut = item("rowCut", 3, 4);
    const a = bill(0, 4, 5);
    const b = bill(6, 4, 1);
    const other = bill(3, 2, 5);
    const keep = item("rowCut", 5, 6);
    let s = sub(flying([cut, a, b, other, keep], [{ x: 35, y: 52, vy: -COIN_SPEED }, { x: 35, y: 54, vy: -COIN_SPEED }]), 30);
    expect(find(s, a.id)!.value).toBe(3);
    expect(find(s, b.id)).toBeUndefined();
    expect(find(s, other.id)!.value).toBe(5);
    expect(find(s, cut.id)!.used).toBe(true);
    s = huntCallBack(s, seeded(1));
    expect(find(s, cut.id)).toBeUndefined();
    expect(find(s, keep.id)!.row).toBe(7);
  });

  it("column cut takes 1 off every bill in its column", () => {
    const cut = item("colCut", 3, 6);
    const a = bill(3, 1, 5);
    const b = bill(4, 1, 5);
    const s = sub(flying([cut, a, b], [{ x: 35, y: 72, vy: -COIN_SPEED }]), 10);
    expect(find(s, a.id)!.value).toBe(4);
    expect(find(s, b.id)!.value).toBe(5);
  });

  it("deflector turns the coin to an upward angle between 20 and 160 degrees", () => {
    const d = item("deflect", 3, 4);
    const coin = (r: number) => sub(flying([d], [{ x: 35, y: 52, vx: 30, vy: -Math.sqrt(COIN_SPEED ** 2 - 900) }]), 12, fixed(r)).shot!.coins[0];
    const low = coin(0);
    expect(Math.atan2(-low.vy, low.vx) / DEG).toBeCloseTo(20);
    const high = coin(0.999999);
    expect(Math.atan2(-high.vy, high.vx) / DEG).toBeCloseTo(160, 2);
    expect(Math.hypot(low.vx, low.vy)).toBeCloseTo(COIN_SPEED);
  });

  it("campaign takes 3 off the 8 bills around it, once, and disappears", () => {
    const c = item("campaign", 3, 4);
    const near = [bill(2, 3, 10), bill(4, 5, 2), bill(3, 3, 3)];
    const far = bill(0, 4, 10);
    const s = sub(flying([c, ...near, far], [{ x: 35, y: 52, vy: -COIN_SPEED }]), 12);
    expect(find(s, c.id)).toBeUndefined();
    expect(find(s, near[0].id)!.value).toBe(7);
    expect(find(s, near[1].id)).toBeUndefined();
    expect(find(s, far.id)!.value).toBe(10);
    // The bill right above it went with the blast, so the coin flies on.
    expect(find(s, near[2].id)).toBeUndefined();
  });
});

describe("the end of a month", () => {
  it("moves everything down a row, brings a new row and counts the month", () => {
    const b = bill(2, 3, 4);
    const s = huntCallBack(flying([b], [], { month: 3, score: 2 }), seeded(4));
    expect(s).toMatchObject({ phase: "aiming", month: 4, score: 3, shot: null });
    expect(find(s, b.id)!.row).toBe(4);
    const fresh = s.items.filter((i) => i.row === 0);
    expect(fresh.length).toBeGreaterThanOrEqual(2);
    expect(fresh.every((i) => i.kind !== "bill" || i.value === 4 || i.value === 8)).toBe(true);
  });

  it("ends the game when a bill reaches the last row, and drops other items that reach it", () => {
    const p = item("plus", 1, HUNT_ROWS - 2);
    const safe = huntCallBack(flying([p], []), seeded(1));
    expect(safe.phase).toBe("aiming");
    expect(find(safe, p.id)).toBeUndefined();
    const b = bill(1, HUNT_ROWS - 2, 4);
    const over = huntCallBack(flying([b], [], { month: 9, score: 8 }), seeded(1));
    expect(over).toMatchObject({ phase: "over", score: 9, shot: null });
  });

  it("keeps the launcher when no coin came down before a call back", () => {
    const s = huntCallBack(flying([], [{ x: 20, y: 30 }], { launcher: 44 }), seeded(1));
    expect(s.launcher).toBe(44);
  });

  it("speeds the rest of a throw up three times", () => {
    const s = huntSpeedUp(huntFire(aiming([], { coins: 3 }), Math.PI / 2));
    expect(s.shot!.speed).toBe(3);
    expect(stepHunt(s, 1 / 120, fixed(0.5)).shot!.t).toBeCloseTo(3 / 120, 5);
    expect(huntSpeedUp(aiming([]))).toEqual(aiming([]));
  });

  it("calls a throw back on its own after 30 s of game time", () => {
    const s = flying([], [{ x: 20, y: 30 }]);
    const late = { ...s, shot: { ...s.shot!, t: THROW_CAP - SUB_DT / 2 } };
    expect(sub(late).phase).toBe("aiming");
  });
});

describe("drawing helpers", () => {
  it("fits the board and the launcher room into the box, centred", () => {
    const v = huntViewport(350, 1000);
    expect(v.scale).toBe(5);
    expect(v.left).toBe(0);
    expect(v.top).toBe((1000 - (HUNT_H + HUNT_FOOT) * 5) / 2);
    expect(huntViewport(1000, 490).scale).toBe(5);
  });

  it("shades a bill darker the more it is worth for its month", () => {
    expect(huntBillShade(1, 10)).not.toBe(huntBillShade(20, 10));
    expect(huntBillShade(20, 10)).toBe(huntBillShade(40, 10));
  });
});

describe("a whole game, played at random", () => {
  const overlaps = (c: HuntCoin, b: HuntItem) => {
    const x0 = b.col * HUNT_CELL + BILL_GAP;
    const y0 = b.row * HUNT_CELL + BILL_GAP;
    const size = HUNT_CELL - 2 * BILL_GAP;
    const nx = Math.min(Math.max(c.x, x0), x0 + size);
    const ny = Math.min(Math.max(c.y, y0), y0 + size);
    return (c.x - nx) ** 2 + (c.y - ny) ** 2 < COIN_R ** 2 - 1e-9;
  };

  for (const seed of [1, 2, 3]) {
    it(`always finishes its throws and ends (seed ${seed})`, () => {
      const rng = seeded(seed);
      let s = huntStart(newHuntGame(rng));
      let months = 0;
      while (s.phase !== "over") {
        expect(months).toBeLessThan(300);
        const before = s.coins;
        const pluses = s.items.filter((i) => i.kind === "plus").length;
        s = huntFire(s, (10 + rng() * 160) * DEG);
        let time = 0;
        while (s.phase === "throwing") {
          s = stepHunt(s, 1 / 30, rng);
          time += 1 / 30;
          expect(time).toBeLessThan(THROW_CAP + 0.1);
          for (const c of s.shot?.coins ?? []) {
            if (c.down) continue;
            expect(c.x).toBeGreaterThanOrEqual(COIN_R - 1e-9);
            expect(c.x).toBeLessThanOrEqual(HUNT_W - COIN_R + 1e-9);
            expect(c.y).toBeGreaterThanOrEqual(COIN_R - 1e-9);
            expect(c.y).toBeLessThanOrEqual(HUNT_H - COIN_R + 1e-9);
            for (const b of s.items) if (b.kind === "bill") expect(overlaps(c, b)).toBe(false);
          }
        }
        expect(s.coins - before).toBeGreaterThanOrEqual(0);
        expect(s.coins - before).toBeLessThanOrEqual(pluses);
        expect(s.coins).toBeLessThanOrEqual(COIN_CAP);
        months++;
      }
      expect(s.score).toBe(months);
    });
  }
});
