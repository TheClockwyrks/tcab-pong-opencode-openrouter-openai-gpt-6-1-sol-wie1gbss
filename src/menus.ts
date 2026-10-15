import type { DeepReadonly } from "ts-essentials";
import type { UpdateApi } from "@clockwyrks/simple-2d";
import type { CaromState, MenuRect, Screen } from "./game";
import * as C from "./constants";
import { returnTitle, startMatch } from "./simulation";

export function menuItems(screen: Screen): readonly string[] {
  switch (screen) {
    case "title":
      return C.TITLE_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "matchover":
      return C.MATCHOVER_ITEMS;
    case "howto":
      return ["BACK TO MENU"];
    default:
      return [];
  }
}
export function menuItemRect(
  s: DeepReadonly<CaromState>,
  index: number,
): MenuRect | null {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= menuItems(s.screen).length
  )
    return null;
  if (s.screen === "title")
    return { x: 100, y: 366 + index * 66, w: 370, h: 56 };
  if (s.screen === "howto") return { x: 100, y: 581, w: 370, h: 56 };
  return { x: 455, y: 365 + index * 66, w: 370, h: 56 };
}
function hit(s: DeepReadonly<CaromState>, x: number, y: number): number | null {
  for (let i = 0; i < menuItems(s.screen).length; i++) {
    const r = menuItemRect(s, i)!;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return null;
}
function confirm(s: DeepReadonly<CaromState>): CaromState {
  switch (s.screen) {
    case "title": {
      const next = { ...s, titleIndex: s.menuIndex };
      return s.menuIndex === 2
        ? { ...next, screen: "howto", menuIndex: 0 }
        : startMatch(next, s.menuIndex === 0 ? "solo" : "versus");
    }
    case "howto":
      return returnTitle(s);
    case "paused":
      return s.menuIndex === 0
        ? { ...s, screen: s.resumeScreen }
        : s.menuIndex === 1
          ? startMatch(s, s.mode)
          : returnTitle(s);
    case "matchover":
      return s.menuIndex === 0 ? startMatch(s, s.mode) : returnTitle(s);
    default:
      return s;
  }
}

// An input-history cache belongs to the state value, never a module closure.
// It contains only active menu press origins, and is discarded at screen changes.
// It is deliberately excluded from the declared world and its snapshot.
interface MenuInputState extends CaromState {
  readonly menuPresses?: Readonly<Record<number, number | null>>;
}
export function readControls(
  state: DeepReadonly<CaromState>,
  api: UpdateApi,
): CaromState {
  const edges = Object.fromEntries(
    C.ACTIONS.map((a) => [a, api.input.pressed(a)]),
  ) as Record<C.ActionName, boolean>;
  const samples = api.input.pointerSamples();
  const contacts = api.input.pointerContacts();
  let s: CaromState = {
    ...state,
    muted: edges.mute ? !state.muted : state.muted,
  };
  if (state.screen === "playing" || state.screen === "countdown") {
    return edges.pause
      ? { ...s, screen: "paused", resumeScreen: state.screen, menuIndex: 0 }
      : s;
  }
  if (state.screen === "paused" && (edges.pause || edges.back))
    return { ...s, screen: s.resumeScreen };
  if ((state.screen === "howto" || state.screen === "matchover") && edges.back)
    return returnTitle(s);
  const up = edges["p1-up"] || edges["p2-up"];
  const down = edges["p1-down"] || edges["p2-down"];
  const count = menuItems(state.screen).length;
  const moved = state.screen !== "howto" && (up || down);
  if (moved)
    s = { ...s, menuIndex: (s.menuIndex + (up ? -1 : 1) + count) % count };
  const keyboardConfirm = !moved && edges.confirm;
  // Resolve the keyboard's item before pointer selections, as the input contract requires.
  const keyboardResult = keyboardConfirm ? confirm(s) : null;
  const presses = { ...(state as DeepReadonly<MenuInputState>).menuPresses };
  let pointerConfirm = false;
  for (const sample of samples) {
    const index = hit(state, sample.x, sample.y);
    if (index !== null) s = { ...s, menuIndex: index };
    if (sample.type === "down" && sample.button === "primary")
      presses[sample.id] = index;
    if (sample.type === "up") {
      if (index !== null && presses[sample.id] === index) pointerConfirm = true;
      delete presses[sample.id];
    }
  }
  for (const contact of contacts) {
    const index = hit(state, contact.x, contact.y);
    if (index !== null) s = { ...s, menuIndex: index };
  }
  const result = keyboardResult ?? (pointerConfirm ? confirm(s) : s);
  const next: MenuInputState = {
    ...result,
    menuPresses: result.screen === state.screen ? presses : {},
  };
  return next;
}
