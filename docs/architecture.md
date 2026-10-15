# Architecture and extraction

## Startup and game flow

`index.html` loads `src/main.js`, which mounts `src/App.vue` using Vue.
`App.vue` supplies a short local briefing to `src/components/TermsShooter.vue`.
That component owns the launch screen, HUD, input, accessibility, browser
storage and audio lifecycle. It dynamically imports the Three.js renderer
when the launch section nears the viewport.

The renderer, `src/assets/js/NeonShooter.js`, owns animation, WebGL resources,
visual effects and a `ShooterGame` instance. `ShooterGame.js` owns the simulation
and exposes `advanceSimulation(game, delta, input)`. It runs without Vue or
Three.js, which allows fast Node tests. Renderer helper classes build the
terrain, ships, weapons, trails and explosions procedurally.

`ShooterAudio.js` handles Web Audio effects and the copied MP3s in
`src/assets/sound`. `PersonalBests.js` and `BattleHistory.js` handle localStorage.
`src/components/terms-shooter.css` is the original feature stylesheet;
`src/style.css` supplies the small reset, theme variables and font faces that
were previously supplied by the website.

## What was copied and adapted

Source: `/Users/mike.watts/Documents/Code/1minus1-2025-nuxt`, commit
`f032253e9ce5f84e42e16441bf6d119817c0dbad`, copied on 2026-10-15.
The Nuxt source project was treated as read-only.

- `app/features/neon-shooter/assets` -> `src/assets`, unchanged.
- `app/features/neon-shooter/tests` -> `src/tests`, unchanged.
- Feature CSS copied unchanged.
- Shooter Vue component copied with explicit Vue imports replacing Nuxt
  auto-imports. Lenis calls were removed; restoring scroll uses the native
  browser API. CMS Markdown was replaced by a slot containing a local briefing.
  Terms-specific interface wording now refers to that briefing.
- Four local fonts copied from the site's public font directory.
- New Vite entry, config, package/lockfile, global theme/reset, documentation,
  and browser smoke tests added.

The Nuxt page wrappers, menu, footer, CMS fetch, analytics, page transitions,
Tailwind and other website dependencies are not required by the standalone app.
The game model, renderer, audio, scoring rules, storage keys and original
regression tests are preserved. No symlinks or imports refer back to the source
checkout. The original Nuxt feature README described site integration; these
docs replace it for the standalone project.

## Future multiplayer

Multiplayer is not implemented. Keep the current model/renderer split when
starting that work. The simulation already accepts input independently of the
rendering, but it currently uses local time, random spawning and one local
player. This is not yet a deterministic or networked simulation.

Before adding networking, choose cooperative versus competitive play and decide
which state a server owns. An authoritative server would own simulation,
spawning, hits and scores, accept player inputs, and send snapshots to browser
renderers over WebSockets. That work will require explicit player identities,
a shared clock/tick, reconnect behavior and synchronization. Personal bests and
battle history are currently browser-local, not shared leaderboards.

No server framework, network abstraction or multiplayer library has been added
in advance; the standalone app remains a small static client.
