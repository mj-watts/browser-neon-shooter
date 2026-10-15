import { test } from "node:test";
import assert from "node:assert/strict";
import { ShooterGame } from "../assets/js/ShooterGame.js";
import { POWERUPS } from "../assets/js/Powerups.js";
import { POWER_ICONS } from "../assets/js/BlockIcons.js";

function arena() {
  const game = new ShooterGame(
    () => {},
    () => 0.5,
  );
  game.phase = "intermission";
  game.elapsed = -100;
  game.supplyCooldown = game.civilianCooldown = game.groundCooldown = 100;
  return game;
}

test("orbital guard destroys ships touching the craft and intercepts shots until it expires", () => {
  const game = arena();
  game.player.y = 0;
  game.collectPowerup("orbit");
  game.enemies = [
    {
      id: ++game.serial,
      kind: 2,
      heavy: true,
      hp: 99,
      age: 5,
      origin: -Math.sin(5.01 * 1.15) * game.bounds.x * 0.06,
      pattern: 0,
      fireAt: 100,
    },
  ];
  game.bullets.push({
    id: ++game.serial,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 2,
    friendly: false,
  });
  game.update(0.01);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.lives, 3);
  assert.equal(game.kills, 1);
  game.orbitTime = 0.001;
  game.bullets.push({
    id: ++game.serial,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 2,
    friendly: false,
  });
  game.update(0.01);
  assert.equal(game.lives, 2);
});

test("rotating orbs complete more than one turn per second", () => {
  const game = arena();
  game.collectPowerup("orbit");
  game.update(0.05);
  const angle = Math.atan2(
    game.orbs[0].y - game.player.y,
    game.orbs[0].x - game.player.x,
  );
  assert.ok(angle / game.clock > Math.PI * 2);
});

test("every upgrade has an icon and can be collected through a supply package", () => {
  for (const [power, config] of Object.entries(POWERUPS)) {
    assert.ok(POWER_ICONS[power]?.some((row) => row.includes("X")));
    const game = arena();
    const events = [];
    game.onEvent = (event) => events.push(event);
    game.pickups.push({
      id: ++game.serial,
      kind: "powerup",
      power,
      x: game.player.x,
      y: game.player.y,
      age: 0,
    });
    game.update(0.01);
    assert.equal(game.pickups.length, 0);
    assert.ok(
      events.some((event) => event.type === "powerup" && event.power === power),
    );
    assert.equal(game.score, 0);
    if (power === "missile") assert.equal(game.missileCount, 4);
    else assert.ok(config.duration > 0);
  }
});

test("the narrowed mega laser still damages targets beyond a narrow beam", () => {
  const game = arena();
  game.collectPowerup("mega");
  game.enemies = [
    {
      id: ++game.serial,
      kind: 0,
      age: 2,
      origin: 1 - Math.sin(2.01 * 1.15) * game.bounds.x * 0.06,
      pattern: 0,
      hp: 10,
      fireAt: 100,
    },
  ];
  game.update(0.01, { fire: true });
  assert.ok(
    game.enemies[0].hp < 10,
    "the wide beam hits an enemy a unit off centre",
  );
});

test("orbit pickups stack to three, refresh ten seconds, pause and expire", () => {
  const game = arena();
  for (let i = 0; i < 4; i++) game.collectPowerup("orbit");
  assert.equal(game.orbitCount, 3);
  assert.equal(game.orbitTime, 10);
  game.update(0.01);
  assert.equal(game.orbs.length, 3);
  assert.ok(
    Math.hypot(game.orbs[0].x - game.player.x, game.orbs[0].y - game.player.y) >
      1,
  );
  const position = { ...game.orbs[0] };
  game.paused = true;
  game.update(0.1);
  assert.deepEqual(game.orbs[0], position);
  game.paused = false;
  game.update(0.1);
  assert.notEqual(game.orbs[0].x, position.x);
  game.orbitTime = 0.01;
  game.update(0.02);
  assert.equal(game.orbitCount, 0);
  assert.equal(game.orbs.length, 0);
});

