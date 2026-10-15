import { test } from "node:test";
import assert from "node:assert/strict";

import { ShooterGame, advanceSimulation } from "../assets/js/ShooterGame.js";

function advance(game, seconds, input = {}) {
  for (let t = 0; t < seconds; t += 1 / 60) game.update(1 / 60, input);
}
function playing() {
  const game = new ShooterGame();
  advance(game, 4);
  return game;
}

test("every heavy and the final wave enemy fall before exploding while ordinary kills can stay immediate", () => {
  const game = playing();
  game.random = () => 0.5;
  const events = [];
  game.onEvent = (event) => events.push(event);
  const ordinary = game.enemies[0];
  game.destroyEnemy(ordinary, true);
  assert.ok(
    events.some(
      (event) => event.type === "explosion" && event.enemyId === ordinary.id,
    ),
  );
  const heavy = game.enemies[0];
  heavy.heavy = true;
  game.destroyEnemy(heavy, true);
  assert.equal(game.fallingEnemies.length, 1);
  assert.ok(game.pickups.some((pickup) => pickup.kind === "life"));
  for (const enemy of game.enemies.slice(0, -1))
    game.destroyEnemy(enemy, false);
  const final = game.enemies[0];
  game.destroyEnemy(final, true);
  assert.equal(game.fallingEnemies.length, 2);
  assert.equal(game.kills, 3);
  assert.equal(events.filter((event) => event.type === "enemyCrash").length, 0);
  game.phase = "intermission";
  game.elapsed = -100;
  game.paused = true;
  advance(game, 1);
  assert.ok(game.fallingEnemies.every((enemy) => enemy.fallAge === 0));
  game.paused = false;
  advance(game, 4.1);
  assert.equal(game.fallingEnemies.length, 0);
  assert.equal(events.filter((event) => event.type === "enemyCrash").length, 2);
  game.reset();
  assert.equal(game.fallingEnemies.length, 0);
});

test("deep scenery scrolls during countdown, stays continuous into play and freezes on pause", () => {
  const game = new ShooterGame();
  advance(game, 1);
  assert.equal(game.phase, "countdown");
  assert.ok(game.groundTravel > 3.5);
  game.paused = true;
  const pausedTravel = game.groundTravel;
  advance(game, 1);
  assert.equal(game.groundTravel, pausedTravel);
  game.paused = false;
  game.elapsed = 3.79;
  const before = game.groundTravel;
  game.update(0.02);
  assert.equal(game.phase, "playing");
  assert.ok(Math.abs(game.groundTravel - before - 0.072) < 1e-10);
  game.update(0.02);
  assert.ok(Math.abs(game.groundTravel - before - 0.144) < 1e-10);
  game.phase = "gameover";
  const stoppedTravel = game.groundTravel;
  game.update(0.02);
  assert.equal(game.groundTravel, stoppedTravel);
});

test("launch counts only 3, 2, 1 before the first wave", () => {
  const game = new ShooterGame();
  assert.equal(game.message, "3");
  advance(game, 0.9);
  assert.equal(game.message, "3");
  advance(game, 1);
  assert.equal(game.message, "2");
  advance(game, 1);
  assert.equal(game.message, "1");
  advance(game, 1);
  assert.equal(game.phase, "playing");
  assert.equal(game.wave, 1);
});

test("pause freezes countdown, enemies, bullets and player", () => {
  const game = playing();
  game.paused = true;
  const before = JSON.stringify(game.snapshot());
  advance(game, 10, { right: true, fire: true });
  assert.equal(JSON.stringify(game.snapshot()), before);
  game.paused = false;
  advance(game, 0.5, { right: true, fire: true });
  assert.ok(game.player.x > 0);
  assert.ok(game.bullets.length > 0);
});

test("movement stays inside the playfield and diagonal speed is normalised", () => {
  const game = playing();
  game.player.invulnerable = 100;
  game.gateCooldown = Infinity;
  const origin = { ...game.player };
  advance(game, 0.2, { right: true, up: true });
  assert.ok(
    Math.hypot(game.player.x - origin.x, game.player.y - origin.y) < 3.5,
  );
  advance(game, 10, { right: true, up: true });
  assert.ok(game.player.x <= 10.5 && game.player.y <= 12.5);
  advance(game, 10, { left: true, down: true });
  assert.ok(game.player.x >= -10.5 && game.player.y >= -13);
});

test("a destroyed enemy drops a collectible one-star pickup", () => {
  const game = playing();
  const enemy = game.enemies[0];
  enemy.age = 2;
  enemy.hp = 1;
  game.update(0.01);
  game.bullets.push({
    id: 10000,
    x: enemy.x,
    y: enemy.y,
    vx: 0,
    vy: 0,
    friendly: true,
    life: 2,
  });
  game.update(0.01);
  assert.equal(game.kills, 1);
  assert.equal(game.pickups[0].value, 1);
  game.player.x = game.pickups[0].x;
  game.player.y = game.pickups[0].y;
  game.update(0.01);
  assert.equal(game.score, 1);
});

test("destroying a complete wave drops a ten-star bonus and waits three seconds", () => {
  const game = playing();
  for (const enemy of [...game.enemies]) game.destroyEnemy(enemy, true);
  game.update(0.01);
  assert.equal(game.phase, "intermission");
  assert.equal(game.pickups.filter((p) => p.value === 10).length, 1);
  const bonus = game.pickups.find((p) => p.value === 10);
  game.player.x = bonus.x;
  game.player.y = bonus.y;
  game.update(0.01);
  assert.ok(game.score >= 10);
  advance(game, 2.8);
  assert.equal(game.wave, 1);
  advance(game, 0.3);
  assert.equal(game.wave, 2);
  assert.equal(game.phase, "playing");
});

