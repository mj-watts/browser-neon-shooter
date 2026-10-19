import { test } from "node:test";
import assert from "node:assert/strict";
import ShooterAudio from "../assets/js/ShooterAudio.js";

function setup(options = {}) {
  const nodes = [];
  const parameter = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime(value) {
      this.value = value;
    },
  });
  const node = () => {
    const value = {
      gain: parameter(),
      frequency: parameter(),
      Q: parameter(),
      delayTime: parameter(),
      threshold: parameter(),
      knee: parameter(),
      ratio: parameter(),
      attack: parameter(),
      release: parameter(),
      connect() {},
      disconnect() {
        this.disconnected = true;
      },
      start() {},
      stop(time) {
        if (time === undefined) this.onended?.();
      },
    };
    nodes.push(value);
    return value;
  };
  const context = {
    currentTime: 0,
    sampleRate: 8000,
    state: "suspended",
    destination: {},
    createGain: node,
    createOscillator: node,
    createBufferSource: node,
    createBiquadFilter: node,
    createDelay: node,
    createDynamicsCompressor: node,
    createBuffer: (_, length) => ({
      getChannelData: () => new Float32Array(length),
    }),
    async resume() {
      this.state = "running";
    },
    async suspend() {
      this.state = "suspended";
    },
    async close() {
      this.state = "closed";
    },
  };
  let tick;
  let timers = 0;
  const audio = new ShooterAudio({
    ...options,
    createContext: () => context,
    setTimer: (fn) => {
      tick = fn;
      timers++;
      return timers;
    },
    clearTimer: () => {
      tick = undefined;
    },
  });
  return { audio, context, nodes, tick: () => tick?.(), timers: () => timers };
}

test("audio stays lazy and silent until effects fire, mutes, pauses and cleans up on leaving", async () => {
  const { audio, context, nodes, tick, timers } = setup();
  assert.equal(nodes.length, 0);
  audio.start();
  await Promise.resolve();
  assert.equal(context.state, "running");
  assert.equal(audio.sources.size, 0);
  assert.equal(timers(), 0);
  audio.effect({ type: "shot" });
  assert.ok(audio.sources.size > 0);
  audio.unlock();
  await Promise.resolve();
  assert.equal(timers(), 0);
  audio.setMuted(true);
  assert.equal(audio.master.gain.value, 0);
  const count = nodes.length;
  context.currentTime = 0.3;
  tick();
  audio.effect({ type: "missileExplosion" });
  assert.equal(nodes.length, count);
  audio.setMuted(false);
  assert.equal(audio.master.gain.value, 0.55);
  audio.setPaused(true);
  assert.equal(context.state, "suspended");
  assert.equal(audio.sources.size, 0);
  context.currentTime = 20;
  tick();
  assert.equal(audio.sources.size, 0);
  audio.effect({ type: "shot" });
  assert.equal(nodes.length, count);
  audio.setPaused(false);
  await Promise.resolve();
  assert.equal(timers(), 0);
  assert.equal(audio.sources.size, 0);
  audio.effect({ type: "shot" });
  assert.ok(audio.sources.size > 0);
  audio.dispose();
  assert.equal(context.state, "closed");
  assert.equal(audio.sources.size, 0);
  assert.ok(audio.master.disconnected);
  assert.ok(audio.effects.disconnected);
});

test("effects throttle rapid fire and game over stops effects even while muted", async () => {
  const { audio, nodes, context } = setup();
  audio.start();
  await Promise.resolve();
  const before = nodes.length;
  audio.effect({ type: "shot" });
  const after = nodes.length;
  assert.ok(after > before);
  audio.effect({ type: "shot" });
  assert.equal(nodes.length, after);
  context.currentTime += 0.1;
  audio.effect({ type: "shot" });
  assert.ok(nodes.length > after);
  audio.setMuted(true);
  audio.effect({ type: "gameover" });
  assert.equal(audio.active, false);
  assert.equal(audio.timer, undefined);
  audio.dispose();
});

test("missing audio support leaves gameplay free to continue", () => {
  const audio = new ShooterAudio({ createContext: () => null });
  assert.doesNotThrow(() => {
    audio.start();
    audio.effect({ type: "explosion" });
    audio.setMuted(true);
    audio.setPaused(true);
    audio.stop();
    audio.dispose();
  });
});

