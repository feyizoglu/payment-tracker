// Paper Plane: a one-tap flyer. Pure logic shared by web and mobile, driven by elapsed time so
// every refresh rate plays the same. The world is 100 units high; its width follows the screen.

export type Rng = () => number;
export type PlanePhase = "ready" | "flying" | "paused" | "over";

export interface PlaneObstacle {
  /** Left edge, in world units. */
  x: number;
  /** Centre of the gap. */
  gapY: number;
  gap: number;
  /** Which drawing: 0 a pencil, 1 a ruler. */
  kind: number;
  /** Order of creation from 0, so an obstacle keeps its colours while others come and go. */
  index: number;
  scored: boolean;
}

export interface PlaneState {
  phase: PlanePhase;
  width: number;
  /** Centre of the plane. */
  y: number;
  /** Units per second, down is positive. */
  vy: number;
  score: number;
  obstacles: PlaneObstacle[];
  /** Units flown, for the scrolling margin line. */
  distance: number;
  /** Obstacles created so far; each one draws exactly one number from the rng. */
  spawned: number;
}

export const PLANE_WORLD_HEIGHT = 100;
export const PLANE_GRAVITY = 260;
export const PLANE_FLAP_SPEED = -78;
export const PLANE_MAX_FALL = 120;
export const PLANE_HITBOX = { w: 6, h: 3 } as const;
export const OBSTACLE_WIDTH = 9;
export const OBSTACLE_SPACING = 38;
export const MAX_GAP_STEP = 30;
export const PLANE_MARGIN_EVERY = 120;
export const PLANE_BEST_KEY = "paper-plane-best";
/** The game-over buttons ignore taps this long, so a late flap does not restart the game. */
export const PLANE_OVER_GUARD_MS = 500;

const FIRST_OBSTACLE_DELAY = 1.5;
const GAP_EDGE = 12;
const DIFFICULTY_CAP = 40;
const MAX_DT = 1 / 30;
const MAX_SUBSTEP = 1 / 120;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function planeWorldWidth(screenWidth: number, screenHeight: number): number {
  if (!(screenWidth > 0) || !(screenHeight > 0)) return 56;
  return clamp((screenWidth / screenHeight) * PLANE_WORLD_HEIGHT, 45, 80);
}

export const planeSpeed = (score: number) => 30 + 0.5 * Math.min(score, DIFFICULTY_CAP);
export const planeGap = (score: number) => 32 - 0.25 * Math.min(score, DIFFICULTY_CAP);
export const planeX = (width: number) => width * 0.3;

/** Nose angle in degrees: -25 climbing at full flap speed, 60 at the fall cap. */
export function planeAngle(vy: number): number {
  const t = clamp((vy - PLANE_FLAP_SPEED) / (PLANE_MAX_FALL - PLANE_FLAP_SPEED), 0, 1);
  return -25 + t * 85;
}

/** A gap centre away from the edges and within MAX_GAP_STEP of the last one, so it can be flown. */
export function drawGapY(prev: number | null, gap: number, rng: Rng): number {
  const lo = GAP_EDGE + gap / 2;
  const hi = PLANE_WORLD_HEIGHT - GAP_EDGE - gap / 2;
  let y = lo + rng() * (hi - lo);
  if (prev !== null) y = clamp(y, prev - MAX_GAP_STEP, prev + MAX_GAP_STEP);
  return clamp(y, lo, hi);
}

function obstacleAfter(prev: PlaneObstacle | undefined, x: number, score: number, rng: Rng, index: number): PlaneObstacle {
  const gap = planeGap(score);
  return { x, gapY: drawGapY(prev ? prev.gapY : null, gap, rng), gap, kind: prev ? (prev.kind + 1) % 2 : 0, index, scored: false };
}

export function newPlaneGame(width: number): PlaneState {
  return { phase: "ready", width, y: 50, vy: 0, score: 0, obstacles: [], distance: 0, spawned: 0 };
}

/** Ready: start with a flap. Flying: flap. Paused: resume without a flap. Over: nothing. */
export function planeTap(s: PlaneState, rng: Rng): PlaneState {
  if (s.phase === "ready") {
    const first = obstacleAfter(undefined, s.width + planeSpeed(0) * FIRST_OBSTACLE_DELAY, 0, rng, 0);
    return { ...s, phase: "flying", vy: PLANE_FLAP_SPEED, obstacles: [first], spawned: 1 };
  }
  if (s.phase === "flying") return { ...s, vy: PLANE_FLAP_SPEED };
  if (s.phase === "paused") return { ...s, phase: "flying" };
  return s;
}