test("escaping enemies finish the wave without awarding a perfect-wave bonus", () => {
  const game = playing();
  const escaped = game.enemies[0];
  escaped.age = 100;
  for (const enemy of game.enemies.slice(1)) game.destroyEnemy(enemy, true);
  game.update(0.01);
  assert.equal(game.phase, "intermission");
  assert.equal(
    game.pickups.some((p) => p.value === 10),
    false,
  );
});

test("damage grants protection, then three hits end the run; restart resets it", () => {
  const game = playing();
  const hit = () => {
    game.bullets.push({
      id: Math.random(),
      x: game.player.x,
      y: game.player.y,
      vx: 0,
      vy: 0,
      friendly: false,
      life: 5,
    });
    game.update(0.01);
  };
  hit();
  assert.equal(game.lives, 2);
  hit();
  assert.equal(game.lives, 2);
  advance(game, 2.1);
  hit();
  assert.equal(game.lives, 1);
  advance(game, 2.1);
  hit();
  assert.equal(game.phase, "dying");
  advance(game, 3.5);
  assert.equal(game.phase, "gameover");
  const score = game.score;
  advance(game, 2, { fire: true });
  assert.equal(game.score, score);
  game.reset();
  assert.equal(game.lives, 3);
  assert.equal(game.wave, 0);
  assert.equal(game.score, 0);
  assert.equal(game.phase, "countdown");
});

test("long sessions keep entities bounded and produce enemy fire and later formations", () => {
  const game = playing();
  let enemyFire = false;
  for (let wave = 1; wave <= 7; wave++) {
    game.player.invulnerable = 100;
    advance(game, 4, { fire: true });
    enemyFire ||= game.bullets.some((b) => !b.friendly);
    for (const enemy of [...game.enemies]) game.destroyEnemy(enemy, true);
    advance(game, 3.1, { fire: true });
    assert.ok(game.bullets.length < 200);
    assert.ok(game.pickups.length < 150);
  }
  assert.ok(enemyFire);
  assert.ok(game.wave >= 7);
});

test("touch targets move smoothly, clamp to the playfield, and expose the break countdown", () => {
  const game = playing();
  advance(game, 0.2, { target: { x: 100, y: 100 }, fire: true });
  assert.ok(game.player.x > 0 && game.player.x < 5);
  assert.ok(game.player.y > -10.5);
  for (const enemy of [...game.enemies]) game.destroyEnemy(enemy, true);
  game.update(0.01);
  assert.equal(game.message, "NEXT WAVE IN 3");
  advance(game, 1.1);
  assert.equal(game.message, "NEXT WAVE IN 2");
});

test("movement and firing respond immediately at the faster arcade pace", () => {
  const game = playing();
  const x = game.player.x;
  advance(game, 0.1, { right: true, fire: true });
  assert.ok(
    game.player.x - x >= 1.5,
    "keyboard movement has no acceleration delay",
  );
  assert.ok(
    game.bullets.length >= 4,
    "holding fire produces at least two paired volleys in 100ms",
  );
  const before = game.player.x;
  game.update(1 / 60, { target: { x: before + 1, y: game.player.y } });
  assert.ok(game.player.x - before >= 0.35, "drag controls follow quickly");
});

test("15fps and 60fps render loops produce the same movement and game time", () => {
  const slow = playing(),
    fast = playing();
  for (let i = 0; i < 6; i++)
    advanceSimulation(slow, 1 / 15, { right: true, fire: true });
  for (let i = 0; i < 24; i++)
    advanceSimulation(fast, 1 / 60, { right: true, fire: true });
  assert.ok(Math.abs(slow.player.x - fast.player.x) < 0.0001);
  assert.ok(Math.abs(slow.clock - fast.clock) < 0.0001);
  assert.equal(slow.bullets.length, fast.bullets.length);
});

test("random supply packages spawn, collect without scoring, and refresh timed upgrades", () => {
  const game = new ShooterGame(
    () => {},
    () => 0,
  );
  advance(game, 7);
  const supply = game.pickups.find((p) => p.kind === "powerup");
  assert.equal(supply.power, "machine");
  game.player.x = supply.x;
  game.player.y = supply.y;
  game.update(0.01);
  assert.equal(game.weapon, "machine");
  assert.ok(game.weaponTime > 11);
  assert.equal(game.score, 0);
  game.weaponTime = 1;
  game.collectPowerup("machine");
  assert.equal(game.weaponTime, 12);
});

test("machine gun doubles firing speed, expires, and pauses its timer", () => {
  const basic = playing(),
    machine = playing();
  machine.collectPowerup("machine");
  advance(basic, 0.3, { fire: true });
  advance(machine, 0.3, { fire: true });
  assert.ok(machine.bullets.length >= basic.bullets.length * 2);
  machine.paused = true;
  const remaining = machine.weaponTime;
  advance(machine, 2);
  assert.equal(machine.weaponTime, remaining);
  machine.paused = false;
  machine.weaponTime = 0.01;
  machine.update(0.02);
  assert.equal(machine.weapon, "guns");
});

test("twin lasers require firing, damage enemies, and replace the primary gun", () => {
  const game = playing();
  game.collectPowerup("laser");
  game.update(0.01);
  assert.equal(game.lasers.length, 0);
  const enemy = game.enemies[0];
  enemy.age = 4;
  enemy.origin = -Math.sin(4 * 1.15) * game.bounds.x * 0.06;
  enemy.hp = 2;
  advance(game, 0.2, { fire: true });
  assert.equal(game.lasers.length, 2);
  assert.equal(game.bullets.filter((b) => b.friendly).length, 0);
  assert.ok(game.kills >= 1);
  game.update(0.01);
  assert.equal(game.lasers.length, 0);
});

