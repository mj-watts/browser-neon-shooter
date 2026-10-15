# Browser Neon Shooter

Standalone copy of the 1MINUS1 neon shooter, using Vue, Three.js and Vite.
No Nuxt, CMS, server, environment variables, or external account is required.
The game runs entirely in the browser. All audio and fonts are local assets.

## Run locally

Use Node.js 24 LTS (Node 22.15+ is supported; the copied renderer tests use
`node:module.registerHooks`). With nvm, run `nvm use` first.

```sh
cd /Users/mike.watts/Documents/Code/tmp/browser-neon-shooter
npm ci
npm run dev
```

Open the URL printed by Vite, normally http://127.0.0.1:5173.
Dependencies have already been installed for this checkout, so you can start
with `npm run dev`. Scroll to the launch button and click **Launch flight**,
or keep scrolling to launch automatically. Reduced-motion users launch explicitly.

## Controls

| Action | Control |
| --- | --- |
| Move | Mouse, arrow keys, O/P for left/right, W/S for up/down |
| Fire | Hold Space or mouse button |
| Missile | B |
| Pause / resume | Escape or the on-screen button |
| Sound | Sound on/off button |
| Touch | Drag to move; automatic fire |
| Leave game | Flight briefing button |

The game pauses when the window loses focus. Personal bests and the last ten
battles use localStorage on the current origin. Existing scores from the Nuxt
site do not automatically transfer to this app. No scores are uploaded.

## Checks

```sh
npm test
npm run test:coverage
npm run test:e2e
```

All 27 original Node test files are copied unchanged into `src/tests`.
The additional Playwright tests check desktop launch, wave progression,
input, pause/resume, sound toggle, exit/relaunch, automatic scroll launch, and a touch viewport against
the production build. They fail on desktop JavaScript/console or HTTP errors.

Install Playwright's Chromium once before running the browser tests:

```sh
npx playwright install chromium
```

Browser screenshots are written to `test-results/` and ignored by Git.
Coverage is reported by Node; the inherited suite primarily tests simulation,
audio, persistence and renderer helpers, not every WebGL or Vue branch.

## Build and preview

```sh
npm run build
npm run preview
```

Open the printed preview URL, normally http://127.0.0.1:4173.
Publish the generated `dist/` directory with a static web server. There is no
backend process. Use HTTP(S); opening `index.html` with a file URL will not run
the source app. Vite uses a relative build base for hosting in a subdirectory.
The Three.js bundle may produce Vite's large-chunk advisory; the renderer is
loaded lazily when the launch area approaches the viewport.

A current browser with WebGL is needed. Browser audio starts after a user
interaction. The game includes reduced-motion and touch controls.

## Development

See [architecture and extraction notes](docs/architecture.md) for the entry
points, differences from the source project, and future multiplayer boundaries.
Dependency versions are recorded in `package-lock.json`; use `npm ci` to
reproduce the installed versions. Vite documentation: https://vite.dev/guide/.

## License

Project code is licensed under the [MIT License](LICENSE).
Copyright (c) 2026 mj-watts (the configured Git author).
Third-party libraries, fonts and audio retain their respective licenses and
are not relicensed by this project's MIT license.

## Extraction verification (2026-10-15)

- 217 original tests passed across all 27 copied test files.
- Production build passed; desktop, touch emulation and automatic scroll-launch
  browser checks all passed (3 Playwright tests). Desktop and touch screenshots
  were visually inspected.
- Node coverage: 72.95% lines overall, 89.59% branches, 81.23% functions;
  `ShooterGame.js` has 99.94% line coverage. WebGL initialization and rendering
  account for most uncovered lines; browser checks separately exercise startup.
- Production dependency audit: 0 vulnerabilities.
- Copied game assets, original test files and feature CSS match the source
  byte-for-byte. Source code hashes and the original Git working tree were
  checked and unchanged.
- Verified with Node 26.1.0, npm 11.13.0 and Playwright Chromium on macOS.
  Touch testing used browser emulation, not a physical phone. Audio loading and
  controls were checked; audible playback was not assessed by ear.
