import { BOOK_H, TOWER_COLORS, TOWER_WIDTH, towerBookColour, type TowerState } from "@/lib/book-tower";

const DESK = 12;
/** Narrower books have no room for the spine stripes. */
export const MIN_STRIPED = 4;

/** Pixels per unit, the world's left edge, and the desk surface's y in pixels. */
export function towerViewport(cssWidth: number, cssHeight: number) {
  const scale = Math.min(cssWidth / TOWER_WIDTH, cssHeight / 110);
  return { scale, left: (cssWidth - TOWER_WIDTH * scale) / 2, desk: cssHeight - DESK * scale };
}

function book(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, colour: string, stripe: string) {
  ctx.fillStyle = colour;
  ctx.fillRect(x, y - BOOK_H, w, BOOK_H);
  if (w < MIN_STRIPED) return;
  ctx.fillStyle = stripe;
  for (const at of [Math.min(3, w / 4), Math.max(w - 4, (3 * w) / 4)]) ctx.fillRect(x + at, y - BOOK_H + 1, 1, BOOK_H - 2);
}

export function drawTowerScene(ctx: CanvasRenderingContext2D, s: TowerState, cssWidth: number, cssHeight: number, dark: boolean) {
  const c = dark ? TOWER_COLORS.dark : TOWER_COLORS.light;
  ctx.fillStyle = c.wall;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  const { scale, left, desk } = towerViewport(cssWidth, cssHeight);
  ctx.save();
  ctx.translate(left, desk + s.camera * scale);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, -10000, TOWER_WIDTH, 10000 + DESK + 1);
  ctx.clip();
  ctx.fillStyle = c.desk;
  ctx.fillRect(0, 0, TOWER_WIDTH, DESK);
  ctx.fillStyle = c.deskEdge;
  ctx.fillRect(0, 0, TOWER_WIDTH, 1.5);
  // The view ends DESK units below the camera, so books down there still show.
  const lowest = Math.max(0, Math.floor((s.camera - DESK) / BOOK_H));
  for (let i = lowest; i < s.stack.length; i++) {
    const b = s.stack[i];
    book(ctx, b.x, -i * BOOK_H, b.w, towerBookColour(b.index), c.stripe);
  }
  if (s.phase === "playing" || s.phase === "paused") {
    const w = s.stack[s.stack.length - 1].w;
    book(ctx, s.slider.x - w / 2, -s.stack.length * BOOK_H, w, towerBookColour(s.stack.length), c.stripe);
  }
  for (const p of s.pieces) {
    ctx.save();
    ctx.translate(p.x + p.w / 2, -p.y - BOOK_H / 2);
    ctx.rotate((p.angle * Math.PI) / 180);
    ctx.fillStyle = towerBookColour(p.index);
    ctx.fillRect(-p.w / 2, -BOOK_H / 2, p.w, BOOK_H);
    ctx.restore();
  }
  ctx.restore();
}
