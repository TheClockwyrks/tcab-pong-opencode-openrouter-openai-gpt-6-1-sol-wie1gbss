import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { game, BACKGROUND } from "./game";
import type { CaromDebugApi, CaromState, Screen } from "./game";
import * as C from "./constants";

const engines: Engine<CaromState, CaromDebugApi>[] = [];
afterEach(() => {
  engines.splice(0).forEach((e) => e.destroy());
  vi.restoreAllMocks();
});

async function setup(stepMs = 10, draw = true) {
  const target = new EventTarget();
  const canvas = createCanvas(C.FIELD_W, C.FIELD_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.FIELD_W,
    height: C.FIELD_H,
    background: BACKGROUND,
    layout: C.LAYOUT,
    clock: new ConstantClock(stepMs),
    game: draw ? game : { ...game, render() {} },
    surface: {
      cssWidth: () => C.FIELD_W,
      cssHeight: () => C.FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const debug = engine.debug;
  const key = (code: string, down = true) =>
    target.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), {
        code,
        repeat: false,
      }),
    );
  const press = async (code: string) => {
    key(code);
    await engine.advance(1);
    key(code, false);
  };
  const pointer = (
    type: "down" | "move" | "up",
    x: number,
    y: number,
    device = "mouse",
    id = 1,
  ) =>
    target.dispatchEvent(
      Object.assign(new Event(`pointer${type}`), {
        clientX: x,
        clientY: y,
        pointerId: id,
        pointerType: device,
        isPrimary: id === 1,
        button: type === "move" ? -1 : 0,
        buttons: type === "up" ? 0 : 1,
      }),
    );
  const pose = (transition: (s: typeof engine.state) => CaromState) =>
    engine.apply(transition);
  const flight = (x: number, y: number, vx: number, vy: number, spin = 0) => {
    pose((s) => debug.clearWorld(s));
    pose((s) => debug.spawnBall(s));
    pose((s) => debug.setBallPosition(s, x, y));
    pose((s) => debug.setBallVelocity(s, vx, vy));
    pose((s) => debug.setBallSpin(s, spin));
    pose((s) => debug.setBallHeld(s, false));
    pose((s) => debug.setScreen(s, "playing"));
    pose((s) => debug.setMode(s, "versus"));
  };
  return { engine, debug, key, press, pointer, pose, flight, canvas };
}

