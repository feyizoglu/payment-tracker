// Bill Hunt: a slingshot coin-thrower. Pure rules shared by web and mobile.
// y points down: the board is 70 wide, row 0 at the top, the floor at y = 90; cell row·7+col covers
// x in [col·10, col·10+10) and y in [row·10, row·10+10).

export const HUNT_COLS = 7;
export const HUNT_ROWS = 9;
export const HUNT_CELL = 10;
export const HUNT_W = HUNT_COLS * HUNT_CELL;
export const HUNT_H = HUNT_ROWS * HUNT_CELL;
/** Room under the floor for the launcher. */
export const HUNT_FOOT = 8;
export const COIN_R = 1.2;
export const COIN_SPEED = 90;
export const LAUNCH_GAP = 0.08;
export const SUB_DT = 1 / 240;
export const MAX_DT = 1 / 30;
export const MIN_ANGLE = (8 * Math.PI) / 180;
export const MIN_PULL = 4;
export const SPEED_UP = 3;
export const THROW_CAP = 30;
export const COIN_CAP = 120;
export const POWER_CHANCE = 0.4;
export const DOUBLE_CHANCE = 0.2;
export const CAMPAIGN_HIT = 3;
/** A bill's box is its cell inset by this on every side. */
export const BILL_GAP = 0.6;
export const HUNT_BEST_KEY = "bill-hunt-best";
export const HUNT_OVER_GUARD_MS = 500;

const DANGER_ROW = HUNT_ROWS - 1;
const MIN_VY = COIN_SPEED * Math.sin(MIN_ANGLE);
const DEG = Math.PI / 180;
// Sub-step accumulation drifts by float error; this keeps an exact multiple of SUB_DT exact.
const EPS = 1e-9;

export type HuntPhase = "ready" | "aiming" | "throwing" | "over";
export type HuntItemKind = "bill" | "plus" | "rowCut" | "colCut" | "deflect" | "campaign";

export interface HuntItem {
  id: number;
  kind: HuntItemKind;
  col: number;
  row: number;
  /** A bill's amount; 0 for everything else. */
  value: number;
  double: boolean;
  /** A cut or deflector a coin entered this month. */
  used: boolean;
}

export interface HuntCoin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  down: boolean;
  /** The cell the centre is in, -1 outside the grid; an item fires when this changes to its cell. */
  cell: number;
}

export interface HuntThrow {
  coins: HuntCoin[];
  total: number;
  fired: number;
  /** Game seconds since the throw began. */
  t: number;
  acc: number;
  speed: 1 | typeof SPEED_UP;
  firstDown: number | null;
  gained: number;
  angle: number;
}

export interface HuntState {
  phase: HuntPhase;
  month: number;
  /** Months completed. */
  score: number;
  coins: number;
  launcher: number;
  items: HuntItem[];
  nextId: number;
  shot: HuntThrow | null;
  /** Goes up whenever an item changes or disappears, so screens redraw the board only then. */
  version: number;
}

type Rng = () => number;

const STAYS_UNTIL_USED: ReadonlySet<HuntItemKind> = new Set(["rowCut", "colCut", "deflect"]);

function shuffled(n: number, rng: Rng): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickPower(rng: Rng): HuntItemKind {
  const r = rng() * 7;
  if (r < 2) return "rowCut";
  if (r < 4) return "colCut";
  if (r < 6) return "deflect";
  return "campaign";
}

/** A new top row for `month`, with ids from `startId`. */
export function spawnHuntRow(month: number, rng: Rng, startId: number): HuntItem[] {
  const cols = shuffled(HUNT_COLS, rng);
  const bills = 1 + Math.floor(rng() * Math.min(4, 2 + Math.floor(month / 8)));
  const items: HuntItem[] = [];
  let id = startId;
  const add = (kind: HuntItemKind, col: number, value = 0, double = false) =>
    items.push({ id: id++, kind, col, row: 0, value, double, used: false });
  for (let i = 0; i < bills; i++) {
    const double = rng() < DOUBLE_CHANCE;
    add("bill", cols[i], double ? month * 2 : month, double);
  }
  add("plus", cols[bills]);
  if (rng() < POWER_CHANCE) add(pickPower(rng), cols[bills + 1]);
  return items;
}

