# Carom

**Find your angle.** Carom is a browser-based, top-down paddle duel with a twist:
moving your paddle on contact puts spin on the ball, bending its flight. Two
swaying, rotating obstacles turn a straight rally into a bank-shot puzzle.

Play **Solo** against the computer or **Versus** with a friend on one keyboard.
First to 11 wins, with a two-point lead required. Everything is drawn in code;
sound is synthesized locally. There are no runtime downloads or accounts.

## Run locally

Use a current Node.js release supported by Vite (Node 22.12+ recommended).

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. The game fits the window while preserving its
16:9 court. Touch devices get the engine's two vertical sliders and menu buttons.

## Production build

```sh
npm ci
npm run build
```

Serve **`dist/`** at the root of any static web server. The entry point is
`dist/index.html`. To check that build locally, run `npm run preview`.

## Controls

| Input | Effect |
| --- | --- |
| W / S | Move player one's left paddle |
| ↑ / ↓ | Move player two's right paddle in Versus; also controls the left paddle in Solo |
| W / S or ↑ / ↓ in menus | Select an item |
| Enter / Space | Confirm |
| Mouse click / touch tap | Select and confirm menu items |
| P / Escape | Pause or resume a match |
| Escape in help or results | Return to the title |
| M | Toggle sound on any screen |
| Backtick | Toggle the engine's diagnostic overlay |

Strike near a paddle's end to change the outgoing angle. Move at the instant of
contact to add spin; upward motion adds negative spin, downward motion positive.
Spin decays gradually. Wall and obstacle reflections preserve it, so a curved
shot can become a surprising bank. Each paddle hit makes the ball faster, up to
its speed cap.

## Development and verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests run the real Simple 2D engine with an in-process canvas and counted clock
frames. They exercise the state machine, keyboard and pointer ordering, serve
and scoring rules, AI gates, driven paddles, oriented collisions, spin, sound,
and agreement between 2 ms and 16 ms steps. Coverage reports are in `coverage/`.

`src/game.ts` declares the immutable state and public debug types. `simulation.ts`
and `physics.ts` implement the render-free world, `menus.ts` handles menu layout
and input, `debug.ts` supplies the engine-only pose/read surface, and `render.ts`
draws the court and screens. All specified figures come from `src/constants.ts`.
The engine owns timing, canvas fitting, input, touch controls, audio, diagnostics,
and recording. Its documentation is in `engine/`; the game specification is in
`specs/`.

The player-facing description and screenshot/replay carousel are in `showcase/`.