describe("state, poses and readings", () => {
  it("initializes the full title world and exposes live pure diagnostics", async () => {
    const { engine, debug, pose } = await setup();
    const before = debug.snapshot(engine.state);
    expect(before).toMatchObject({
      version: C.CAROM_DEBUG_VERSION,
      screen: "title",
      mode: "solo",
      score: { p1: 0, p2: 0 },
      receiver: "left",
      obstacleClock: 0,
      simTime: 0,
      ball: { held: true, holdTimer: C.HOLD_TIME, speed: 0, trail: [] },
    });
    expect(before.obstacles).toHaveLength(2);
    pose((s) => debug.setScore(s, 7, 9));
    expect(engine.diagnostics()).toContainEqual({ name: "p1", value: 7 });
    expect(engine.diagnostics().every((d) => d.error === undefined)).toBe(true);
    const frozen = debug.snapshot(engine.state);
    engine.diagnostics();
    debug.snapshot(engine.state);
    expect(debug.snapshot(engine.state)).toEqual(frozen);
    expect(before.score.p1).toBe(0);
  });
  it("poses every independent scalar, reconciles idempotently, and resets", async () => {
    const { engine: e, debug: d, pose } = await setup();
    pose((s) => d.setScreen(s, "paused"));
    pose((s) => d.setMode(s, "versus"));
    pose((s) => d.setMenuIndex(s, 2));
    pose((s) => d.setTitleIndex(s, 1));
    pose((s) => d.setResumeScreen(s, "countdown"));
    pose((s) => d.setWinner(s, "right"));
    pose((s) => d.setReceiver(s, "right"));
    pose((s) => d.setPaddleCy(s, "left", 123));
    pose((s) => d.setPaddleVy(s, "left", -230));
    pose((s) => d.setPaddleDriven(s, "left", true));
    pose((s) => d.setBallPosition(s, 111, 222));
    pose((s) => d.setBallVelocity(s, 300, 400));
    pose((s) => d.setBallSpin(s, 123));
    pose((s) => d.setBallHoldTimer(s, 0.2));
    pose((s) => d.setBallServeSign(s, -1));
    pose((s) => d.setBallHeld(s, false));
    pose((s) => d.setAiTracking(s, false));
    pose((s) => d.setAiMovement(s, false));
    pose((s) => d.setMuted(s, true));
    pose((s) => d.setObstacleClock(s, 0.9));
    pose((s) => d.setObstacleClockRunning(s, false));
    expect(d.snapshot(e.state)).toMatchObject({
      screen: "paused",
      mode: "versus",
      menuIndex: 2,
      titleIndex: 1,
      resumeScreen: "countdown",
      winner: "right",
      receiver: "right",
      muted: true,
      paddles: {
        left: { cy: 123, drivenVy: -230, vy: 0, driven: true },
        right: { driven: false },
      },
      ball: {
        x: 111,
        y: 222,
        speed: 500,
        spin: 123,
        holdTimer: 0.2,
        serveSign: -1,
        held: false,
      },
      ai: { tracking: false, movement: false },
      obstacleClockRunning: false,
    });
    expect(e.state.obstacles[0].cy).toBeCloseTo(
      C.OBSTACLE_CENTERS[0].y + C.OBSTACLE_SWAY_AMP,
    );
    const before = d.snapshot(e.state);
    pose((s) => d.reconcile(s));
    pose((s) => d.reconcile(s));
    expect(d.snapshot(e.state)).toEqual(before);
    await e.advance(5);
    expect(e.state.ball?.holdTimer).toBe(0.2);
    pose((s) => d.reset(s));
    expect(e.state).toMatchObject({
      screen: "title",
      simTime: 0,
      muted: true,
      titleIndex: 0,
      ai: { movement: true, tracking: true },
      paddles: { left: { driven: false, drivenVy: 0 } },
    });
  });
  it("clears entities, refuses absent-ball poses, and spawns in clock order", async () => {
    const { engine: e, debug: d, pose } = await setup();
    pose((s) => d.clearWorld(s));
    expect(d.snapshot(e.state)).toMatchObject({ ball: null, obstacles: [] });
    const absent = [
      () => d.setBallPosition(e.state, 0, 0),
      () => d.setBallVelocity(e.state, 0, 0),
      () => d.setBallSpin(e.state, 1),
      () => d.setBallHeld(e.state, true),
      () => d.setBallHoldTimer(e.state, 0),
      () => d.setBallServeSign(e.state, 1),
      () => d.drawBallServeSign(e.state),
    ];
    for (const call of absent) expect(call).toThrow("No ball");
    expect(() => d.spawnObstacle(e.state, 2)).toThrow();
    pose((s) => d.setScreen(s, "playing"));
    await e.advance(3);
    expect(e.state.score).toEqual({ p1: 0, p2: 0 });
    pose((s) => d.setObstacleClock(s, 1));
    pose((s) => d.spawnObstacle(s, 1));
    pose((s) => d.spawnObstacle(s, 0));
    pose((s) => d.spawnObstacle(s, 0));
    expect(e.state.obstacles.map((o) => o.index)).toEqual([0, 1]);
    pose((s) => d.spawnBall(s));
    vi.spyOn(Math, "random").mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);
    pose((s) => d.drawBallServeSign(s));
    expect(e.state.ball?.serveSign).toBe(-1);
    pose((s) => d.drawBallServeSign(s));
    expect(e.state.ball?.serveSign).toBe(1);
  });
});