export function planePause(s: PlaneState): PlaneState {
  return s.phase === "flying" ? { ...s, phase: "paused" } : s;
}

function hits(s: PlaneState, o: PlaneObstacle): boolean {
  const px = planeX(s.width);
  const w = PLANE_HITBOX.w / 2;
  const h = PLANE_HITBOX.h / 2;
  if (px + w <= o.x || px - w >= o.x + OBSTACLE_WIDTH) return false;
  return s.y - h < o.gapY - o.gap / 2 || s.y + h > o.gapY + o.gap / 2;
}

export function stepPlane(state: PlaneState, dt: number, rng: Rng): PlaneState {
  if (state.phase !== "flying") return state;
  const total = clamp(dt, 0, MAX_DT);
  if (total === 0) return state;
  const n = Math.ceil(total / MAX_SUBSTEP - 1e-9);
  const h = total / n;
  const s: PlaneState = { ...state, obstacles: state.obstacles.map((o) => ({ ...o })) };
  const px = planeX(s.width);
  for (let i = 0; i < n; i++) {
    s.vy = Math.min(PLANE_MAX_FALL, s.vy + PLANE_GRAVITY * h);
    s.y += s.vy * h;
    const dx = planeSpeed(s.score) * h;
    s.distance += dx;
    for (const o of s.obstacles) o.x -= dx;
    if (s.y - PLANE_HITBOX.h / 2 <= 0 || s.y + PLANE_HITBOX.h / 2 >= PLANE_WORLD_HEIGHT) return { ...s, phase: "over" };
    for (const o of s.obstacles) {
      if (hits(s, o)) return { ...s, phase: "over" };
      if (!o.scored && px - PLANE_HITBOX.w / 2 > o.x + OBSTACLE_WIDTH) {
        o.scored = true;
        s.score += 1;
      }
    }
    s.obstacles = s.obstacles.filter((o) => o.x + OBSTACLE_WIDTH >= 0);
    let last = s.obstacles.at(-1);
    while (!last || last.x < s.width) {
      const next = obstacleAfter(last, last ? last.x + OBSTACLE_SPACING : s.width, s.score, rng, s.spawned);
      s.obstacles.push(next);
      s.spawned += 1;
      last = next;
    }
  }
  return s;
}

export function parseSavedBest(raw: string | null): number {
  if (raw === null || raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/** What one screen knows about the best: the highest score read or played, and whether any read succeeded. */
export interface PlaneSessionBest {
  best: number;
  known: boolean;
}

export const newPlaneSessionBest = (): PlaneSessionBest => ({ best: 0, known: false });

/** The session after a storage read: `null` is a read that failed. */
export function planeSessionRead(session: PlaneSessionBest, stored: number | null): PlaneSessionBest {
  return stored === null ? session : { best: Math.max(session.best, stored), known: true };
}

/**
 * A game that scored `score` ends, with the stored best just read (`null` if that read failed).
 * A new best is claimed only once some read has succeeded, so a broken read never passes for an
 * empty record; `save` is the session best to write when it beats what is stored.
 */
export function planeBestAfter(
  score: number,
  session: PlaneSessionBest,
  stored: number | null
): { session: PlaneSessionBest; isNew: boolean; save: number | null } {
  const known = session.known || stored !== null;
  const top = Math.max(session.best, stored ?? 0);
  const best = Math.max(top, score);
  const beats = best > (stored ?? session.best);
  return { session: { best, known }, isNew: known && score > top, save: known && beats ? best : null };
}

export const PLANE_COLORS = {
  light: { paper: "#fdfbf3", line: "#c9d8ee", margin: "#e8a3a3", ink: "#3b3b3b", plane: "#ffffff", score: "#1f2937" },
  dark: { paper: "#141d33", line: "#26355a", margin: "#7a3b4a", ink: "#d9dfeb", plane: "#eef2f8", score: "#f3f4f6" },
} as const;
export const PLANE_PENCILS = ["#f2b134", "#e4572e", "#4c9f70", "#3d7dd8"] as const;
export const PLANE_RULER = "#d9b77e";

/** The pencil colour of one half of an obstacle, fixed for the obstacle's whole flight. */
export function planePencilColour(o: Pick<PlaneObstacle, "index">, top: boolean): string {
  const n = Math.floor(o.index / 2) + (top ? 0 : 1);
  return PLANE_PENCILS[n % PLANE_PENCILS.length];
}
