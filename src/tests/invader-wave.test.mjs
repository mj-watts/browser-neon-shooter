import { test } from "node:test";
import assert from "node:assert/strict";
import { ShooterGame } from "../assets/js/ShooterGame.js";

const playing = (width = 24, height = 32) => {
  const game = new ShooterGame(
    () => {},
    () => 0.5,
  );
  game.setPlayfield(width, height);
  game.startWave();
  game.capitalCooldown =
    game.supplyCooldown =
    game.civilianCooldown =
    game.groundCooldown =
    game.gateCooldown =
      Infinity;
  game.player.invulnerable = 1000;
  return game;
};
const advance = (game, seconds) => {
  for (let t = 0; t < seconds; t += 0.05) game.update(0.05);
};

test("capital entrance queues exactly one 20 by 5 wave without replacing current enemies", () => {
  const game = playing();
  const current = game.enemies;
  game.spawnCapitalShip();
  game.spawnCapitalShip();
  assert.equal(game.enemies, current);
  game.startWave();
  assert.equal(game.enemies.length, 100);
  assert.equal(game.waveSize, 100);
  assert.equal(new Set(game.enemies.map((e) => e.origin)).size, 20);
  assert.equal(new Set(game.enemies.map((e) => e.formationRow)).size, 5);
  assert.ok(game.enemies.every((e) => e.invader && e.hp === 1 && !e.heavy));
  game.startWave();
  assert.ok(game.enemies.length < 100);
});

for (const [width, height] of [
  [24, 32],
  [12, 44],
  [48, 26],
]) {
  test(`formation stays aligned and visible on a ${width} by ${height} playfield`, () => {
    const game = playing(width, height);
    game.spawnCapitalShip();
    game.capitalShips = [];
    game.startWave();
    advance(game, 6);
    assert.equal(game.enemies.length, 100);
    for (const enemy of game.enemies) {
      assert.ok(Math.abs(enemy.x) + enemy.scale < width / 2);
      assert.ok(Math.abs(enemy.y) < height / 2);
    }
    for (let row = 0; row < 5; row++) {
      const ships = game.enemies.filter((e) => e.formationRow === row);
      assert.equal(new Set(ships.map((e) => e.y)).size, 1);
      assert.equal(ships.length, 20);
    }
    assert.ok(game.bullets.filter((b) => !b.friendly).length <= 20);
  });
}

test("shooting out a column leaves an open corridor as the formation advances", () => {
  const game = playing();
  game.spawnCapitalShip();
  game.capitalShips = [];
  game.startWave();
  advance(game, 6);
  const column = game.enemies.filter((e) => e.column === 10);
  assert.equal(column.length, 5);
  for (const enemy of column) {
    game.bullets.push({
      id: ++game.serial,
      x: enemy.x,
      y: enemy.y,
      vx: 0,
      vy: 0,
      life: 1,
      friendly: true,
    });
    game.update(0);
  }
  assert.equal(game.enemies.length, 95);
  assert.equal(game.waveKills, 5);
  advance(game, 2);
  assert.ok(game.enemies.every((e) => e.column !== 10));
  advance(game, 40);
  assert.ok(game.enemies.every((e) => !e.invader));
});

test("pause freezes the grid and reset discards a queued invasion", () => {
  const game = playing();
  game.spawnCapitalShip();
  game.startWave();
  game.paused = true;
  const before = JSON.stringify(game.enemies);
  advance(game, 2);
  assert.equal(JSON.stringify(game.enemies), before);
  game.reset();
  game.startWave();
  assert.ok(game.enemies.every((e) => !e.invader));
});

test("normal play starts the queued invasion after clearing the current wave", () => {
  const game = playing();
  game.spawnCapitalShip();
  for (const enemy of [...game.enemies]) game.destroyEnemy(enemy, true);
  game.update(0);
  assert.equal(game.phase, "intermission");
  advance(game, 3.1);
  assert.equal(game.phase, "playing");
  assert.equal(game.enemies.length, 100);
  assert.ok(game.enemies.every((e) => e.invader));
});
