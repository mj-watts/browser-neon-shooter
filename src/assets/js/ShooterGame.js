import { canyonWall } from "./CanyonTerrain.js";
import { POWERUPS, supplyPower } from "./Powerups.js";

// Rendering-independent simulation. World coordinates are constant on every device.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class ShooterGame {
  constructor(onEvent = () => {}, random = Math.random) {
    this.onEvent = onEvent;
    this.random = random;
    this.bounds = { x: 10.5, bottom: -13, top: 12.5 };
    this.reset();
  }

  reset() {
    this.phase = "countdown";
    this.paused = false;
    this.elapsed = 0;
    this.wave = 0;
    this.score = 0;
    this.kills = 0;
    this.lives = 3;
    this.serial = 0;
    this.clock = 0;
    this.fireCooldown = 0;
    this.weapon = "guns";
    this.weaponStrength = 1;
    this.weaponTime = 0;
    this.missileCount = 3;
    this.missilePressed = false;
    this.shieldTime = 0;
    this.speedTime = 0;
    this.speedBlend = 0;
    this.orbitTime = 0;
    this.orbitCount = 0;
    this.orbs = [];
    this.companionTime = 0;
    this.companionMode = "wingmen";
    this.companionCooldown = 0;
    this.companions = [];
    this.fleet = [];
    this.fleetFollowTime = 0;
    this.fleetHistory = [];
    this.fleetTime = 0;
    this.fleetRadioTime = 0;
    this.fleetRadioMessage = "";
    this.fleetCooldown = 0;
    this.assaultFleet = [];
    this.assaultTime = 0;
    this.assaultCooldown = 0;
    this.scatterTime = 0;
    this.scatterCooldown = 0;
    this.supplyCooldown = 2.5 + this.random() * 1.5;
    this.civilianCooldown = 30 + this.random() * 15;
    this.capitalCooldown = 22 + this.random() * 10;
    this.capitalShips = [];
    this.invaderWavePending = false;
    this.civilians = [];
    this.fallingCivilians = [];
    this.fallingEnemies = [];
    this.flyawayEnemies = [];
    this.rescues = 0;
    this.groundEnemies = [];
    this.groundWrecks = [];
    this.gateLasers = [];
    this.laserGateTutorialCount = 0;
    this.turretLasers = [];
    this.gateCooldown = 12;
    this.groundCooldown = 5 + this.random() * 3;
    this.groundEncounter = 0;
    this.groundTravel = 0;
    this.lasers = [];
    this.player = { x: 0, y: -10.5, z: 1, invulnerable: 0, bank: 0 };
    this.playerFall = null;
    this.enemies = [];
    this.bullets = [];
    this.pickups = [];
    this.waveKills = 0;
    this.escaped = 0;
    this.lastKill = { x: 0, y: 3 };
  }

  setPlayfield(width, height) {
    this.sceneryWidth = width;
    this.playfieldHeight = height;
    this.bounds = {
      x: width / 2 - 1.1,
      bottom: -height / 2 + 1.1,
      top: height / 2 - 1.1,
    };
    this.player.x = clamp(this.player.x, -this.bounds.x, this.bounds.x);
    this.player.y = clamp(this.player.y, this.bounds.bottom, this.bounds.top);
  }

  get message() {
    if (this.phase === "countdown")
      return this.elapsed < 0.8
        ? "3"
        : String(Math.max(1, 3 - Math.floor(this.elapsed - 0.8)));
    if (this.phase === "intermission")
      return `NEXT WAVE IN ${Math.max(1, Math.ceil(3 - this.elapsed))}`;
    return "";
  }

  snapshot() {
    return {
      phase: this.phase,
      wave: this.wave,
      score: this.score,
      lives: this.lives,
      elapsed: this.elapsed,
      player: this.player,
      enemies: this.enemies,
      bullets: this.bullets,
      pickups: this.pickups,
    };
  }

  startWave() {
    this.wave++;
    this.phase = "playing";
    this.elapsed = 0;
    this.waveKills = 0;
    this.escaped = 0;
    if (this.invaderWavePending) {
      this.invaderWavePending = false;
      const spacing = (this.bounds.x * 1.85) / 19;
      this.waveSize = 100;
      this.enemies = Array.from({ length: 100 }, (_, index) => ({
        id: ++this.serial,
        invader: true,
        column: index % 20,
        formationRow: Math.floor(index / 20),
        origin: ((index % 20) - 9.5) * spacing,
        x: ((index % 20) - 9.5) * spacing,
        y:
          (this.playfieldHeight || 32) / 2 +
          2 +
          Math.floor(index / 20) *
            Math.min(2, (this.playfieldHeight || 32) * 0.06),
        age: 0,
        scale: Math.min(0.7, spacing / 1.8),
        kind: Math.floor(index / 20) % 3,
        hp: 1,
        fireAt: 5 + (index % 20) * 0.24,
      }));
      this.onEvent({ type: "wave", wave: this.wave });
      return;
    }
    const columns = 4 + Math.floor(this.random() * 7);
    const count = columns * 3;
    const spacing = 1.65;
    const centre = (columns - 1) / 2;
    this.waveSize = count;
    const pattern = (this.wave - 1) % 4;
    const primaryKind = (this.wave - 1) % 3;
    const secondaryKind =
      this.wave % 2 === 0 ? (primaryKind + 1) % 3 : primaryKind;
    const entryY = (this.playfieldHeight || 32) / 2 + 2;
    const entrySway = Math.sin(pattern * 0.4) * this.bounds.x * 0.06;
    this.enemies = Array.from({ length: count }, (_, index) => ({
      id: ++this.serial,
      x: ((index % columns) - centre) * spacing + entrySway,
      y: entryY + Math.floor(index / columns) * 2.2,
      origin: ((index % columns) - centre) * spacing,
      formationRow: Math.floor(index / columns),
      age: 0,
      index,
      pattern,
      kind: index < Math.ceil(count / 2) ? primaryKind : secondaryKind,
      hp: 1 + Math.floor(Math.min(this.wave - 1, 8) / 3),
      fireAt: 2.1 + (index % 4) * 0.48,
    }));
    // One armoured ship on waves 2, 5, 8... keeps the encounter occasional.
    if (this.wave % 3 === 2) {
      const heavy = this.enemies[Math.floor(count / 2)];
      heavy.heavy = true;
      heavy.kind = 2;
      heavy.hp = 12 + Math.floor(this.wave * 0.6);
    }
    this.onEvent({ type: "wave", wave: this.wave });
  }

  destroyEnemy(enemy, credited) {
    if (!this.enemies.includes(enemy)) return;
    const falling = credited && (enemy.heavy || this.enemies.length === 1);
    const deathRoll = credited && !falling ? this.random() : 1;
    const flyaway = deathRoll < 0.28;
    this.enemies = this.enemies.filter((item) => item !== enemy);
    if (credited) {
      this.kills++;
      this.waveKills++;
      this.lastKill = { x: enemy.x, y: clamp(enemy.y, -10, 10) };
      this.pickups.push({
        id: ++this.serial,
        x: enemy.x,
        y: enemy.y,
        value: 1,
        age: 0,
      });
      if (enemy.heavy)
        this.pickups.push({
          id: ++this.serial,
          kind: "life",
          x: enemy.x + 0.6,
          y: enemy.y,
          age: 0,
        });
      if (falling)
        this.fallingEnemies.push({
          ...enemy,
          falling: true,
          fallAge: 0,
          fallDuration: 4,
          fallX: enemy.x,
          fallY: enemy.y,
        });
      if (flyaway)
        this.flyawayEnemies.push({
          ...enemy,
          flyaway: true,
          deathAge: 0,
          deathX: enemy.x,
          deathY: enemy.y,
          deathSide: deathRoll < 0.14 ? -1 : 1,
          deathLift: (this.random() - 0.5) * 4,
        });
      this.onEvent({
        type: falling ? "enemyFalling" : flyaway ? "enemyFlyaway" : "explosion",
        duration: falling ? 4 : undefined,
        kind: enemy.kind,
        enemyId: enemy.id,
        x: enemy.x,
        y: enemy.y,
        heavy: !!enemy.heavy,
        size: enemy.heavy ? 4.8 : 1.5,
        color: enemy.heavy ? "gold" : enemy.kind === 1 ? "pink" : "orange",
      });
    } else this.escaped++;
  }

  spawnSupply() {
    const power = supplyPower(this.random());
    this.pickups.push({
      id: ++this.serial,
      kind: "powerup",
      power,
      x: (this.random() - 0.5) * 14,
      y: 14,
      age: 0,
    });
    this.supplyCooldown = 7 + this.random() * 4;
    this.onEvent({ type: "supply", power });
  }

  spawnCivilian() {
    if (this.civilians.length) {
      this.civilianCooldown = 2;
      return;
    }
    const origin = (this.random() - 0.5) * 14;
    const civilian = {
      id: ++this.serial,
      x: origin,
      origin,
      y: 18,
      age: 0,
      hit: false,
      hp: 5,
    };
    this.civilians.push(civilian);
    this.civilianCooldown = 45 + this.random() * 20;
    this.onEvent({ type: "civilianIncoming", id: civilian.id });
  }

  spawnCapitalShip() {
    if (this.capitalShips.length) return;
    this.invaderWavePending = true;
    const width = Math.min(14, (this.sceneryWidth || 24) * 0.8);
    const length = 24;
    this.capitalShips.push({
      id: ++this.serial,
      x:
        (this.random() - 0.5) *
        Math.max(0, (this.sceneryWidth || 24) - width) *
        0.35,
      y: (this.playfieldHeight || 32) / 2 + length / 2 + 2,
      width,
      length,
      age: 0,
      turrets: [-6, 0, 6].flatMap((y, row) =>
        [-1, 1].map((side, index) => ({
          x: side * width * 0.28,
          y,
          aim: Math.PI,
          fireCooldown: 0.8 + row * 0.4 + index * 0.25,
          flashUntil: 0,
          hp: 4,
          destroyed: false,
          wreckAge: 0,
        })),
      ),
    });
    this.onEvent({ type: "capitalIncoming" });
  }

  capitalTurretTargets() {
    return this.capitalShips.flatMap((ship) =>
      ship.turrets
        .filter((turret) => !turret.destroyed)
        .map((turret) => ({
          x: ship.x + turret.x,
          y: ship.y + turret.y,
          age: ship.age,
          turret,
        })),
    );
  }

  damageCapitalTurret(target, damage) {
    const turret = target.turret;
    if (turret.destroyed) return;
    turret.hp = Math.max(0, turret.hp - damage);
    if (turret.hp === 0) {
      turret.destroyed = true;
      turret.flashUntil = 0;
      turret.wreckAge = 0;
      this.onEvent({
        type: "explosion",
        capitalTurret: true,
        x: target.x,
        y: target.y,
        size: 1.1,
        color: "orange",
        blocky: true,
      });
    }
  }

  updateCapitalShips(dt) {
    if (!this.capitalShips.length) {
      this.capitalCooldown -= dt;
      if (this.capitalCooldown <= 0) this.spawnCapitalShip();
    }
    const halfHeight = (this.playfieldHeight || 32) / 2;
    const halfWidth = (this.sceneryWidth || 24) / 2;
    for (const ship of this.capitalShips) {
      ship.age += dt;
      ship.y -= dt * 5.8;
      for (const turret of ship.turrets) {
        if (turret.destroyed) {
          turret.wreckAge += dt;
          continue;
        }
        const x = ship.x + turret.x,
          y = ship.y + turret.y;
        turret.aim =
          Math.atan2(this.player.y - y, this.player.x - x) - Math.PI / 2;
        turret.fireCooldown -= dt;
        if (
          Math.abs(y) > halfHeight - 1 ||
          Math.abs(x) > halfWidth - 0.5 ||
          turret.fireCooldown > 0
        )
          continue;
        turret.fireCooldown = 2.4 + this.random() * 0.6;
        turret.flashUntil = ship.age + 0.12;
        const angle = turret.aim + Math.PI / 2;
        this.bullets.push({
          id: ++this.serial,
          x: x + Math.cos(angle) * 1.1,
          y: y + Math.sin(angle) * 1.1,
          vx: Math.cos(angle) * 8,
          vy: Math.sin(angle) * 8,
          friendly: false,
          life: 8,
        });
        this.onEvent({ type: "enemyShot" });
      }
    }
    const wasPassing = this.capitalShips.length > 0;
    this.capitalShips = this.capitalShips.filter(
      (ship) => ship.y + ship.length / 2 > -halfHeight - 2,
    );
    if (wasPassing && !this.capitalShips.length)
      this.capitalCooldown = 35 + this.random() * 20;
  }

  spawnGroundEnemy(kind) {
    if (this.groundEnemies.length >= 3) {
      this.groundCooldown = 2;
      return;
    }
    kind ||= ++this.groundEncounter % 3 === 0 ? "tank" : "turret";
    const side = this.random() < 0.5 ? -1 : 1;
    this.groundEnemies.push({
      id: ++this.serial,
      kind,
      side,
      x: side * (this.sceneryWidth || 24) * 0.25,
      y: 18,
      age: 0,
      hp: kind === "tank" ? 1 : 5,
      fireCooldown: 1.1,
      aim: Math.PI,
    });
    this.groundCooldown = 8 + this.random() * 5;
    this.onEvent({ type: "groundIncoming", kind });
  }

  spawnLaserGate() {
    if (this.groundEnemies.some((enemy) => enemy.gateId)) {
      this.gateCooldown = 3;
      return;
    }
    const gateId = ++this.serial;
    for (const side of [-1, 1])
      this.groundEnemies.push({
        id: ++this.serial,
        gateId,
        kind: "laserTurret",
        side,
        x: side * (this.sceneryWidth || 24) * 0.35,
        y: (this.playfieldHeight || 32) / 2 + 2,
        age: 0,
        hp: 5,
        aim: (-side * Math.PI) / 2,
      });
    this.gateCooldown = 20 + this.random() * 8;
    this.refreshGateLasers();
  }

  refreshGateLasers() {
    this.gateLasers = this.groundEnemies
      .filter((enemy) => enemy.gateId && enemy.side === -1)
      .flatMap((left) => {
        const right = this.groundEnemies.find(
          (enemy) => enemy.gateId === left.gateId && enemy.side === 1,
        );
        return right
          ? [
              {
                id: left.gateId,
                x: left.x,
                endX: right.x,
                y: left.y,
                top: right.y,
                width: 1.2,
                color: "red",
              },
            ]
          : [];
      });
  }

  blockLaserGates(previousY) {
    for (const beam of this.gateLasers) {
      // Swept collision also catches pointer movement and a scrolling barrier.
      const before = previousY - (beam.y + (beam.scrollStep || 0));
      const after = this.player.y - beam.y;
      const clearance = beam.width / 2 + 0.45;
      if (Math.abs(after) >= clearance && before * after > 0) continue;
      const side = before > 0 ? 1 : -1;
      this.player.y = beam.y + side * clearance;
      this.damagePlayer(true);
    }
  }

  destroyGroundEnemy(enemy) {
    if (!this.groundEnemies.includes(enemy)) return;
    this.groundEnemies = this.groundEnemies.filter((item) => item !== enemy);
    this.turretLasers = this.turretLasers.filter(
      (beam) => beam.id !== enemy.id,
    );
    if (enemy.gateId) {
      this.groundWrecks.push({ ...enemy, destroyed: true, wreckAge: 0 });
      this.refreshGateLasers();
    }
    this.pickups.push({
      id: ++this.serial,
      x: enemy.x,
      y: enemy.y,
      value: enemy.kind === "tank" ? 3 : 1,
      age: 0,
    });
    this.onEvent({
      type: enemy.gateId ? "gateExplosion" : "groundExplosion",
      groundKind: enemy.kind,
      groundId: enemy.id,
      x: enemy.x,
      y: enemy.y,
      size: enemy.kind === "tank" ? 3.8 : 2.2,
    });
  }

  updateGroundEnemies(dt) {
    this.turretLasers = [];
    const speed = this.sceneryVelocity;
    this.groundCooldown -= dt;
    if (this.groundCooldown <= 0) this.spawnGroundEnemy();
    this.gateCooldown -= dt;
    if (this.gateCooldown <= 0) this.spawnLaserGate();
    for (const enemy of [...this.groundEnemies, ...this.groundWrecks]) {
      if (this.sceneryStopped) break;
      enemy.age += dt;
      if (enemy.destroyed) enemy.wreckAge += dt;
      enemy.y -= dt * speed;
      // The wall and its installation share the same surface coordinates.
      const y = enemy.y + this.groundTravel;
      const phase = enemy.side * 0.9;
      const wall = canyonWall(y, phase);
      const lane =
        enemy.kind === "tank" ? 0.5 + Math.sin(enemy.age * 0.75) * 0.055 : 0.49;
      enemy.x = enemy.side * (this.sceneryWidth || 24) * 0.5 * (lane + wall);
      if (enemy.gateId) {
        enemy.aim = (-enemy.side * Math.PI) / 2;
        if (
          !enemy.enteredView &&
          enemy.y <= (this.playfieldHeight || 32) / 2 - 1
        ) {
          const pair = this.groundEnemies.filter(
            (item) => item.gateId === enemy.gateId,
          );
          pair.forEach((item) => {
            item.enteredView = true;
          });
          if (pair.length === 2 && this.laserGateTutorialCount < 2) {
            this.laserGateTutorialCount++;
            pair.forEach((item) => {
              item.highlightUntil = item.age + 2;
            });
            this.onEvent({ type: "laserGateTutorial" });
          }
        }
        continue;
      }
      if (enemy.laserAttack) {
        enemy.laserAttack.remaining -= dt;
        if (enemy.laserAttack.remaining <= 0) {
          if (enemy.laserAttack.warning) {
            enemy.laserAttack = { warning: false, remaining: 0.25 };
            this.onEvent({ type: "laser" });
          } else {
            enemy.laserAttack = null;
            enemy.fireCooldown = 4;
          }
        }
      }
      if (enemy.laserAttack) {
        this.updateTurretLaser(enemy);
        continue;
      }
      enemy.aim =
        Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x) -
        Math.PI / 2;
      enemy.fireCooldown -= dt;
      if (Math.abs(enemy.y) < 15 && enemy.fireCooldown <= 0) {
        if (enemy.kind === "turret" && this.wave >= 3) {
          enemy.laserAttack = { warning: true, remaining: 1.2 };
          this.updateTurretLaser(enemy);
          continue;
        }
        enemy.fireCooldown = enemy.kind === "tank" ? 2.1 : 1.6;
        const angle = enemy.aim + Math.PI / 2;
        this.bullets.push({
          id: ++this.serial,
          x: enemy.x + Math.cos(angle) * 0.9,
          y: enemy.y + Math.sin(angle) * 0.9,
          vx: Math.cos(angle) * 9,
          vy: Math.sin(angle) * 9,
          friendly: false,
          ground: true,
          life: 8,
        });
        this.onEvent({
          type: "groundShot",
          x: enemy.x + Math.cos(angle) * 0.9,
          y: enemy.y + Math.sin(angle) * 0.9,
          size: 0.3,
        });
      }
    }
    const bottom = -(this.playfieldHeight || 32) / 2 - 3;
    this.groundEnemies = this.groundEnemies.filter((enemy) => enemy.y > bottom);
    this.turretLasers = this.turretLasers.filter((beam) =>
      this.groundEnemies.some((enemy) => enemy.id === beam.id),
    );
    this.groundWrecks = this.groundWrecks.filter((enemy) => enemy.y > bottom);
    this.refreshGateLasers();
    this.gateLasers.forEach((beam) => {
      beam.scrollStep = dt * speed;
    });
  }

  updateTurretLaser(enemy) {
    const angle = enemy.aim + Math.PI / 2;
    const dx = Math.cos(angle),
      dy = Math.sin(angle);
    const length = Math.hypot(
      this.sceneryWidth || 24,
      this.playfieldHeight || 32,
    );
    const warning = enemy.laserAttack.warning;
    const beam = {
      id: enemy.id,
      x: enemy.x + dx * 0.9,
      y: enemy.y + dy * 0.9,
      endX: enemy.x + dx * length,
      top: enemy.y + dy * length,
      width: warning ? 0.12 : 0.65,
      color: warning ? "gold" : "red",
      warning,
    };
    this.turretLasers.push(beam);
    if (warning) return;
    // A segment-distance check works for beams aimed in any direction.
    const bx = beam.endX - beam.x,
      by = beam.top - beam.y;
    const t = clamp(
      ((this.player.x - beam.x) * bx + (this.player.y - beam.y) * by) /
        (bx * bx + by * by),
      0,
      1,
    );
    if (
      Math.hypot(
        this.player.x - beam.x - t * bx,
        this.player.y - beam.y - t * by,
      ) <
      0.45 + beam.width / 2
    )
      this.damagePlayer();
  }

  hitCivilian(civilian) {
    if (
      (civilian.hitCooldown || 0) > 0 ||
      Math.abs(civilian.y) > 16 ||
      !this.civilians.includes(civilian)
    )
      return;
    civilian.hit = true;
    civilian.hp -= 1;
    // Count a twin volley or continuous laser contact as one impact.
    civilian.hitCooldown = 0.35;
    this.score -= 1000;
    this.onEvent({
      type: "civilianHit",
      penalty: 1000,
      fatal: civilian.hp === 0,
      id: civilian.id,
      x: civilian.x,
      y: civilian.y,
    });
    if (civilian.hp === 1) {
      civilian.alarmCooldown = 0.9;
      this.onEvent({
        type: "civilianAlarm",
        id: civilian.id,
        x: civilian.x,
        y: civilian.y,
      });
    }
    if (civilian.hp === 0) {
      this.civilians = this.civilians.filter((item) => item !== civilian);
      this.fallingCivilians.push({
        ...civilian,
        falling: true,
        fallAge: 0,
        fallDuration: 4,
        fallX: civilian.x,
        fallY: civilian.y,
      });
      this.onEvent({
        type: "civilianKilled",
        id: civilian.id,
        x: civilian.x,
        y: civilian.y,
        duration: 4,
      });
    }
  }

  updateFallingShips(dt) {
    for (const [ships, type] of [
      [this.fallingCivilians, "civilianCrash"],
      [this.fallingEnemies, "enemyCrash"],
    ]) {
      for (const civilian of ships) {
        civilian.fallAge += dt;
        const progress = Math.min(1, civilian.fallAge / civilian.fallDuration);
        civilian.x = civilian.fallX + Math.sin(progress * Math.PI) * 0.6;
        civilian.y = Math.max(
          -(this.playfieldHeight || 32) / 2 + 0.6,
          civilian.fallY - 3.5 * progress * progress,
        );
        if (progress === 1)
          this.onEvent({
            type,
            id: civilian.id,
            x: civilian.x,
            y: civilian.y,
            heavy: !!civilian.heavy,
            size:
              type === "civilianCrash" ? 0.45 : civilian.heavy ? 0.85 : 0.55,
          });
      }
    }
    this.fallingCivilians = this.fallingCivilians.filter(
      (civilian) => civilian.fallAge < civilian.fallDuration,
    );
    this.fallingEnemies = this.fallingEnemies.filter(
      (enemy) => enemy.fallAge < enemy.fallDuration,
    );
  }

  updateFlyawayShips(dt) {
    // A short, bounded drift keeps the spinning wreck close to its kill position.
    // Dead ships remain outside all combat/collision lists.
    this.flyawayEnemies = this.flyawayEnemies.filter((enemy) => {
      enemy.deathAge += dt;
      const age = enemy.deathAge;
      const progress = Math.min(1, age / 1.4);
      enemy.x = enemy.deathX + enemy.deathSide * 2.1 * progress;
      enemy.y =
        enemy.deathY - 0.7 * progress + enemy.deathLift * 0.2 * progress;
      if (age < 1.4) return true;
      this.onEvent({
        type: "explosion",
        enemyId: enemy.id,
        kind: enemy.kind,
        x: enemy.x,
        y: enemy.y,
        size: 1.5,
        color: "orange",
        blocky: true,
      });
      return false;
    });
  }

  laserHits(beam, target, radius) {
    return (
      beam.top > beam.y &&
      target.y >= beam.y &&
      target.y <= beam.top &&
      Math.abs(
        target.x -
          (beam.x +
            ((target.y - beam.y) * (beam.endX - beam.x)) / (beam.top - beam.y)),
      ) <
        radius + (beam.width || 0) / 2
    );
  }

  collectPowerup(power) {
    if (!POWERUPS[power]) return;
    if (["machine", "laser", "mega"].includes(power)) {
      this.weaponStrength =
        power === "mega"
          ? 3
          : this.weapon === power && this.weaponTime > 0
            ? Math.min(3, this.weaponStrength + 1)
            : power === "machine"
              ? 2
              : 1;
      this.weapon = power;
      this.weaponTime = 12;
      this.fireCooldown = 0;
    } else if (power === "missile") {
      this.missileCount = Math.min(10, this.missileCount + 1);
    } else if (power === "shield") this.shieldTime = 8;
    else if (power === "speed") this.speedTime = POWERUPS.speed.duration;
    else if (power === "orbit") {
      this.orbitCount = Math.min(3, this.orbitCount + 1);
      this.orbitTime = 10;
    } else if (power === "wingmen" || power === "spread") {
      this.companionMode = power;
      this.companionTime = 12;
      this.companionCooldown = 0;
    } else if (power === "fleet") {
      this.fleetTime = POWERUPS.fleet.duration;
      this.fleetRadioTime = 3;
      this.fleetRadioMessage = "Roger, on way!";
      this.fleetCooldown = 0;
      this.fleetFollowTime = 0;
      this.fleetHistory = [{ time: 0, ...this.player }];
      this.fleet = [-2, -1, 1, 2].map((side) => ({
        id: ++this.serial,
        side,
        followDelay: 0.08 * Math.abs(side) + (side > 0 ? 0.02 : 0),
        x: this.player.x + side * 2.4,
        y: Math.min(this.bounds.bottom - 4, this.player.y - 5),
        entryY: Math.min(this.bounds.bottom - 4, this.player.y - 5),
        age: 0,
        bank: 0,
        departing: false,
        missileCooldown: (side + 2) * 0.15,
      }));
    } else if (power === "assault") {
      this.assaultTime = POWERUPS.assault.duration;
      this.assaultCooldown = 0;
      const bottom = -(this.playfieldHeight || 32) / 2 - 1;
      const top = (this.playfieldHeight || 32) / 2 + 1;
      this.assaultFleet = [-3, -2, -1, 1, 2, 3].map((side) => ({
        id: ++this.serial,
        kind: "cart",
        missileCooldown: (side + 3) * 0.08,
        hp: 1,
        aim: 0,
        age: 0,
        side: Math.sign(side),
        x: this.assaultLane(
          Math.sign(side),
          bottom - (Math.abs(side) - 1) * 2.4,
        ),
        y: bottom - (Math.abs(side) - 1) * 2.4,
        speed: (top - bottom) / POWERUPS.assault.duration,
        bank: 0,
      }));
    } else if (power === "scatter") {
      this.scatterTime = 12;
      this.scatterCooldown = 0;
    }
    this.onEvent({
      type: "powerup",
      power,
      x: this.player.x,
      y: this.player.y,
    });
  }

  detonateMissile(missile) {
    this.blast(missile, 4.8, "missileExplosion", 3.4);
  }

  detonateBomb(bomb) {
    if (bomb.exploded) return;
    bomb.exploded = true;
    this.blast(bomb, 2.2, "scatterExplosion", 1.7);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      this.bullets.push({
        id: ++this.serial,
        kind: "shrapnel",
        friendly: true,
        x: bomb.x,
        y: bomb.y,
        vx: Math.sin(angle) * 16,
        vy: Math.cos(angle) * 16,
        life: 0.7,
      });
    }
  }

  blast(missile, radius, type, size) {
    missile.life = -1;
    this.onEvent({
      type,
      x: missile.x,
      y: missile.y,
      size,
    });
    for (const enemy of [...this.enemies]) {
      if (enemy.age >= 0 && distance(enemy, missile) < radius)
        this.destroyEnemy(enemy, true);
    }
    for (const enemy of [...this.groundEnemies]) {
      if (Math.abs(enemy.y) <= 16 && distance(enemy, missile) < radius)
        this.destroyGroundEnemy(enemy);
    }
    for (const target of this.capitalTurretTargets())
      if (
        Math.abs(target.y) <= (this.playfieldHeight || 32) / 2 &&
        distance(target, missile) < radius
      )
        this.damageCapitalTurret(target, target.turret.hp);
    for (const bullet of this.bullets) {
      if (!bullet.friendly && distance(bullet, missile) < radius)
        bullet.life = -1;
    }
    const civilian = this.civilians.find(
      (item) => Math.abs(item.y) <= 16 && distance(item, missile) < radius,
    );
    if (civilian && type !== "missileExplosion") this.hitCivilian(civilian);
  }

  updateAddons(dt, firing) {
    this.orbitTime = Math.max(0, this.orbitTime - dt);
    this.companionTime = Math.max(0, this.companionTime - dt);
    this.scatterTime = Math.max(0, this.scatterTime - dt);
    if (!this.orbitTime) this.orbitCount = 0;
    this.orbs = Array.from({ length: this.orbitCount }, (_, index) => {
      const angle = this.clock * 7 + (index / this.orbitCount) * Math.PI * 2;
      return {
        id: index,
        x: this.player.x + Math.cos(angle) * 1.8,
        y: this.player.y + Math.sin(angle) * 1.8,
      };
    });
    this.companions =
      this.companionTime > 0
        ? [-1, 1].map((side) => ({
            id: side,
            x: this.player.x + side * 1.7,
            y: this.player.y + 0.2,
          }))
        : [];
    this.companionCooldown -= dt;
    if (firing && this.companions.length && this.companionCooldown <= 0) {
      this.companionCooldown = 0.16;
      for (const orb of this.companions) {
        for (const degrees of this.companionMode === "spread"
          ? [-2, 0, 2]
          : [0]) {
          const angle = (degrees * Math.PI) / 180;
          this.bullets.push({
            id: ++this.serial,
            kind: "companion",
            friendly: true,
            x: orb.x,
            y: orb.y + 0.4,
            vx: Math.sin(angle) * 42,
            vy: Math.cos(angle) * 42,
            life: Math.max(1.5, (this.playfieldHeight || 32) / 42 + 0.2),
          });
        }
      }
      this.onEvent({ type: "shot" });
    }
    this.scatterCooldown -= dt;
    if (firing && this.scatterTime > 0 && this.scatterCooldown <= 0) {
      this.scatterCooldown = 0.8;
      for (const degrees of [-40, -20, 0, 20, 40]) {
        const angle = (degrees * Math.PI) / 180;
        this.bullets.push({
          id: ++this.serial,
          kind: "bomb",
          friendly: true,
          x: this.player.x,
          y: this.player.y + 0.9,
          vx: Math.sin(angle) * 12,
          vy: Math.cos(angle) * 12,
          life: 1.2,
          fuse: 0.65,
        });
      }
      this.onEvent({ type: "missileLaunch" });
    }
  }

  hitOrbitals() {
    const contacts =
      this.orbitTime > 0 ? [...this.orbs, this.player] : this.orbs;
    for (const orb of contacts) {
      for (const enemy of [...this.enemies])
        if (enemy.age >= 0 && distance(orb, enemy) < (enemy.heavy ? 1.3 : 0.95))
          this.destroyEnemy(enemy, true);
      for (const enemy of [...this.groundEnemies])
        if (Math.abs(enemy.y) <= 16 && distance(orb, enemy) < 1)
          this.destroyGroundEnemy(enemy);
      for (const bullet of this.bullets)
        if (!bullet.friendly && distance(orb, bullet) < 0.7) bullet.life = -1;
      for (const civilian of [...this.civilians])
        if (distance(orb, civilian) < 1) this.hitCivilian(civilian);
    }
  }

  assaultLane(side, y) {
    const boundary =
      0.79 + canyonWall(y + this.groundTravel * 1.08, side * 0.7 + 4);
    return side * (this.sceneryWidth || 24) * 0.5 * ((boundary + 1) / 2);
  }

  fireSupportMissile(ship, source, remaining, interval, dt, angle = 0) {
    ship.missileCooldown -= dt;
    if (ship.missileCooldown > 1e-8) return;
    ship.missileCooldown = interval;
    this.bullets.push({
      id: ++this.serial,
      kind: "missile",
      support: source,
      friendly: true,
      x: ship.x,
      y: ship.y + 0.8,
      vx: Math.sin(angle) * 18,
      vy: Math.cos(angle) * 18,
      // Support rockets clear quickly instead of patrolling between waves forever.
      life: Math.min(3, remaining),
    });
    this.onEvent({ type: "missileLaunch", x: ship.x, y: ship.y });
  }

  updateAssaultFleet(dt) {
    if (!this.assaultTime) return;
    this.assaultTime = Math.max(0, this.assaultTime - dt);
    if (this.assaultTime < 1e-8) this.assaultTime = 0;
    if (!this.assaultTime) {
      this.assaultFleet = [];
      return;
    }
    this.assaultCooldown -= dt;
    const fire = this.assaultCooldown <= 0;
    if (fire) this.assaultCooldown = 0.24;
    for (const ship of this.assaultFleet) {
      ship.age += dt;
      ship.y += ship.speed * dt;
      ship.x = this.assaultLane(ship.side, ship.y);
      const target = this.enemies
        .filter(
          (enemy) =>
            enemy.age >= 0 &&
            enemy.y > ship.y &&
            enemy.y <= (this.playfieldHeight || 32) / 2,
        )
        .reduce(
          (nearest, enemy) =>
            !nearest || distance(enemy, ship) < distance(nearest, ship)
              ? enemy
              : nearest,
          null,
        );
      const angle = target
        ? Math.atan2(target.x - ship.x, target.y - ship.y)
        : 0;
      ship.aim = -angle;
      if (Math.abs(ship.y) < (this.playfieldHeight || 32) / 2)
        this.fireSupportMissile(
          ship,
          "assault",
          this.assaultTime,
          0.6,
          dt,
          angle,
        );
      if (fire) {
        this.bullets.push({
          id: ++this.serial,
          kind: "assault",
          friendly: true,
          x: ship.x,
          y: ship.y + 0.8,
          vx: Math.sin(angle) * 36,
          vy: Math.cos(angle) * 36,
          life: (this.playfieldHeight || 32) / 36 + 0.2,
        });
      }
    }
  }

  updateFleet(dt) {
    const remaining = this.fleetTime;
    this.fleetTime = Math.max(0, remaining - dt);
    if (this.fleetTime < 1e-8) this.fleetTime = 0;
    this.fleetRadioTime = Math.max(0, this.fleetRadioTime - dt);
    if (remaining > 0 && this.fleetTime === 0 && this.fleet.length) {
      this.fleetRadioMessage = "Good job guys!";
      this.fleetRadioTime = 3;
    }
    if (!this.fleet.length) return;
    this.fleetFollowTime += dt;
    this.fleetHistory.push({ time: this.fleetFollowTime, ...this.player });
    // Retain the sample before the longest delay for smooth interpolation.
    while (
      this.fleetHistory.length > 2 &&
      this.fleetHistory[1].time < this.fleetFollowTime - 0.2
    )
      this.fleetHistory.shift();
    this.fleetCooldown -= dt;
    const fire = this.fleetCooldown <= 0;
    if (fire) this.fleetCooldown = 0.18;
    for (const ship of this.fleet) {
      ship.previousY = ship.y;
      ship.age += dt;
      if (!this.fleetTime) ship.departing = true;
      if (ship.departing) {
        // Freeze the departure lanes so the final sweep is independent of the hero.
        ship.y += dt * 32;
        ship.bank = 0;
      } else {
        const targetTime = this.fleetFollowTime - ship.followDelay;
        const index = this.fleetHistory.findIndex(
          (sample) => sample.time >= targetTime,
        );
        const before = this.fleetHistory[Math.max(0, index - 1)];
        const after = this.fleetHistory[Math.max(0, index)];
        const blend =
          after.time > before.time
            ? clamp(
                (targetTime - before.time) / (after.time - before.time),
                0,
                1,
              )
            : 0;
        const leaderX = before.x + (after.x - before.x) * blend;
        const leaderY = before.y + (after.y - before.y) * blend;
        const progress = Math.min(1, ship.age / 1.1);
        const ease = 1 - Math.pow(1 - progress, 3);
        ship.x = leaderX + ship.side * 2.4;
        ship.y =
          ship.entryY +
          (leaderY - 1.4 * Math.abs(ship.side) - ship.entryY) * ease;
        ship.bank = before.bank + (after.bank - before.bank) * blend;
      }
      if (!ship.departing && ship.age >= 1.1)
        this.fireSupportMissile(ship, "fleet", this.fleetTime, 1.2, dt);
      if (fire && ship.age >= 1.1) {
        this.bullets.push({
          id: ++this.serial,
          kind: "fleet",
          friendly: true,
          x: ship.x,
          y: ship.y + 0.8,
          vx: 0,
          vy: 42,
          life: Math.max(1.5, (this.playfieldHeight || 32) / 42 + 0.2),
        });
      }
    }
  }

  hitFleet() {
    for (const ship of this.fleet) {
      if (!ship.departing) continue;
      // Swept contact prevents fast departing fighters from skipping targets.
      const touches = (target, radius) =>
        Math.abs(target.x - ship.x) < radius &&
        target.y >= ship.previousY - radius &&
        target.y <= ship.y + radius;
      for (const enemy of [...this.enemies])
        if (enemy.age >= 0 && touches(enemy, enemy.heavy ? 1.5 : 1.1))
          this.destroyEnemy(enemy, true);
      for (const enemy of [...this.groundEnemies])
        if (touches(enemy, 1.2)) this.destroyGroundEnemy(enemy);
      for (const bullet of this.bullets)
        if (!bullet.friendly && touches(bullet, 0.9)) bullet.life = -1;
    }
    this.fleet = this.fleet.filter(
      (ship) => ship.y < (this.playfieldHeight || 32) / 2 + 3,
    );
  }

  damagePlayer(pierceDefenses = false) {
    if (this.lives <= 0) return;
    if (
      this.player.invulnerable > 0 ||
      (!pierceDefenses && (this.shieldTime > 0 || this.orbitTime > 0))
    )
      return;
    this.lives--;
    this.player.invulnerable = 2;
    this.bullets = this.bullets.filter((bullet) => bullet.friendly);
    this.onEvent({
      type: "hit",
      x: this.player.x,
      y: this.player.y,
      size: 2.4,
      fatal: this.lives === 0,
    });
    if (this.lives === 0) {
      this.phase = "dying";
      this.elapsed = 0;
      this.player.invulnerable = 0;
      this.playerFall = {
        x: this.player.x,
        y: this.player.y,
        bank: this.player.bank,
      };
      this.bullets = [];
      this.lasers = [];
      this.gateLasers = [];
      this.turretLasers = [];
      this.orbs = [];
      this.companions = [];
      this.orbitTime = 0;
      this.orbitCount = 0;
      this.companionTime = 0;
      this.missileCount = 0;
      this.shieldTime = 0;
      this.speedTime = 0;
      this.speedBlend = 0;
      // Pending formations must not enter the death scene.
      this.enemies = this.enemies.filter(
        (enemy) =>
          enemy.age >= 0 && enemy.y <= (this.playfieldHeight || 32) / 2 + 1,
      );
      this.onEvent({ type: "playerFalling", ...this.player, duration: 2.4 });
    }
  }

  get sceneryStopped() {
    return ["dying", "crashed", "gameover"].includes(this.phase);
  }

  get speedIntensity() {
    return this.speedBlend * this.speedBlend * (3 - 2 * this.speedBlend);
  }

  get sceneryVelocity() {
    return (this.scenerySpeed ?? 3.6) * (1 + this.speedIntensity * 1.35);
  }

  get sceneryMotion() {
    if (this.phase === "dying") return Math.max(0, 1 - this.elapsed / 1.2) ** 2;
    return this.sceneryStopped ? 0 : 1;
  }

  updateDepartingEnemies(dt) {
    const bottom = -(this.playfieldHeight || 32) / 2;
    for (const key of [
      "enemies",
      "capitalShips",
      "groundEnemies",
      "fallingEnemies",
      "flyawayEnemies",
    ]) {
      this[key] = this[key].filter((enemy) => {
        enemy.y -= dt * 18;
        return enemy.y > bottom - (key === "capitalShips" ? 14 : 3);
      });
    }
  }

  update(delta, input = {}) {
    if (this.paused || this.phase === "gameover") return;
    const dt = clamp(delta, 0, 0.05);
    this.clock += dt;
    this.elapsed += dt;
    if (this.sceneryStopped) this.updateDepartingEnemies(dt);
    if (this.phase === "dying") {
      this.groundTravel += dt * (this.scenerySpeed ?? 3.6) * this.sceneryMotion;
      const progress = Math.min(1, this.elapsed / 2.4);
      // Ease into the screen center before spiralling down toward the floor.
      const centering = Math.min(1, this.elapsed / 0.4);
      const ease = centering * centering * (3 - 2 * centering);
      this.player.x = centering === 1 ? 0 : this.playerFall.x * (1 - ease);
      this.player.y = centering === 1 ? 0 : this.playerFall.y * (1 - ease);
      this.player.z = 1 - 25 * progress * progress;
      this.player.bank = this.playerFall.bank + progress * Math.PI * 2;
      if (progress === 1) {
        this.phase = "crashed";
        this.elapsed = 0;
        this.onEvent({
          type: "playerCrash",
          ...this.player,
          size: 5.5,
          heavy: true,
        });
      }
      return;
    }
    if (this.phase === "crashed") {
      if (this.elapsed >= 0.8) {
        this.phase = "gameover";
        this.onEvent({ type: "gameover" });
      }
      return;
    }
    this.speedTime = Math.max(0, this.speedTime - dt);
    this.speedBlend = clamp(
      this.speedBlend + (this.speedTime > 0 ? dt / 0.65 : -dt / 0.85),
      0,
      1,
    );
    this.groundTravel += dt * this.sceneryVelocity;
    this.updateFallingShips(dt);
    this.updateFlyawayShips(dt);
    if (this.phase === "countdown") {
      if (this.elapsed >= 3.8) this.startWave();
      return;
    }

    const firing = input.fire;
    const launchMissile = input.missile && !this.missilePressed;
    this.missilePressed = !!input.missile;
    this.civilianCooldown -= dt;
    if (this.civilianCooldown <= 0) this.spawnCivilian();
    for (const civilian of this.civilians) {
      civilian.hitCooldown = Math.max(0, (civilian.hitCooldown || 0) - dt);
      civilian.age += dt;
      civilian.y -= dt * 2.1;
      civilian.x = civilian.origin + Math.sin(civilian.age * 0.65) * 0.35;
      if (civilian.hp === 1 && civilian.y > -18) {
        civilian.alarmCooldown = (civilian.alarmCooldown ?? 0) - dt;
        if (civilian.alarmCooldown <= 0) {
          civilian.alarmCooldown += 0.9;
          this.onEvent({
            type: "civilianAlarm",
            id: civilian.id,
            x: civilian.x,
            y: civilian.y,
          });
        }
      }
      if (civilian.y <= -18) {
        this.rescues += 1;
        this.score += 10000;
        this.onEvent({
          type: "civilianRescued",
          id: civilian.id,
          points: 10000,
        });
      }
    }
    this.civilians = this.civilians.filter((civilian) => civilian.y > -18);
    this.weaponTime = Math.max(0, this.weaponTime - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    if (!this.weaponTime) {
      this.weapon = "guns";
      this.weaponStrength = 1;
    }
    this.supplyCooldown -= dt;
    if (this.supplyCooldown <= 0) this.spawnSupply();
    this.lasers = [];

    let dx = Number(!!input.right) - Number(!!input.left);
    let dy = Number(!!input.up) - Number(!!input.down);
    const magnitude = Math.hypot(dx, dy) || 1;
    dx /= magnitude;
    dy /= magnitude;
    const horizontalIntent = input.target
      ? clamp((input.target.x - this.player.x) / 0.6, -1, 1)
      : dx;
    const bankTarget = (horizontalIntent * -Math.PI) / 36;
    const speedMultiplier = 1 + this.speedIntensity * 0.7;
    this.player.bank +=
      (bankTarget - this.player.bank) * Math.min(1, dt * 20 * speedMultiplier);
    const sin = Math.sin(this.player.bank),
      cos = Math.cos(this.player.bank);
    const muzzle = (side, forward = 0.8) => ({
      x: this.player.x + side * cos - forward * sin,
      y: this.player.y + side * sin + forward * cos,
    });
    const previousPlayerY = this.player.y;
    if (input.target) {
      const reach = 22 * speedMultiplier * dt;
      this.player.x += clamp(input.target.x - this.player.x, -reach, reach);
      this.player.y += clamp(input.target.y - this.player.y, -reach, reach);
    } else {
      this.player.x += dx * 16 * speedMultiplier * dt;
      this.player.y += dy * 16 * speedMultiplier * dt;
    }
    this.player.x = clamp(this.player.x, -this.bounds.x, this.bounds.x);
    this.player.y = clamp(this.player.y, this.bounds.bottom, this.bounds.top);
    this.player.invulnerable = Math.max(0, this.player.invulnerable - dt);
    this.fireCooldown -= dt;
    if (
      firing &&
      ["guns", "machine"].includes(this.weapon) &&
      this.fireCooldown <= 0
    ) {
      this.fireCooldown = this.weapon === "machine" ? 0.035 : 0.085;
      for (const side of [-1, 1])
        this.bullets.push({
          id: ++this.serial,
          ...muzzle(side * 0.24),
          strength: this.weaponStrength,
          damage: this.weaponStrength,
          vx: -sin * 42,
          vy: cos * 42,
          friendly: true,
          life: Math.max(1.5, (this.playfieldHeight || 32) / 42 + 0.2),
        });
      this.onEvent({
        type: "shot",
        ...muzzle(0),
      });
    }

    if (launchMissile && this.missileCount > 0) {
      this.missileCount -= 1;
      // Keep circling rockets bounded during long quiet periods.
      const missiles = this.bullets.filter(
        (bullet) => bullet.kind === "missile" && !bullet.support,
      );
      if (missiles.length >= 12) missiles[0].life = -1;
      this.bullets.push({
        id: ++this.serial,
        kind: "missile",
        friendly: true,
        ...muzzle(0, 0.9),
        vx: -sin * 18,
        vy: cos * 18,
        life: Infinity,
      });
      this.onEvent({ type: "missileLaunch" });
    }
    if (firing && this.weapon === "laser") {
      this.lasers = [-1, 1].map((side) => {
        const origin = muzzle(side * 0.48);
        const top = (this.playfieldHeight || 32) / 2;
        return {
          ...origin,
          strength: this.weaponStrength,
          damage: 18 * this.weaponStrength,
          width: 0.1 * this.weaponStrength,
          top,
          endX: origin.x - ((top - origin.y) * sin) / cos,
        };
      });
    }
    if (firing && this.weapon === "mega") {
      const origin = muzzle(0);
      const top = (this.playfieldHeight || 32) / 2;
      this.lasers = [
        {
          ...origin,
          top,
          endX: origin.x - ((top - origin.y) * sin) / cos,
          strength: 3,
          color: "purple",
          width: 1.2,
          damage: 54,
        },
      ];
    }
    this.updateAddons(dt, firing);
    this.updateFleet(dt);
    this.updateAssaultFleet(dt);

    this.updateGroundEnemies(dt);
    this.updateCapitalShips(dt);

    for (const enemy of [...this.enemies]) {
      enemy.age += dt;
      if (enemy.age < 0) continue;
      const age = enemy.age;
      if (enemy.invader) {
        // A rigid wall descends slowly; destroyed columns remain open.
        const height = this.playfieldHeight || 32;
        enemy.y =
          height / 2 +
          2 +
          enemy.formationRow * Math.min(2, height * 0.06) -
          age * ((height + 10) / 24);
        enemy.x = enemy.origin + Math.sin(age * 0.8) * this.bounds.x * 0.04;
      } else {
        // Keep the opening pace, then add a gentle increase on every wave.
        const speed = 3.62 + Math.max(0, this.wave - 1) * 0.3;
        // Columns sway together while keeping the full formation on screen.
        enemy.y =
          (this.playfieldHeight || 32) / 2 +
          2 +
          (enemy.formationRow || 0) * 2.2 -
          age * speed;
        enemy.x =
          enemy.origin +
          Math.sin(age * 1.15 + enemy.pattern * 0.4) * this.bounds.x * 0.06;
      }
      if (
        enemy.y < (enemy.invader ? -(this.playfieldHeight || 32) / 2 - 2 : -17)
      ) {
        this.destroyEnemy(enemy, false);
        continue;
      }
      const canFire =
        !enemy.invader ||
        !this.enemies.some(
          (other) =>
            other.column === enemy.column &&
            other.formationRow < enemy.formationRow,
        );
      if (
        canFire &&
        age > enemy.fireAt &&
        enemy.y < Math.min(13, (this.playfieldHeight || 32) / 2 - 1) &&
        enemy.y > this.player.y + 1.5
      ) {
        enemy.fireAt =
          age + (enemy.invader ? 6 : Math.max(0.9, 2.5 - this.wave * 0.12));
        const angle = Math.atan2(
          this.player.y - enemy.y,
          this.player.x - enemy.x,
        );
        this.onEvent({ type: "enemyShot" });
        const spread =
          !enemy.invader && enemy.kind === 2 && this.wave > 2
            ? [-0.22, 0, 0.22]
            : [0];
        for (const offset of spread)
          this.bullets.push({
            id: ++this.serial,
            x: enemy.x,
            y: enemy.y - 0.6,
            vx: Math.cos(angle + offset) * 7.5,
            vy: Math.sin(angle + offset) * 7.5,
            friendly: false,
            life: 8,
          });
      }
      if (
        distance(enemy, this.player) <
        (enemy.invader ? 0.35 + enemy.scale * 0.45 : enemy.heavy ? 1.05 : 0.8)
      )
        this.damagePlayer();
      if (this.lives <= 0) return;
    }

    this.hitOrbitals();
    this.hitFleet();
    // Stop each beam at its nearest civilian.
    for (const beam of this.lasers) {
      const laserCivilian = this.civilians
        .filter((civilian) => this.laserHits(beam, civilian, 0.85))
        .sort((a, b) => a.y - b.y)[0];
      if (laserCivilian) {
        this.hitCivilian(laserCivilian);
        beam.endX =
          beam.x +
          ((laserCivilian.y - beam.y) * (beam.endX - beam.x)) /
            (beam.top - beam.y);
        beam.top = laserCivilian.y;
      }
    }
    for (const enemy of [...this.enemies]) {
      if (
        enemy.age < 0 ||
        !this.lasers.some((beam) =>
          this.laserHits(
            beam,
            enemy,
            enemy.invader ? 0.75 * enemy.scale : enemy.heavy ? 1 : 0.75,
          ),
        )
      )
        continue;
      enemy.hp -=
        dt *
        Math.max(
          ...this.lasers
            .filter((beam) =>
              this.laserHits(
                beam,
                enemy,
                enemy.invader ? 0.75 * enemy.scale : enemy.heavy ? 1 : 0.75,
              ),
            )
            .map((beam) => beam.damage || 18),
        );
      enemy.laserImpactAt = (enemy.laserImpactAt || 0) - dt;
      if (enemy.laserImpactAt <= 0) {
        enemy.laserImpactAt = 0.12;
        this.onEvent({ type: "impact", x: enemy.x, y: enemy.y, size: 0.25 });
      }
      if (enemy.hp <= 0) this.destroyEnemy(enemy, true);
    }

    for (const enemy of [...this.groundEnemies]) {
      if (
        Math.abs(enemy.y) > 16 ||
        !this.lasers.some((beam) => this.laserHits(beam, enemy, 0.85))
      )
        continue;
      enemy.impactAt = (enemy.impactAt || 0) - dt;
      if (enemy.impactAt <= 0) {
        enemy.impactAt = 0.15;
        this.onEvent({
          type: "armourImpact",
          x: enemy.x,
          y: enemy.y,
          size: 0.3,
        });
      }
      enemy.hp -=
        dt *
        Math.max(
          ...this.lasers
            .filter((beam) => this.laserHits(beam, enemy, 0.85))
            .map((beam) => beam.damage || 18),
        );
      if (enemy.hp <= 0) this.destroyGroundEnemy(enemy);
    }

    for (const target of this.capitalTurretTargets()) {
      const beams = this.lasers.filter((beam) =>
        this.laserHits(beam, target, 0.85),
      );
      if (beams.length)
        this.damageCapitalTurret(
          target,
          dt * Math.max(...beams.map((beam) => beam.damage || 18)),
        );
    }

    for (const bullet of [...this.bullets]) {
      if (bullet.life <= 0) continue;
      if (bullet.kind === "missile") {
        const targets = [
          ...this.enemies,
          ...this.groundEnemies,
          ...this.capitalTurretTargets(),
        ].filter((enemy) => enemy.age >= 0 && Math.abs(enemy.y) < 17);
        const aim = targets.reduce(
          (nearest, enemy) =>
            !nearest || distance(enemy, bullet) < distance(nearest, bullet)
              ? enemy
              : nearest,
          null,
        );
        // Patrol an ellipse inside the arena until a target is available.
        const orbit = this.clock * 1.4 + bullet.id * 2.4;
        const goal = aim || {
          x: Math.cos(orbit) * 7.5,
          y: Math.sin(orbit) * 11,
        };
        const dx = goal.x - bullet.x,
          dy = goal.y - bullet.y;
        const length = Math.hypot(dx, dy) || 1;
        const speed = aim ? 24 : 13;
        const steer = Math.min(1, dt * (aim ? 10 : 5));
        bullet.vx += ((dx / length) * speed - bullet.vx) * steer;
        bullet.vy += ((dy / length) * speed - bullet.vy) * steer;
      }
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.kind === "missile") {
        const limit = Math.max(11, (this.sceneryWidth || 24) * 0.32);
        bullet.x = clamp(bullet.x, -limit, limit);
        const verticalLimit = Math.max(
          15,
          (this.playfieldHeight || 32) / 2 - 1,
        );
        bullet.y = clamp(bullet.y, -verticalLimit, verticalLimit);
      }
      bullet.life -= dt;
      if (bullet.kind === "bomb") {
        bullet.fuse -= dt;
        if (bullet.fuse <= 0) {
          this.detonateBomb(bullet);
          continue;
        }
      }
      if (bullet.friendly) {
        const civilian = this.civilians.find(
          (item) => Math.abs(item.y) <= 16 && distance(item, bullet) < 0.85,
        );
        if (civilian && bullet.kind !== "missile") {
          bullet.life = -1;
          if (bullet.kind === "bomb") this.detonateBomb(bullet);
          else this.hitCivilian(civilian);
          continue;
        }
        const deck = this.capitalTurretTargets().find(
          (target) =>
            Math.abs(target.y) <= (this.playfieldHeight || 32) / 2 &&
            distance(target, bullet) < 0.85,
        );
        if (deck) {
          if (bullet.kind === "missile") this.detonateMissile(bullet);
          else if (bullet.kind === "bomb") this.detonateBomb(bullet);
          else {
            bullet.life = -1;
            this.damageCapitalTurret(deck, bullet.damage || 1);
            this.onEvent({
              type: "armourImpact",
              x: bullet.x,
              y: bullet.y,
              size: 0.3,
            });
          }
          continue;
        }
        const ground = this.groundEnemies.find(
          (item) => Math.abs(item.y) <= 16 && distance(item, bullet) < 0.85,
        );
        if (ground) {
          if (bullet.kind === "missile") this.detonateMissile(bullet);
          else if (bullet.kind === "bomb") this.detonateBomb(bullet);
          else {
            bullet.life = -1;
            this.onEvent({
              type: "armourImpact",
              x: bullet.x,
              y: bullet.y,
              size: 0.3,
            });
            ground.hp -= bullet.damage || 1;
            if (ground.hp <= 0) this.destroyGroundEnemy(ground);
          }
          continue;
        }
        const enemy = this.enemies.find(
          (item) =>
            item.age >= 0 &&
            distance(item, bullet) <
              (item.invader
                ? 0.15 + 0.6 * item.scale
                : item.heavy
                  ? 0.85
                  : 0.6),
        );
        if (enemy && bullet.kind === "bomb") {
          this.detonateBomb(bullet);
        } else if (enemy && bullet.kind === "missile") {
          this.detonateMissile(bullet);
        } else if (enemy) {
          bullet.life = -1;
          enemy.hp -= bullet.damage || 1;
          this.onEvent({
            type: "impact",
            x: bullet.x,
            y: bullet.y,
            size: 0.35,
          });
          if (enemy.hp <= 0) this.destroyEnemy(enemy, true);
        }
      } else {
        const cart = this.assaultFleet.find(
          (vehicle) => distance(bullet, vehicle) < 0.7,
        );
        if (cart) {
          bullet.life = -1;
          this.assaultFleet = this.assaultFleet.filter(
            (vehicle) => vehicle !== cart,
          );
          this.onEvent({
            type: "explosion",
            x: cart.x,
            y: cart.y,
            size: 1.2,
            color: "orange",
            blocky: true,
          });
        } else if (distance(bullet, this.player) < 0.36) {
          bullet.life = -1;
          this.damagePlayer();
          if (this.lives <= 0) return;
        }
      }
    }
    this.bullets = this.bullets.filter(
      (bullet) =>
        bullet.life > 0 &&
        Math.abs(bullet.x) < Math.max(16, (this.sceneryWidth || 24) / 2 + 2) &&
        Math.abs(bullet.y) < Math.max(21, (this.playfieldHeight || 32) / 2 + 2),
    );

    this.blockLaserGates(previousPlayerY);
    if (this.lives <= 0) return;

    for (const pickup of this.pickups) {
      pickup.age += dt;
      pickup.y -= dt * (pickup.kind === "powerup" ? 4 : 1.8);
      const d = distance(pickup, this.player);
      if (d < 3.2) {
        pickup.x += ((this.player.x - pickup.x) / Math.max(d, 0.01)) * dt * 11;
        pickup.y += ((this.player.y - pickup.y) / Math.max(d, 0.01)) * dt * 11;
      }
      if (distance(pickup, this.player) < 0.8) {
        if (pickup.kind === "life") {
          const restored = this.lives < 3;
          this.lives = Math.min(3, this.lives + 1);
          pickup.collected = true;
          this.onEvent({ type: "life", x: pickup.x, y: pickup.y, restored });
          continue;
        }
        if (pickup.kind === "powerup") {
          this.collectPowerup(pickup.power);
          pickup.collected = true;
          continue;
        }
        this.score += pickup.value;
        pickup.collected = true;
        this.onEvent({
          type: "collect",
          x: pickup.x,
          y: pickup.y,
          size: pickup.value === 10 ? 1.5 : 0.45,
          value: pickup.value,
        });
      }
    }
    this.pickups = this.pickups.filter(
      (pickup) => !pickup.collected && pickup.y > -18 && pickup.age < 16,
    );

    if (this.phase === "playing" && this.enemies.length === 0) {
      this.phase = "intermission";
      this.elapsed = 0;
      const perfect = this.waveKills === this.waveSize && this.escaped === 0;
      if (perfect)
        this.pickups.push({
          id: ++this.serial,
          ...this.lastKill,
          value: 10,
          age: 0,
        });
      this.onEvent({
        type: "waveClear",
        perfect,
        ...this.lastKill,
        size: perfect ? 3 : 1.5,
      });
    } else if (this.phase === "intermission" && this.elapsed >= 3)
      this.startWave();
  }
}

// Rendering can run at 15, 30 or 60fps without changing movement or countdown speed.
export function advanceSimulation(game, delta, input) {
  for (
    let remaining = clamp(delta, 0, 0.1);
    remaining > 0.00001;
    remaining -= 1 / 120
  ) {
    game.update(Math.min(remaining, 1 / 120), input);
  }
}
