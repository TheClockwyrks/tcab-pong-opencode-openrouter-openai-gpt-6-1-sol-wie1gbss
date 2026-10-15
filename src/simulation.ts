import type { DeepReadonly } from "ts-essentials";
import type { UpdateApi } from "@clockwyrks/simple-2d";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
  Side,
} from "./game";
import * as C from "./constants";
import { flyBall } from "./physics";
import { clamp } from "./math";

export const drawSign = (): 1 | -1 => (Math.random() < 0.5 ? -1 : 1);
export function parkedBall(): BallState {
  return {
    x: C.FIELD_CX,
    y: C.FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: C.HOLD_TIME,
    serveSign: drawSign(),
    trail: [],
  };
}
export function obstaclePose(index: number, t: number): ObstacleState {
  const base = C.OBSTACLE_CENTERS[index];
  if (!base) throw new RangeError(`No obstacle at index ${index}`);
  return {
    index,
    cx: base.x,
    cy:
      base.y +
      (index === 0 ? 1 : -1) *
        C.OBSTACLE_SWAY_AMP *
        Math.sin((2 * Math.PI * t) / C.OBSTACLE_SWAY_PERIOD),
    theta: C.OBSTACLE_SPIN_RATE * t,
  };
}
export function openingState(muted = false): CaromState {
  const paddle: PaddleState = {
    cy: C.FIELD_CY,
    vy: 0,
    driven: false,
    drivenVy: 0,
  };
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: { ...paddle }, right: { ...paddle } },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: C.OBSTACLE_CENTERS.map((_, i) => obstaclePose(i, 0)),
    obstacleClock: 0,
    obstacleClockRunning: true,
    simTime: 0,
    muted,
  };
}
export function returnTitle(s: DeepReadonly<CaromState>): CaromState {
  return {
    ...openingState(s.muted),
    titleIndex: s.titleIndex,
    menuIndex: s.titleIndex,
    simTime: s.simTime,
  };
}
export function startMatch(
  s: DeepReadonly<CaromState>,
  mode: Mode,
): CaromState {
  return {
    ...s,
    screen: "countdown",
    mode,
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...s.paddles.left, cy: C.FIELD_CY, vy: 0 },
      right: { ...s.paddles.right, cy: C.FIELD_CY, vy: 0 },
    },
    obstacleClock: 0,
    obstacleClockRunning: true,
    obstacles: s.obstacles.map((o) => obstaclePose(o.index, 0)),
  };
}
function movePaddle(
  s: DeepReadonly<CaromState>,
  side: Side,
  api: UpdateApi,
  dt: number,
): PaddleState {
  const p = s.paddles[side];
  let vy = p.drivenVy;
  if (!p.driven) {
    if (side === "right" && s.mode === "solo") {
      let target = C.AI_HOME_Y;
      let deadzone = C.AI_HOME_DEADZONE;
      if (s.ai.tracking && s.screen === "playing" && s.ball && s.ball.vx > 0) {
        target = s.ball.y - s.ball.vy * C.AI_REACT;
        deadzone = C.AI_DEADZONE;
      }
      const diff = target - p.cy;
      vy =
        !s.ai.movement || Math.abs(diff) <= deadzone || dt <= 0
          ? 0
          : Math.sign(diff) * Math.min(C.AI_SPEED, Math.abs(diff) / dt);
    } else {
      const prefix = side === "left" ? "p1" : "p2";
      const up =
        api.input.value(`${prefix}-up`) > 0 ||
        (s.mode === "solo" && api.input.value("p2-up") > 0);
      const down =
        api.input.value(`${prefix}-down`) > 0 ||
        (s.mode === "solo" && api.input.value("p2-down") > 0);
      vy = (Number(down) - Number(up)) * C.PADDLE_SPEED;
    }
  }
  const raw = p.cy + vy * dt;
  const cy = clamp(raw, C.PADDLE_MIN_CY, C.PADDLE_MAX_CY);
  if (raw !== cy && dt > 0) vy = (cy - p.cy) / dt;
  return { ...p, cy, vy };
}

export function advanceWorld(
  s: DeepReadonly<CaromState>,
  api: UpdateApi,
  dt: number,
): CaromState {
  if (s.screen !== "countdown" && s.screen !== "playing") return s;
  let next: CaromState = {
    ...s,
    paddles: {
      left: movePaddle(s, "left", api, dt),
      right: movePaddle(s, "right", api, dt),
    },
  };
  const cues = new Set<C.CueName>();
  if (s.ball) {
    let ball = s.ball;
    if (s.screen === "countdown") {
      const timer = ball.holdTimer - dt;
      ball = {
        ...ball,
        x: C.FIELD_CX,
        y: C.FIELD_CY,
        holdTimer: Math.max(0, timer),
      };
      if (timer <= 0) {
        ball = {
          ...ball,
          held: false,
          trail: [],
          vx:
            (s.receiver === "left" ? -1 : 1) *
            C.SERVE_SPEED *
            Math.cos(C.SERVE_ANGLE),
          vy: ball.serveSign * C.SERVE_SPEED * Math.sin(C.SERVE_ANGLE),
        };
        next = { ...next, screen: "playing" };
      }
    } else if (!ball.held)
      ball = flyBall(ball, next.paddles, s.obstacles, dt, cues);
    ball = {
      ...ball,
      trail: [
        ...ball.trail.filter((p) => s.simTime - p.t <= C.TRAIL_TIME),
        { x: ball.x, y: ball.y, t: s.simTime },
      ],
    };
    next = { ...next, ball };
    if (
      s.screen === "playing" &&
      !ball.held &&
      (ball.x - C.BALL_R > C.FIELD_W || ball.x + C.BALL_R < 0)
    ) {
      const scorer: Side = ball.x > C.FIELD_W ? "left" : "right";
      const score = {
        p1: s.score.p1 + Number(scorer === "left"),
        p2: s.score.p2 + Number(scorer === "right"),
      };
      cues.add(C.CUES.score);
      const won =
        Math.max(score.p1, score.p2) >= C.WIN_SCORE &&
        Math.abs(score.p1 - score.p2) >= C.WIN_LEAD;
      next = won
        ? { ...next, score, winner: scorer, screen: "matchover", menuIndex: 0 }
        : {
            ...next,
            score,
            receiver: scorer === "left" ? "right" : "left",
            ball: parkedBall(),
            screen: "countdown",
          };
    }
  }
  const clock = s.obstacleClock + (s.obstacleClockRunning ? dt : 0);
  next = {
    ...next,
    obstacleClock: clock,
    obstacles: s.obstacles.map((o) => obstaclePose(o.index, clock)),
  };
  for (const cue of cues) api.audio.play(cue);
  return next;
}
