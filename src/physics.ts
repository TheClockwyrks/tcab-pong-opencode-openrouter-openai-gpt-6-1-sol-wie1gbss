import type { DeepReadonly } from "ts-essentials";
import type {
  BallState,
  CaromState,
  ObstacleState,
  PaddleState,
  Side,
} from "./game";
import * as C from "./constants";
import { clamp } from "./math";

// Only this new, frame-local working value is mutable. No input state is written.
type Flight = { x: number; y: number; vx: number; vy: number; spin: number };
function paddleContact(
  b: Flight,
  p: DeepReadonly<PaddleState>,
  side: Side,
  cues: Set<C.CueName>,
): void {
  const x0 = side === "left" ? C.P1_X0 : C.P2_X0;
  const x1 = side === "left" ? C.P1_X1 : C.P2_X1;
  const y0 = p.cy - C.PADDLE_HALF;
  const y1 = p.cy + C.PADDLE_HALF;
  const depths = [
    b.x - (x0 - C.BALL_R),
    x1 + C.BALL_R - b.x,
    b.y - (y0 - C.BALL_R),
    y1 + C.BALL_R - b.y,
  ];
  if (depths.some((d) => d <= 0)) return;
  const face = depths.indexOf(Math.min(...depths));
  if (face < 2) {
    const theta =
      clamp((b.y - p.cy) / C.PADDLE_HALF, -1, 1) * C.MAX_BOUNCE_ANGLE;
    const speed = Math.min(Math.hypot(b.vx, b.vy) * C.SPEED_MULT, C.SPEED_CAP);
    b.vx = (side === "left" ? 1 : -1) * speed * Math.cos(theta);
    b.vy = speed * Math.sin(theta);
    b.spin = clamp(
      b.spin + p.vy * C.SPIN_FROM_PADDLE,
      -C.SPIN_CLAMP,
      C.SPIN_CLAMP,
    );
    b.x = side === "left" ? C.P1_X1 + C.BALL_R : C.P2_X0 - C.BALL_R;
    cues.add(C.CUES.paddleHit);
  } else {
    b.y = face === 2 ? y0 - C.BALL_R : y1 + C.BALL_R;
    if ((face === 2 && b.vy > 0) || (face === 3 && b.vy < 0)) {
      b.vy = -b.vy;
      cues.add(C.CUES.wallBounce);
    }
  }
}
function obstacleContact(
  b: Flight,
  o: DeepReadonly<ObstacleState>,
  cues: Set<C.CueName>,
): void {
  const cos = Math.cos(o.theta),
    sin = Math.sin(o.theta);
  const dx = b.x - o.cx,
    dy = b.y - o.cy;
  const lx = dx * cos + dy * sin,
    ly = -dx * sin + dy * cos;
  const qx = clamp(lx, -C.OBSTACLE_HW, C.OBSTACLE_HW);
  const qy = clamp(ly, -C.OBSTACLE_HH, C.OBSTACLE_HH);
  const distance = Math.hypot(lx - qx, ly - qy);
  if (distance >= C.BALL_R) return;
  let nx: number, ny: number, push: number;
  if (distance > 0) {
    nx = (lx - qx) / distance;
    ny = (ly - qy) / distance;
    push = C.BALL_R - distance;
  } else {
    const px = C.OBSTACLE_HW - Math.abs(lx),
      py = C.OBSTACLE_HH - Math.abs(ly);
    nx = px <= py ? (lx < 0 ? -1 : 1) : 0;
    ny = px <= py ? 0 : ly < 0 ? -1 : 1;
    push = C.BALL_R + Math.min(px, py);
  }
  const wx = nx * cos - ny * sin,
    wy = nx * sin + ny * cos;
  const dot = b.vx * wx + b.vy * wy;
  if (dot < 0) {
    b.vx -= 2 * dot * wx;
    b.vy -= 2 * dot * wy;
    cues.add(C.CUES.obstacleBounce);
  }
  b.x += wx * push;
  b.y += wy * push;
}
export function flyBall(
  ball: DeepReadonly<BallState>,
  paddles: DeepReadonly<CaromState["paddles"]>,
  obstacles: readonly DeepReadonly<ObstacleState>[],
  dt: number,
  cues: Set<C.CueName>,
): BallState {
  const b: Flight = { ...ball };
  const n = Math.max(
    1,
    Math.ceil((Math.hypot(b.vx, b.vy) * dt) / C.MAX_SUBSTEP),
  );
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 0) {
      const angle = (b.spin / speed) * h;
      const cos = Math.cos(angle),
        sin = Math.sin(angle);
      const vx = b.vx * cos - b.vy * sin;
      b.vy = b.vx * sin + b.vy * cos;
      b.vx = vx;
    }
    b.spin *= Math.pow(0.5, h / C.SPIN_HALFLIFE);
    b.x += b.vx * h;
    b.y += b.vy * h;
    if (b.y - C.BALL_R < 0 && b.vy < 0) {
      b.y = C.BALL_R;
      b.vy = -b.vy;
      cues.add(C.CUES.wallBounce);
    } else if (b.y + C.BALL_R > C.FIELD_H && b.vy > 0) {
      b.y = C.FIELD_H - C.BALL_R;
      b.vy = -b.vy;
      cues.add(C.CUES.wallBounce);
    }
    paddleContact(b, paddles.left, "left", cues);
    paddleContact(b, paddles.right, "right", cues);
    for (const obstacle of obstacles) obstacleContact(b, obstacle, cues);
  }
  return { ...ball, ...b };
}