test("missiles supplement guns and destroy nearby enemies without hitting unspawned enemies", () => {
  const game = playing();
  game.collectPowerup("missile");
  game.update(0.01, { fire: true, missile: true });
  assert.ok(game.bullets.some((b) => b.kind === "missile"));
  assert.ok(game.bullets.some((b) => b.friendly && b.kind !== "missile"));
  const [a, b, pending] = game.enemies;
  a.age = 2;
  a.x = 0;
  a.y = 0;
  b.age = 2;
  b.x = 3;
  b.y = 0;
  pending.age = -1;
  pending.x = 1;
  pending.y = 0;
  game.detonateMissile({ x: 0, y: 0 });
  assert.equal(game.enemies.includes(a), false);
  assert.equal(game.enemies.includes(b), false);
  assert.equal(game.enemies.includes(pending), true);
  assert.equal(game.kills, 2);
});

test("shield blocks collisions until it expires and all upgrades reset on replay", () => {
  const game = playing();
  game.collectPowerup("shield");
  game.collectPowerup("missile");
  game.damagePlayer();
  assert.equal(game.lives, 3);
  game.shieldTime = 0.01;
  game.update(0.02);
  game.damagePlayer();
  assert.equal(game.lives, 2);
  game.reset();
  assert.equal(game.weapon, "guns");
  assert.equal(game.missileCount, 3);
  assert.equal(game.shieldTime, 0);
  assert.equal(game.lasers.length, 0);
});

test("all four package types can spawn and missile impacts trigger the area blast", () => {
  for (const [index, power] of [
    "machine",
    "laser",
    "missile",
    "shield",
  ].entries()) {
    const game = new ShooterGame(
      () => {},
      () => [0.05, 0.15, 0.25, 0.35][index],
    );
    game.spawnSupply();
    assert.equal(game.pickups[0].power, power);
  }
  const events = [];
  const game = new ShooterGame((event) => events.push(event));
  advance(game, 4);
  for (const enemy of game.enemies.slice(0, 2)) {
    enemy.age = 3;
    enemy.origin = 0;
  }
  game.update(0.01);
  const enemy = game.enemies[0];
  game.bullets.push({
    id: 10000,
    kind: "missile",
    friendly: true,
    x: enemy.x,
    y: enemy.y - 0.1,
    vx: 0,
    vy: 18,
    life: 2,
  });
  game.update(0.01);
  assert.ok(events.some((event) => event.type === "missileExplosion"));
  assert.ok(game.kills >= 2);
});

test("destruction identifies the enemy design so its own blocks can scatter", () => {
  const game = playing();
  game.random = () => 0.5; // Exercise the explosion branch, not a random flyaway.
  const events = [];
  game.onEvent = (event) => events.push(event);
  const enemy = game.enemies[1];
  game.destroyEnemy(enemy, true);
  const explosion = events.find((event) => event.type === "explosion");
  assert.equal(explosion.kind, enemy.kind);
  assert.equal(explosion.enemyId, enemy.id);
  assert.equal(explosion.x, enemy.x);
  assert.equal(explosion.y, enemy.y);
});

test("supply pool makes rotating orbs more frequent and includes every add-on", () => {
  const counts = {
    machine: 0,
    laser: 0,
    missile: 0,
    shield: 0,
    speed: 0,
    orbit: 0,
    wingmen: 0,
    spread: 0,
    scatter: 0,
    mega: 0,
    fleet: 0,
    assault: 0,
  };
  for (let i = 0; i < 1000; i++) {
    const game = new ShooterGame(
      () => {},
      () => (i + 0.5) / 1000,
    );
    game.spawnSupply();
    counts[game.pickups[0].power]++;
  }
  assert.deepEqual(counts, {
    machine: 79,
    laser: 79,
    missile: 123,
    shield: 79,
    speed: 79,
    orbit: 216,
    wingmen: 57,
    spread: 58,
    scatter: 57,
    mega: 58,
    fleet: 57,
    assault: 58,
  });
});

test("reversing keeps the ship and weapons facing forward", () => {
  const game = playing();
  game.update(0.01, { down: true, fire: true });
  assert.equal(game.player.bank, 0);
  assert.ok(
    game.bullets
      .filter((b) => b.friendly)
      .every((b) => b.vy > 0 && b.y > game.player.y),
  );
  game.collectPowerup("laser");
  game.update(0.01, { down: true, fire: true });
  assert.ok(
    game.lasers.every((beam) => beam.top > beam.y && beam.endX === beam.x),
  );
});

test("left and right movement banks at most five degrees and angles shots and twin lasers with the hull", () => {
  for (const direction of ["left", "right"]) {
    const game = playing();
    advance(game, 0.3, { [direction]: true });
    assert.ok(Math.abs(game.player.bank) <= Math.PI / 36);
    assert.ok(Math.abs(game.player.bank) > 0.08);
    game.fireCooldown = 0;
    game.update(0.01, { [direction]: true, fire: true });
    const shot = game.bullets.find((b) => b.friendly);
    assert.ok(direction === "left" ? shot.vx < 0 : shot.vx > 0);
    assert.ok(
      Math.abs(Math.atan2(-shot.vx, shot.vy) - game.player.bank) < 1e-10,
    );
    game.collectPowerup("laser");
    game.update(0.01, { [direction]: true, fire: true });
    assert.equal(game.lasers.length, 2);
    for (const beam of game.lasers)
      assert.ok(
        Math.abs(
          Math.atan2(-(beam.endX - beam.x), beam.top - beam.y) -
            game.player.bank,
        ) < 1e-10,
      );
    advance(game, 0.3);
    assert.ok(Math.abs(game.player.bank) < 0.001);
  }
  const game = playing();
  game.update(0.05, { target: { x: game.player.x + 3, y: game.player.y } });
  assert.ok(game.player.bank < 0);
});

