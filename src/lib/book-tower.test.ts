import { describe, it, expect } from "vitest";
import {
  BOOK_H,
  START_W,
  TOWER_WIDTH,
  newTowerGame,
  stepTower,
  towerBookColour,
  towerCameraTarget,
  towerPause,
  towerSliderRange,
  towerSpeed,
  towerTap,
  TOWER_BOOKS,
  type TowerState,
} from "@/lib/book-tower";

const playing = (): TowerState => towerTap(newTowerGame());
const at = (s: TowerState, x: number): TowerState => ({ ...s, slider: { ...s.slider, x } });
const top = (s: TowerState) => s.stack[s.stack.length - 1];

describe("start", () => {
  it("waits with one book on the desk, and the first tap starts the slider without dropping", () => {
    const s = newTowerGame();
    expect(s.phase).toBe("ready");
    expect(s.stack).toEqual([{ x: 25, w: START_W, index: 0 }]);
    const p = towerTap(s);
    expect(p.phase).toBe("playing");
    expect(p.stack).toHaveLength(1);
    expect(p.slider).toEqual({ x: -25, dir: 1 });
    expect(stepTower(s, 0.5)).toBe(s);
  });
});

describe("sliding", () => {
  it("moves at the current speed and bounces at both ends", () => {
    let s = playing();
    s = stepTower(s, 1 / 60);
    expect(s.slider.x).toBeCloseTo(-25 + towerSpeed(0) / 60);
    s = stepTower({ ...s, slider: { x: 124, dir: 1 } }, 1 / 30);
    expect(s.slider.dir).toBe(-1);
    expect(s.slider.x).toBeCloseTo(125 - (towerSpeed(0) / 30 - 1));
    s = stepTower({ ...s, slider: { x: -24.5, dir: -1 } }, 1 / 30);
    expect(s.slider.dir).toBe(1);
  });

  it("lets the book slide fully past each edge, so it can miss from the first drop", () => {
    expect(towerSliderRange(50)).toEqual({ lo: -25, hi: 125 });
    expect(towerTap(at(playing(), -10)).phase).toBe("over");
  });

  it("treats a long frame as at most 1/30 s", () => {
    expect(stepTower(playing(), 1).slider.x).toBeCloseTo(-25 + towerSpeed(0) / 30);
  });

  it("speeds up by score and stops at 40 points", () => {
    expect(towerSpeed(0)).toBe(35);
    expect(towerSpeed(10)).toBe(50);
    expect(towerSpeed(40)).toBe(95);
    expect(towerSpeed(90)).toBe(95);
  });
});

describe("dropping", () => {
  it("cuts what hangs over on the right and drops it as a falling piece", () => {
    const s = towerTap(at(playing(), 60));
    expect(s.score).toBe(1);
    expect(top(s)).toEqual({ x: 35, w: 40, index: 1 });
    expect(s.pieces).toHaveLength(1);
    expect(s.pieces[0]).toMatchObject({ x: 75, w: 10, y: BOOK_H, index: 1 });
    expect(s.slider).toEqual({ x: TOWER_WIDTH + 20, dir: -1 });
  });

  it("cuts what hangs over on the left", () => {
    const s = towerTap(at(playing(), 40));
    expect(top(s)).toEqual({ x: 25, w: 40, index: 1 });
    expect(s.pieces[0]).toMatchObject({ x: 15, w: 10 });
  });

  it("lands a near miss exactly on the book below, and grows on every third perfect drop in a row", () => {
    let s = playing();
    s = towerTap(at(s, 51));
    expect(top(s)).toEqual({ x: 25, w: 50, index: 1 });
    expect(s.pieces).toHaveLength(0);
    expect(s.perfect).toBeGreaterThan(0);
    s = { ...s, stack: [...s.stack.slice(0, -1), { x: 30, w: 40, index: 1 }] };
    s = towerTap(at(s, 50));
    s = towerTap(at(s, 50));
    expect(s.streak).toBe(3);
    expect(top(s)).toEqual({ x: 27, w: 46, index: 3 });
    s = towerTap(at(s, 60));
    expect(s.streak).toBe(0);
  });

  it("keeps a grown book on the page", () => {
    let s = playing();
    s = { ...s, stack: [...s.stack.slice(0, -1), { x: 0, w: 20, index: 0 }], streak: 2 };
    s = towerTap(at(s, 10));
    expect(top(s)).toEqual({ x: 0, w: 26, index: 1 });
  });

  it("never grows past the starting width", () => {
    let s = playing();
    for (let i = 0; i < 3; i++) s = towerTap(at(s, 50));
    expect(top(s).w).toBe(START_W);
  });

  it("ends the game when the book misses, and lets the whole book fall", () => {
    const s = towerTap(at(playing(), 100));
    expect(s.phase).toBe("over");
    expect(s.score).toBe(0);
    expect(s.pieces).toHaveLength(1);
    expect(s.pieces[0]).toMatchObject({ x: 75, w: 50 });
  });

  it("does nothing on a tap after the end", () => {
    const over = towerTap(at(playing(), 100));
    expect(towerTap(over)).toBe(over);
  });
});

describe("camera and falling pieces", () => {
  it("keeps five books below the top, easing towards it", () => {
    expect(towerCameraTarget(newTowerGame())).toBe(0);
    let s = playing();
    for (let i = 0; i < 8; i++) s = towerTap(at(s, 50));
    expect(towerCameraTarget(s)).toBe((s.stack.length - 6) * BOOK_H);
    const after = stepTower(s, 1 / 60);
    expect(after.camera).toBeGreaterThan(0);
    expect(after.camera).toBeLessThan(towerCameraTarget(s));
    let settled = after;
    for (let i = 0; i < 120; i++) settled = stepTower(settled, 1 / 60);
    expect(settled.camera).toBeCloseTo(towerCameraTarget(s), 1);
  });

  it("lets pieces fall and spin, and drops them below the view; over keeps them falling", () => {
    let s = towerTap(at(playing(), 100));
    const y0 = s.pieces[0].y;
    s = stepTower(s, 1 / 30);
    expect(s.pieces[0].y).toBeLessThan(y0);
    expect(s.pieces[0].angle).not.toBe(0);
    for (let i = 0; i < 120; i++) s = stepTower(s, 1 / 30);
    expect(s.pieces).toHaveLength(0);
  });

  it("fades the perfect flash out", () => {
    let s = towerTap(at(playing(), 50));
    for (let i = 0; i < 30; i++) s = stepTower(s, 1 / 30);
    expect(s.perfect).toBe(0);
  });
});

describe("pause", () => {
  it("stops the slider while paused, and a tap resumes without dropping", () => {
    const p = towerPause(stepTower(playing(), 1 / 60));
    expect(p.phase).toBe("paused");
    expect(stepTower(p, 1 / 30)).toBe(p);
    const r = towerTap(p);
    expect(r.phase).toBe("playing");
    expect(r.stack).toHaveLength(1);
  });

  it("ignores pause outside play", () => {
    const s = newTowerGame();
    expect(towerPause(s)).toBe(s);
  });
});

describe("colours", () => {
  it("gives a book the same colour for its whole life", () => {
    expect(towerBookColour(0)).toBe(TOWER_BOOKS[0]);
    expect(towerBookColour(TOWER_BOOKS.length + 2)).toBe(TOWER_BOOKS[2]);
  });
});
