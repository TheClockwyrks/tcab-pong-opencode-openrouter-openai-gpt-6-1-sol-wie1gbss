import type { DeepReadonly } from "ts-essentials";
import type {
  BallState,
  CaromDebugApi,
  CaromState,
  PaddleState,
  Side,
} from "./game";
import { CAROM_DEBUG_VERSION } from "./constants";
import { drawSign, obstaclePose, openingState, parkedBall } from "./simulation";
import { menuItemRect } from "./menus";

function ballPatch(
  s: DeepReadonly<CaromState>,
  patch: Partial<BallState>,
): CaromState {
  if (!s.ball) throw new Error("No ball on the playfield");
  return { ...s, ball: { ...s.ball, ...patch } };
}
function paddlePatch(
  s: DeepReadonly<CaromState>,
  side: Side,
  patch: Partial<PaddleState>,
): CaromState {
  return {
    ...s,
    paddles: { ...s.paddles, [side]: { ...s.paddles[side], ...patch } },
  };
}
export function createDebug(): CaromDebugApi {
  return {
    version: CAROM_DEBUG_VERSION,
    clearWorld: (s) => ({ ...s, ball: null, obstacles: [] }),
    spawnBall: (s) => ({ ...s, ball: parkedBall() }),
    spawnObstacle: (s, index) => {
      const obstacle = obstaclePose(index, s.obstacleClock);
      return {
        ...s,
        obstacles: [
          ...s.obstacles.filter((o) => o.index !== index),
          obstacle,
        ].sort((a, b) => a.index - b.index),
      };
    },
    reset: (s) => openingState(s.muted),
    reconcile: (s) => ({
      ...s,
      obstacles: s.obstacles.map((o) => obstaclePose(o.index, s.obstacleClock)),
    }),
    setScreen: (s, screen) => ({ ...s, screen }),
    setMode: (s, mode) => ({ ...s, mode }),
    setMenuIndex: (s, menuIndex) => ({ ...s, menuIndex }),
    setTitleIndex: (s, titleIndex) => ({ ...s, titleIndex }),
    setResumeScreen: (s, resumeScreen) => ({ ...s, resumeScreen }),
    setScore: (s, p1, p2) => ({ ...s, score: { p1, p2 } }),
    setWinner: (s, winner) => ({ ...s, winner }),
    setReceiver: (s, receiver) => ({ ...s, receiver }),
    setPaddleCy: (s, side, cy) => paddlePatch(s, side, { cy }),
    setPaddleVy: (s, side, drivenVy) => paddlePatch(s, side, { drivenVy }),
    setPaddleDriven: (s, side, driven) => paddlePatch(s, side, { driven }),
    setBallPosition: (s, x, y) => ballPatch(s, { x, y }),
    setBallVelocity: (s, vx, vy) => ballPatch(s, { vx, vy }),
    setBallSpin: (s, spin) => ballPatch(s, { spin }),
    setBallHeld: (s, held) => ballPatch(s, { held }),
    setBallHoldTimer: (s, holdTimer) => ballPatch(s, { holdTimer }),
    setBallServeSign: (s, serveSign) => ballPatch(s, { serveSign }),
    drawBallServeSign: (s) => ballPatch(s, { serveSign: drawSign() }),
    setAiTracking: (s, tracking) => ({ ...s, ai: { ...s.ai, tracking } }),
    setAiMovement: (s, movement) => ({ ...s, ai: { ...s.ai, movement } }),
    setMuted: (s, muted) => ({ ...s, muted }),
    setObstacleClock: (s, obstacleClock) => ({
      ...s,
      obstacleClock,
      obstacles: s.obstacles.map((o) => obstaclePose(o.index, obstacleClock)),
    }),
    setObstacleClockRunning: (s, obstacleClockRunning) => ({
      ...s,
      obstacleClockRunning,
    }),
    snapshot: (s) => ({
      version: CAROM_DEBUG_VERSION,
      screen: s.screen,
      mode: s.mode,
      menuIndex: s.menuIndex,
      titleIndex: s.titleIndex,
      resumeScreen: s.resumeScreen,
      score: { ...s.score },
      winner: s.winner,
      muted: s.muted,
      paddles: { left: { ...s.paddles.left }, right: { ...s.paddles.right } },
      ai: { ...s.ai },
      receiver: s.receiver,
      ball: s.ball
        ? {
            ...s.ball,
            speed: Math.hypot(s.ball.vx, s.ball.vy),
            trail: s.ball.trail.map((p) => ({ ...p })),
          }
        : null,
      obstacles: s.obstacles.map((o) => obstaclePose(o.index, s.obstacleClock)),
      obstacleClock: s.obstacleClock,
      obstacleClockRunning: s.obstacleClockRunning,
      simTime: s.simTime,
    }),
    menuItemRect,
  };
}