export function newHuntGame(rng: Rng): HuntState {
  const items = spawnHuntRow(1, rng, 1);
  return { phase: "ready", month: 1, score: 0, coins: 1, launcher: HUNT_W / 2, items, nextId: 1 + items.length, shot: null, version: 0 };
}

export const huntStart = (s: HuntState): HuntState => (s.phase === "ready" ? { ...s, phase: "aiming" } : s);

/** The throw angle above the horizontal for a pull of (dx, dy) world units, or null when it throws nothing. */
export function huntAim(dx: number, dy: number): number | null {
  if (dy <= 0 || Math.hypot(dx, dy) < MIN_PULL) return null;
  const angle = Math.atan2(dy, -dx);
  return Math.min(Math.PI - MIN_ANGLE, Math.max(MIN_ANGLE, angle));
}

const cellOf = (x: number, y: number): number => {
  const col = Math.floor(x / HUNT_CELL);
  const row = Math.floor(y / HUNT_CELL);
  return col < 0 || col >= HUNT_COLS || row < 0 || row >= HUNT_ROWS ? -1 : row * HUNT_COLS + col;
};

function overlapsBill(x: number, y: number, col: number, row: number): boolean {
  const x0 = col * HUNT_CELL + BILL_GAP;
  const y0 = row * HUNT_CELL + BILL_GAP;
  const x1 = x0 + HUNT_CELL - 2 * BILL_GAP;
  const y1 = y0 + HUNT_CELL - 2 * BILL_GAP;
  const nx = x < x0 ? x0 : x > x1 ? x1 : x;
  const ny = y < y0 ? y0 : y > y1 ? y1 : y;
  return (x - nx) ** 2 + (y - ny) ** 2 < COIN_R * COIN_R;
}

interface Board {
  grid: (HuntItem | null)[];
  /** Per cell, the coin move that last hit its bill, so a corner costs a bill 1 per sub-step. */
  lastHit: number[];
  stamp: number;
  gone: Set<number>;
  changed: boolean;
}

function boardOf(items: HuntItem[]): Board {
  const grid: (HuntItem | null)[] = Array(HUNT_COLS * HUNT_ROWS).fill(null);
  for (const i of items) if (i.row >= 0 && i.row < HUNT_ROWS) grid[i.row * HUNT_COLS + i.col] = i;
  return { grid, lastHit: Array(HUNT_COLS * HUNT_ROWS).fill(-1), stamp: 0, gone: new Set(), changed: false };
}

function payBill(b: Board, bill: HuntItem, amount: number) {
  bill.value -= amount;
  b.changed = true;
  if (bill.value <= 0) {
    b.gone.add(bill.id);
    b.grid[bill.row * HUNT_COLS + bill.col] = null;
  }
}

/** Tries to move the coin by (dx, dy); on a wall, the ceiling or a bill it stays put and reports a bounce. */
function tryMove(coin: HuntCoin, b: Board, dx: number, dy: number, pay: boolean): boolean {
  const nx = coin.x + dx;
  const ny = coin.y + dy;
  let bounce = nx - COIN_R < 0 || nx + COIN_R > HUNT_W || ny - COIN_R < 0;
  const c0 = Math.max(0, Math.floor((nx - COIN_R) / HUNT_CELL));
  const c1 = Math.min(HUNT_COLS - 1, Math.floor((nx + COIN_R) / HUNT_CELL));
  const r0 = Math.max(0, Math.floor((ny - COIN_R) / HUNT_CELL));
  const r1 = Math.min(HUNT_ROWS - 1, Math.floor((ny + COIN_R) / HUNT_CELL));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const cell = r * HUNT_COLS + c;
      const item = b.grid[cell];
      if (!item || item.kind !== "bill" || !overlapsBill(nx, ny, c, r)) continue;
      bounce = true;
      if (pay && b.lastHit[cell] !== b.stamp) {
        b.lastHit[cell] = b.stamp;
        payBill(b, item, 1);
      }
    }
  }
  if (!bounce) {
    coin.x = nx;
    coin.y = ny;
  }
  return bounce;
}

function keepSteep(coin: HuntCoin) {
  if (Math.abs(coin.vy) >= MIN_VY) return;
  coin.vy = coin.vy > 0 ? MIN_VY : -MIN_VY;
  coin.vx = (coin.vx >= 0 ? 1 : -1) * Math.sqrt(COIN_SPEED * COIN_SPEED - MIN_VY * MIN_VY);
}

