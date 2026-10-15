import { test } from "node:test";
import assert from "node:assert/strict";
import { ShooterGame } from "../assets/js/ShooterGame.js";
import BlockLaser from "../assets/js/BlockLaser.js";

function turretGame(wave = 3, kind = "turret") {
  const game = new ShooterGame(
    () => {},
    () => 0.5,
  );
  game.phase = "playing";
  game.wave = wave;
  game.scenerySpeed = 0;
  game.groundCooldown = game.gateCooldown = 100;
  game.spawnGroundEnemy(kind);
  const turret = game.groundEnemies[0];
  turret.y = 8;
  turret.fireCooldown = 0;
  game.updateGroundEnemies(0);
  return { game, turret };
}

function advance(game, seconds) {
  for (let i = 0; i < Math.round(seconds / 0.01); i++)
    game.updateGroundEnemies(0.01);
}

test("later-wave turrets warn harmlessly for 1.2 seconds before firing", () => {
  const { game } = turretGame();
  assert.equal(game.turretLasers.length, 1);
  assert.equal(game.turretLasers[0].warning, true);
  assert.equal(game.bullets.length, 0);
  advance(game, 1.19);
  assert.equal(game.lives, 3);
  assert.equal(game.turretLasers[0].warning, true);
  advance(game, 0.02);
  assert.equal(game.turretLasers[0].warning, false);
  assert.equal(game.lives, 2);
  advance(game, 0.3);
  assert.equal(game.turretLasers.length, 0);
  assert.equal(game.lives, 2);
});

test("a turret locks its direction during the warning so the player can dodge", () => {
  const { game, turret } = turretGame();
  const aim = turret.aim;
  game.player.x = -8;
  advance(game, 1.22);
  assert.equal(turret.aim, aim);
  assert.equal(game.lives, 3);
  assert.equal(game.turretLasers[0].warning, false);
});

test("early turrets and later tanks keep their projectile attacks", () => {
  for (const [wave, kind] of [
    [2, "turret"],
    [3, "tank"],
  ]) {
    const { game } = turretGame(wave, kind);
    assert.equal(game.turretLasers.length, 0);
    assert.equal(game.bullets.length, 1);
  }
});

test("destroying a charging turret cancels its laser and reset clears attacks", () => {
  const { game, turret } = turretGame();
  game.destroyGroundEnemy(turret);
  assert.equal(game.turretLasers.length, 0);
  advance(game, 1.5);
  assert.equal(game.lives, 3);
  game.reset();
  assert.equal(game.turretLasers.length, 0);
});

test("warning graphics are thin and dim, with a solid red firing beam", () => {
  const resources = [];
  const mesh = new BlockLaser((r) => {
    resources.push(r);
    return r;
  });
  const { game } = turretGame();
  const warning = game.turretLasers[0];
  mesh.update(warning);
  assert.equal(mesh.visible, true);
  assert.equal(mesh.tiles.material.opacity, 0.45);
  advance(game, 1.22);
  const firing = game.turretLasers[0];
  assert.ok(firing.width > warning.width);
  assert.equal(firing.color, "red");
  mesh.update(firing);
  assert.equal(mesh.tiles.material.opacity, 1);
  mesh.tiles.dispose();
  resources.forEach((r) => r.dispose());
});

test("keyboard and pointer movement dodge a charged laser in the game loop", () => {
  for (const input of [{ left: true }, { target: { x: -8, y: -10.5 } }]) {
    const { game } = turretGame();
    game.supplyCooldown = game.civilianCooldown = game.capitalCooldown = 100;
    for (let i = 0; i < 25; i++) game.update(0.05, input);
    assert.equal(game.lives, 3);
    assert.equal(game.turretLasers[0].warning, false);
  }
});

test("pausing freezes the warning and fatal laser damage clears the beam", () => {
  const { game } = turretGame();
  game.paused = true;
  for (let i = 0; i < 30; i++) game.update(0.05);
  assert.equal(game.turretLasers[0].warning, true);
  assert.equal(game.lives, 3);
  game.paused = false;
  game.lives = 1;
  advance(game, 1.22);
  assert.equal(game.phase, "dying");
  assert.equal(game.turretLasers.length, 0);
});
