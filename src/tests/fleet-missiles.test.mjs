import { test } from "node:test";
import assert from "node:assert/strict";
import { ShooterGame } from "../assets/js/ShooterGame.js";

function arena(power) {
  const game = new ShooterGame(() => {}, () => 0.5);
  game.phase = "intermission";
  game.elapsed = -100;
  game.supplyCooldown = game.civilianCooldown = game.groundCooldown = 100;
  game.capitalCooldown = game.gateCooldown = 100;
  game.collectPowerup(power);
  return game;
}

for (const [power, fleet, update, timer, interval] of [
  ["fleet", "fleet", "updateFleet", "fleetTime", 1.2],
  ["assault", "assaultFleet", "updateAssaultFleet", "assaultTime", 0.6],
]) {
  test(`${power} launches repeated homing missiles without spending player ammo`, () => {
    const game = arena(power);
    game.missileCount = 5;
    for (const ship of game[fleet]) {
      ship.y = ship.entryY = 0;
      ship.age = 2;
    }
    for (let i = 0; i < 60; i++) game[update](0.05);
    const missiles = game.bullets.filter((shot) => shot.kind === "missile");
    assert.ok(missiles.length >= game[fleet].length * Math.floor(3 / interval));
    assert.ok(missiles.every((shot) => shot.friendly && shot.life <= 3));
    assert.equal(game.missileCount, 5);
  });

  test(`${power} missiles pause and disappear after support expires`, () => {
    const game = arena(power);
    for (let i = 0; i < 120; i++) game.update(0.05);
    assert.ok(game.bullets.some((shot) => shot.kind === "missile"));
    game.paused = true;
    const bullets = structuredClone(game.bullets);
    game.update(0.05);
    assert.deepEqual(game.bullets, bullets);
    game.paused = false;
    game[timer] = 0.1;
    for (let i = 0; i < 80; i++) game.update(0.05);
    assert.equal(game.bullets.some((shot) => shot.kind === "missile"), false);
    game.reset();
    assert.deepEqual(game.bullets, []);
  });
}