const reachesFloor = (coin: HuntCoin, dy: number) => coin.vy > 0 && coin.y + dy + COIN_R >= HUNT_H;

function enter(b: Board, shot: HuntThrow, coin: HuntCoin, cell: number, coinsAtStart: number, rng: Rng) {
  const item = b.grid[cell];
  if (!item || item.kind === "bill") return;
  const bills = (keep: (i: HuntItem) => boolean) =>
    b.grid.filter((i): i is HuntItem => i !== null && i.kind === "bill" && keep(i));
  switch (item.kind) {
    case "plus":
      if (coinsAtStart + shot.gained < COIN_CAP) shot.gained += 1;
      b.gone.add(item.id);
      b.grid[cell] = null;
      b.changed = true;
      return;
    case "rowCut":
      for (const bill of bills((i) => i.row === item.row)) payBill(b, bill, 1);
      break;
    case "colCut":
      for (const bill of bills((i) => i.col === item.col)) payBill(b, bill, 1);
      break;
    case "deflect": {
      const a = (20 + rng() * 140) * DEG;
      coin.vx = Math.cos(a) * COIN_SPEED;
      coin.vy = -Math.sin(a) * COIN_SPEED;
      break;
    }
    case "campaign":
      for (const bill of bills((i) => Math.abs(i.row - item.row) <= 1 && Math.abs(i.col - item.col) <= 1)) payBill(b, bill, CAMPAIGN_HIT);
      b.gone.add(item.id);
      b.grid[cell] = null;
      b.changed = true;
      return;
  }
  if (!item.used) {
    item.used = true;
    b.changed = true;
  }
}

function moveCoin(coin: HuntCoin, b: Board, shot: HuntThrow, coinsAtStart: number, rng: Rng) {
  b.stamp += 1;
  const bx = tryMove(coin, b, coin.vx * SUB_DT, 0, true);
  if (bx) coin.vx = -coin.vx;
  const dy = coin.vy * SUB_DT;
  if (reachesFloor(coin, dy)) {
    coin.y = HUNT_H - COIN_R;
    coin.down = true;
    shot.firstDown ??= coin.x;
    return;
  }
  const by = tryMove(coin, b, 0, dy, true);
  if (by) coin.vy = -coin.vy;
  if (bx || by) keepSteep(coin);
  const cell = cellOf(coin.x, coin.y);
  if (cell !== coin.cell) {
    coin.cell = cell;
    if (cell >= 0) enter(b, shot, coin, cell, coinsAtStart, rng);
  }
}

const launchY = HUNT_H - COIN_R;

/** Where the aim line ends: a ghost coin, moved like a thrown one, at its first bounce or on the floor. */
export function huntAimEnd(s: HuntState, angle: number): { x: number; y: number } {
  const b = boardOf(s.items);
  const coin: HuntCoin = { x: s.launcher, y: launchY, vx: Math.cos(angle) * COIN_SPEED, vy: -Math.sin(angle) * COIN_SPEED, down: false, cell: -1 };
  for (let i = 0; i < 4000; i++) {
    if (tryMove(coin, b, coin.vx * SUB_DT, 0, false)) break;
    const dy = coin.vy * SUB_DT;
    if (reachesFloor(coin, dy) || tryMove(coin, b, 0, dy, false)) break;
  }
  return { x: coin.x, y: coin.y };
}

export function huntFire(s: HuntState, angle: number): HuntState {
  if (s.phase !== "aiming") return s;
  return {
    ...s,
    phase: "throwing",
    shot: { coins: [], total: s.coins, fired: 0, t: 0, acc: 0, speed: 1, firstDown: null, gained: 0, angle },
  };
}

export const huntSpeedUp = (s: HuntState): HuntState =>
  s.phase === "throwing" && s.shot ? { ...s, shot: { ...s.shot, speed: SPEED_UP } } : s;

function endMonth(s: HuntState, items: HuntItem[], shot: HuntThrow, rng: Rng): HuntState {
  const coins = Math.min(COIN_CAP, s.coins + shot.gained);
  const launcher = shot.firstDown ?? s.launcher;
  const score = s.month;
  const moved = items
    .filter((i) => !(i.used && STAYS_UNTIL_USED.has(i.kind)))
    .map((i) => ({ ...i, row: i.row + 1 }))
    .filter((i) => i.kind === "bill" || i.row < DANGER_ROW);
  const version = s.version + 1;
  if (moved.some((i) => i.kind === "bill" && i.row >= DANGER_ROW)) {
    return { ...s, phase: "over", score, coins, launcher, items: moved, shot: null, version };
  }
  const month = s.month + 1;
  const row = spawnHuntRow(month, rng, s.nextId);
  return { phase: "aiming", month, score, coins, launcher, items: [...moved, ...row], nextId: s.nextId + row.length, shot: null, version };
}

