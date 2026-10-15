import { test } from "node:test";
import assert from "node:assert/strict";
import { ShooterGame } from "../assets/js/ShooterGame.js";

for (const [width, height] of [
  [24, 32],
  [24, 52],
  [48, 32],
]) {
  for (const wave of [1, 2]) {
    test(`wave ${wave} enters continuously from above a ${width} by ${height} playfield`, () => {
      const game = new ShooterGame(
        () => {},
        () => 0.5,
      );
      game.setPlayfield(width, height);
      game.wave = wave - 1;
      game.startWave();
      game.capitalCooldown =
        game.supplyCooldown =
        game.civilianCooldown =
        game.groundCooldown =
        game.gateCooldown =
          Infinity;
      game.player.invulnerable = 1000;
      const top = height / 2;
      assert.equal(game.enemies.length, 21);
      assert.ok(game.enemies.every((enemy) => enemy.y >= top + 2));
      const initial = game.enemies.map(({ x, y }) => ({ x, y }));
      game.update(0);
      assert.deepEqual(
        game.enemies.map(({ x, y }) => ({ x, y })),
        initial,
        "the first update must not teleport ships into their row positions",
      );
      assert.ok(game.enemies[0].y < game.enemies[7].y);
      assert.ok(game.enemies[7].y < game.enemies[14].y);
      const entered = new Set();
      const speed = 3.62 + (wave - 1) * 0.3;
      for (let frame = 0; frame < 100; frame++) {
        const previous = new Map(game.enemies.map((e) => [e.id, e.y]));
        game.update(0.05);
        for (const enemy of game.enemies) {
          assert.ok(
            Math.abs(previous.get(enemy.id) - enemy.y - speed * 0.05) < 1e-9,
          );
          if (enemy.y <= top && !entered.has(enemy.id)) {
            assert.ok(previous.get(enemy.id) > top);
            entered.add(enemy.id);
          }
        }
      }
      assert.equal(entered.size, 21);
    });
  }
}
