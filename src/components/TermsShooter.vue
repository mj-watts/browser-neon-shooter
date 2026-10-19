<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from "vue";
import { POWER_ICONS } from "../assets/js/BlockIcons";
import soundtrackUrl from "../assets/sound/soundtrack.mp3?url";
import gameoverUrl from "../assets/sound/gameover.mp3?url";
import bigshipUrl from "../assets/sound/bigship.mp3?url";
import engagingUrl from "../assets/sound/engaging.mp3?url";
import engaging2Url from "../assets/sound/engaging-2.mp3?url";
import maydayUrl from "../assets/sound/mayday.mp3?url";
import sirenUrl from "../assets/sound/siren.mp3?url";
import ShooterAudio from "../assets/js/ShooterAudio";
import { readPersonalBests, completeRun } from "../assets/js/PersonalBests";
import {
  readBattles,
  recordBattle,
  readBestBattle,
  recordBestBattle,
} from "../assets/js/BattleHistory";

const upgradePixels = Object.fromEntries(
  Object.entries(POWER_ICONS).map(([power, rows]) => [
    power,
    rows.flatMap((row, y) =>
      [...row].flatMap((cell, x) => (cell === "." ? [] : [{ x, y }])),
    ),
  ]),
);
const mounted = ref(false);
const active = ref(false);
const loading = ref(false);
const failure = ref("");
const progress = ref(0);
const articleRef = ref(null);
const runwayRef = ref(null);
const canvasRef = ref(null);
const flightRef = ref(null);
const state = ref({
  phase: "countdown",
  wave: 0,
  score: 0,
  lives: 3,
  missileCount: 3,
  kills: 0,
  message: "3",
  paused: false,
  upgrades: [],
  notice: "",
  fleetRadio: false,
  fleetRadioMessage: "",
  civilians: [],
  civilianPenalty: null,
  rescues: 0,
});
const personalBests = ref(null);
const pastBattles = ref([]);
const bestBattle = ref(null);
const reducedMotion = ref(false);
const touch = ref(false);
const soundMuted = ref(false);
const audioBlocked = ref(false);
let sound;
const keys = new Set();
let engine;
let enginePromise;
let disposed = false;
let observer;
let motionQuery;
let resizeFrame;
let hasLaunched = false;
let pointerId;
let pointerFiring = false;
let target;
let scrollBeforeGame = 0;
let previousOverflow = "";
const formatScore = computed(
  () =>
    `${state.value.score < 0 ? "−" : ""}${String(Math.abs(state.value.score)).padStart(6, "0")}`,
);
const isCountdown = computed(() => state.value.phase === "countdown");
const isGameOver = computed(() => state.value.phase === "gameover");
const overlayMessage = computed(() =>
  state.value.paused
    ? "PAUSED"
    : isGameOver.value
      ? "GAME OVER"
      : isCountdown.value
        ? state.value.message
        : "",
);

function sampleText() {
  if (!articleRef.value || !engine) return;
  const walker = document.createTreeWalker(
    articleRef.value,
    NodeFilter.SHOW_TEXT,
  );
  const nodes = [];
  while (walker.nextNode())
    if (walker.currentNode.textContent.trim()) nodes.push(walker.currentNode);
  let remaining = 800;
  const seeds = [];
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = 48;
  sampleCanvas.height = 56;
  const context = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  for (const node of nodes.reverse()) {
    const style = getComputedStyle(node.parentElement);
    const text = node.textContent;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.textBaseline = "top";
    for (let i = text.length - 1; i >= 0 && remaining > 0; i--, remaining--) {
      if (!text[i].trim()) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      if (!rect.width) continue;
      context.clearRect(0, 0, 48, 56);
      context.fillStyle = "#fff";
      context.fillText(text[i], 0, 0);
      const pixels = context.getImageData(0, 0, 48, 56).data;
      for (let y = 0; y < Math.min(rect.height, 56); y += 4)
        for (let x = 0; x < Math.min(rect.width, 48); x += 4) {
          if (pixels[(y * 48 + x) * 4 + 3] > 80)
            seeds.push({
              x: rect.left + x,
              y: rect.top + window.scrollY + y,
              scatterX: (Math.random() - 0.5) * 40,
            });
        }
    }
    if (remaining <= 0) break;
  }
  engine.setTextSeeds(seeds);
}