test("missiles patrol without targets, survive between waves, then home in behind them", () => {
  const events = [];
  const game = new ShooterGame((e) => events.push(e));
  game.groundCooldown = Infinity;
  game.phase = "intermission";
  game.elapsed = -100;
  game.collectPowerup("missile");
  game.update(0.01, { fire: true, missile: true });
  const missile = game.bullets.find((b) => b.kind === "missile");
  advance(game, 8);
  assert.ok(game.bullets.includes(missile));
  assert.ok(Math.abs(missile.x) <= 11 && Math.abs(missile.y) <= 15);
  // Spawn an enemy behind the rocket; its position is governed by age.
  const enemy = {
    id: 999,
    age: 6,
    x: 0,
    y: -4,
    origin: 0,
    index: 0,
    pattern: 0,
    kind: 0,
    hp: 1,
    fireAt: 999,
  };
  game.enemies = [enemy];
  missile.x = 0;
  missile.y = 5;
  missile.vx = 0;
  missile.vy = 18;
  advance(game, 0.2);
  assert.ok(missile.vy < 0, "rocket turns around to chase a rear target");
  advance(game, 2);
  assert.ok(events.some((e) => e.type === "missileExplosion"));
  assert.equal(game.enemies.includes(enemy), false);
});

test("manually launched circling missiles stay bounded during continuous gun firing", () => {
  const game = playing();
  game.phase = "intermission";
  game.elapsed = -100;
  game.enemies = [];
  game.groundCooldown = Infinity;
  game.supplyCooldown = Infinity;
  game.civilianCooldown = Infinity;
  game.capitalCooldown = Infinity;
  for (let i = 0; i < 10; i++) {
    game.collectPowerup("missile");
    game.update(0.01, { missile: true });
    game.update(0.01);
  }
  advance(game, 11.5, { fire: true });
  const missiles = game.bullets.filter((b) => b.kind === "missile");
  assert.equal(missiles.length, 10);
  assert.ok(missiles.every((b) => Math.abs(b.x) <= 11 && Math.abs(b.y) <= 15));
  game.reset();
  assert.equal(game.bullets.length, 0);
  assert.equal(game.player.bank, 0);
});

test("occasional heavy enemies take repeated hits and emit a larger destruction event", () => {
  const events = [];
  const game = new ShooterGame((event) => events.push(event));
  game.startWave();
  assert.equal(
    game.enemies.some((enemy) => enemy.heavy),
    false,
  );
  game.startWave();
  const heavy = game.enemies.find((enemy) => enemy.heavy);
  assert.equal(game.enemies.filter((enemy) => enemy.heavy).length, 1);
  assert.ok(heavy.hp >= 12);
  heavy.age = 4;
  game.update(0.001);
  const initialHp = heavy.hp;
  for (let i = 0; i < 3; i++) {
    game.bullets.push({
      id: ++game.serial,
      x: heavy.x,
      y: heavy.y,
      vx: 0,
      vy: 0,
      life: 1,
      friendly: true,
    });
    game.update(0.001);
  }
  assert.equal(heavy.hp, initialHp - 3);
  assert.ok(game.enemies.includes(heavy));
  game.destroyEnemy(heavy, true);
  const explosion = events.find(
    (event) => event.type === "enemyFalling" && event.enemyId === heavy.id,
  );
  assert.equal(explosion.heavy, true);
  assert.ok(explosion.size >= 4.5);
  game.startWave();
  assert.equal(
    game.enemies.some((enemy) => enemy.heavy),
    false,
  );
  game.startWave();
  assert.equal(
    game.enemies.some((enemy) => enemy.heavy),
    false,
  );
  game.startWave();
  assert.equal(game.enemies.filter((enemy) => enemy.heavy).length, 1);
});

test("heavy enemies drop a life that restores one life without scoring and caps at three", () => {
  const events = [];
  const game = new ShooterGame((event) => events.push(event));
  game.startWave();
  game.startWave();
  const heavy = game.enemies.find((enemy) => enemy.heavy);
  heavy.x = game.player.x;
  heavy.y = game.player.y;
  game.destroyEnemy(heavy, true);
  const life = game.pickups.find((pickup) => pickup.kind === "life");
  assert.ok(life);
  game.pickups = [life];
  game.enemies = [];
  game.phase = "intermission";
  game.lives = 1;
  game.update(0.01);
  assert.equal(game.lives, 2);
  assert.equal(game.score, 0);
  assert.equal(game.pickups.length, 0);
  assert.ok(events.some((event) => event.type === "life" && event.restored));
  game.lives = 3;
  game.pickups.push({
    id: ++game.serial,
    kind: "life",
    x: game.player.x,
    y: game.player.y,
    age: 0,
  });
  game.update(0.01);
  assert.equal(game.lives, 3);
  assert.equal(events.at(-1).restored, false);
});

test("enemy flight speed increases gently on every wave, including later waves", () => {
  const speeds = [];
  for (const wave of [1, 2, 3, 14, 15, 20]) {
    const game = new ShooterGame();
    game.wave = wave - 1;
    game.startWave();
    const enemy = game.enemies[0];
    enemy.age = 1;
    game.update(0.01);
    const firstY = enemy.y;
    game.update(0.01);
    speeds.push({ wave, speed: (firstY - enemy.y) / 0.01 });
  }
  assert.ok(Math.abs(speeds[0].speed - 3.62) < 1e-9);
  for (let i = 1; i < speeds.length; i++) {
    const increase =
      (speeds[i].speed - speeds[i - 1].speed) /
      (speeds[i].wave - speeds[i - 1].wave);
    assert.ok(Math.abs(increase - 0.3) < 1e-9);
  }
});

test("normal waves use one or two ship designs in four to ten columns and three rows", () => {
  const game = new ShooterGame();
  for (let wave = 1; wave <= 6; wave++) {
    game.startWave();
    const regular = game.enemies.filter((enemy) => !enemy.heavy);
    assert.equal(
      new Set(regular.map((enemy) => enemy.kind)).size,
      wave % 2 ? 1 : 2,
    );
    assert.equal(game.enemies[0].age, game.enemies[1].age);
    assert.equal(game.enemies[1].age, game.enemies[2].age);
    assert.ok(Math.abs(game.enemies.at(-1).age) < 1);
    const columns = new Set(game.enemies.map((e) => e.origin)).size;
    assert.ok(columns >= 4 && columns <= 10);
    assert.equal(game.enemies.length, columns * 3);
    assert.equal(game.waveSize, columns * 3);
    assert.equal(new Set(game.enemies.map((e) => e.formationRow)).size, 3);
    assert.ok(game.enemies.every((e) => e.age === 0));
  }
});