test("already-unlocked audio stays silent until an effect fires", () => {
  const { audio, context, timers } = setup();
  context.state = "running";
  context.resume = () => new Promise(() => {});
  audio.start();
  assert.equal(timers(), 0);
  assert.equal(audio.sources.size, 0);
  audio.effect({ type: "shot" });
  assert.ok(audio.sources.size > 0);
  audio.dispose();
});

test("scroll launch reports blocked audio and state changes enable effects without music", async () => {
  const { audio, context, timers } = setup();
  const statuses = [];
  audio.onStatus = (status) => statuses.push(status);
  context.resume = async () => {};
  audio.start();
  await Promise.resolve();
  assert.equal(statuses.at(-1), "blocked");
  assert.equal(timers(), 0);
  context.state = "running";
  context.onstatechange();
  assert.equal(statuses.at(-1), "playing");
  assert.equal(timers(), 0);
  assert.equal(audio.sources.size, 0);
  audio.effect({ type: "shot" });
  assert.ok(audio.sources.size > 0);
  audio.dispose();
  assert.equal(context.onstatechange, null);
});

test("synthesized gameplay sound effects still produce audio", async () => {
  const { audio, context, nodes } = setup();
  audio.start();
  await Promise.resolve();
  for (const type of [
    "countdown",
    "laser",
    "missileLaunch",
    "enemyShot",
    "shot",
    "impact",
    "armourImpact",
    "explosion",
    "groundExplosion",
    "missileExplosion",
    "scatterExplosion",
    "civilianKilled",
    "civilianCrash",
    "enemyCrash",
    "civilianRescued",
    "hit",
    "collect",
    "powerup",
    "life",
    "waveClear",
    "groundShot",
    "civilianAlarm",
    "civilianHit",
    "playerFalling",
    "playerCrash",
  ]) {
    context.currentTime += 1;
    const before = nodes.length;
    audio.effect({ type });
    assert.ok(nodes.length > before, `${type} should produce sound`);
  }
  audio.effect({ type: "gameover" });
  assert.equal(audio.active, false);
  audio.dispose();
});

function trackStub() {
  return {
    paused: true,
    currentTime: 12,
    plays: 0,
    async play() {
      this.paused = false;
      this.plays++;
    },
    pause() {
      this.paused = true;
    },
    removeAttribute() {
      this.removed = true;
    },
    load() {
      this.loaded = true;
    },
  };
}

test("enemy falling and flyoff deaths stay silent until their crash or explosion", async () => {
  const { audio, nodes } = setup();
  audio.start();
  await Promise.resolve();
  for (const type of ["enemyFalling", "enemyFlyaway"]) {
    audio.effect({ type, duration: 4 });
    assert.equal(audio.sources.size, 0, `${type} must not play a falling cry`);
  }
  audio.effect({ type: "enemyCrash" });
  assert.ok(audio.sources.size > 0, "enemy ground impact still plays");
  assert.equal(nodes.filter((node) => node.type === "bandpass").length, 0);
  audio.effect({ type: "explosion" });
  assert.equal(nodes.filter((node) => node.type === "bandpass").length, 0);
  audio.dispose();
});

test("fatal civilian hit stays silent until the falling cry, with an explosion only on impact", async () => {
  const { audio, nodes } = setup();
  audio.start();
  await Promise.resolve();
  audio.effect({ type: "civilianHit", fatal: true });
  assert.equal(audio.sources.size, 0);
  audio.effect({ type: "civilianKilled", duration: 4 });
  assert.equal(audio.sources.size, 2);
  assert.ok([...audio.sources].every((source) => source.type === "sawtooth"));
  assert.equal(nodes.filter((node) => node.type === "bandpass").length, 2);
  audio.effect({ type: "civilianCrash" });
  assert.equal(audio.sources.size, 4);
  assert.ok([...audio.sources].some((source) => source.buffer));
  audio.dispose();
});