async function ensureEngine() {
  if (engine) return engine;
  if (enginePromise) return enginePromise;
  loading.value = true;
  enginePromise = (async () => {
    try {
      const { default: NeonShooter } = await import("../assets/js/NeonShooter");
      if (disposed) return;
      engine = new NeonShooter(canvasRef.value, {
        reducedMotion: reducedMotion.value,
        onEvent: (event) => sound?.effect(event),
        onState: (next) => {
          if (next.paused !== state.value.paused) sound?.setPaused(next.paused);
          if (
            next.phase === "countdown" &&
            next.message !== state.value.message
          )
            sound?.effect({ type: "countdown" });
          if (next.phase === "gameover" && state.value.phase !== "gameover") {
            personalBests.value = completeRun(personalBests.value, next).best;
            pastBattles.value = recordBattle(pastBattles.value, next);
            bestBattle.value = recordBestBattle(bestBattle.value, next);
          }
          state.value = next;
        },
        onError: () => handleFailure(),
      });
      sampleText();
      engine.setProgress(progress.value);
      engine.setVisible(progress.value > 0 || active.value);
      return engine;
    } catch {
      handleFailure();
    } finally {
      loading.value = false;
    }
  })();
  return enginePromise;
}

function handleFailure() {
  failure.value =
    "The flight deck could not start on this device. Try a browser with WebGL support.";
  if (active.value) exitGame();
}
function unlockAudio() {
  if (!sound) {
    sound = new ShooterAudio({
      soundtrackUrl,
      gameoverUrl,
      bigshipUrl,
      engagingUrls: [engagingUrl, engaging2Url],
      maydayUrl,
      sirenUrl,
      onStatus: (status) => {
        audioBlocked.value = status === "blocked";
      },
    });
    sound.setMuted(soundMuted.value);
  }
  sound.unlock();
}
function toggleSound() {
  if (audioBlocked.value && !soundMuted.value) {
    unlockAudio();
    return;
  }
  soundMuted.value = !soundMuted.value;
  unlockAudio();
  sound.setMuted(soundMuted.value);
}
function syncInput() {
  engine?.setInput({
    left: keys.has("o") || keys.has("arrowleft"),
    right: keys.has("p") || keys.has("arrowright"),
    up: keys.has("w") || keys.has("arrowup"),
    down: keys.has("s") || keys.has("arrowdown"),
    fire: keys.has(" ") || touch.value || pointerFiring,
    missile: keys.has("b"),
    target,
  });
}
function clearInput() {
  keys.clear();
  target = undefined;
  pointerId = undefined;
  pointerFiring = false;
  syncInput();
}
function keyDown(event) {
  if (!active.value) return;
  if (event.key === "Tab") {
    const controls = [
      ...flightRef.value.querySelectorAll("button:not(:disabled), a[href]"),
    ];
    const first = controls[0],
      last = controls.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === flightRef.value)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
    return;
  }
  if (!state.value.paused) sound?.unlock();
  const key = event.key.toLowerCase();
  if (key === "escape") {
    event.preventDefault();
    togglePause();
    return;
  }
  if (
    ![
      "b",
      "o",
      "p",
      "w",
      "s",
      " ",
      "arrowleft",
      "arrowright",
      "arrowup",
      "arrowdown",
    ].includes(key) ||
    event.target.closest("button, a, input")
  )
    return;
  event.preventDefault();
  if (key !== " " && key !== "b") target = undefined;
  keys.add(key);
  syncInput();
}
function keyUp(event) {
  keys.delete(event.key.toLowerCase());
  syncInput();
}
function pointerDown(event) {
  if (
    !active.value ||
    state.value.paused ||
    isGameOver.value ||
    event.target.closest("button, a")
  )
    return;
  sound?.unlock();
  pointerId = event.pointerId;
  event.currentTarget.setPointerCapture(event.pointerId);
  target = engine?.pointerToWorld(event.clientX, event.clientY);
  if (target && event.pointerType !== "mouse") target.y += 1.8;
  pointerFiring = true;
  syncInput();
}
function pointerMove(event) {
  if (
    !active.value ||
    state.value.paused ||
    isGameOver.value ||
    event.target.closest("button, a")
  )
    return;
  if (event.pointerType !== "mouse" && event.pointerId !== pointerId) return;
  target = engine?.pointerToWorld(event.clientX, event.clientY);
  if (target && event.pointerType !== "mouse") target.y += 1.8;
  syncInput();
}
function pointerUp(event) {
  pointerId = undefined;
  pointerFiring = false;
  if (event.pointerType !== "mouse" || event.type === "pointercancel")
    target = undefined;
  syncInput();
}
function pointerLeave(event) {
  if (event.pointerType === "mouse" && pointerId === undefined) {
    target = undefined;
    syncInput();
  }
}

