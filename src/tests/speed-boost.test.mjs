import { test } from "node:test";
import assert from "node:assert/strict";
import { ShooterGame } from "../assets/js/ShooterGame.js";
import { POWERUPS, supplyPower } from "../assets/js/Powerups.js";
import { POWER_ICONS } from "../assets/js/BlockIcons.js";

function arena() {
  const game = new ShooterGame(
    () => {},
    () => 0.5,
  );
  game.phase = "intermission";
  game.elapsed = -100;
  game.supplyCooldown =
    game.civilianCooldown =
    game.groundCooldown =
    game.gateCooldown =
      Infinity;
  game.player.y = 0;
  return game;
}

test("speed ramps terrain travel up and down and keeps ground installations attached", () => {
  const game = arena();
  const normal = arena();
  game.collectPowerup("speed");
  const installation = {
    id: 999,
    kind: "gate",
    age: 0,
    y: 10,
    side: 1,
    hp: 10,
  };
  game.groundEnemies.push(installation);
  for (let i = 0; i < 20; i++) game.update(0.05);
  const surface = installation.y + game.groundTravel;
  const start = game.groundTravel;
  game.update(0.01);
  normal.update(0.01);
  assert.ok(
    Math.abs(game.groundTravel - start - normal.groundTravel * 2.35) < 1e-9,
  );
  assert.ok(Math.abs(installation.y + game.groundTravel - surface) < 1e-9);
  game.speedTime = 0;
  for (let i = 0; i < 20; i++) game.update(0.05);
  const before = game.groundTravel;
  game.update(0.01);
  assert.ok(Math.abs(game.groundTravel - before - normal.groundTravel) < 1e-9);
});

test("speed is a collectible supply with an icon and a 15-second duration", () => {
  assert.equal(POWERUPS.speed?.duration, 15);
  assert.ok(POWER_ICONS.speed?.some((row) => row.includes("X")));
  assert.ok(
    Array.from({ length: 1000 }, (_, i) => supplyPower(i / 1000)).includes(
      "speed",
    ),
  );
  const game = arena();
  game.pickups.push({
    id: ++game.serial,
    kind: "powerup",
    power: "speed",
    x: 0,
    y: 0,
    age: 0,
  });
  game.update(0.01);
  assert.equal(game.pickups.length, 0);
  assert.equal(game.speedTime, 15);
});

test("speed increases keyboard movement and banking response, including direction changes", () => {
  const normal = arena();
  const boosted = arena();
  boosted.collectPowerup("speed");
  for (let i = 0; i < 20; i++) boosted.update(0.05);
  normal.update(0.01, { right: true });
  boosted.update(0.01, { right: true });
  assert.ok(boosted.player.x > normal.player.x * 1.6);
  assert.ok(Math.abs(boosted.player.bank) > Math.abs(normal.player.bank));
  const before = boosted.player.x;
  boosted.update(0.01, { left: true });
  assert.ok(before - boosted.player.x > normal.player.x * 1.6);
});

test("speed improves pointer tracking and keeps movement inside the playfield", () => {
  const normal = arena();
  const boosted = arena();
  boosted.collectPowerup("speed");
  for (let i = 0; i < 20; i++) boosted.update(0.05);
  const input = { target: { x: 100, y: 100 } };
  normal.update(0.01, input);
  boosted.update(0.01, input);
  assert.ok(boosted.player.x > normal.player.x * 1.6);
  assert.ok(boosted.player.y > normal.player.y * 1.6);
  for (let i = 0; i < 100; i++) boosted.update(0.05, input);
  assert.equal(boosted.player.x, boosted.bounds.x);
  assert.equal(boosted.player.y, boosted.bounds.top);
});

test("speed lasts 15 active seconds, freezes on pause, refreshes and expires without stacking", () => {
  const game = arena();
  game.collectPowerup("speed");
  game.paused = true;
  for (let i = 0; i < 100; i++) game.update(0.05);
  assert.equal(game.speedTime, 15);
  game.paused = false;
  for (let i = 0; i < 100; i++) game.update(0.05);
  assert.ok(Math.abs(game.speedTime - 10) < 1e-9);
  game.collectPowerup("speed");
  assert.equal(game.speedTime, 15);
  const baseline = arena();
  baseline.collectPowerup("speed");
  for (let i = 0; i < 20; i++) baseline.update(0.05);
  game.update(0.01, { right: true });
  baseline.update(0.01, { right: true });
  assert.equal(game.player.x, baseline.player.x);
  for (let i = 0; i < 299; i++) game.update(0.05);
  assert.ok(game.speedTime > 0);
  game.update(0.05);
  assert.equal(game.speedTime, 0);
  for (let i = 0; i < 20; i++) game.update(0.05);
  game.player.x = 0;
  game.update(0.01, { right: true });
  assert.equal(game.player.x, 0.16);
  game.collectPowerup("speed");
  game.reset();
  assert.equal(game.speedTime, 0);
});

test("speed acceleration and deceleration are gradual and pause freezes their progress", () => {
  const game = arena();
  const base = game.sceneryVelocity;
  game.collectPowerup("speed");
  assert.equal(game.sceneryVelocity, base);
  game.update(0.05);
  const first = game.sceneryVelocity;
  assert.ok(first > base && first < base * 1.1);
  for (let i = 0; i < 20; i++) game.update(0.05);
  const top = game.sceneryVelocity;
  assert.ok(top > base * 2);
  game.speedTime = 0;
  game.update(0.05);
  assert.ok(game.sceneryVelocity < top && game.sceneryVelocity > base * 2);
  game.paused = true;
  const paused = game.sceneryVelocity;
  game.update(0.05);
  assert.equal(game.sceneryVelocity, paused);
});