test("wide formations sway left and right while staying within the playfield", () => {
  const game = playing();
  const enemy = game.enemies[1];
  enemy.origin = 0;
  const samples = [];
  for (const age of [0.5, 1.5, 3, 4, 5]) {
    enemy.age = age;
    game.update(0.001);
    samples.push(enemy.x);
  }
  assert.ok(Math.max(...samples) > 0.5);
  assert.ok(Math.min(...samples) < -0.5);
  assert.ok(game.enemies.every((e) => Math.abs(e.x) < game.bounds.x));
});

function civilianScene() {
  const game = playing();
  game.enemies = [];
  game.phase = "intermission";
  game.elapsed = -100;
  game.spawnCivilian();
  const civilian = game.civilians[0];
  civilian.origin = 0;
  civilian.x = 0;
  civilian.y = 0;
  return { game, civilian };
}

test("civilian encounters are rarer and restart resets rescues", () => {
  const game = new ShooterGame(
    () => {},
    () => 0,
  );
  assert.ok(game.civilianCooldown >= 30);
  game.spawnCivilian();
  assert.ok(game.civilianCooldown >= 45);
  game.rescues = 3;
  game.reset();
  assert.equal(game.rescues, 0);
});

test("five distinct hits send a civilian falling and never award a rescue", () => {
  const { game, civilian } = civilianScene();
  const events = [];
  game.onEvent = (event) => events.push(event);
  for (let hit = 1; hit <= 5; hit++) {
    civilian.hitCooldown = 0;
    game.hitCivilian(civilian);
    assert.equal(civilian.hp, 5 - hit);
    assert.equal(game.civilians.includes(civilian), hit < 5);
    game.hitCivilian(civilian);
    assert.equal(game.score, -1000 * hit, "a burst counts as one hit");
  }
  civilian.y = -18;
  game.update(0.01);
  assert.equal(game.rescues, 0);
  assert.equal(game.fallingCivilians.length, 1);
  assert.equal(
    events.filter((event) => event.type === "civilianKilled").length,
    1,
  );
  assert.equal(
    events.some((event) => event.type === "civilianRescued"),
    false,
  );
});

test("civilian falls into the distance before one delayed impact, pauses and clears on replay", () => {
  const { game, civilian } = civilianScene();
  const events = [];
  game.onEvent = (event) => events.push(event);
  for (let hit = 0; hit < 5; hit++) {
    civilian.hitCooldown = 0;
    game.hitCivilian(civilian);
  }
  assert.equal(
    events.some((event) => event.type === "civilianCrash"),
    false,
  );
  advance(game, 2);
  const falling = game.fallingCivilians[0];
  assert.ok(falling.fallAge >= 2);
  assert.ok(falling.y < 0);
  game.paused = true;
  const age = falling.fallAge;
  advance(game, 1);
  assert.equal(falling.fallAge, age);
  game.paused = false;
  advance(game, 2.2);
  assert.equal(game.fallingCivilians.length, 0);
  assert.equal(
    events.filter((event) => event.type === "civilianCrash").length,
    1,
  );
  assert.equal(game.rescues, 0);
  assert.equal(game.score, -5000);
  advance(game, 1);
  assert.equal(
    events.filter((event) => event.type === "civilianCrash").length,
    1,
  );
  game.reset();
  assert.equal(game.fallingCivilians.length, 0);
});

test("each surviving civilian awards 10000 once, including wounded survivors", () => {
  const { game, civilian } = civilianScene();
  const events = [];
  game.onEvent = (event) => events.push(event);
  civilian.y = -18;
  game.paused = true;
  game.update(0.01);
  assert.equal(game.score, 0);
  game.paused = false;
  game.update(0.01);
  assert.equal(game.score, 10000);
  assert.equal(game.rescues, 1);
  game.update(0.01);
  assert.equal(game.score, 10000);
  game.spawnCivilian();
  const wounded = game.civilians[0];
  wounded.y = 0;
  for (let hit = 0; hit < 3; hit++) {
    wounded.hitCooldown = 0;
    game.hitCivilian(wounded);
  }
  wounded.y = -18;
  game.update(0.01);
  assert.equal(game.rescues, 2);
  assert.equal(game.score, 17000);
  assert.deepEqual(
    events
      .filter((event) => event.type === "civilianRescued")
      .map((event) => event.points),
    [10000, 10000],
  );
});

test("civilian ships float separately from waves, do not damage the player, and stay bounded", () => {
  const { game, civilian } = civilianScene();
  const count = game.waveSize;
  game.player.y = 0;
  advance(game, 0.2);
  assert.ok(civilian.y < 0);
  assert.equal(game.lives, 3);
  assert.equal(game.waveSize, count);
  game.spawnCivilian();
  assert.equal(game.civilians.length, 1);
  civilian.y = -18;
  game.update(0.01);
  assert.equal(game.civilians.length, 0);
  game.civilianCooldown = 0;
  game.update(0.01);
  assert.equal(game.civilians.length, 1);
});