async function launch() {
  if (active.value || failure.value) return;
  unlockAudio();
  const instance = await ensureEngine();
  if (!instance || disposed || active.value) return;
  hasLaunched = true;
  scrollBeforeGame = window.scrollY;
  previousOverflow = document.documentElement.style.overflow;
  active.value = true;
  progress.value = 1;
  document.documentElement.style.overflow = "hidden";
  instance.setProgress(1);
  instance.setVisible(true);
  instance.start();
  sound.start();
  clearInput();
  await nextTick();
  flightRef.value?.focus({ preventScroll: true });
}
function togglePause() {
  if (!engine || isGameOver.value) return;
  const paused = !state.value.paused;
  clearInput();
  if (!paused) sound?.unlock();
  engine.setPaused(paused);
  if (!paused) nextTick(() => flightRef.value?.focus({ preventScroll: true }));
}
function replay() {
  unlockAudio();
  sound.start();
  clearInput();
  engine?.start();
  nextTick(() => flightRef.value?.focus({ preventScroll: true }));
}
function unlockPage() {
  document.documentElement.style.overflow = previousOverflow;
  window.scrollTo({ top: scrollBeforeGame, behavior: "instant" });
}
function exitGame() {
  if (!active.value) return;
  active.value = false;
  clearInput();
  sound?.stop();
  engine?.transition();
  engine?.setVisible(false);
  unlockPage();
  progress.value = 0;
  nextTick(() => {
    articleRef.value?.scrollIntoView({ block: "start", behavior: "instant" });
    articleRef.value?.focus({ preventScroll: true });
  });
}
function measureScroll() {
  if (!runwayRef.value || active.value) return;
  const rect = runwayRef.value.getBoundingClientRect();
  const height = window.innerHeight;
  progress.value = Math.max(
    0,
    Math.min(1, (height * 0.85 - rect.top) / (height * 1.15)),
  );
  engine?.setProgress(progress.value);
  engine?.setVisible(progress.value > 0 && !document.hidden);
  // Reduced motion always uses an explicit launch instead of an automatic takeover.
  if (
    progress.value >= 1 &&
    !hasLaunched &&
    !reducedMotion.value &&
    !loading.value &&
    !failure.value &&
    rect.bottom > 0
  )
    launch();
}
function onScroll() {
  if (resizeFrame) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = undefined;
    measureScroll();
  });
}
function onResize() {
  touch.value = matchMedia("(pointer: coarse)").matches || innerWidth <= 760;
  syncInput();
  sampleText();
  onScroll();
}
function loseFocus() {
  clearInput();
  if (active.value && !state.value.paused && !isGameOver.value)
    engine?.setPaused(true);
}
function visibilityChanged() {
  if (document.hidden) loseFocus();
  engine?.setVisible(
    !document.hidden && (active.value || progress.value > 0),
  );
}
function motionChanged(event) {
  reducedMotion.value = event.matches;
  if (engine) engine.reducedMotion = event.matches;
}

