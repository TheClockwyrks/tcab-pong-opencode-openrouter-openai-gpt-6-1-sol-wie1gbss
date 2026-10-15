import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { createDebug } from "./debug";
import { openingState, advanceWorld } from "./simulation";
import { readControls } from "./menus";
import { render } from "./render";
import "./presentation.css";

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";
export type Mode = "solo" | "versus";
export type Side = "left" | "right";
export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}
export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}
export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}
export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}
export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
  readonly theta: number;
}
export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";
  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;
  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;
  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];
  readonly obstacleClock: number;
  readonly obstacleClockRunning: boolean;
  readonly simTime: number;
  readonly muted: boolean;
}

export interface MenuRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export type CaromSnapshot = Omit<CaromState, "ball"> & {
  readonly version: number;
  readonly ball: (BallState & { readonly speed: number }) | null;
};
type State = DeepReadonly<CaromState>;
export interface CaromDebugApi {
  readonly version: number;
  clearWorld(s: State): CaromState;
  spawnBall(s: State): CaromState;
  spawnObstacle(s: State, index: number): CaromState;
  reset(s: State): CaromState;
  reconcile(s: State): CaromState;
  setScreen(s: State, screen: Screen): CaromState;
  setMode(s: State, mode: Mode): CaromState;
  setMenuIndex(s: State, index: number): CaromState;
  setTitleIndex(s: State, index: number): CaromState;
  setResumeScreen(s: State, screen: "countdown" | "playing"): CaromState;
  setScore(s: State, p1: number, p2: number): CaromState;
  setWinner(s: State, side: Side | null): CaromState;
  setReceiver(s: State, side: Side): CaromState;
  setPaddleCy(s: State, side: Side, cy: number): CaromState;
  setPaddleVy(s: State, side: Side, vy: number): CaromState;
  setPaddleDriven(s: State, side: Side, driven: boolean): CaromState;
  setBallPosition(s: State, x: number, y: number): CaromState;
  setBallVelocity(s: State, vx: number, vy: number): CaromState;
  setBallSpin(s: State, spin: number): CaromState;
  setBallHeld(s: State, held: boolean): CaromState;
  setBallHoldTimer(s: State, seconds: number): CaromState;
  setBallServeSign(s: State, sign: 1 | -1): CaromState;
  drawBallServeSign(s: State): CaromState;
  setAiTracking(s: State, enabled: boolean): CaromState;
  setAiMovement(s: State, enabled: boolean): CaromState;
  setMuted(s: State, muted: boolean): CaromState;
  setObstacleClock(s: State, t: number): CaromState;
  setObstacleClockRunning(s: State, running: boolean): CaromState;
  snapshot(s: State): CaromSnapshot;
  menuItemRect(s: State, index: number): MenuRect | null;
}

export const BACKGROUND = "#0b1119";

export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    api.audio.define(C.CUES.paddleHit, {
      wave: "triangle",
      freq: 610,
      freqTo: 290,
      durationMs: 75,
      gain: 0.2,
    });
    api.audio.define(C.CUES.wallBounce, {
      freq: 250,
      freqTo: 180,
      durationMs: 45,
      gain: 0.13,
    });
    api.audio.define(C.CUES.obstacleBounce, {
      wave: "triangle",
      freq: 880,
      freqTo: 1250,
      durationMs: 85,
      gain: 0.16,
    });
    api.audio.define(C.CUES.score, {
      freq: 440,
      freqTo: 880,
      durationMs: 220,
      gain: 0.22,
    });
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("mode", (s) => s.mode);
    api.diagnostics.register("p1", (s) => s.score.p1);
    api.diagnostics.register("p2", (s) => s.score.p2);
    api.diagnostics.register("ball position", (s) =>
      s.ball ? `${s.ball.x.toFixed(1)}, ${s.ball.y.toFixed(1)}` : "none",
    );
    api.diagnostics.register("ball velocity", (s) =>
      s.ball ? `${s.ball.vx.toFixed(1)}, ${s.ball.vy.toFixed(1)}` : "none",
    );
    api.diagnostics.register("speed", (s) =>
      s.ball ? Math.hypot(s.ball.vx, s.ball.vy) : "none",
    );
    api.diagnostics.register("spin", (s) => s.ball?.spin ?? "none");
    for (const side of ["left", "right"] as const) {
      api.diagnostics.register(`${side} cy`, (s) => s.paddles[side].cy);
      api.diagnostics.register(`${side} vy`, (s) => s.paddles[side].vy);
    }
    return [openingState(), createDebug()];
  },
  update(state, api, dt) {
    const next = readControls(state, api);
    // The declared bit is also the pending value set by a debug pose. Commit it
    // to the engine before any event in this frame can make a sound.
    api.audio.setMuted(next.muted);
    return advanceWorld(
      { ...next, simTime: state.simTime + dt, muted: api.audio.muted() },
      api,
      dt,
    );
  },
  render,
};