test("civilian hits deduct 1000 points, allow negative scores, and leave weapons operational", () => {
  const { game, civilian } = civilianScene();
  const events = [];
  game.onEvent = (event) => events.push(event);
  game.score = 400;
  game.bullets.push({
    id: ++game.serial,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 1,
    friendly: true,
  });
  game.update(0.01);
  assert.equal(civilian.hit, true);
  assert.equal(game.score, -600);
  assert.equal(game.kills, 0);
  assert.equal(game.lives, 3);
  assert.equal(
    events.find((event) => event.type === "civilianHit").penalty,
    1000,
  );
  civilian.y = 10;
  for (const weapon of ["machine", "laser"]) {
    game.collectPowerup(weapon);
    game.collectPowerup("missile");
    game.update(0.01);
    game.update(0.01, { fire: true, right: true, missile: true });
    if (weapon === "machine")
      assert.ok(game.bullets.some((bullet) => bullet.friendly));
    else assert.equal(game.lasers.length, 2);
    assert.ok(game.bullets.some((bullet) => bullet.kind === "missile"));
  }
  assert.ok(game.player.x > 0);
  game.reset();
  assert.equal(game.score, 0);
});

test("lasers charge one impact penalty, stop at civilians, and keep firing", () => {
  const { game, civilian } = civilianScene();
  game.startWave();
  const enemy = game.enemies[0];
  enemy.age = 4;
  enemy.origin = -Math.sin(4 * 1.15 + enemy.pattern * 0.4) * game.bounds.x * 0.06;
  const hp = enemy.hp;
  game.collectPowerup("laser");
  game.update(0.01, { fire: true });
  assert.equal(civilian.hit, true);
  assert.equal(game.score, -1000);
  assert.equal(game.lasers.length, 2);
  assert.ok(game.lasers.every((beam) => beam.top <= civilian.y));
  assert.equal(enemy.hp, hp);
  game.update(0.01, { fire: true });
  assert.equal(
    game.score,
    -1000,
    "continuous laser frames are one impact, not separate penalties",
  );
  assert.equal(game.lasers.length, 2);
});

for (const source of ["hero", "fleet"]) {
  test(`${source} missiles pass through civilians and still hit enemies`, () => {
    const { game, civilian } = civilianScene();
    const events = [];
    game.onEvent = (event) => events.push(event);
    if (source === "hero") {
      game.player.x = 0;
      game.player.y = -0.8;
      game.collectPowerup("missile");
      game.update(0.01, { missile: true });
    } else {
      game.fireSupportMissile(
        { x: 0, y: -0.8, missileCooldown: 0 }, "fleet", 10, 1.2, 0.01,
      );
    }
    const missile = game.bullets.find((bullet) => bullet.kind === "missile");
    assert.ok(missile, "missile survives launch beside a civilian");
    missile.x = civilian.x;
    missile.y = civilian.y;
    missile.vx = missile.vy = 0;
    game.update(0.01);
    assert.ok(game.bullets.includes(missile), "civilian contact does not detonate missiles");
    assert.equal(civilian.hp, 5);
    assert.equal(game.score, 0);

    game.groundEnemies = [{
      id: ++game.serial, kind: "turret", x: 0, y: 0, side: 0,
      hp: 3, age: 1, fireCooldown: 100,
    }];
    missile.x = 0;
    missile.y = 0;
    missile.vx = missile.vy = 0;
    game.update(0.01);
    assert.equal(game.groundEnemies.length, 0, "missile still destroys enemies");
    assert.equal(civilian.hp, 5, "nearby civilian survives missile splash");
    assert.equal(events.some((event) => event.type === "civilianHit"), false);
    assert.ok(events.some((event) => event.type === "missileExplosion"));
  });

  test(`${source} missile explosions never damage civilians or deduct points`, () => {
    const { game, civilian } = civilianScene();
    for (let i = 0; i < 6; i++) {
      civilian.hitCooldown = 0;
      game.detonateMissile({ x: 3, y: civilian.y, support: source === "fleet" ? source : undefined });
    }
    assert.equal(civilian.hp, 5);
    assert.equal(game.score, 0);
    assert.ok(game.civilians.includes(civilian));
  });
}

test("ground encounters aim at the player, scroll with scenery and freeze on pause", () => {
  const game = playing();
  game.groundCooldown = 0;
  game.update(0.05);
  const turret = game.groundEnemies[0];
  assert.equal(turret.kind, "turret");
  turret.y = 8;
  turret.fireCooldown = 0;
  game.enemies = [];
  game.player.x = -4;
  game.update(0.05);
  const shot = game.bullets.find((bullet) => bullet.ground);
  assert.ok(shot);
  assert.ok(shot.vx * (game.player.x - turret.x) > 0);
  assert.ok(shot.vy * (game.player.y - turret.y) > 0);
  assert.ok(turret.y < 8);
  game.paused = true;
  const before = JSON.stringify(game.groundEnemies);
  advance(game, 2);
  assert.equal(JSON.stringify(game.groundEnemies), before);
});

test("turrets take gun and laser damage without contributing to wave kills", () => {
  for (const weapon of ["guns", "laser"]) {
    const game = playing();
    game.enemies = [];
    game.spawnGroundEnemy("turret");
    const turret = game.groundEnemies[0];
    turret.y = 0;
    game.updateGroundEnemies(0);
    game.player.x = turret.x - 0.48;
    turret.hp = 1;
    if (weapon === "laser") game.collectPowerup("laser");
    else
      game.bullets.push({
        id: 999,
        friendly: true,
        x: turret.x,
        y: -0.1,
        vx: 0,
        vy: 0,
        life: 1,
      });
    advance(game, 0.1, { fire: weapon === "laser" });
    assert.equal(game.groundEnemies.length, 0);
    assert.equal(game.waveKills, 0);
    assert.ok(game.pickups.some((pickup) => pickup.value === 1));
  }
});

test("tanks move on the ground and die to missile splash", () => {
  const game = playing();
  game.enemies = [];
  game.spawnGroundEnemy("tank");
  const tank = game.groundEnemies[0];
  tank.y = 0;
  const initialX = tank.x;
  advance(game, 0.3);
  assert.notEqual(tank.x, initialX);
  game.detonateMissile({ x: tank.x, y: tank.y, life: 1 });
  assert.equal(game.groundEnemies.length, 0);
});

