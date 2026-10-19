// Looping MP3 soundtrack and game sound effects synthesized with Web Audio.
// Playback starts when a menu or gameplay requests it and the browser permits audio.
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

export default class ShooterAudio {
  constructor({
    createContext = () => {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      return Context ? new Context() : null;
    },
    soundtrackUrl,
    menuSoundtrackUrl,
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (timer) => clearTimeout(timer),
    gameoverUrl,
    bigshipUrl,
    engagingUrls = [],
    maydayUrl,
    sirenUrl,
    createTrack = (url) => new Audio(url),
    onStatus = () => {},
  } = {}) {
    this.soundtrackUrl = soundtrackUrl;
    this.menuSoundtrackUrl = menuSoundtrackUrl;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.menuActive = false;
    this.gameoverUrl = gameoverUrl;
    this.bigshipUrl = bigshipUrl;
    this.sirenUrl = sirenUrl;
    this.sirenPlaying = false;
    this.maydayUrl = maydayUrl;
    this.maydayPlaying = false;
    this.engagingUrls = engagingUrls;
    this.engagingPlaying = false;
    this.bigshipPlaying = false;
    this.ending = false;
    this.createTrack = createTrack;
    this.musicBlocked = false;
    this.onStatus = onStatus;
    this.createContext = createContext;
    this.sources = new Set();
    this.muted = false;
    this.active = false;
    this.paused = false;
    this.disposed = false;
    this.lastEffect = new Map();
  }