test("MP3 loops at modest volume and follows mute, pause, restart and exit", async () => {
  const track = trackStub();
  let created = 0;
  const { audio } = setup({
    soundtrackUrl: "/soundtrack.mp3",
    createTrack: (url) => {
      assert.equal(url, "/soundtrack.mp3");
      created++;
      return track;
    },
  });
  assert.equal(created, 0);
  audio.unlock();
  assert.equal(track.plays, 0);
  audio.start();
  await Promise.resolve();
  assert.equal(track.loop, true);
  assert.equal(track.volume, 0.3);
  assert.equal(track.currentTime, 0);
  assert.equal(track.paused, false);
  audio.setMuted(true);
  assert.equal(track.muted, true);
  audio.setMuted(false);
  assert.equal(track.muted, false);
  audio.setPaused(true);
  assert.equal(track.paused, true);
  track.currentTime = 20;
  audio.setPaused(false);
  assert.equal(track.paused, false);
  assert.equal(track.currentTime, 20);
  audio.effect({ type: "gameover" });
  assert.equal(track.paused, true);
  audio.start();
  assert.equal(track.currentTime, 0);
  audio.stop();
  assert.equal(track.paused, true);
  audio.dispose();
  assert.equal(track.removed, true);
  assert.equal(track.loaded, true);
  assert.equal(created, 1);
});

test("blocked MP3 playback can retry on user input without preventing effects", async () => {
  const track = trackStub();
  track.play = async () => {
    throw new Error("autoplay blocked");
  };
  const { audio } = setup({
    soundtrackUrl: "/soundtrack.mp3",
    createTrack: () => track,
  });
  audio.start();
  await new Promise((resolve) => setImmediate(resolve));
  audio.effect({ type: "shot" });
  assert.ok(audio.sources.size > 0);
  track.play = async () => {
    track.paused = false;
  };
  audio.unlock();
  assert.equal(track.paused, false);
  audio.dispose();
});

test("hero fall and crash have effects, then gameover MP3 plays once and cleans up", async () => {
  const track = trackStub();
  const { audio } = setup({
    gameoverUrl: "/gameover.mp3",
    createTrack: () => track,
  });
  audio.start();
  await Promise.resolve();
  audio.effect({ type: "playerFalling", duration: 2.4 });
  assert.ok(audio.sources.size > 0);
  audio.effect({ type: "playerCrash", heavy: true });
  assert.ok([...audio.sources].some((source) => source.buffer));
  assert.equal(track.plays, 0);
  audio.effect({ type: "gameover" });
  await Promise.resolve();
  assert.equal(track.plays, 1);
  assert.equal(track.loop, false);
  audio.effect({ type: "gameover" });
  assert.equal(track.plays, 1);
  audio.setMuted(true);
  assert.equal(track.muted, true);
  audio.start();
  assert.equal(track.paused, true);
  audio.dispose();
  assert.equal(track.removed, true);
});

test("fatal hero hit waits for the fall sound and muted ending stays silent", async () => {
  const track = trackStub();
  const { audio } = setup({
    gameoverUrl: "/gameover.mp3",
    createTrack: () => track,
  });
  audio.start();
  await Promise.resolve();
  audio.effect({ type: "hit", fatal: true });
  assert.equal(audio.sources.size, 0);
  audio.setMuted(true);
  audio.effect({ type: "gameover" });
  await Promise.resolve();
  assert.equal(track.muted, true);
  audio.setPaused(true);
  assert.equal(track.paused, true);
  audio.setPaused(false);
  await Promise.resolve();
  assert.equal(track.paused, false);
  audio.stop();
  assert.equal(track.paused, true);
  audio.dispose();
});

