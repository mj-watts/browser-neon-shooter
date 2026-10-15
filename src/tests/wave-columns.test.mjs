import { test } from "node:test";
import assert from "node:assert/strict";
import { ShooterGame } from "../assets/js/ShooterGame.js";

for (let columns = 4; columns <= 10; columns++) {
  test(`normal waves can have ${columns} columns with three complete rows`, () => {
    const game = new ShooterGame(
      () => {},
      () => (columns - 4 + 0.5) / 7,
    );
    game.startWave();
    assert.equal(game.enemies.length, columns * 3);
    assert.equal(game.waveSize, columns * 3);
    assert.equal(new Set(game.enemies.map((e) => e.origin)).size, columns);
    for (let row = 0; row < 3; row++) {
      const ships = game.enemies.filter((e) => e.formationRow === row);
      assert.equal(ships.length, columns);
      for (let column = 1; column < ships.length; column++) {
        assert.ok(
          Math.abs(ships[column].x - ships[column - 1].x - 1.65) < 1e-9,
          "column spacing stays fixed regardless of formation width",
        );
      }
      assert.equal(new Set(ships.map((e) => e.y)).size, 1);
      assert.ok(ships.every((e) => e.y >= 18 && Math.abs(e.x) < game.bounds.x));
      assert.ok(Math.abs(ships[0].origin + ships.at(-1).origin) < 1e-9);
    }
  });
}

test("width varies per normal wave while the post-capital wave remains twenty by five", () => {
  const game = new ShooterGame();
  game.random = () => 0;
  game.startWave();
  assert.equal(game.enemies.length, 12);
  game.random = () => 0.999999;
  game.startWave();
  assert.equal(game.enemies.length, 30);
  game.random = () => 0;
  game.spawnCapitalShip();
  game.startWave();
  assert.equal(game.enemies.length, 100);
  assert.equal(new Set(game.enemies.map((e) => e.origin)).size, 20);
  assert.equal(new Set(game.enemies.map((e) => e.formationRow)).size, 5);
  game.startWave();
  assert.equal(game.enemies.length, 12);
});