/** Ends the throw now: coins still in the air or not yet thrown count as down, their hits never happen. */
export const huntCallBack = (s: HuntState, rng: Rng): HuntState =>
  s.phase === "throwing" && s.shot ? endMonth(s, s.items, s.shot, rng) : s;

export function stepHunt(s: HuntState, dt: number, rng: Rng): HuntState {
  if (s.phase !== "throwing" || !s.shot) return s;
  const items = s.items.map((i) => ({ ...i }));
  const b = boardOf(items);
  const shot: HuntThrow = { ...s.shot, coins: s.shot.coins.map((c) => ({ ...c })) };
  const alive = () => (b.gone.size ? items.filter((i) => !b.gone.has(i.id)) : items);
  shot.acc += Math.min(Math.max(dt, 0), MAX_DT) * shot.speed;
  while (shot.acc >= SUB_DT - EPS) {
    shot.acc -= SUB_DT;
    shot.t += SUB_DT;
    while (shot.fired < shot.total && shot.t >= shot.fired * LAUNCH_GAP - EPS) {
      const vx = Math.cos(shot.angle) * COIN_SPEED;
      const vy = -Math.sin(shot.angle) * COIN_SPEED;
      shot.coins.push({ x: s.launcher, y: launchY, vx, vy, down: false, cell: cellOf(s.launcher, launchY) });
      shot.fired += 1;
    }
    for (const coin of shot.coins) if (!coin.down) moveCoin(coin, b, shot, s.coins, rng);
    const done = shot.fired === shot.total && shot.coins.every((c) => c.down);
    if (done || shot.t >= THROW_CAP - EPS) return endMonth({ ...s, version: s.version + (b.changed ? 1 : 0) }, alive(), shot, rng);
  }
  return { ...s, items: b.changed ? alive() : s.items, shot, version: b.changed ? s.version + 1 : s.version };
}

export function huntViewport(width: number, height: number): { scale: number; left: number; top: number } {
  const scale = Math.min(width / HUNT_W, height / (HUNT_H + HUNT_FOOT));
  return { scale, left: (width - HUNT_W * scale) / 2, top: (height - (HUNT_H + HUNT_FOOT) * scale) / 2 };
}

const BILL_SHADES = ["#fde7c3", "#fbcf8f", "#f7a95c", "#ef7f45", "#e0573a"] as const;

/** A bill's fill: darker the more it is worth against the most a bill can be worth this month. */
export function huntBillShade(value: number, month: number): string {
  const ratio = Math.min(1, value / (2 * Math.max(1, month)));
  return BILL_SHADES[Math.min(BILL_SHADES.length - 1, Math.floor(ratio * BILL_SHADES.length))];
}

export const HUNT_ICONS: Record<Exclude<HuntItemKind, "bill">, string> = {
  plus: "+1",
  rowCut: "↔",
  colCut: "↕",
  deflect: "🔀",
  campaign: "💥",
};

export const HUNT_COLORS = {
  light: {
    bg: "#f6f1e7",
    grid: "rgba(0,0,0,0.05)",
    floor: "#c9b896",
    ink: "#1f2937",
    billInk: "#1f2937",
    doubleEdge: "#7c2d12",
    coin: "#f2b705",
    coinEdge: "#a87800",
    aim: "rgba(31,41,55,0.5)",
    power: "#2563eb",
    powerUsed: "#93c5fd",
    powerInk: "#ffffff",
  },
  dark: {
    bg: "#141d33",
    grid: "rgba(255,255,255,0.05)",
    floor: "#3a4766",
    ink: "#f3f4f6",
    billInk: "#1f2937",
    doubleEdge: "#fca5a5",
    coin: "#f6c945",
    coinEdge: "#c49214",
    aim: "rgba(243,244,246,0.55)",
    power: "#3b82f6",
    powerUsed: "#1e3a8a",
    powerInk: "#ffffff",
  },
} as const;