test("unavailable or blocked gameover MP3 never breaks the ending", async () => {
  for (const createTrack of [
    () => {
      throw new Error("unsupported media");
    },
    () => ({
      ...trackStub(),
      play: async () => {
        throw new Error("blocked");
      },
    }),
  ]) {
    const { audio } = setup({ gameoverUrl: "/gameover.mp3", createTrack });
    audio.start();
    await Promise.resolve();
    assert.doesNotThrow(() => audio.effect({ type: "gameover" }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(audio.active, false);
    audio.dispose();
  }
});

test("capital arrival plays the big ship MP3 once and follows pause, mute and cleanup", async () => {
  const track = trackStub();
  let created = 0;
  const { audio } = setup({
    bigshipUrl: "/bigship.mp3",
    createTrack: (url) => {
      assert.equal(url, "/bigship.mp3");
      created++;
      return track;
    },
  });
  audio.effect({ type: "capitalIncoming" });
  assert.equal(created, 0);
  audio.start();
  await Promise.resolve();
  audio.effect({ type: "capitalIncoming" });
  await Promise.resolve();
  assert.equal(track.plays, 1);
  assert.equal(track.currentTime, 0);
  assert.equal(track.loop, false);
  audio.setMuted(true);
  assert.equal(track.muted, true);
  audio.effect({ type: "capitalIncoming" });
  assert.equal(track.plays, 1);
  audio.setMuted(false);
  assert.equal(track.muted, false);
  track.currentTime = 2;
  audio.setPaused(true);
  assert.equal(track.paused, true);
  audio.effect({ type: "capitalIncoming" });
  assert.equal(track.plays, 1);
  audio.setPaused(false);
  await Promise.resolve();
  assert.equal(track.plays, 2);
  assert.equal(track.currentTime, 2);
  track.onended();
  audio.setPaused(true);
  audio.setPaused(false);
  assert.equal(track.plays, 2);
  audio.effect({ type: "capitalIncoming" });
  assert.equal(created, 1);
  assert.equal(track.currentTime, 0);
  audio.effect({ type: "gameover" });
  assert.equal(track.paused, true);
  audio.start();
  assert.equal(track.currentTime, 0);
  audio.effect({ type: "capitalIncoming" });
  audio.stop();
  assert.equal(track.paused, true);
  audio.dispose();
  assert.equal(track.removed, true);
  assert.equal(track.loaded, true);
});

for (const failure of ["create", "play"]) {
  test(`big ship ${failure} failure does not interrupt gameplay`, async () => {
    const { audio } = setup({
      bigshipUrl: "/bigship.mp3",
      createTrack: () => {
        if (failure === "create") throw new Error("unsupported audio");
        const track = trackStub();
        track.play = async () => {
          throw new Error("autoplay blocked");
        };
        return track;
      },
    });
    audio.start();
    await Promise.resolve();
    assert.doesNotThrow(() => audio.effect({ type: "capitalIncoming" }));
    await Promise.resolve();
    audio.dispose();
  });
}

test("fleet arrival plays the engaging MP3 once and follows pause, mute and cleanup", async () => {
  const track = trackStub();
  let created = 0;
  const { audio } = setup({
    engagingUrls: ["/engaging.mp3"],
    createTrack: (url) => {
      assert.equal(url, "/engaging.mp3");
      created++;
      return track;
    },
  });
  audio.effect({ type: "powerup", power: "fleet" });
  assert.equal(created, 0);
  audio.start();
  await Promise.resolve();
  audio.effect({ type: "powerup", power: "fleet" });
  await Promise.resolve();
  assert.equal(track.plays, 1);
  audio.effect({ type: "powerup", power: "shield" });
  assert.equal(track.plays, 1);
  assert.equal(track.currentTime, 0);
  assert.equal(track.loop, false);
  audio.setMuted(true);
  assert.equal(track.muted, true);
  audio.effect({ type: "powerup", power: "fleet" });
  assert.equal(track.plays, 1);
  audio.setMuted(false);
  assert.equal(track.muted, false);
  track.currentTime = 2;
  audio.setPaused(true);
  assert.equal(track.paused, true);
  audio.effect({ type: "powerup", power: "fleet" });
  assert.equal(track.plays, 1);
  audio.setPaused(false);
  await Promise.resolve();
  assert.equal(track.plays, 2);
  assert.equal(track.currentTime, 2);
  track.onended();
  audio.setPaused(true);
  audio.setPaused(false);
  assert.equal(track.plays, 2);
  audio.effect({ type: "powerup", power: "fleet" });
  audio.effect({ type: "powerup", power: "assault" });
  assert.equal(track.plays, 4);
  assert.equal(created, 1);
  assert.equal(track.currentTime, 0);
  audio.effect({ type: "gameover" });
  assert.equal(track.paused, true);
  audio.start();
  assert.equal(track.currentTime, 0);
  audio.effect({ type: "powerup", power: "fleet" });
  audio.stop();
  assert.equal(track.paused, true);
  audio.dispose();
  assert.equal(track.removed, true);
  assert.equal(track.loaded, true);
});


test("each fleet arrival randomly chooses a clip and pause resumes that choice", async (t) => {
  const track = trackStub();
  const { audio } = setup({
    engagingUrls: ["/engaging.mp3", "/engaging-2.mp3"],
    createTrack: () => track,
  });
  let choice = 0;
  t.mock.method(Math, "random", () => choice);
  audio.start();
  await Promise.resolve();
  audio.effect({ type: "powerup", power: "fleet" });
  assert.equal(track.src, "/engaging.mp3");
  choice = 0.99;
  audio.setPaused(true);
  audio.setPaused(false);
  assert.equal(track.src, "/engaging.mp3");
  audio.effect({ type: "powerup", power: "fleet" });
  assert.equal(track.src, "/engaging-2.mp3");
  choice = 0;
  audio.effect({ type: "powerup", power: "assault" });
  assert.equal(track.src, "/engaging.mp3");
  assert.equal(track.currentTime, 0);
  audio.dispose();
});

test("civilian arrival plays mayday at 25 percent MP3 once and follows pause, mute and cleanup", async () => {
  const track = trackStub();
  let created = 0;
  const { audio } = setup({
    maydayUrl: "/mayday.mp3",
    createTrack: (url) => {
      assert.equal(url, "/mayday.mp3");
      created++;
      return track;
    },
  });
  audio.effect({ type: "civilianIncoming" });
  assert.equal(created, 0);
  audio.start();
  await Promise.resolve();
  audio.effect({ type: "civilianIncoming" });
  await Promise.resolve();
  assert.equal(track.plays, 1);
  assert.equal(track.currentTime, 0);
  assert.equal(track.loop, false);
  assert.equal(track.volume, 0.25);
  audio.setMuted(true);
  assert.equal(track.muted, true);
  audio.effect({ type: "civilianIncoming" });
  assert.equal(track.plays, 1);
  audio.setMuted(false);
  assert.equal(track.muted, false);
  track.currentTime = 2;
  audio.setPaused(true);
  assert.equal(track.paused, true);
  audio.effect({ type: "civilianIncoming" });
  assert.equal(track.plays, 1);
  audio.setPaused(false);
  await Promise.resolve();
  assert.equal(track.plays, 2);
  assert.equal(track.currentTime, 2);
  track.onended();
  audio.setPaused(true);
  audio.setPaused(false);
  assert.equal(track.plays, 2);
  audio.effect({ type: "civilianIncoming" });
  assert.equal(created, 1);
  assert.equal(track.currentTime, 0);
  audio.effect({ type: "gameover" });
  assert.equal(track.paused, true);
  audio.start();
  assert.equal(track.currentTime, 0);
  audio.effect({ type: "civilianIncoming" });
  audio.stop();
  assert.equal(track.paused, true);
  audio.dispose();
  assert.equal(track.removed, true);
  assert.equal(track.loaded, true);
});

test("game start plays siren once at 15 percent and follows audio controls", async () => {
  const track = trackStub();
  const { audio } = setup({
    sirenUrl: "/siren.mp3",
    createTrack: () => track,
  });
  audio.unlock();
  assert.equal(track.plays, 0);
  audio.start();
  await Promise.resolve();
  assert.equal(track.plays, 1);
  assert.equal(track.volume, 0.15);
  assert.equal(track.loop, false);
  assert.equal(track.currentTime, 0);
  audio.setMuted(true);
  assert.equal(track.muted, true);
  audio.setMuted(false);
  assert.equal(track.muted, false);
  assert.equal(track.plays, 1);
  track.currentTime = 2;
  audio.setPaused(true);
  assert.equal(track.paused, true);
  audio.setPaused(false);
  await Promise.resolve();
  assert.equal(track.plays, 2);
  assert.equal(track.currentTime, 2);
  track.onended();
  audio.setPaused(true);
  audio.setPaused(false);
  assert.equal(track.plays, 2);
  audio.start();
  assert.equal(track.plays, 3);
  assert.equal(track.currentTime, 0);
  audio.effect({ type: "gameover" });
  assert.equal(track.paused, true);
  audio.start();
  audio.stop();
  assert.equal(track.paused, true);
  audio.dispose();
  assert.equal(track.removed, true);
  assert.equal(track.loaded, true);
});


test("siren mixes a reverb tail and gates it on mute and stop", () => {
  const track = trackStub();
  const { audio, context } = setup({ sirenUrl: "/siren.mp3", createTrack: () => track });
  const connections = [];
  const source = { connect: (target) => connections.push(target), disconnect() {} };
  let impulse;
  const convolver = { connect() {}, disconnect() {}, set buffer(value) { impulse = value; } };
  context.createMediaElementSource = (element) => {
    assert.equal(element, track);
    return source;
  };
  context.createConvolver = () => convolver;
  audio.start();
  assert.ok(impulse, "reverb has an impulse response");
  assert.equal(connections.length, 2, "siren feeds dry and reverb paths");
  assert.ok(connections.includes(convolver));
  assert.equal(audio.sirenOutput.gain.value, 1);
  audio.setMuted(true);
  assert.equal(audio.sirenOutput.gain.value, 0);
  audio.setMuted(false);
  assert.equal(audio.sirenOutput.gain.value, 1);
  audio.stop();
  assert.equal(audio.sirenOutput.gain.value, 0);
  audio.dispose();
});

test("Unity menu music follows menu, gameplay, pause, mute and disposal", async () => {
  const menu = trackStub();
  const gameplay = trackStub();
  const { audio } = setup({
    menuSoundtrackUrl: "/menu.mp3",
    soundtrackUrl: "/game.mp3",
    createTrack: url => url === "/menu.mp3" ? menu : gameplay,
  });
  audio.setMenuActive(true);
  await Promise.resolve();
  assert.equal(menu.paused, false);
  assert.equal(menu.loop, false);
  assert.equal(menu.volume, 0.45);
  audio.start();
  await Promise.resolve();
  assert.equal(menu.paused, true);
  assert.equal(gameplay.paused, false);
  audio.setPaused(true);
  await Promise.resolve();
  assert.equal(menu.paused, false);
  assert.equal(gameplay.paused, true);
  audio.setMuted(true);
  assert.equal(menu.muted, true);
  audio.setMuted(false);
  assert.equal(menu.muted, false);
  audio.setPaused(false);
  await Promise.resolve();
  assert.equal(menu.paused, true);
  assert.equal(gameplay.paused, false);
  audio.stop();
  audio.setMenuActive(true);
  assert.equal(menu.paused, false);
  audio.dispose();
  assert.equal(menu.paused, true);
  assert.equal(menu.onended, null);
  assert.equal(menu.removed, true);
});

test("menu repeats after a 2–4 second gap without interactions skipping the silence", () => {
  const menu = trackStub();
  const { audio, tick, timers } = setup({ menuSoundtrackUrl: "/menu.mp3", createTrack: () => menu });
  let repeatDelay;
  const schedule = audio.setTimer;
  audio.setTimer = (callback, delay) => {
    repeatDelay = delay;
    return schedule(callback, delay);
  };
  audio.setMenuActive(true);
  menu.paused = true;
  menu.onended();
  assert.equal(timers(), 1);
  assert.ok(repeatDelay >= 2000 && repeatDelay <= 4000);
  audio.unlock();
  assert.equal(menu.plays, 1);
  tick();
  assert.equal(menu.plays, 2);
  menu.onended();
  audio.start();
  tick();
  assert.equal(menu.paused, true);
  audio.dispose();
});

test("blocked menu audio retries on a gesture and never restarts after disposal", async () => {
  const menu = trackStub();
  menu.play = () => Promise.reject(new Error("autoplay blocked"));
  const { audio } = setup({ menuSoundtrackUrl: "/menu.mp3", createTrack: () => menu });
  audio.setMenuActive(true);
  await new Promise(resolve => setImmediate(resolve));
  menu.play = async () => { menu.paused = false; };
  audio.unlock();
  await Promise.resolve();
  assert.equal(menu.paused, false);
  audio.dispose();
  audio.unlock();
  assert.equal(menu.paused, true);
});