for (const weapon of [
  "guns",
  "machine",
  "laser",
  "mega",
  "missile",
  "wingmen",
  "spread",
  "scatter",
  "orbit",
  "fragment",
]) {
  test(`${weapon} destroys tanks and awards one ground reward`, () => {
    const events = [];
    const game = new ShooterGame(
      (event) => events.push(event),
      () => 0.5,
    );
    game.phase = "intermission";
    game.elapsed = -100;
    game.supplyCooldown = game.civilianCooldown = game.groundCooldown = 100;
    game.scenerySpeed = 0;
    game.sceneryWidth = 12;
    game.spawnGroundEnemy("tank");
    const tank = game.groundEnemies[0];
    tank.y = 0;
    game.updateGroundEnemies(0);
    game.player.x = tank.x - (["wingmen", "spread"].includes(weapon) ? 1.7 : 0);
    game.player.y = -1.2;
    if (!["guns", "fragment"].includes(weapon)) game.collectPowerup(weapon);
    if (weapon === "orbit") game.player.y = -0.5;
    if (weapon === "fragment")
      game.bullets.push({
        id: ++game.serial,
        friendly: true,
        kind: "fragment",
        x: tank.x,
        y: tank.y,
        vx: 0,
        vy: 0,
        life: 1,
      });
    advance(game, 0.4, { fire: true });
    assert.equal(game.groundEnemies.length, 0);
    assert.equal(game.waveKills, 0);
    assert.equal(
      game.pickups.reduce((total, pickup) => total + pickup.value, 0) +
        game.score,
      3,
    );
    assert.equal(
      events.filter((event) => event.type === "groundExplosion").length,
      1,
    );
  });
}

test("missiles acquire ground targets and ground encounters are bounded and reset", () => {
  const game = playing();
  game.enemies = [];
  game.phase = "intermission";
  game.spawnGroundEnemy("tank");
  const tank = game.groundEnemies[0];
  tank.y = 4;
  game.updateGroundEnemies(0);
  game.bullets.push({
    id: 999,
    kind: "missile",
    friendly: true,
    x: tank.x,
    y: 3.5,
    vx: 0,
    vy: 0,
    life: Infinity,
  });
  game.update(0.01);
  assert.equal(game.groundEnemies.length, 0);
  for (let i = 0; i < 10; i++) game.spawnGroundEnemy("turret");
  assert.ok(game.groundEnemies.length <= 3);
  game.groundEnemies.forEach((enemy) => {
    enemy.y = -19;
  });
  game.update(0.01);
  assert.equal(game.groundEnemies.length, 0);
  game.reset();
  assert.equal(game.groundEnemies.length, 0);
});

test("viewport bounds let keyboard and pointer movement reach every visible edge and survive replay", () => {
  const game = playing();
  game.setPlayfield(60, 32);
  game.enemies = [];
  game.groundCooldown = Infinity;
  game.phase = "intermission";
  game.elapsed = -100;
  advance(game, 4, { right: true, up: true });
  assert.ok(game.player.x > 28 && game.player.x < 30);
  assert.ok(game.player.y > 14 && game.player.y < 16);
  advance(game, 4, { target: { x: -30, y: -16 } });
  assert.ok(game.player.x < -28 && game.player.y < -14);
  game.reset();
  assert.equal(game.bounds.x, 28.9);
  game.setPlayfield(24, 52);
  game.phase = "intermission";
  game.elapsed = -100;
  game.enemies = [];
  game.groundCooldown = Infinity;
  advance(game, 3, { up: true });
  assert.ok(game.player.y > 24);
  game.collectPowerup("laser");
  game.update(0.01, { fire: true });
  assert.ok(game.lasers.every((beam) => beam.top > beam.y));
});

test("homing missiles reach canyon tanks outside the old central flight area", () => {
  const game = playing();
  game.setPlayfield(60, 32);
  game.enemies = [];
  game.phase = "intermission";
  game.elapsed = -100;
  game.groundCooldown = Infinity;
  game.spawnGroundEnemy("tank");
  game.groundEnemies[0].y = 12;
  game.updateGroundEnemies(0);
  assert.ok(Math.abs(game.groundEnemies[0].x) > 11);
  game.bullets.push({
    id: 999,
    kind: "missile",
    friendly: true,
    x: 0,
    y: -5,
    vx: 0,
    vy: 18,
    life: Infinity,
  });
  advance(game, 2);
  assert.equal(game.groundEnemies.length, 0);
});

test("fatal damage removes external hero weapons before the death spiral", () => {
  const game = playing();
  game.orbitTime = 10;
  game.orbitCount = 3;
  game.companionTime = 10;
  game.shieldTime = 10;
  game.missileCount = 4;
  game.updateAddons(0, false);
  assert.equal(game.orbs.length, 3);
  assert.equal(game.companions.length, 2);

  game.lives = 2;
  game.damagePlayer(true);
  assert.equal(game.orbs.length, 3, "surviving a hit keeps the orbs");
  assert.equal(game.companions.length, 2);
  game.player.invulnerable = 0;
  game.damagePlayer(true);
  assert.equal(game.phase, "dying");
  assert.deepEqual(game.orbs, []);
  assert.deepEqual(game.companions, []);
  assert.equal(game.orbitTime, 0);
  assert.equal(game.orbitCount, 0);
  assert.equal(game.companionTime, 0);
  assert.equal(game.shieldTime, 0);
  assert.equal(game.missileCount, 0);
  advance(game, 2.5, { fire: true });
  assert.deepEqual(game.orbs, []);
  assert.deepEqual(game.companions, []);
});

