import { test } from "node:test";
import assert from "node:assert/strict";
import { ShooterGame } from "../assets/js/ShooterGame.js";
import { POWERUPS, supplyPower } from "../assets/js/Powerups.js";
import { canyonWall } from "../assets/js/CanyonTerrain.js";

function arena() {
  const game = new ShooterGame(() => {}, () => 0.5);
  game.phase = "intermission";
  game.elapsed = -100;
  game.supplyCooldown = game.civilianCooldown = game.groundCooldown = 100;
  return game;
}

test("assault fleet is a separate supply with three vehicles on each side", () => {
  const game = arena();
  assert.equal(POWERUPS.assault.duration, 20);
  assert.equal(supplyPower(0.999), "assault");
  game.collectPowerup("fleet");
  game.collectPowerup("assault");
  assert.equal(game.fleet.length, 4);
  assert.equal(game.assaultFleet.length, 6);
  assert.equal(game.assaultFleet.filter((ship) => ship.x < 0).length, 3);
  assert.equal(game.assaultFleet.filter((ship) => ship.x > 0).length, 3);
  assert.ok(game.assaultFleet.every((ship) => ship.y < game.bounds.bottom));
  const positions = game.assaultFleet.map((ship) => ({ ...ship }));
  for (let i = 0; i < 200; i++) game.update(0.05);
  for (const [index, ship] of game.assaultFleet.entries()) {
    assert.ok(ship.y > positions[index].y);
    const boundary = 0.79 + canyonWall(ship.y + game.groundTravel * 1.08, ship.side * 0.7 + 4);
    assert.ok(Math.abs(ship.x) / 12 > boundary);
    assert.ok(ship.y < game.bounds.top);
  }
  assert.ok(game.bullets.some((shot) => shot.kind === "assault"));
  assert.ok(game.bullets.length < 100);
});

test("sand carts follow the top canyon ledges in three staggered rows per side", () => {
  const game = arena();
  game.collectPowerup("assault");
  for (const side of [-1, 1]) {
    const carts = game.assaultFleet.filter((cart) => cart.side === side);
    assert.equal(carts.length, 3);
    assert.equal(new Set(carts.map((cart) => cart.y)).size, 3);
  }
  game.update(0.05);
  for (const cart of game.assaultFleet) {
    const boundary = 0.79 + canyonWall(cart.y + game.groundTravel * 1.08, cart.side * 0.7 + 4);
    assert.ok(Math.abs(cart.x) > boundary * 12);
    assert.ok(Math.abs(cart.x) < 12);
  }
});

test("carts aim inward at enemy ships from both canyon ledges", () => {
  const game = arena();
  game.collectPowerup("assault");
  game.enemies = [{ id: 999, x: 0, y: 5, age: 1, hp: 10 }];
  game.updateAssaultFleet(0.01);
  for (const side of [-1, 1]) {
    const shots = game.bullets.filter((shot) => Math.sign(shot.x) === side);
    assert.equal(shots.length, 3);
    assert.ok(shots.every((shot) => Math.sign(shot.vx) === -side && shot.vy > 0));
  }
});

test("assault fleet freezes on pause, expires at twenty seconds and resets", () => {
  const game = arena();
  game.collectPowerup("assault");
  const positions = structuredClone(game.assaultFleet);
  game.paused = true;
  game.update(0.05);
  assert.equal(game.assaultTime, 20);
  assert.deepEqual(game.assaultFleet, positions);
  game.paused = false;
  for (let i = 0; i < 399; i++) game.update(0.05);
  assert.ok(game.assaultTime > 0);
  assert.equal(game.assaultFleet.length, 6);
  game.update(0.05);
  assert.equal(game.assaultTime, 0);
  assert.deepEqual(game.assaultFleet, []);
  game.collectPowerup("assault");
  game.update(0.05);
  game.collectPowerup("assault");
  assert.equal(game.assaultTime, 20);
  assert.equal(game.assaultFleet.length, 6);
  game.reset();
  assert.equal(game.assaultTime, 0);
  assert.deepEqual(game.assaultFleet, []);
});

test("assault bullets damage enemy ships through gameplay collisions", () => {
  const game = arena();
  game.collectPowerup("assault");
  for (let i = 0; i < 40; i++) game.update(0.05);
  const ship = game.assaultFleet[0];
  const age = (18 - (ship.y + 1.5)) / 3.62 - 0.01;
  game.enemies = [{
    id: ++game.serial, age, hp: 1, pattern: 0, fireAt: 100,
    origin: ship.x - Math.sin((age + 0.01) * 1.15) * game.bounds.x * 0.06,
  }];
  game.assaultCooldown = 0;
  game.update(0.01);
  assert.equal(game.kills, 1);
  assert.equal(game.enemies.length, 0);
});

test("assault formation fits a narrow playfield and stops on gameover", () => {
  const game = arena();
  game.setPlayfield(10, 24);
  game.player.x = game.bounds.x;
  game.collectPowerup("assault");
  assert.ok(game.assaultFleet.every((ship) => Math.abs(ship.x) + 0.45 < 5));
  game.phase = "gameover";
  const positions = structuredClone(game.assaultFleet);
  game.update(0.05);
  assert.deepEqual(game.assaultFleet, positions);
  assert.equal(game.assaultTime, 20);
});

test("one enemy bullet destroys a sand cart without hurting the player or other carts", () => {
  const events = [];
  const game = arena();
  game.onEvent = (event) => events.push(event);
  game.collectPowerup("assault");
  for (let i = 0; i < 100; i++) game.update(0.05);
  const cart = game.assaultFleet[0];
  game.bullets.push({ id: ++game.serial, x: cart.x, y: cart.y + 0.1,
    vx: 0, vy: -10, life: 2, friendly: false });
  game.update(0.01);
  assert.equal(game.assaultFleet.length, 5);
  assert.ok(!game.assaultFleet.includes(cart));
  assert.equal(game.lives, 3);
  assert.equal(game.score, 0);
  assert.equal(events.filter((event) => event.type === "explosion").length, 1);
  game.assaultCooldown = 0;
  game.bullets = [];
  game.update(0.01);
  assert.equal(game.bullets.filter((shot) => shot.kind === "assault").length, 5);
});
