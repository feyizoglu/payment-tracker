// Book Tower: a one-tap stacking game. Pure logic shared by web and mobile, driven by elapsed time.
// The world is 100 units wide; y points up from the desk, and book i sits between i·7 and (i+1)·7.

export type TowerPhase = "ready" | "playing" | "paused" | "over";

export interface TowerBook {
  /** Left edge. */
  x: number;
  w: number;
  /** Order of placement from 0 (the desk book); picks the colour. */
  index: number;
}

export interface TowerPiece {
  x: number;
  w: number;
  /** Bottom edge. */
  y: number;
  vy: number;
  /** Degrees. */
  angle: number;
  spin: number;
  index: number;
}

export interface TowerState {
  phase: TowerPhase;
  stack: TowerBook[];
  /** Centre of the sliding book and its direction. */
  slider: { x: number; dir: 1 | -1 };
  score: number;
  /** Perfect drops in a row. */
  streak: number;
  camera: number;
  pieces: TowerPiece[];
  /** Seconds the "Perfect!" text still shows. */
  perfect: number;
}

export const TOWER_WIDTH = 100;
export const BOOK_H = 7;
export const START_W = 50;
export const PERFECT_TOLERANCE = 1.5;
export const GROW = 6;
export const GROW_EVERY = 3;
export const KEEP_BELOW = 5;
export const PERFECT_FLASH = 0.6;
export const TOWER_BEST_KEY = "book-tower-best";
export const TOWER_OVER_GUARD_MS = 500;

const MAX_DT = 1 / 30;
const GRAVITY = 300;
const CAMERA_RATE = 12;
const DIFFICULTY_CAP = 40;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const towerSpeed = (score: number) => 35 + 1.5 * Math.min(score, DIFFICULTY_CAP);

export function towerCameraTarget(s: TowerState): number {
  return Math.max(0, (s.stack.length - (KEEP_BELOW + 1)) * BOOK_H);
}

/** How far the slider's centre goes: the book slides fully past each edge of the page. */
export const towerSliderRange = (w: number) => ({ lo: -w / 2, hi: TOWER_WIDTH + w / 2 });

/** Books come alternately from the left and the right end. */
function sliderFor(index: number, w: number): TowerState["slider"] {
  const { lo, hi } = towerSliderRange(w);
  return index % 2 === 1 ? { x: lo, dir: 1 } : { x: hi, dir: -1 };
}

export function newTowerGame(): TowerState {
  return {
    phase: "ready",
    stack: [{ x: (TOWER_WIDTH - START_W) / 2, w: START_W, index: 0 }],
    slider: sliderFor(1, START_W),
    score: 0,
    streak: 0,
    camera: 0,
    pieces: [],
    perfect: 0,
  };
}

function piece(x: number, w: number, index: number, side: number): TowerPiece {
  return { x, w, y: index * BOOK_H, vy: 0, angle: 0, spin: 90 * side, index };
}

function drop(s: TowerState): TowerState {
  const below = s.stack[s.stack.length - 1];
  const index = s.stack.length;
  const left = s.slider.x - below.w / 2;
  const right = left + below.w;
  const centre = below.x + below.w / 2;
  if (Math.abs(s.slider.x - centre) < PERFECT_TOLERANCE) {
    const streak = s.streak + 1;
    const w = streak % GROW_EVERY === 0 ? Math.min(START_W, below.w + GROW) : below.w;
    const book = { x: clamp(centre - w / 2, 0, TOWER_WIDTH - w), w, index };
    return { ...s, stack: [...s.stack, book], score: s.score + 1, streak, slider: sliderFor(index + 1, w), perfect: PERFECT_FLASH };
  }
  const lo = Math.max(left, below.x);
  const hi = Math.min(right, below.x + below.w);
  if (hi - lo <= 0) {
    return { ...s, phase: "over", streak: 0, pieces: [...s.pieces, piece(left, below.w, index, s.slider.x < centre ? -1 : 1)] };
  }
  const cut = left < lo ? piece(left, lo - left, index, -1) : piece(hi, right - hi, index, 1);
  return {
    ...s,
    stack: [...s.stack, { x: lo, w: hi - lo, index }],
    score: s.score + 1,
    streak: 0,
    slider: sliderFor(index + 1, hi - lo),
    pieces: [...s.pieces, cut],
  };
}

/** Ready: start sliding. Playing: drop. Paused: resume without a drop. Over: nothing. */
export function towerTap(s: TowerState): TowerState {
  if (s.phase === "ready" || s.phase === "paused") return { ...s, phase: "playing" };
  if (s.phase === "playing") return drop(s);
  return s;
}

export function towerPause(s: TowerState): TowerState {
  return s.phase === "playing" ? { ...s, phase: "paused" } : s;
}

/** Playing moves everything; over only lets the pieces finish falling. */
export function stepTower(s: TowerState, dt: number): TowerState {
  if (s.phase !== "playing" && s.phase !== "over") return s;
  const t = clamp(dt, 0, MAX_DT);
  if (t === 0) return s;
  let slider = s.slider;
  if (s.phase === "playing") {
    const { lo, hi } = towerSliderRange(s.stack[s.stack.length - 1].w);
    let x = slider.x + slider.dir * towerSpeed(s.score) * t;
    let dir = slider.dir;
    if (x > hi) {
      x = 2 * hi - x;
      dir = -1;
    } else if (x < lo) {
      x = 2 * lo - x;
      dir = 1;
    }
    slider = { x, dir };
  }
  const camera = s.camera + (towerCameraTarget(s) - s.camera) * (1 - Math.exp(-CAMERA_RATE * t));
  const pieces = s.pieces
    .map((p) => {
      const vy = p.vy + GRAVITY * t;
      return { ...p, vy, y: p.y - vy * t, angle: p.angle + p.spin * t };
    })
    .filter((p) => p.y > camera - 60);
  return { ...s, slider, camera, pieces, perfect: Math.max(0, s.perfect - t) };
}

/** The desk under the stack, in world units; the view is fitted to the world's width or this height. */
export const TOWER_DESK = 12;
export const TOWER_VIEW_H = 110;
/** Narrower books have no room for the spine stripes. */
export const MIN_STRIPED = 4;

/** Pixels per unit, the world's left edge, and the desk surface's y in pixels, for a view of this size. */
export function towerViewport(width: number, height: number) {
  const scale = Math.min(width / TOWER_WIDTH, height / TOWER_VIEW_H);
  return { scale, left: (width - TOWER_WIDTH * scale) / 2, desk: height - TOWER_DESK * scale };
}

/** Where a book's two 1-unit spine stripes start, from its left edge; none on a narrow book. */
export function towerStripes(w: number): number[] {
  return w < MIN_STRIPED ? [] : [Math.min(3, w / 4), Math.max(w - 4, (3 * w) / 4)];
}

export const TOWER_BOOKS = ["#c0392b", "#2e86c1", "#27ae60", "#e67e22", "#8e44ad", "#16a085"] as const;
export const towerBookColour = (index: number) => TOWER_BOOKS[index % TOWER_BOOKS.length];

export const TOWER_COLORS = {
  light: { wall: "#f6f1e7", desk: "#c8955c", deskEdge: "#a5733f", stripe: "rgba(255,255,255,0.55)", ink: "#3b3b3b", score: "#1f2937" },
  dark: { wall: "#141d33", desk: "#4a3524", deskEdge: "#33241a", stripe: "rgba(255,255,255,0.35)", ink: "#d9dfeb", score: "#f3f4f6" },
} as const;