onMounted(async () => {
  personalBests.value = readPersonalBests();
  pastBattles.value = readBattles();
  bestBattle.value = readBestBattle(pastBattles.value);
  mounted.value = true;
  motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion.value = motionQuery.matches;
  touch.value = matchMedia("(pointer: coarse)").matches || innerWidth <= 760;
  motionQuery.addEventListener("change", motionChanged);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", loseFocus);
  document.addEventListener("visibilitychange", visibilityChanged);
  await nextTick();
  if (disposed) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting))
        ensureEngine().then(measureScroll);
    },
    { rootMargin: "100% 0px" },
  );
  observer.observe(runwayRef.value);
  measureScroll();
});
onBeforeUnmount(() => {
  disposed = true;
  if (active.value) unlockPage();
  cancelAnimationFrame(resizeFrame);
  observer?.disconnect();
  motionQuery?.removeEventListener("change", motionChanged);
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("resize", onResize);
  window.removeEventListener("keydown", keyDown);
  window.removeEventListener("keyup", keyUp);
  window.removeEventListener("blur", loseFocus);
  document.removeEventListener("visibilitychange", visibilityChanged);
  sound?.dispose();
  engine?.dispose();
});
</script>

<template>
  <section
    class="terms-shooter"
    :style="{ '--dissolve': reducedMotion ? 0 : progress }"
    @pointerdown.capture="unlockAudio"
    @keydown.capture="unlockAudio"
  >
    <div class="terms-reading-toolbar">
      <span>FLIGHT BRIEFING / READY WHEN YOU ARE</span>
    </div>
    <article
      ref="articleRef"
      tabindex="-1"
      class="terms-document"
      aria-label="Flight briefing"
    >
      <slot />
    </article>
    <div v-if="mounted" ref="runwayRef" class="terms-runway">
      <div class="terms-launch-copy">
        <p class="terms-launch-kicker">
          SYSTEMS READY. YOUR NEXT FLIGHT STARTS HERE.
        </p>
        <h2>You made it.<br /><span>Now make it out.</span></h2>
        <p>There’s a whole universe down here.</p>
        <p class="terms-launch-controls">
          <span>MOUSE TO FLY</span>
          <span><kbd>O</kbd><kbd>P</kbd> LEFT / RIGHT</span
          ><span><kbd>W</kbd><kbd>S</kbd> UP / DOWN</span
          ><span><kbd>SPACE</kbd> FIRE</span>
          <span><kbd>B</kbd> MISSILE</span>
        </p>
        <p class="terms-touch-controls">DRAG TO FLY · AUTO FIRE</p>
        <button
          class="terms-launch-button"
          :disabled="loading || !!failure"
          @click="launch"
        >
          {{
            failure
              ? "Flight unavailable"
              : loading
                ? "Preparing flight…"
                : hasLaunched
                  ? "Fly again ↗"
                  : "Launch flight ↗"
          }}
        </button>
        <p v-if="failure" role="status" class="terms-flight-error">
          {{ failure }}
        </p>
        <span class="terms-scroll-hint" aria-hidden="true">{{
          reducedMotion
            ? "PRESS LAUNCH WHEN READY"
            : "KEEP SCROLLING TO LAUNCH ↓"
        }}</span>
      </div>
    </div>
    <Teleport v-if="mounted" to="body">
      <div
        v-show="progress > 0 || active"
        ref="flightRef"
        class="terms-flight-layer"
        :class="{ 'terms-flight-layer--active': active }"
        :style="{ opacity: active ? 1 : Math.min(1, progress * 2.5) }"
        :role="active ? 'application' : undefined"
        :aria-label="active ? 'Neon space shooter' : undefined"
        :aria-describedby="active ? 'flight-control-instructions' : undefined"
        :aria-hidden="!active"
        :tabindex="active ? 0 : -1"
        @pointerdown="pointerDown"
        @pointermove="pointerMove"
        @pointerleave="pointerLeave"
        @pointerup="pointerUp"
        @pointercancel="pointerUp"
        @lostpointercapture="pointerUp"
      >
        <canvas
          ref="canvasRef"
          aria-label="Neon ships, stars, and explosions"
        ></canvas>
        <template v-if="active">
          <div class="flight-vignette" aria-hidden="true"></div>
          <header class="flight-hud">
            <div class="flight-brand"><span>AFTER HOURS</span></div>
            <div class="flight-stats">
              <div class="flight-score">
                <span>SCORE</span><strong>{{ formatScore }}</strong>
                <small class="flight-pb">
                  <span class="flight-pb-label">PB</span>
                  <span class="flight-pb-value">{{
                    personalBests?.score ?? "—"
                  }}</span>
                </small>
              </div>
              <div class="flight-wave">
                <span>WAVE</span
                ><strong>{{ String(state.wave).padStart(2, "0") }}</strong>
                <small class="flight-pb">
                  <span class="flight-pb-label">PB</span>
                  <span class="flight-pb-value">{{
                    personalBests?.wave ?? "—"
                  }}</span>
                </small>
              </div>
              <div
                class="flight-shields"
                :aria-label="`${state.lives} lives remaining`"
              >
                <span>SHIELDS</span>
                <strong>{{ String(state.lives).padStart(2, "0") }}</strong>
                <div aria-hidden="true">
                  <i
                    v-for="life in 3"
                    :key="life"
                    :class="{ 'flight-shield--lost': life > state.lives }"
                  ></i>
                </div>
              </div>
              <div
                class="flight-missiles"
                :aria-label="`${state.missileCount} missiles stored, maximum 10. Press B to fire.`"
              >
                <span>MISSILES</span>
                <strong>{{
                  String(state.missileCount).padStart(2, "0")
                }}</strong>
              </div>
            </div>
            <button
              class="flight-control"
              :disabled="isGameOver"
              @click.stop="togglePause"
            >
              {{ state.paused ? "Resume" : "Pause" }}</button
            ><button
              class="flight-control"
              :aria-pressed="!soundMuted && !audioBlocked"
              @click.stop="toggleSound"
            >
              {{
                soundMuted
                  ? "Sound off"
                  : audioBlocked
                    ? "Enable sound"
                    : "Sound on"
              }}</button
            ><button class="flight-control" @click.stop="exitGame">
              Flight briefing ↗
            </button>
          </header>
          <aside
            v-if="state.upgrades?.length"
            class="flight-upgrades"
            aria-label="Active upgrades"
          >
            <div
              v-for="upgrade in state.upgrades"
              :key="upgrade.id"
              class="flight-upgrade"
              :class="`flight-upgrade--${upgrade.id}`"
            >
              <svg viewBox="0 0 7 7" fill="currentColor" aria-hidden="true">
                <rect
                  v-for="pixel in upgradePixels[upgrade.id]"
                  :key="`${pixel.x}-${pixel.y}`"
                  :x="pixel.x"
                  :y="pixel.y"
                  width=".85"
                  height=".85"
                />
              </svg>
              <span>{{ upgrade.label }}</span
              ><strong>{{ Math.ceil(upgrade.remaining) }}s</strong>
              <div
                class="flight-upgrade-timer"
                :style="{
                  transform: `scaleX(${upgrade.remaining / upgrade.duration})`,
                }"
              ></div>
            </div>
          </aside>
          <aside
            v-if="state.fleetRadio"
            class="flight-fleet-radio"
            role="status"
          >
            <div class="flight-fleet-pilots" aria-hidden="true">
              <svg
                v-for="pilot in 2"
                :key="pilot"
                viewBox="0 0 32 36"
                shape-rendering="crispEdges"
              >
                <rect width="32" height="36" fill="#102035" />
                <path
                  :fill="pilot === 1 ? '#61eaff' : '#ff83d7'"
                  d="M8 4h16v3H8zM5 7h22v17H5zM8 24h16v4H8zM4 30h24v6H4z"
                />
                <path
                  :fill="pilot === 1 ? '#ffd69d' : '#c98c65'"
                  d="M10 11h12v13H10zM12 24h8v5h-8z"
                />
                <path
                  fill="#07101d"
                  d="M8 10h16v7H8zM4 15h4v9H4zM24 15h4v9h-4zM18 23h8v3h-8z"
                />
                <path
                  fill="#d2fcff"
                  d="M10 12h5v2h-5zM18 12h4v2h-4zM13 20h6v2h-6z"
                />
              </svg>
            </div>
            <div>
              <span
                >FLEET COMMS ·
                {{
                  state.fleetRadioMessage === "Good job guys!"
                    ? "FOUR OUTBOUND"
                    : "FOUR INBOUND"
                }}</span
              ><strong>{{ state.fleetRadioMessage }}</strong>
            </div>
          </aside>
          <aside
            v-if="state.rescues > 0"
            class="flight-rescue-panel"
            aria-label="Civilian rescues"
          >
            <svg
              viewBox="0 0 32 40"
              aria-hidden="true"
              shape-rendering="crispEdges"
            >
              <path fill="#53e9b4" d="M9 3h14v4H9zM8 7h17v3H8z" />
              <path fill="#ffd69d" d="M10 10h12v12H10zM26 8h5v7h-5z" />
              <path
                fill="#15212f"
                d="M12 12h2v3h-2zM18 12h2v3h-2zM14 18h4v2h-4z"
              />
              <path
                fill="#a3e7d4"
                d="M9 22h14v10H9zM23 22h3v-8h4v12h-7zM5 23h4v9H5z"
              />
              <path fill="#53e9b4" d="M10 32h5v7h-5zM17 32h5v7h-5z" />
            </svg>
            <div role="status" aria-live="polite" aria-atomic="true">
              <span>RESCUED · {{ state.rescues }}</span>
              <strong
                >+{{ (state.rescues * 10000).toLocaleString("en-GB") }}</strong
              >
              <small>THANK YOU, PILOT!</small>
            </div>
          </aside>
          <p
            v-if="state.notice && !overlayMessage"
            class="flight-supply-notice"
            role="status"
          >
            {{ state.notice }}
          </p>
          <div
            v-if="!state.paused && !isGameOver"
            class="flight-civilian-markers"
            aria-hidden="true"
          >
            <span
              v-for="civilian in state.civilians"
              :key="civilian.id"
              :style="{ left: `${civilian.left}%`, top: `${civilian.top}%` }"
              >CIVILIAN · {{ civilian.hit ? "HELP!" : "HOLD FIRE" }} ·
              {{ civilian.hp }}/5</span
            >
          </div>
          <aside
            v-if="state.civilianPenalty && !isGameOver && !state.paused"
            class="flight-civilian-penalty"
          >
            <p :key="state.civilianPenalty.id" role="alert">
              {{ state.civilianPenalty.text }}
            </p>
            <strong>−1,000 POINTS</strong>
          </aside>
          <div
            v-if="!state.paused && !isGameOver"
            class="flight-callouts"
            aria-hidden="true"
          >
            <span
              v-for="callout in state.callouts"
              :key="callout.id"
              class="flight-callout"
              :class="`flight-callout--${callout.kind}`"
              :style="{
                left: `${callout.left}%`,
                top: `${callout.top}%`,
                opacity: callout.opacity,
                transform: `translate(-50%, -50%) rotate(${callout.angle}deg) scale(${callout.scale})`,
              }"
              >{{ callout.text }}</span
            >
          </div>
          <div
            v-if="overlayMessage"
            :key="overlayMessage"
            class="flight-overlay"
            :class="{
              'flight-overlay--countdown': isCountdown && !state.paused,
              'flight-overlay--gameover': isGameOver && !state.paused,
            }"
          >
            <p v-if="!isCountdown || state.paused">
              {{
                state.paused
                  ? "TAKE A BREATH. THE UNIVERSE CAN WAIT."
                  : isGameOver
                    ? "THE CANYON WILL BE WAITING."
                    : "SYSTEMS ONLINE / EYES UP"
              }}
            </p>
            <h2>{{ overlayMessage }}</h2>
            <template v-if="state.paused"
              ><button class="terms-launch-button" @click.stop="togglePause">
                Resume flight →</button
              ><button class="flight-control" @click.stop="exitGame">
                Back to briefing
              </button></template
            ><template v-else-if="isGameOver"
              ><div class="flight-battles">
                <h3>Past battles</h3>
                <div class="flight-battles-scroll">
                  <table>
                    <caption class="sr-only">
                      Your last 10 battles, newest first
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Score</th>
                        <th scope="col">Wave</th>
                        <th scope="col">Enemies killed</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="bestBattle" class="flight-battle--best">
                        <td>
                          <span class="flight-battle-label">Personal best</span
                          >{{ bestBattle.score }}
                        </td>
                        <td>{{ bestBattle.wave }}</td>
                        <td>{{ bestBattle.kills }}</td>
                      </tr>
                      <tr
                        v-for="(battle, index) in pastBattles"
                        :key="index"
                        :class="{ 'flight-battle--latest': index === 0 }"
                      >
                        <td>{{ battle.score }}</td>
                        <td>{{ battle.wave }}</td>
                        <td>{{ battle.kills }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <button class="terms-launch-button" @click.stop="replay">
                One more flight ↗</button
              ><button class="flight-control" @click.stop="exitGame">
                Back to briefing
              </button></template
            >
            <p v-else-if="!isCountdown">
              {{
                touch
                  ? "DRAG TO FLY · AUTO FIRE"
                  : "MOVE MOUSE OR O / P & W / S · SPACE / HOLD CLICK TO FIRE"
              }}
            </p>
          </div>
          <div
            v-else-if="state.phase === 'intermission'"
            class="flight-wave-clear"
            aria-live="polite"
          >
            <strong>WAVE CLEAR</strong><span>{{ state.message }}</span
            ><small>COLLECT THE STARS. CATCH YOUR BREATH.</small>
          </div>
          <footer id="flight-control-instructions" class="flight-footer">
            <span class="flight-desktop-help"
              >MOUSE OR <kbd>O</kbd><kbd>P</kbd> MOVE <kbd>W</kbd><kbd>S</kbd>
              <span>↑↓</span> <kbd>SPACE</kbd> FIRE <kbd>B</kbd> MISSILE
              <kbd>ESC</kbd> PAUSE</span
            ><span class="flight-mobile-help">DRAG TO FLY / AUTO FIRE</span
            ><span class="flight-bonus-help">FULL WAVE = ★ 10</span>
          </footer>
          <p class="sr-only" role="status" aria-live="polite">
            {{
              state.paused
                ? "Game paused"
                : isGameOver
                  ? `Game over. ${state.score} points. Wave ${state.wave}. ${state.kills} enemies killed. Past battles updated.`
                  : isCountdown
                    ? state.message
                    : `Wave ${state.wave}. ${state.lives} lives.`
            }}
          </p>
        </template>
      </div>
    </Teleport>
  </section>
</template>

<style src="./terms-shooter.css"></style>