describe("screen and input state machine", () => {
  it("wraps, prioritizes up over down and movement over confirm, remembers title", async () => {
    const { engine: e, key, press } = await setup();
    key("KeyW");
    key("KeyS");
    key("Enter");
    await e.advance(1);
    expect(e.state).toMatchObject({ screen: "title", menuIndex: 2 });
    key("KeyW", false);
    key("KeyS", false);
    key("Enter", false);
    await press("Enter");
    expect(e.state.screen).toBe("howto");
    await press("Escape");
    expect(e.state).toMatchObject({
      screen: "title",
      menuIndex: 2,
      titleIndex: 2,
    });
    await press("ArrowDown");
    expect(e.state.menuIndex).toBe(0);
    await press("ArrowDown");
    await press("Space");
    expect(e.state).toMatchObject({
      screen: "countdown",
      mode: "versus",
      titleIndex: 1,
    });
  });
  it("pauses once on Escape, freezes the world, and resumes the same hold", async () => {
    const { engine: e, press, key } = await setup();
    await press("Enter");
    await e.advance(20);
    const ball = e.state.ball,
      clock = e.state.obstacleClock;
    await press("Escape");
    expect(e.state.screen).toBe("paused");
    key("KeyS");
    await e.advance(10);
    key("KeyS", false);
    expect(e.state.ball).toEqual(ball);
    expect(e.state.obstacleClock).toBe(clock);
    const time = e.state.simTime;
    key("KeyP");
    key("Enter");
    await e.advance(1);
    key("KeyP", false);
    key("Enter", false);
    expect(e.state.screen).toBe("countdown");
    expect(e.state.ball!.holdTimer).toBeCloseTo(ball!.holdTimer - 0.01);
    expect(e.state.simTime).toBeCloseTo(time + 0.01);
  });
  it("restarts, quits and restores title defaults while preserving title selection", async () => {
    const { engine: e, debug: d, press, pose } = await setup();
    await press("ArrowDown");
    await press("Enter");
    await press("KeyP");
    pose((s) => d.setScore(s, 4, 6));
    await press("ArrowDown");
    await press("Enter");
    expect(e.state).toMatchObject({
      screen: "countdown",
      score: { p1: 0, p2: 0 },
      mode: "versus",
    });
    await press("KeyP");
    await press("ArrowUp");
    await press("Enter");
    expect(e.state).toMatchObject({
      screen: "title",
      menuIndex: 1,
      titleIndex: 1,
      mode: "solo",
    });
    pose((s) => d.setScreen(s, "matchover"));
    await press("Escape");
    expect(e.state.screen).toBe("title");
  });
  it.each(["mouse", "touch"])(
    "pairs %s presses across frames and rejects cross-item releases",
    async (device) => {
      const { engine: e, debug: d, pointer } = await setup();
      const a = d.menuItemRect(e.state, 0)!,
        b = d.menuItemRect(e.state, 1)!;
      pointer("down", a.x + 20, a.y + 20, device);
      await e.advance(1);
      pointer("up", b.x + 20, b.y + 20, device);
      await e.advance(1);
      expect(e.state).toMatchObject({ screen: "title", menuIndex: 1 });
      pointer("down", b.x + 20, b.y + 20, device);
      await e.advance(1);
      pointer("up", b.x + 20, b.y + 20, device);
      await e.advance(1);
      expect(e.state).toMatchObject({ screen: "countdown", mode: "versus" });
      expect(d.menuItemRect(e.state, 0)).toBeNull();
    },
  );
  it("accepts same-frame taps, pointer selection after keys, and keyboard confirm first", async () => {
    const { engine: e, debug: d, pointer, key, pose } = await setup();
    const b = d.menuItemRect(e.state, 1)!;
    key("ArrowDown");
    pointer("move", b.x + 10, b.y + 10);
    await e.advance(1);
    key("ArrowDown", false);
    expect(e.state.menuIndex).toBe(1);
    pose((s) => d.setMenuIndex(s, 0));
    key("Enter");
    pointer("down", b.x + 10, b.y + 10);
    pointer("up", b.x + 10, b.y + 10);
    await e.advance(1);
    key("Enter", false);
    expect(e.state.mode).toBe("solo");
  });
  it("renders all six screens and returns regions only for valid menu items", async () => {
    const { engine: e, debug: d, pose, canvas } = await setup();
    for (const screen of [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
    ] as Screen[]) {
      pose((s) => d.setScreen(s, screen));
      await e.advance(1);
      expect(d.menuItemRect(e.state, -1)).toBeNull();
      expect(d.menuItemRect(e.state, 99)).toBeNull();
    }
    expect(canvas.toBuffer("image/png").length).toBeGreaterThan(10000);
  });
});