  ensureContext() {
    if (this.context || this.disposed) return this.context;
    const ctx = this.createContext();
    if (!ctx) return null;
    this.context = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.effects = ctx.createGain();
    this.effects.gain.value = 0.6;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 20;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    this.effects.connect(this.master);
    this.master.connect(compressor);
    compressor.connect(ctx.destination);
    this.compressor = compressor;
    ctx.onstatechange = () => this.notifyStatus();
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      // Quantized, held noise adds a crunchy 8-bit edge to the effects.
      data[i] =
        i % 3 === 0
          ? Math.round((Math.random() * 2 - 1) * 32) / 32
          : data[i - 1];
    }
    return ctx;
  }

  setMenuActive(active) {
    this.menuActive = active && !this.disposed;
    if (!this.menuActive) {
      this.clearTimer(this.menuTimer);
      this.menuTimer = undefined;
      this.menuTrack?.pause();
      if (this.menuTrack) this.menuTrack.currentTime = 0;
    } else this.syncMenuMusic();
  }

  syncMenuMusic() {
    if (!this.menuActive || this.disposed || !this.menuSoundtrackUrl) return;
    try {
      if (!this.menuTrack) {
        this.menuTrack = this.createTrack(this.menuSoundtrackUrl);
        this.menuTrack.loop = false;
        this.menuTrack.volume = 0.45;
        this.menuTrack.preload = "auto";
        this.menuTrack.currentTime = 0;
        this.menuTrack.onended = () => {
          if (!this.menuActive || this.disposed) return;
          this.menuTimer = this.setTimer(() => {
            this.menuTimer = undefined;
            if (!this.menuActive || this.disposed) return;
            this.menuTrack.currentTime = 0;
            this.syncMenuMusic();
          }, 2000 + Math.random() * 2000);
        };
      }
      this.menuTrack.muted = this.muted;
      if (this.menuTimer !== undefined || !this.menuTrack.paused) return;
      void this.menuTrack.play().then(() => {
        if (!this.menuActive || this.disposed) this.menuTrack?.pause();
      }).catch(() => {
        // Retry after the next user gesture if autoplay was blocked.
      });
    } catch {
      // Missing menu audio must leave the controls usable.
    }
  }

  syncMusic() {
    if (!this.active || this.paused || this.disposed) {
      this.track?.pause();
      return;
    }
    if (!this.soundtrackUrl) return;
    try {
      if (!this.track) {
        this.track = this.createTrack(this.soundtrackUrl);
        this.track.currentTime = 0;
        this.track.loop = true;
        this.track.volume = 0.3;
        this.track.preload = "auto";
      }
      this.track.muted = this.muted;
      if (!this.track.paused) return;
      void this.track
        .play()
        .then(() => {
          this.musicBlocked = false;
          if (!this.active || this.paused || this.disposed) this.track?.pause();
          this.notifyStatus();
        })
        .catch(() => {
          this.musicBlocked = true;
          this.notifyStatus();
        });
    } catch {
      // A missing or unsupported soundtrack must not interrupt gameplay.
    }
  }

  notifyStatus() {
    this.onStatus(
      !this.active || this.disposed
        ? "stopped"
        : this.muted
          ? "muted"
          : this.paused
            ? "paused"
            : this.context?.state === "running" && !this.musicBlocked
              ? "playing"
              : "blocked",
    );
  }

  unlock() {
    if (this.disposed) return;
    this.syncMenuMusic();
    this.syncMusic();
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      this.notifyStatus();
      if (ctx.state === "running") return;
      void ctx
        .resume()
        .then(() => {
          this.notifyStatus();
        })
        .catch(() => this.notifyStatus());
    } catch {
      /* Unsupported audio must never prevent the game from starting. */
    }
  }

  start() {
    this.setMenuActive(false);
    this.ending = false;
    this.stopBigship();
    this.stopEngaging();
    this.stopMayday();
    this.stopSiren();
    this.gameoverTrack?.pause();
    if (this.gameoverTrack) this.gameoverTrack.currentTime = 0;
    this.active = true;
    this.paused = false;
    this.stopSources();
    if (this.track) this.track.currentTime = 0;
    this.unlock();
    this.playSiren();
  }

  voice(
    type,
    midi,
    time,
    duration,
    volume,
    target = this.effects,
    { end, attack = 0.003, cutoff = 0, formant = 0, hold = 0 } = {},
  ) {
    const ctx = this.context;
    const source = ctx.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(frequency(midi), time);
    if (end !== undefined)
      source.frequency.exponentialRampToValueAtTime(
        frequency(end),
        time + duration,
      );
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + attack);
    if (hold) gain.gain.setValueAtTime(volume, time + duration * hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    let filter;
    if (cutoff || formant) {
      filter = ctx.createBiquadFilter();
      filter.type = formant ? "bandpass" : "lowpass";
      if (formant) filter.Q.value = 4;
      filter.frequency.setValueAtTime(formant || cutoff, time);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(100, formant ? formant * 0.65 : cutoff * 0.35),
        time + duration,
      );
      source.connect(filter);
      filter.connect(gain);
    } else source.connect(gain);
    gain.connect(target);
    this.playSource(source, gain, filter, time, duration);
  }

  noiseHit(time, duration, volume, cutoff, target = this.effects, attack = 0) {
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = cutoff < 1500 ? "lowpass" : "highpass";
    filter.frequency.value = cutoff;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(attack ? 0.0001 : volume, time);
    if (attack) gain.gain.exponentialRampToValueAtTime(volume, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(target);
    this.playSource(source, gain, filter, time, duration);
  }

  playSource(source, gain, filter, time, duration) {
    this.sources.add(source);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      filter?.disconnect();
      this.sources.delete(source);
    };
    source.start(time);
    source.stop(time + duration + 0.01);
  }

  playGameover() {
    if (!this.gameoverUrl || this.disposed || this.paused) return;
    try {
      if (!this.gameoverTrack) {
        this.gameoverTrack = this.createTrack(this.gameoverUrl);
        this.gameoverTrack.loop = false;
        this.gameoverTrack.volume = 0.6;
        this.gameoverTrack.preload = "auto";
      }
      this.gameoverTrack.muted = this.muted;
      void Promise.resolve(this.gameoverTrack.play())
        .then(() => {
          if (!this.ending || this.disposed || this.paused)
            this.gameoverTrack?.pause();
        })
        .catch(() => {});
    } catch {
      // Unsupported audio must never interrupt the ending.
    }
  }

  playBigship(restart = true) {
    if (
      !this.bigshipUrl ||
      !this.active ||
      this.paused ||
      this.disposed ||
      (restart && this.muted)
    )
      return;
    try {
      if (!this.bigshipTrack) {
        this.bigshipTrack = this.createTrack(this.bigshipUrl);
        this.bigshipTrack.loop = false;
        this.bigshipTrack.volume = 0.6;
        this.bigshipTrack.preload = "auto";
        this.bigshipTrack.onended = () => {
          this.bigshipPlaying = false;
        };
      }
      if (restart) this.bigshipTrack.currentTime = 0;
      this.bigshipTrack.muted = this.muted;
      this.bigshipPlaying = true;
      void Promise.resolve(this.bigshipTrack.play())
        .then(() => {
          if (!this.active || this.paused || this.disposed)
            this.bigshipTrack?.pause();
        })
        .catch(() => {
          this.bigshipPlaying = false;
        });
    } catch {
      this.bigshipPlaying = false;
      // Missing or unsupported audio must never interrupt gameplay.
    }
  }

  stopBigship() {
    this.bigshipPlaying = false;
    this.bigshipTrack?.pause();
    if (this.bigshipTrack) this.bigshipTrack.currentTime = 0;
  }

  setupSirenReverb() {
    const ctx = this.context;
    if (!ctx?.createMediaElementSource || !ctx.createConvolver) return;
    try {
      const reverb = ctx.createConvolver();
      const length = Math.floor(ctx.sampleRate * 1.4);
      const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const samples = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
        }
      }
      reverb.buffer = impulse;
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const output = ctx.createGain();
      dry.gain.value = 0.8;
      wet.gain.value = 0.2;
      output.gain.value = 0;
      dry.connect(output);
      reverb.connect(wet);
      wet.connect(output);
      output.connect(ctx.destination);
      const source = ctx.createMediaElementSource(this.sirenTrack);
      source.connect(dry);
      source.connect(reverb);
      this.sirenOutput = output;
      this.sirenReverbNodes = [source, dry, reverb, wet, output];
    } catch {
      // Keep ordinary siren playback when reverb is unavailable.
    }
  }

  playSiren(restart = true) {
    if (
      !this.sirenUrl ||
      !this.active ||
      this.paused ||
      this.disposed ||
      (restart && this.muted)
    )
      return;
    try {
      if (!this.sirenTrack) {
        this.sirenTrack = this.createTrack(this.sirenUrl);
        this.sirenTrack.loop = false;
        this.sirenTrack.volume = 0.15;
        this.sirenTrack.preload = "auto";
        this.setupSirenReverb();
        this.sirenTrack.onended = () => {
          this.sirenPlaying = false;
        };
      }
      if (restart) this.sirenTrack.currentTime = 0;
      this.sirenTrack.muted = this.muted;
      if (this.sirenOutput) this.sirenOutput.gain.value = this.muted ? 0 : 1;
      this.sirenPlaying = true;
      void Promise.resolve(this.sirenTrack.play())
        .then(() => {
          if (!this.active || this.paused || this.disposed)
            this.sirenTrack?.pause();
        })
        .catch(() => {
          this.sirenPlaying = false;
        });
    } catch {
      this.sirenPlaying = false;
      // Missing or unsupported audio must never interrupt gameplay.
    }
  }

  stopSiren() {
    this.sirenPlaying = false;
    if (this.sirenOutput) this.sirenOutput.gain.value = 0;
    this.sirenTrack?.pause();
    if (this.sirenTrack) this.sirenTrack.currentTime = 0;
  }

  playMayday(restart = true) {
    if (
      !this.maydayUrl ||
      !this.active ||
      this.paused ||
      this.disposed ||
      (restart && this.muted)
    )
      return;
    try {
      if (!this.maydayTrack) {
        this.maydayTrack = this.createTrack(this.maydayUrl);
        this.maydayTrack.loop = false;
        this.maydayTrack.volume = 0.25;
        this.maydayTrack.preload = "auto";
        this.maydayTrack.onended = () => {
          this.maydayPlaying = false;
        };
      }
      if (restart) this.maydayTrack.currentTime = 0;
      this.maydayTrack.muted = this.muted;
      this.maydayPlaying = true;
      void Promise.resolve(this.maydayTrack.play())
        .then(() => {
          if (!this.active || this.paused || this.disposed)
            this.maydayTrack?.pause();
        })
        .catch(() => {
          this.maydayPlaying = false;
        });
    } catch {
      this.maydayPlaying = false;
      // Missing or unsupported audio must never interrupt gameplay.
    }
  }

  stopMayday() {
    this.maydayPlaying = false;
    this.maydayTrack?.pause();
    if (this.maydayTrack) this.maydayTrack.currentTime = 0;
  }

  playEngaging(restart = true) {
    if (
      !this.engagingUrls.length ||
      !this.active ||
      this.paused ||
      this.disposed ||
      (restart && this.muted)
    )
      return;
    try {
      const url = restart
        ? this.engagingUrls[Math.floor(Math.random() * this.engagingUrls.length)]
        : null;
      if (!this.engagingTrack) {
        this.engagingTrack = this.createTrack(url);
        this.engagingTrack.loop = false;
        this.engagingTrack.volume = 0.25;
        this.engagingTrack.preload = "auto";
        this.engagingTrack.onended = () => {
          this.engagingPlaying = false;
        };
      }
      if (restart) {
        this.engagingTrack.src = url;
        this.engagingTrack.currentTime = 0;
      }
      this.engagingTrack.muted = this.muted;
      this.engagingPlaying = true;
      void Promise.resolve(this.engagingTrack.play())
        .then(() => {
          if (!this.active || this.paused || this.disposed)
            this.engagingTrack?.pause();
        })
        .catch(() => {
          this.engagingPlaying = false;
        });
    } catch {
      this.engagingPlaying = false;
      // Missing or unsupported audio must never interrupt gameplay.
    }
  }

  stopEngaging() {
    this.engagingPlaying = false;
    this.engagingTrack?.pause();
    if (this.engagingTrack) this.engagingTrack.currentTime = 0;
  }

  effect(event) {
    if (event.type === "civilianIncoming") {
      this.playMayday();
      return;
    }
    if (event.type === "powerup" && ["fleet", "assault"].includes(event.power))
      this.playEngaging();
    if (event.type === "capitalIncoming") {
      this.playBigship();
      return;
    }
    const ending = event.type === "gameover";
    if (ending) {
      if (!this.active || this.ending || this.disposed) return;
      this.ending = true;
      this.active = false;
      this.track?.pause();
      this.stopBigship();
      this.stopEngaging();
      this.stopMayday();
      this.stopSiren();
      this.stopSources();
      this.playGameover();
      this.notifyStatus();
      return;
    }
    if (
      !this.context ||
      this.context.state !== "running" ||
      this.muted ||
      !this.active ||
      this.paused ||
      this.disposed
    ) {
      if (ending) this.active = false;
      return;
    }
    const now = this.context.currentTime;
    const cooldown =
      {
        laser: 0.16,
        enemyShot: 0.1,
        shot: 0.06,
        impact: 0.09,
        armourImpact: 0.12,
        explosion: 0.06,
        collect: 0.06,
      }[event.type] || 0;
    if (now - (this.lastEffect.get(event.type) ?? -Infinity) < cooldown) return;
    this.lastEffect.set(event.type, now);
    const tone = (midi, end, duration, volume = 0.15, type = "square") =>
      this.voice(type, midi, now, duration, volume, this.effects, { end });
    if (event.type === "countdown") tone(84, 84, 0.12, 0.13, "triangle");
    if (event.type === "laser") tone(67, 64, 0.15, 0.07, "sawtooth");
    if (event.type === "missileLaunch") tone(48, 79, 0.25, 0.09, "triangle");
    if (event.type === "enemyShot") tone(65, 42, 0.09, 0.05, "triangle");
    if (event.type === "shot") tone(91, 62, 0.055, 0.08);
    if (event.type === "impact" || event.type === "armourImpact")
      this.noiseHit(now, 0.04, 0.09, 4000, this.effects);
    if (
      !(event.type === "hit" && event.fatal) &&
      [
        "explosion",
        "groundExplosion",
        "missileExplosion",
        "scatterExplosion",
        "hit",
        "playerCrash",
      ].includes(event.type)
    ) {
      const huge =
        event.heavy ||
        ["missileExplosion", "playerCrash"].includes(event.type) ||
        event.groundKind === "tank";
      this.noiseHit(
        now,
        huge ? 0.95 : 0.55,
        huge ? 0.38 : 0.2,
        huge ? 420 : 550,
        this.effects,
        0.012,
      );
      // A softer onset and sustained low bass give blasts weight and a rumbling tail.
      this.voice(
        "sine",
        huge ? 38 : 41,
        now,
        huge ? 0.9 : 0.55,
        0.4,
        this.effects,
        {
          end: huge ? 22 : 26,
          attack: 0.018,
          hold: 0.12,
        },
      );
    }
    if (
      ["collect", "powerup", "life", "waveClear", "civilianRescued"].includes(
        event.type,
      )
    ) {
      const melody = event.type === "collect" ? [84, 96] : [72, 76, 79, 84];
      melody.forEach((midi, index) =>
        this.voice(
          "square",
          midi,
          now + index * 0.055,
          0.12,
          0.07,
          this.effects,
        ),
      );
    }
    if (event.type === "groundShot") tone(57, 36, 0.12, 0.13, "sawtooth");
    if (event.type === "civilianAlarm") {
      // Two clipped square-wave notes repeat while the ship is critically damaged.
      this.voice("square", 81, now, 0.16, 0.07, this.effects);
      this.voice("square", 74, now + 0.22, 0.16, 0.07, this.effects);
    }
    if (event.type === "civilianHit" && !event.fatal) {
      // A short arcade scream, rather than the old punishment warning tones.
      this.voice("triangle", 96, now, 0.22, 0.12, this.effects, {
        end: 60,
        hold: 0.18,
      });
      this.voice("sawtooth", 91, now + 0.015, 0.18, 0.025, this.effects, {
        end: 57,
        cutoff: 1800,
      });
      this.noiseHit(now, 0.08, 0.035, 2500, this.effects);
    }
    if (event.type === "civilianKilled" || event.type === "playerFalling") {
      // Two vowel resonances make an arcade "aaaagh", dropping and fading into distance.
      const duration = (event.duration || 4) * 0.95;
      for (const [formant, volume] of [
        [700, 0.12],
        [1200, 0.07],
      ]) {
        this.voice("sawtooth", 72, now, duration, volume, this.effects, {
          end: 43,
          attack: 0.04,
          hold: 0.12,
          formant,
        });
      }
    }
    if (event.type === "civilianCrash" || event.type === "enemyCrash") {
      this.noiseHit(
        now,
        0.65,
        event.heavy ? 0.09 : 0.045,
        320,
        this.effects,
        0.025,
      );
      this.voice(
        "sine",
        34,
        now,
        0.7,
        event.heavy ? 0.12 : 0.06,
        this.effects,
        {
          end: 22,
          attack: 0.025,
          hold: 0.05,
        },
      );
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.menuTrack) this.menuTrack.muted = muted;
    if (this.track) this.track.muted = muted;
    if (this.gameoverTrack) this.gameoverTrack.muted = muted;
    if (this.bigshipTrack) this.bigshipTrack.muted = muted;
    if (this.engagingTrack) this.engagingTrack.muted = muted;
    if (this.maydayTrack) this.maydayTrack.muted = muted;
    if (this.sirenTrack) this.sirenTrack.muted = muted;
    if (this.sirenOutput)
      this.sirenOutput.gain.value = muted || this.paused || !this.active ? 0 : 1;
    if (this.context)
      this.master.gain.setTargetAtTime(
        muted ? 0 : 0.55,
        this.context.currentTime,
        0.02,
      );
    if (!muted) this.unlock();
    this.notifyStatus();
  }

  setPaused(paused) {
    this.paused = paused;
    this.setMenuActive(paused && (this.active || this.ending));
    if (this.sirenOutput)
      this.sirenOutput.gain.value = paused || this.muted || !this.active ? 0 : 1;
    if (paused) {
      this.track?.pause();
      this.gameoverTrack?.pause();
      this.bigshipTrack?.pause();
      this.engagingTrack?.pause();
      this.maydayTrack?.pause();
      this.sirenTrack?.pause();
    }
    if (paused) {
      this.stopSources();
      void this.context?.suspend().catch(() => {});
    } else if (this.ending) this.playGameover();
    else if (this.active) {
      this.unlock();
      if (this.bigshipPlaying) this.playBigship(false);
      if (this.engagingPlaying) this.playEngaging(false);
      if (this.maydayPlaying) this.playMayday(false);
      if (this.sirenPlaying) this.playSiren(false);
    }
    this.notifyStatus();
  }

  stopSources() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already finished. */
      }
    }
    this.lastEffect.clear();
  }

  stop() {
    this.ending = false;
    this.stopBigship();
    this.stopEngaging();
    this.stopMayday();
    this.stopSiren();
    this.gameoverTrack?.pause();
    this.active = false;
    this.track?.pause();
    this.musicBlocked = false;
    this.stopSources();
    void this.context?.suspend().catch(() => {});
    this.notifyStatus();
  }

  dispose() {
    this.disposed = true;
    this.setMenuActive(false);
    if (this.menuTrack) {
      this.menuTrack.onended = null;
      this.menuTrack.removeAttribute("src");
      this.menuTrack.load();
    }
    if (this.context) this.context.onstatechange = null;
    this.stop();
    if (this.track) {
      this.track.removeAttribute("src");
      this.track.load();
    }
    if (this.gameoverTrack) {
      this.gameoverTrack.removeAttribute("src");
      this.gameoverTrack.load();
    }
    if (this.bigshipTrack) {
      this.bigshipTrack.onended = null;
      this.bigshipTrack.removeAttribute("src");
      this.bigshipTrack.load();
    }
    if (this.engagingTrack) {
      this.engagingTrack.onended = null;
      this.engagingTrack.removeAttribute("src");
      this.engagingTrack.load();
    }
    if (this.maydayTrack) {
      this.maydayTrack.onended = null;
      this.maydayTrack.removeAttribute("src");
      this.maydayTrack.load();
    }
    if (this.sirenTrack) {
      this.sirenTrack.onended = null;
      this.sirenTrack.removeAttribute("src");
      this.sirenTrack.load();
    }
    for (const node of this.sirenReverbNodes || []) node.disconnect();
    this.effects?.disconnect();
    this.master?.disconnect();
    this.compressor?.disconnect();
    void this.context?.close().catch(() => {});
  }
}