test("hero falls to the canyon floor, crashes once, then ends the game", () => {
  const events = [];
  const game = playing();
  game.onEvent = (event) => events.push(event);
  game.lives = 1;
  game.damagePlayer();
  assert.equal(game.phase, "dying");
  assert.equal(events.at(-1).type, "playerFalling");
  const score = game.score;
  advance(game, 0.6, { fire: true, x: 1, y: 1 });
  assert.equal(game.player.x, 0);
  assert.equal(game.player.y, 0);
  assert.ok(game.player.z < 1);
  assert.equal(game.score, score);
  assert.equal(
    events.some((event) => event.type === "gameover"),
    false,
  );
  game.paused = true;
  const frozen = game.player.y;
  advance(game, 1);
  assert.equal(game.player.y, frozen);
  game.paused = false;
  advance(game, 1.9);
  assert.equal(game.phase, "crashed");
  assert.equal(game.player.z, -24);
  assert.equal(
    events.filter((event) => event.type === "playerCrash").length,
    1,
  );
  assert.ok(events.find((event) => event.type === "playerCrash").size >= 5);
  advance(game, 0.9);
  assert.equal(game.phase, "gameover");
  assert.equal(events.filter((event) => event.type === "gameover").length, 1);
  advance(game, 2);
  game.damagePlayer();
  assert.equal(game.lives, 0);
  assert.equal(
    events.filter((event) => event.type === "playerCrash").length,
    1,
  );
  game.reset();
  assert.equal(game.player.z, 1);
  assert.equal(game.phase, "countdown");
});

test("scenery eases to a stop during hero fall and stays still through impact", () => {
  const game = playing();
  game.scenerySpeed = 3.6;
  game.lives = 1;
  game.damagePlayer();
  const beforeFall = game.groundTravel;
  game.update(0.05);
  assert.equal(game.sceneryStopped, true);
  const firstStep = game.groundTravel - beforeFall;
  assert.ok(firstStep > 0 && firstStep < 0.18);
  const firstSpeed = game.sceneryMotion;
  assert.ok(firstSpeed > 0 && firstSpeed < 1);
  const beforeSecond = game.groundTravel;
  game.update(0.05);
  assert.ok(game.groundTravel - beforeSecond < firstStep);
  assert.ok(game.sceneryMotion < firstSpeed);
  game.paused = true;
  const pausedTravel = game.groundTravel;
  game.update(0.05);
  assert.equal(game.groundTravel, pausedTravel);
  game.paused = false;
  advance(game, 1.2);
  assert.equal(game.sceneryMotion, 0);
  const stoppedBeforeImpact = game.groundTravel;
  advance(game, 1.2);
  assert.equal(game.groundTravel, stoppedBeforeImpact);
  assert.equal(game.phase, "crashed");
  const beforeImpact = game.groundTravel;
  game.update(0.05);
  assert.equal(game.groundTravel, beforeImpact);
  advance(game, 1);
  assert.equal(game.phase, "gameover");
  const stoppedTravel = game.groundTravel;
  game.update(0.05);
  assert.equal(game.groundTravel, stoppedTravel);
});

test("death clears enemy fire and lets only visible existing enemies leave without spawning", () => {
  const events = [];
  const game = playing();
  game.onEvent = (event) => events.push(event);
  game.player.x = 8;
  game.player.y = -10;
  game.enemies = [
    { id: 100, age: 1, x: 3, y: 5, fireAt: 0 },
    { id: 101, age: -1, x: 2, y: 19, fireAt: 0 },
  ];
  game.capitalShips = [{ id: 102, x: 0, y: 0 }];
  game.groundEnemies = [{ id: 103, x: 1, y: 0 }];
  game.bullets = [{ friendly: false, x: 0, y: 0 }];
  game.gateLasers = [{ y: 5 }];
  game.lives = 1;
  game.damagePlayer();
  const serial = game.serial;
  const wave = game.wave;
  game.civilianCooldown = game.capitalCooldown = game.groundCooldown = 0;
  advance(game, 0.5, { fire: true });
  assert.equal(game.player.x, 0);
  assert.equal(game.player.y, 0);
  assert.equal(game.enemies.length, 1);
  assert.ok(game.enemies[0].y < 5);
  assert.ok(game.capitalShips[0].y < 0);
  assert.ok(game.groundEnemies[0].y < 0);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.gateLasers.length, 0);
  assert.equal(game.serial, serial);
  assert.equal(game.wave, wave);
  advance(game, 2.8, { fire: true });
  assert.equal(game.enemies.length, 0);
  assert.equal(game.capitalShips.length, 0);
  assert.equal(game.groundEnemies.length, 0);
  assert.equal(game.serial, serial);
  assert.equal(
    events.some((event) =>
      ["enemyShot", "groundShot", "capitalShot", "shot"].includes(event.type),
    ),
    false,
  );
  const crash = events.find((event) => event.type === "playerCrash");
  assert.equal(crash.x, 0);
  assert.equal(crash.y, 0);
  game.reset();
  assert.equal(game.sceneryStopped, false);
});

test("missile pickups store at most ten rounds without expiring or firing with guns", () => {
  const game = playing();
  game.phase = "intermission";
  game.elapsed = -100;
  game.enemies = [];
  game.supplyCooldown = Infinity;
  game.groundCooldown = Infinity;
  for (let i = 0; i < 12; i++) game.collectPowerup("missile");
  assert.equal(game.missileCount, 10);
  advance(game, 15, { fire: true });
  assert.equal(game.missileCount, 10);
  assert.equal(
    game.bullets.some((bullet) => bullet.kind === "missile"),
    false,
  );
});

test("each missile press spends one round, holding does not repeat, and empty presses do nothing", () => {
  const game = playing();
  game.missileCount = 2;
  advanceSimulation(game, 0.1, { missile: true });
  assert.equal(game.missileCount, 1);
  assert.equal(
    game.bullets.filter((bullet) => bullet.kind === "missile").length,
    1,
  );
  game.update(0.01);
  game.update(0.01, { missile: true });
  assert.equal(game.missileCount, 0);
  game.update(0.01);
  game.update(0.01, { missile: true });
  assert.equal(
    game.bullets.filter((bullet) => bullet.kind === "missile").length,
    2,
  );
});
