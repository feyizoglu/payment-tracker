import {
  OBSTACLE_WIDTH,
  PLANE_COLORS,
  PLANE_MARGIN_EVERY,
  PLANE_RULER,
  PLANE_WORLD_HEIGHT,
  planeAngle,
  planePencilColour,
  planeX,
  type PlaneObstacle,
  type PlaneState,
} from "@/lib/paper-plane";

/** Pixels per world unit, and where the world's left edge sits. */
export function planeViewport(worldWidth: number, cssWidth: number, cssHeight: number) {
  const scale = cssHeight / PLANE_WORLD_HEIGHT;
  return { scale, left: (cssWidth - worldWidth * scale) / 2 };
}

const TIP = 5;

function drawPiece(ctx: CanvasRenderingContext2D, o: PlaneObstacle, top: boolean, ink: string) {
  const x = o.x;
  const edge = top ? o.gapY - o.gap / 2 : o.gapY + o.gap / 2;
  const from = top ? 0 : PLANE_WORLD_HEIGHT;
  if (o.kind === 1) {
    ctx.fillStyle = PLANE_RULER;
    ctx.fillRect(x, Math.min(from, edge), OBSTACLE_WIDTH, Math.abs(edge - from));
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    for (let y = Math.min(from, edge) + 2; y < Math.max(from, edge); y += 2) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.round(y) % 10 === 0 ? 3.5 : 2), y);
    }
    ctx.stroke();
    return;
  }
  const bodyEnd = top ? edge - TIP : edge + TIP;
  ctx.fillStyle = planePencilColour(o, top);
  ctx.fillRect(x, Math.min(from, bodyEnd), OBSTACLE_WIDTH, Math.abs(bodyEnd - from));
  ctx.fillStyle = "#f3d9b1";
  ctx.beginPath();
  ctx.moveTo(x, bodyEnd);
  ctx.lineTo(x + OBSTACLE_WIDTH, bodyEnd);
  ctx.lineTo(x + OBSTACLE_WIDTH / 2, edge);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(x + OBSTACLE_WIDTH * 0.35, top ? edge - 1.6 : edge + 1.6);
  ctx.lineTo(x + OBSTACLE_WIDTH * 0.65, top ? edge - 1.6 : edge + 1.6);
  ctx.lineTo(x + OBSTACLE_WIDTH / 2, edge);
  ctx.closePath();
  ctx.fill();
}

/** Draws one frame. The canvas is sized in CSS pixels; the caller sets the device-pixel transform. */
export function drawPlaneScene(ctx: CanvasRenderingContext2D, s: PlaneState, cssWidth: number, cssHeight: number, dark: boolean) {
  const c = dark ? PLANE_COLORS.dark : PLANE_COLORS.light;
  ctx.fillStyle = c.paper;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  const { scale, left } = planeViewport(s.width, cssWidth, cssHeight);

  ctx.save();
  ctx.translate(left, 0);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, 0, s.width, PLANE_WORLD_HEIGHT);
  ctx.clip();
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  for (let y = 6; y < PLANE_WORLD_HEIGHT; y += 6) {
    ctx.moveTo(0, y);
    ctx.lineTo(s.width, y);
  }
  ctx.stroke();
  const margin = PLANE_MARGIN_EVERY - (s.distance % PLANE_MARGIN_EVERY) - 10;
  if (margin > -1 && margin < s.width + 1) {
    ctx.strokeStyle = c.margin;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(margin, 0);
    ctx.lineTo(margin, PLANE_WORLD_HEIGHT);
    ctx.stroke();
  }
  for (const o of s.obstacles) {
    drawPiece(ctx, o, true, c.ink);
    drawPiece(ctx, o, false, c.ink);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(left + planeX(s.width) * scale, s.y * scale);
  ctx.rotate((planeAngle(s.vy) * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.fillStyle = c.plane;
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(-5, -3);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-5, 2.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(-3, 0);
  ctx.stroke();
  ctx.restore();
}
