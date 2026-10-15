import { test } from "node:test";
import assert from "node:assert/strict";
import { ShooterGame } from "../assets/js/ShooterGame.js";

function arena(roll) {
  const events = [];
  const game = new ShooterGame(
    (event) => events.push(event),
    () => roll,
  );
  game.phase = "intermission";
  game.elapsed = -100;
  game.supplyCooldown = game.civilianCooldown = game.groundCooldown = 100;
  game.enemies = [1, 2].map((id) => ({
    id,
    x: 0,
    y: 2,
    age: 1,
    kind: 0,
    hp: 1,
  }));
  return { game, events };
}

for (const [side, roll] of [
  [-1, 0.1],
  [1, 0.2],
]) {
  test(`random burning death drifts ${side < 0 ? "left" : "right"} before one nearby block explosion`, () => {
    const { game, events } = arena(roll);
    game.setPlayfield(48, 32);
    game.destroyEnemy(game.enemies[0], true);
    assert.equal(
      events.filter((event) => event.type === "explosion").length,
      0,
    );
    assert.equal(game.flyawayEnemies.length, 1);
    assert.equal(game.kills, 1);
    assert.equal(game.pickups.length, 1);
    const wreck = game.flyawayEnemies[0];
    game.destroyEnemy(wreck, true);
    assert.equal(game.kills, 1);
    for (let i = 0; i < 10; i++) game.update(0.05);
    assert.ok(
      side * wreck.x > 0.5 && side * wreck.x < 1,
      "wreck drifts only slightly",
    );
    assert.equal(
      events.filter((event) => event.type === "explosion").length,
      0,
    );
    game.paused = true;
    const position = { x: wreck.x, y: wreck.y };
    game.update(0.05);
    assert.deepEqual({ x: wreck.x, y: wreck.y }, position);
    game.paused = false;
    // Resizing must not extend the death animation or fling the wreck further.
    game.setPlayfield(64, 32);
    for (let i = 0; i < 60; i++) game.update(0.05);
    const blasts = events.filter((event) => event.type === "explosion");
    assert.equal(blasts.length, 1);
    assert.ok(side * blasts[0].x > 1.5 && side * blasts[0].x < 2.5);
    assert.ok(Math.abs(blasts[0].y - 2) < 1.2);
    assert.equal(blasts[0].blocky, true);
    assert.notEqual(blasts[0].offscreen, true);
    assert.equal(game.flyawayEnemies.length, 0);
    game.reset();
    assert.deepEqual(game.flyawayEnemies, []);
  });
}

test("other deaths retain immediate explosions and existing heavy/final falls", () => {
  const { game, events } = arena(0.8);
  game.destroyEnemy(game.enemies[0], true);
  assert.equal(events[0].type, "explosion");
  const final = game.enemies[0];
  game.destroyEnemy(final, true);
  assert.equal(game.fallingEnemies.length, 1);
  const heavy = { id: 3, x: 1, y: 2, heavy: true };
  game.enemies = [heavy, { id: 4 }];
  game.random = () => 0.1;
  game.destroyEnemy(heavy, true);
  assert.equal(game.fallingEnemies.length, 2);
  assert.deepEqual(game.flyawayEnemies, []);
  game.destroyEnemy(game.enemies[0], false);
  assert.equal(game.escaped, 1);
  assert.deepEqual(game.flyawayEnemies, []);
});
