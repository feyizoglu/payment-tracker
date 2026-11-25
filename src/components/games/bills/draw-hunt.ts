import {
  BILL_GAP,
  COIN_R,
  HUNT_CELL,
  HUNT_COLORS,
  HUNT_COLS,
  HUNT_H,
  HUNT_ICONS,
  HUNT_ROWS,
  HUNT_W,
  huntAimEnd,
  huntBillShade,
  huntViewport,
  type HuntState,
} from "@/lib/bill-hunt";

function coin(ctx: CanvasRenderingContext2D, x: number, y: number, fill: string, edge: string) {
  ctx.beginPath();
  ctx.arc(x, y, COIN_R, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 0.3;
  ctx.strokeStyle = edge;
  ctx.stroke();
}

/** Paints the board in CSS pixels; `aim` is the angle being pulled, if any. */
export function drawHuntScene(ctx: CanvasRenderingContext2D, s: HuntState, cssWidth: number, cssHeight: number, dark: boolean, aim: number | null) {
  const c = dark ? HUNT_COLORS.dark : HUNT_COLORS.light;
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  const { scale, left, top } = huntViewport(cssWidth, cssHeight);
  ctx.save();
  ctx.translate(left, top);
  ctx.scale(scale, scale);

  ctx.fillStyle = c.grid;
  for (let col = 1; col < HUNT_COLS; col++) ctx.fillRect(col * HUNT_CELL - 0.1, 0, 0.2, HUNT_H);
  for (let row = 1; row < HUNT_ROWS; row++) ctx.fillRect(0, row * HUNT_CELL - 0.1, HUNT_W, 0.2);
  ctx.fillStyle = c.floor;
  ctx.fillRect(0, HUNT_H, HUNT_W, 0.6);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const item of s.items) {
    const cx = item.col * HUNT_CELL + HUNT_CELL / 2;
    const cy = item.row * HUNT_CELL + HUNT_CELL / 2;
    if (item.kind === "bill") {
      const size = HUNT_CELL - 2 * BILL_GAP;
      const x = item.col * HUNT_CELL + BILL_GAP;
      const y = item.row * HUNT_CELL + BILL_GAP;
      ctx.fillStyle = huntBillShade(item.value, s.month);
      ctx.fillRect(x, y, size, size);
      if (item.double) {
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = c.doubleEdge;
        ctx.strokeRect(x + 0.3, y + 0.3, size - 0.6, size - 0.6);
      }
      ctx.fillStyle = c.billInk;
      ctx.font = item.value >= 100 ? "bold 3.2px sans-serif" : "bold 4px sans-serif";
      ctx.fillText(String(item.value), cx, cy);
      continue;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, item.kind === "plus" ? 2.4 : 3, 0, Math.PI * 2);
    ctx.fillStyle = item.kind === "plus" ? c.coin : item.used ? c.powerUsed : c.power;
    ctx.fill();
    ctx.fillStyle = item.kind === "plus" ? c.billInk : c.powerInk;
    ctx.font = "bold 2.6px sans-serif";
    ctx.fillText(HUNT_ICONS[item.kind], cx, cy);
  }

  if (s.phase === "aiming" || s.phase === "ready") coin(ctx, s.launcher, HUNT_H - COIN_R, c.coin, c.coinEdge);
  if (s.phase === "aiming" && aim !== null) {
    const end = huntAimEnd(s, aim);
    ctx.save();
    ctx.setLineDash([1, 1.5]);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = c.aim;
    ctx.beginPath();
    ctx.moveTo(s.launcher, HUNT_H - COIN_R);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }
  for (const k of s.shot?.coins ?? []) coin(ctx, k.x, k.y, c.coin, c.coinEdge);
  ctx.restore();
}