test("orbitals destroy armour and hostile shots on contact and respect civilian health", () => {
  const game = arena();
  game.collectPowerup("orbit");
  game.update(0.01);
  const orb = game.orbs[0];
  const target = { id: 100, kind: "tank", ...orb, hp: 99, age: 0 };
  game.groundEnemies = [target];
  game.bullets.push({
    id: 101,
    ...orb,
    friendly: false,
    vx: 0,
    vy: 0,
    life: 1,
  });
  game.spawnCivilian();
  const civilian = game.civilians[0];
  civilian.origin = civilian.x = orb.x;
  civilian.y = orb.y;
  game.hitOrbitals();
  assert.equal(game.groundEnemies.length, 0);
  assert.ok(game.bullets.every((bullet) => bullet.life <= 0));
  assert.equal(civilian.hp, 4);
});

test("flanking orbs follow the player and shoot two or six shots at exact spread angles", () => {
  for (const [power, count] of [
    ["wingmen", 2],
    ["spread", 6],
  ]) {
    const game = arena();
    game.collectPowerup(power);
    game.update(0.01, { right: true });
    assert.equal(game.companions.length, 2);
    assert.ok(game.companions[0].x < game.player.x);
    assert.ok(game.companions[1].x > game.player.x);
    assert.equal(game.bullets.length, 0);
    game.update(0.01, { fire: true });
    const shots = game.bullets.filter((bullet) => bullet.kind === "companion");
    assert.equal(shots.length, count);
    const angles = shots
      .slice(0, count / 2)
      .map((shot) =>
        Math.round((Math.atan2(shot.vx, shot.vy) * 180) / Math.PI),
      );
    assert.deepEqual(angles, power === "spread" ? [-2, 0, 2] : [0]);
    game.companionTime = 0.01;
    game.update(0.02);
    assert.equal(game.companions.length, 0);
  }
});

test("mega laser is a single strongest purple beam at half its original width", () => {
  const game = arena();
  game.collectPowerup("mega");
  game.update(0.01, { fire: true });
  assert.equal(game.lasers.length, 1);
  assert.equal(game.lasers[0].color, "purple");
  assert.equal(game.lasers[0].strength, 3);
  assert.equal(game.lasers[0].width, 1.2);
  assert.ok(game.lasers[0].damage > 18);
  game.update(0.01);
  assert.equal(game.lasers.length, 0);
});

test("scatter bombs burst into bounded fragments, destroy tanks and leave unspawned enemies alone", () => {
  const game = arena();
  game.collectPowerup("scatter");
  game.update(0.01, { fire: true });
  const bombs = game.bullets.filter((bullet) => bullet.kind === "bomb");
  assert.equal(bombs.length, 5);
  const bomb = bombs[2];
  game.groundEnemies = [
    { id: 1000, kind: "tank", x: bomb.x, y: bomb.y, hp: 30, age: 0 },
  ];
  game.enemies = [{ id: 1001, x: bomb.x, y: bomb.y, age: -1, hp: 1 }];
  game.detonateBomb(bomb);
  assert.equal(game.groundEnemies.length, 0);
  assert.equal(game.enemies.length, 1);
  assert.equal(
    game.bullets.filter((bullet) => bullet.kind === "shrapnel").length,
    8,
  );
  const before = game.bullets.length;
  game.detonateBomb(bomb);
  assert.equal(game.bullets.length, before, "a bomb cannot explode twice");
  game.scatterTime = 0;
  for (let i = 0; i < 180; i++) game.update(1 / 60);
  assert.equal(game.bullets.length, 0);
});

test("all new add-ons reset on replay and remain bounded during sustained firing", () => {
  const game = arena();
  for (const power of ["orbit", "spread", "scatter", "mega"])
    game.collectPowerup(power);
  game.paused = true;
  game.update(0.1, { fire: true });
  assert.equal(game.orbitTime, 10);
  assert.equal(game.companionTime, 12);
  assert.equal(game.scatterTime, 12);
  game.paused = false;
  for (let i = 0; i < 600; i++) game.update(1 / 60, { fire: true });
  assert.ok(game.bullets.length < 200);
  game.reset();
  assert.equal(game.orbitTime, 0);
  assert.equal(game.orbitCount, 0);
  assert.equal(game.companionTime, 0);
  assert.equal(game.scatterTime, 0);
  assert.equal(game.orbs.length, 0);
  assert.equal(game.companions.length, 0);
});
