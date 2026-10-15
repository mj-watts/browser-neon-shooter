import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ShooterGame } from "../assets/js/ShooterGame.js";
import BlockLaser from "../assets/js/BlockLaser.js";
import {
  createBulletTemplates,
  WEAPON_STRENGTHS,
} from "../assets/js/WeaponStrength.js";

function arena() {
  const game = new ShooterGame(
    () => {},
    () => 0.5,
  );
  game.phase = "intermission";
  game.elapsed = -100;
  game.supplyCooldown =
    game.civilianCooldown =
    game.capitalCooldown =
    game.groundCooldown =
    game.gateCooldown =
      100;
  return game;
}

test("bullets upgrade from blue to orange to purple and cap at three", () => {
  const game = arena();
  for (const strength of [1, 2, 3, 3]) {
    if (strength > 1) game.collectPowerup("machine");
    game.bullets = [];
    game.update(0.01, { fire: true });
    assert.equal(game.bullets.length, 2);
    assert.equal(game.bullets[0].strength, strength);
    assert.equal(game.bullets[0].damage, strength);
  }
  game.weaponTime = 0.001;
  game.fireCooldown = 0;
  game.bullets = [];
  game.update(0.01, { fire: true });
  assert.equal(game.bullets[0].strength, 1);
});

test("laser pickups increase damage through three tiers and mega is strongest", () => {
  const game = arena();
  for (const strength of [1, 2, 3, 3]) {
    game.collectPowerup("laser");
    game.update(0.01, { fire: true });
    assert.equal(game.lasers.length, 2);
    assert.equal(game.lasers[0].strength, strength);
    assert.equal(game.lasers[0].damage, 18 * strength);
  }
  game.collectPowerup("mega");
  game.update(0.01, { fire: true });
  assert.equal(game.lasers[0].strength, 3);
  assert.equal(game.lasers[0].damage, 54);
  game.reset();
  assert.equal(game.weaponStrength, 1);
});

test("strong laser tiles have purple edges and a white centre", () => {
  const resources = [];
  const beam = new BlockLaser((r) => {
    resources.push(r);
    return r;
  });
  const colour = new THREE.Color();
  for (const [strength, hex] of [
    [1, "#289dff"],
    [2, "#ff803b"],
    [3, "#8855ff"],
  ]) {
    beam.update({ x: 0, y: 0, endX: 0, top: 5, width: 0.3, strength });
    beam.tiles.getColorAt(0, colour);
    assert.ok(
      colour
        .toArray()
        .every(
          (v, i) =>
            Math.abs(v - new THREE.Color(hex).multiplyScalar(2).toArray()[i]) <
            1e-6,
        ),
    );
    if (strength === 3) {
      beam.tiles.getColorAt(1, colour);
      assert.ok(colour.equals(new THREE.Color("#ffffff").multiplyScalar(2)));
    }
  }
  beam.tiles.dispose();
  resources.forEach((r) => r.dispose());
});

test("bullet templates show tier colours and a white core only at maximum strength", () => {
  const resources = [];
  const geometry = new THREE.BoxGeometry(0.1, 0.5, 0.1);
  const templates = createBulletTemplates(geometry, (r) => {
    resources.push(r);
    return r;
  });
  for (const strength of [1, 2, 3]) {
    const bullet = templates[strength].clone(true);
    assert.equal(bullet.children.length, strength === 3 ? 2 : 1);
    assert.ok(
      bullet.children[0].material.color.equals(
        new THREE.Color(WEAPON_STRENGTHS[strength].color).multiplyScalar(2),
      ),
    );
    if (strength === 3) {
      assert.ok(
        bullet.children[1].material.color.equals(
          new THREE.Color("white").multiplyScalar(2),
        ),
      );
      assert.ok(bullet.children[1].position.z > bullet.children[0].position.z);
    }
  }
  geometry.dispose();
  resources.forEach((r) => r.dispose());
});

test("each bullet strength deals its actual damage to armour", () => {
  for (const strength of [1, 2, 3]) {
    const game = arena();
    game.scenerySpeed = 0;
    game.spawnGroundEnemy("tank");
    const tank = game.groundEnemies[0];
    tank.x = 0;
    tank.y = 0;
    tank.hp = 100;
    tank.fireCooldown = 100;
    game.updateGroundEnemies(0);
    game.bullets.push({
      id: ++game.serial,
      x: tank.x,
      y: tank.y,
      vx: 0,
      vy: 0,
      friendly: true,
      life: 1,
      damage: strength,
      strength,
    });
    game.update(0);
    assert.equal(tank.hp, 100 - strength);
  }
});