describe("paddles, AI, serving and scoring", () => {
  it("integrates held movement during countdown, clamps actual velocity and isolates Versus", async () => {
    const { engine: e, debug: d, key, press, pose } = await setup();
    await press("Enter");
    key("ArrowDown");
    await e.advance(10);
    expect(e.state.paddles.left.cy).toBeCloseTo(
      C.FIELD_CY + C.PADDLE_SPEED * 0.1,
    );
    expect(e.state.paddles.right.cy).toBe(C.FIELD_CY);
    pose((s) => d.setMode(s, "versus"));
    await e.advance(10);
    expect(e.state.paddles.right.cy).toBeCloseTo(
      C.FIELD_CY + C.PADDLE_SPEED * 0.1,
    );
    await e.advance(50);
    expect(e.state.paddles.right).toMatchObject({ cy: C.PADDLE_MAX_CY, vy: 0 });
    key("ArrowDown", false);
  });
  it("debug drivers override humans, retain desired velocity at clamps and release independently", async () => {
    const { engine: e, debug: d, pose, press, key } = await setup();
    await press("Enter");
    pose((s) => d.setPaddleDriven(s, "left", true));
    pose((s) => d.setPaddleCy(s, "left", C.PADDLE_MIN_CY + 2));
    pose((s) => d.setPaddleVy(s, "left", -300));
    key("KeyS");
    await e.advance(1);
    expect(e.state.paddles.left).toMatchObject({
      cy: C.PADDLE_MIN_CY,
      vy: -200,
      drivenVy: -300,
    });
    await e.advance(1);
    expect(e.state.paddles.left.vy).toBe(0);
    pose((s) => d.setPaddleDriven(s, "left", false));
    await e.advance(1);
    expect(e.state.paddles.left.vy).toBe(C.PADDLE_SPEED);
    expect(e.state.paddles.right.driven).toBe(false);
  });
  it("AI tracks only incoming flight, gates movement and tracking, and returns home", async () => {
    const { engine: e, debug: d, pose, flight } = await setup();
    flight(900, 580, 400, 100);
    pose((s) => d.setMode(s, "solo"));
    await e.advance(1);
    expect(e.state.paddles.right.vy).toBe(C.AI_SPEED);
    pose((s) => d.setAiMovement(s, false));
    await e.advance(1);
    expect(e.state.paddles.right.vy).toBe(0);
    pose((s) => d.setAiMovement(s, true));
    pose((s) => d.setAiTracking(s, false));
    pose((s) => d.setPaddleCy(s, "right", 600));
    await e.advance(1);
    expect(e.state.paddles.right.vy).toBe(-C.AI_SPEED);
    pose((s) => d.setAiTracking(s, true));
    pose((s) => d.setBallVelocity(s, -400, 0));
    await e.advance(1);
    expect(e.state.paddles.right.vy).toBe(-C.AI_SPEED);
  });
  it.each([-1, 1] as const)(
    "serves sign %s on expiry without advancing its position",
    async (sign) => {
      const { engine: e, debug: d, pose, press } = await setup();
      await press("Enter");
      pose((s) => d.setBallServeSign(s, sign));
      pose((s) => d.setReceiver(s, "right"));
      pose((s) => d.setBallHoldTimer(s, 0.005));
      await e.advance(1);
      expect(e.state).toMatchObject({
        screen: "playing",
        ball: {
          x: C.FIELD_CX,
          y: C.FIELD_CY,
          held: false,
          holdTimer: 0,
          serveSign: sign,
        },
      });
      expect(e.state.ball!.vx).toBeCloseTo(
        C.SERVE_SPEED * Math.cos(C.SERVE_ANGLE),
      );
      expect(e.state.ball!.vy).toBeCloseTo(
        sign * C.SERVE_SPEED * Math.sin(C.SERVE_ANGLE),
      );
    },
  );
  it("requires the entire ball over a goal, parks toward the conceder and wins by two", async () => {
    const { engine: e, debug: d, pose, flight, press } = await setup();
    flight(C.FIELD_W + C.BALL_R - 1, 150, 0, 0);
    await e.advance(1);
    expect(e.state.score.p1).toBe(0);
    pose((s) => d.setBallVelocity(s, 300, 0));
    await e.advance(1);
    expect(e.state).toMatchObject({
      screen: "countdown",
      receiver: "right",
      score: { p1: 1, p2: 0 },
      ball: { held: true, trail: [] },
    });
    pose((s) => d.setScore(s, 10, 10));
    flight(C.FIELD_W + 20, 150, 300, 0);
    await e.advance(1);
    expect(e.state).toMatchObject({
      screen: "countdown",
      score: { p1: 11, p2: 10 },
      winner: null,
    });
    flight(C.FIELD_W + 20, 150, 300, 0);
    await e.advance(1);
    expect(e.state).toMatchObject({
      screen: "matchover",
      score: { p1: 12, p2: 10 },
      winner: "left",
      menuIndex: 0,
    });
    await press("Enter");
    expect(e.state).toMatchObject({
      screen: "countdown",
      score: { p1: 0, p2: 0 },
    });
    pose((s) => d.setScore(s, 0, 10));
    flight(-20, 150, -300, 0);
    await e.advance(1);
    expect(e.state).toMatchObject({ screen: "matchover", winner: "right" });
    await press("ArrowDown");
    await press("Enter");
    expect(e.state.screen).toBe("title");
  });
});

