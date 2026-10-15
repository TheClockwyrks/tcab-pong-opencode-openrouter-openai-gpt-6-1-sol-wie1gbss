import type { DeepReadonly } from "ts-essentials";
import type { RenderApi } from "@clockwyrks/simple-2d";
import type { CaromState } from "./game";
import * as C from "./constants";
import { menuItemRect, menuItems } from "./menus";

const INK = "#ecf2ed";
const QUIET = "#7e909d";
const LINE = "#24323e";
const LEFT = "#62e7db";
const RIGHT = "#ff897d";
const GOLD = "#f2cc78";
const FONT = "Arial, Helvetica, sans-serif";
const MONO = "'Courier New', monospace";
type Context = CanvasRenderingContext2D;

function text(
  ctx: Context,
  copy: string,
  x: number,
  y: number,
  size = 14,
  color = INK,
  align: CanvasTextAlign = "left",
  bold = false,
): void {
  ctx.fillStyle = color;
  ctx.font = `${bold ? 700 : 400} ${size}px ${size <= 15 ? MONO : FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(copy, x, y);
}
function line(
  ctx: Context,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color = LINE,
  width = 1,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}
function round(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function dot(
  ctx: Context,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function grid(ctx: Context): void {
  ctx.fillStyle = "#17222d";
  for (let x = 24; x < C.FIELD_W; x += 32)
    for (let y = 24; y < C.FIELD_H; y += 32) ctx.fillRect(x, y, 1, 1);
}
function mark(ctx: Context, x: number, y: number, scale = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  line(ctx, 0, 1, 0, 22, LEFT, 4);
  line(ctx, 24, 1, 24, 22, RIGHT, 4);
  line(ctx, 5, 18, 18, 5, GOLD, 2);
  dot(ctx, 18, 5, 3, INK);
  ctx.restore();
}
function chrome(ctx: Context, s: DeepReadonly<CaromState>): void {
  mark(ctx, 42, 35);
  text(ctx, C.TITLE_TEXT, 83, 53, 17, INK, "left", true);
  text(ctx, "A GAME OF ANGLES", 225, 52, 12, QUIET);
  text(
    ctx,
    s.muted ? "M  SOUND OFF" : "M  SOUND ON",
    1238,
    52,
    12,
    QUIET,
    "right",
  );
  line(ctx, 42, 75, 1238, 75);
  text(ctx, "SPIN. BANK. REPEAT.", 42, 683, 12, QUIET);
  text(
    ctx,
    "W S / ↑ ↓  SELECT     ENTER  CONFIRM",
    1238,
    683,
    12,
    QUIET,
    "right",
  );
}
function furniture(ctx: Context, s: DeepReadonly<CaromState>): void {
  line(ctx, 0, 1, C.FIELD_W, 1, "#41505b", 2);
  line(ctx, 0, C.FIELD_H - 1, C.FIELD_W, C.FIELD_H - 1, "#41505b", 2);
  ctx.save();
  ctx.setLineDash([6, 16]);
  line(ctx, C.NET_X, 0, C.NET_X, C.FIELD_H, "#2b3a46", 2);
  ctx.restore();
  ctx.strokeStyle = "#24323e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(C.FIELD_CX, C.FIELD_CY, 57, 0, Math.PI * 2);
  ctx.stroke();
  for (const side of ["left", "right"] as const) {
    const x = side === "left" ? C.P1_X0 : C.P2_X0;
    const color = side === "left" ? LEFT : RIGHT;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    round(
      ctx,
      x,
      s.paddles[side].cy - C.PADDLE_HALF,
      C.PADDLE_W,
      C.PADDLE_H,
      7,
      color,
    );
    ctx.restore();
  }
  for (const o of s.obstacles) {
    ctx.save();
    ctx.translate(o.cx, o.cy);
    ctx.rotate(o.theta);
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 15;
    round(
      ctx,
      -C.OBSTACLE_HW,
      -C.OBSTACLE_HH,
      C.OBSTACLE_W,
      C.OBSTACLE_H,
      7,
      GOLD,
    );
    ctx.shadowBlur = 0;
    dot(ctx, 0, 0, 3, "#8d713c");
    ctx.restore();
  }
  if (!s.ball) return;
  const b = s.ball;
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 1; i < b.trail.length; i++) {
    const a = b.trail[i - 1],
      p = b.trail[i];
    const alpha = Math.max(0, 1 - (s.simTime - p.t) / C.TRAIL_TIME);
    ctx.globalAlpha = alpha * 0.45;
    line(ctx, a.x, a.y, p.x, p.y, b.spin < 0 ? LEFT : INK, 3 + alpha * 12);
  }
  ctx.globalAlpha = 1;
  ctx.shadowColor = INK;
  ctx.shadowBlur = 18;
  dot(ctx, b.x, b.y, C.BALL_R, INK);
  ctx.restore();
}
function scoreboard(ctx: Context, s: DeepReadonly<CaromState>): void {
  // Opaque backing keeps the net from passing through the scoreboard.
  round(ctx, C.FIELD_CX - 177, 20, 354, 107, 16, "#0b1119");
  text(ctx, "PLAYER 01", 523, 42, 11, LEFT, "center");
  text(
    ctx,
    s.mode === "solo" ? "COMPUTER" : "PLAYER 02",
    757,
    42,
    11,
    RIGHT,
    "center",
  );
  text(
    ctx,
    String(s.score.p1).padStart(2, "0"),
    523,
    104,
    62,
    INK,
    "center",
    true,
  );
  text(
    ctx,
    String(s.score.p2).padStart(2, "0"),
    757,
    104,
    62,
    INK,
    "center",
    true,
  );
  text(ctx, "CAROM", C.FIELD_CX, 68, 12, QUIET, "center");
  text(
    ctx,
    s.mode === "solo" ? "SOLO" : "VERSUS",
    C.FIELD_CX,
    91,
    11,
    GOLD,
    "center",
  );
  text(
    ctx,
    `FIRST TO ${C.WIN_SCORE} / LEAD BY ${C.WIN_LEAD}`,
    104,
    35,
    11,
    QUIET,
  );
  text(ctx, "P / ESC  PAUSE", 1176, 35, 11, QUIET, "right");
  text(ctx, "01  /  W + S", 104, 691, 11, LEFT);
  text(
    ctx,
    s.muted ? "M  SOUND OFF" : "M  SOUND ON",
    C.FIELD_CX,
    691,
    11,
    QUIET,
    "center",
  );
  text(
    ctx,
    s.mode === "solo" ? "02  /  COMPUTER" : "02  /  ↑ + ↓",
    1176,
    691,
    11,
    RIGHT,
    "right",
  );
}
function menu(ctx: Context, s: DeepReadonly<CaromState>): void {
  menuItems(s.screen).forEach((copy, i) => {
    const r = menuItemRect(s, i)!;
    const selected = i === s.menuIndex;
    round(ctx, r.x, r.y, r.w, r.h, 5, selected ? LEFT : "#111d28");
    if (!selected) line(ctx, r.x, r.y + r.h, r.x + r.w, r.y + r.h, LINE);
    text(
      ctx,
      `0${i + 1}`,
      r.x + 19,
      r.y + 35,
      12,
      selected ? "#2b6664" : QUIET,
    );
    text(
      ctx,
      copy,
      r.x + 61,
      r.y + 36,
      19,
      selected ? "#102526" : INK,
      "left",
      true,
    );
    text(
      ctx,
      "↗",
      r.x + r.w - 26,
      r.y + 37,
      24,
      selected ? "#102526" : QUIET,
      "center",
    );
  });
}
function title(ctx: Context, s: DeepReadonly<CaromState>): void {
  chrome(ctx, s);
  text(ctx, "THE PADDLE DUEL, WITH A TWIST.", 100, 151, 12, GOLD);
  text(ctx, C.TITLE_TEXT, 91, 274, 112, INK, "left", true);
  text(ctx, "Find your angle.", 100, 319, 26, QUIET);
  menu(ctx, s);
  text(ctx, "1 PLAYER VS AI", 491, 402, 10, QUIET);
  text(ctx, "2 PLAYERS / LOCAL", 491, 468, 10, QUIET);
  // A compact view of the actual opening court, rather than an external image.
  ctx.save();
  ctx.translate(590, 190);
  ctx.scale(0.47, 0.47);
  furniture(ctx, s);
  ctx.restore();
  text(ctx, "01", 593, 164, 12, LEFT);
  text(ctx, "02", 1186, 164, 12, RIGHT, "right");
  ctx.save();
  ctx.strokeStyle = LEFT;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  ctx.moveTo(645, 437);
  ctx.bezierCurveTo(730, 455, 777, 306, 890, 358);
  ctx.bezierCurveTo(976, 406, 1014, 232, 1115, 266);
  ctx.stroke();
  ctx.restore();
  dot(ctx, 1115, 266, 6, INK);
  text(ctx, "THE ANGLE IS EVERYTHING.", 593, 584, 15, INK);
  text(ctx, "Moving paddles bend the flight.", 593, 610, 13, QUIET);
  text(ctx, "Turning obstacles change the plan.", 593, 631, 13, QUIET);
}
function howto(ctx: Context, s: DeepReadonly<CaromState>): void {
  chrome(ctx, s);
  text(ctx, "THE FIELD GUIDE", 100, 144, 12, GOLD);
  text(ctx, "A little motion.", 97, 208, 52, INK, "left", true);
  text(ctx, "A different trajectory.", 97, 268, 52, INK, "left", true);
  const rows = [
    ["01 / MOVE", "W + S", "Left paddle. In Solo, ↑ + ↓ works too."],
    ["02 / DUEL", "↑ + ↓", "Right paddle in a local Versus match."],
    ["03 / CONTROL", "P / ESC", "Pause or resume. M toggles the sound."],
  ];
  rows.forEach((r, i) => {
    const y = 327 + i * 75;
    text(ctx, r[0], 100, y, 12, LEFT);
    text(ctx, r[1], 255, y + 2, 19, INK, "left", true);
    text(ctx, r[2], 100, y + 28, 15, QUIET);
  });
  line(ctx, 650, 302, 650, 548);
  text(ctx, "PUT SOME SPIN ON IT", 715, 329, 15, GOLD);
  text(ctx, "Move your paddle as you strike.", 715, 364, 21, INK);
  text(ctx, "The ball curves with your motion.", 715, 393, 17, QUIET);
  text(ctx, "PLAY THE BANK", 715, 451, 15, GOLD);
  text(ctx, "Swaying, rotating obstacles reflect", 715, 485, 17, QUIET);
  text(ctx, "your shot. Read the angle; find the gap.", 715, 513, 17, QUIET);
  text(
    ctx,
    `FIRST TO ${C.WIN_SCORE}. WIN BY ${C.WIN_LEAD}.`,
    715,
    572,
    15,
    INK,
  );
  menu(ctx, s);
}
export function render(s: DeepReadonly<CaromState>, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  grid(ctx);
  if (s.screen === "title") title(ctx, s);
  else if (s.screen === "howto") howto(ctx, s);
  else {
    furniture(ctx, s);
    scoreboard(ctx, s);
    if (s.screen === "countdown") {
      text(ctx, "GET READY", C.FIELD_CX, 276, 12, GOLD, "center");
      text(
        ctx,
        s.receiver === "left" ? "← YOUR SERVE" : "SERVING RIGHT →",
        C.FIELD_CX,
        308,
        20,
        INK,
        "center",
        true,
      );
      if (s.ball) {
        ctx.strokeStyle = LEFT;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(
          C.FIELD_CX,
          C.FIELD_CY,
          32,
          -Math.PI / 2,
          -Math.PI / 2 +
            Math.PI * 2 * Math.max(0, s.ball.holdTimer / C.HOLD_TIME),
        );
        ctx.stroke();
      }
      text(
        ctx,
        "MOVE ON CONTACT TO ADD SPIN",
        C.FIELD_CX,
        438,
        11,
        QUIET,
        "center",
      );
    }
    if (s.screen === "paused" || s.screen === "matchover") {
      ctx.fillStyle = "#0b1119dc";
      ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
      round(
        ctx,
        405,
        163,
        470,
        s.screen === "paused" ? 436 : 391,
        14,
        "#111b26",
      );
      text(
        ctx,
        s.screen === "paused" ? "TAKE A BREATHER" : "THE FINAL ANGLE",
        C.FIELD_CX,
        211,
        12,
        GOLD,
        "center",
      );
      text(
        ctx,
        s.screen === "paused"
          ? "PAUSED"
          : s.winner === "left"
            ? "PLAYER 01 WINS"
            : s.mode === "solo"
              ? "COMPUTER WINS"
              : "PLAYER 02 WINS",
        C.FIELD_CX,
        278,
        s.screen === "paused" ? 55 : 38,
        INK,
        "center",
        true,
      );
      text(
        ctx,
        `${s.score.p1}  —  ${s.score.p2}`,
        C.FIELD_CX,
        323,
        24,
        QUIET,
        "center",
      );
      menu(ctx, s);
    }
  }
  ctx.restore();
}