describe("collision and spin simulation", () => {
  it("bounces at both walls, preserves speed and decays spin with elapsed time", async () => {
    const { engine: e, flight } = await setup(10, false);
    flight(300, C.BALL_R + 1, 0, -500, 0);
    await e.advance(1);
    expect(e.state.ball!.vy).toBe(500);
    expect(e.state.ball!.y).toBeGreaterThanOrEqual(C.BALL_R);
    flight(300, C.FIELD_H - C.BALL_R - 1, 0, 500);
    await e.advance(1);
    expect(e.state.ball!.vy).toBe(-500);
    flight(300, 300, 500, 0, 200);
    await e.advance(80);
    expect(e.state.ball!.spin).toBeCloseTo(100, 6);
    expect(Math.hypot(e.state.ball!.vx, e.state.ball!.vy)).toBeCloseTo(500, 6);
    expect(e.state.ball!.vy).toBeGreaterThan(0);
    expect(e.state.ball!.trail[0].t).toBeGreaterThanOrEqual(
      e.state.simTime - C.TRAIL_TIME,
    );
  });
  it.each(["left", "right"] as const)(
    "reflects off %s paddle, accelerates, and applies integrated spin",
    async (side) => {
      const { engine: e, debug: d, pose, flight } = await setup();
      const left = side === "left";
      flight(
        left ? C.P1_X1 + C.BALL_R + 2 : C.P2_X0 - C.BALL_R - 2,
        C.FIELD_CY,
        left ? -500 : 500,
        0,
      );
      pose((s) => d.setPaddleDriven(s, side, true));
      pose((s) => d.setPaddleVy(s, side, 200));
      const events: string[] = [];
      e.events.on("cue:played", (event) => events.push(event.cue));
      await e.advance(1);
      expect(Math.sign(e.state.ball!.vx)).toBe(left ? 1 : -1);
      expect(Math.hypot(e.state.ball!.vx, e.state.ball!.vy)).toBeCloseTo(
        500 * C.SPEED_MULT,
      );
      const imparted = 200 * C.SPIN_FROM_PADDLE;
      expect(e.state.ball!.spin).toBeGreaterThanOrEqual(
        imparted * Math.pow(0.5, 0.01 / C.SPIN_HALFLIFE),
      );
      expect(e.state.ball!.spin).toBeLessThanOrEqual(imparted);
      expect(events).toEqual([C.CUES.paddleHit]);
    },
  );
  it("caps paddle hit speed and spin, resolves end caps without adding either", async () => {
    const { engine: e, debug: d, pose, flight } = await setup();
    flight(C.P1_X1 + C.BALL_R + 2, C.FIELD_CY, -C.SPEED_CAP, 0, 800);
    pose((s) => d.setPaddleDriven(s, "left", true));
    pose((s) => d.setPaddleVy(s, "left", C.PADDLE_SPEED));
    await e.advance(1);
    expect(Math.hypot(e.state.ball!.vx, e.state.ball!.vy)).toBeCloseTo(
      C.SPEED_CAP,
    );
    expect(e.state.ball!.spin).toBeLessThanOrEqual(C.SPIN_CLAMP);
    pose((s) => d.setPaddleVy(s, "left", 0));
    pose((s) => d.setPaddleCy(s, "left", C.FIELD_CY));
    flight(
      (C.P1_X0 + C.P1_X1) / 2,
      C.FIELD_CY - C.PADDLE_HALF - C.BALL_R - 1,
      0,
      500,
    );
    await e.advance(1);
    expect(e.state.ball!.vy).toBe(-500);
    expect(e.state.ball!.spin).toBe(0);
  });
  it("reflects oriented obstacles, preserves speed and uses the frame-start pose", async () => {
    const { engine: e, debug: d, pose, flight } = await setup();
    const t = 0.7;
    flight(0, 0, 0, 0);
    pose((s) => d.setObstacleClock(s, t));
    pose((s) => d.setObstacleClockRunning(s, false));
    pose((s) => d.spawnObstacle(s, 0));
    const o = e.state.obstacles[0],
      cos = Math.cos(o.theta),
      sin = Math.sin(o.theta);
    pose((s) =>
      d.setBallPosition(
        s,
        o.cx - (C.OBSTACLE_HW + C.BALL_R + 1) * cos,
        o.cy - (C.OBSTACLE_HW + C.BALL_R + 1) * sin,
      ),
    );
    pose((s) => d.setBallVelocity(s, 500 * cos, 500 * sin));
    await e.advance(1);
    expect(e.state.ball!.vx).toBeCloseTo(-500 * cos);
    expect(e.state.ball!.vy).toBeCloseTo(-500 * sin);
    expect(e.state.obstacleClock).toBe(t);
  });
  it("pushes inside and corner obstacle contacts out without changing outward velocity", async () => {
    const { engine: e, debug: d, pose, flight } = await setup();
    flight(C.OBSTACLE_CENTERS[0].x, C.OBSTACLE_CENTERS[0].y, 0, 0);
    pose((s) => d.setObstacleClockRunning(s, false));
    pose((s) => d.spawnObstacle(s, 0));
    await e.advance(1);
    expect(e.state.ball!.x).toBe(
      C.OBSTACLE_CENTERS[0].x + C.OBSTACLE_HW + C.BALL_R,
    );
    pose((s) =>
      d.setBallPosition(
        s,
        C.OBSTACLE_CENTERS[0].x - C.OBSTACLE_HW - 5,
        C.OBSTACLE_CENTERS[0].y - C.OBSTACLE_HH - 5,
      ),
    );
    pose((s) => d.setBallVelocity(s, -100, -100));
    await e.advance(1);
    expect(e.state.ball!.vx).toBe(-100);
    expect(e.state.ball!.vy).toBe(-100);
  });
  it("deduplicates cues per frame and mute changes sound alone", async () => {
    const { engine: e, debug: d, pose, flight, press } = await setup(100);
    flight(300, 12, 500, -500);
    const events: { cue: string; gain: number }[] = [];
    e.events.on("cue:played", (event) => events.push(event));
    pose((s) => d.setMuted(s, true));
    await e.advance(1);
    expect(events).toMatchObject([{ cue: C.CUES.wallBounce, gain: 0 }]);
    expect(e.state.muted).toBe(true);
    await press("KeyM");
    expect(e.state.muted).toBe(false);
  });
  it("agrees on contacts, speed, direction and points at 2ms and 16ms steps", async () => {
    async function drive(ms: number) {
      const { engine: e, debug: d, pose, flight } = await setup(ms, false);
      flight(300, 360, -600, 0, 200);
      pose((s) => d.setPaddleDriven(s, "left", true));
      const cues: string[] = [];
      e.events.on("cue:played", ({ cue }) => cues.push(cue));
      await e.advance(1600 / ms);
      return {
        ball: e.state.ball!,
        score: e.state.score,
        cues,
        time: e.state.simTime,
      };
    }
    const a = await drive(2),
      b = await drive(16);
    expect(a.cues).toEqual(b.cues);
    expect(a.score).toEqual(b.score);
    expect(
      Math.abs(
        Math.hypot(a.ball.vx, a.ball.vy) - Math.hypot(b.ball.vx, b.ball.vy),
      ),
    ).toBeLessThan(10);
    expect(Math.sign(a.ball.vx)).toBe(Math.sign(b.ball.vx));
    expect(Math.sign(a.ball.vy)).toBe(Math.sign(b.ball.vy));
    expect(a.time).toBeCloseTo(b.time);
  });
});
