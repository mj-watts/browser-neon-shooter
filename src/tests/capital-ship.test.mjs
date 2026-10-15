import { test } from "node:test";
import assert from "node:assert/strict";
import { ShooterGame } from "../assets/js/ShooterGame.js";

const advance = (game, seconds) => {
  for (let t = 0; t < seconds; t += 0.05) game.update(0.05);
};
const playing = () => {
  const game = new ShooterGame(
    () => {},
    () => 0.5,
  );
  game.phase = "intermission";
  game.elapsed = -1000;
  game.supplyCooldown = game.civilianCooldown = game.groundCooldown = Infinity;
  game.player.invulnerable = 1000;
  return game;
};

test("capital ship waits, crosses the entire screen, and never overlaps another flyby", () => {
  const game = playing();
  assert.ok(game.capitalCooldown >= 20);
  game.capitalCooldown = 0;
  game.update(0.05);
  assert.equal(game.capitalShips.length, 1);
  const ship = game.capitalShips[0];
  assert.equal(ship.turrets.length, 6);
  assert.ok(ship.y > 25);
  game.capitalCooldown = 0;
  advance(game, 3);
  assert.equal(game.capitalShips.length, 1);
  assert.ok(ship.y < 25);
  advance(game, 15);
  assert.equal(game.capitalShips.length, 0);
  assert.ok(game.capitalCooldown >= 35);
});

test("turrets aim from their own decks, fire only on screen, and can damage the player", () => {
  const game = playing();
  game.setPlayfield(12, 44);
  game.spawnCapitalShip();
  const ship = game.capitalShips[0];
  game.update(0.05);
  assert.equal(game.bullets.length, 0);
  ship.y = 0;
  game.player.x = 2;
  game.player.y = -10;
  for (const turret of ship.turrets) turret.fireCooldown = 0;
  game.update(0.05);
  assert.equal(game.bullets.length, 6);
  assert.ok(ship.width <= 12 * 0.8);
  for (const bullet of game.bullets) {
    assert.equal(bullet.friendly, false);
    const cross =
      (game.player.x - bullet.x) * bullet.vy -
      (game.player.y - bullet.y) * bullet.vx;
    assert.ok(Math.abs(cross) < 1e-10);
  }
  game.player.invulnerable = 0;
  game.bullets = [
    {
      id: ++game.serial,
      x: game.player.x,
      y: game.player.y,
      vx: 0,
      vy: 0,
      friendly: false,
      life: 1,
    },
  ];
  game.update(0.05);
  assert.equal(game.lives, 2);
});

test("flyby timers and turrets freeze on pause/game over and reset with the run", () => {
  const game = playing();
  game.spawnCapitalShip();
  for (const phase of ["intermission", "gameover"]) {
    game.phase = phase;
    game.paused = phase === "intermission";
    const before = JSON.stringify([game.capitalShips, game.capitalCooldown]);
    advance(game, 2);
    assert.equal(
      JSON.stringify([game.capitalShips, game.capitalCooldown]),
      before,
    );
  }
  game.reset();
  assert.equal(game.capitalShips.length, 0);
  game.capitalCooldown = 0;
  advance(game, 1);
  assert.equal(game.capitalShips.length, 0);
});

test("rumble fades at the edges, peaks underneath, and respects reduced motion", async () => {
  const { capitalRumble } = await import("../assets/js/CapitalShip.js");
  const ship = { y: 0, length: 24 };
  const centre = capitalRumble([ship], 32, false);
  assert.ok(centre >= 0.3 && centre <= 0.6);
  assert.equal(capitalRumble([ship], 32, true), 0);
  ship.y = 28;
  assert.equal(capitalRumble([ship], 32, false), 0);
  ship.y = 24;
  assert.ok(capitalRumble([ship], 32, false) < centre);
  assert.equal(capitalRumble([], 32, false), 0);
});

test("massive hull and six independent turret guns reuse tracked rendering resources", async () => {
  const { default: CapitalShip } = await import("../assets/js/CapitalShip.js");
  const resources = [];
  const system = new CapitalShip((resource) => {
    resources.push(resource);
    return resource;
  });
  const mesh = system.createMesh();
  const game = playing();
  game.spawnCapitalShip();
  const ship = game.capitalShips[0];
  const count = resources.length;
  ship.turrets[0].aim = 0.8;
  system.animate(mesh, ship, false);
  assert.equal(mesh.getObjectByName("turret-0").rotation.z, 0.8);
  assert.ok(mesh.getObjectByName("hull").geometry.boundingBox.max.y >= 11);
  for (let i = 0; i < 100; i++) system.animate(mesh, ship, i % 2 === 0);
  assert.equal(resources.length, count);
  assert.ok(
    Math.abs(system.createMesh().getObjectByName("turret-0").rotation.z) === 0,
  );
  resources.forEach((resource) => resource.dispose());
});

for (const weapon of ["gun", "laser", "mega", "missile", "bomb"]) {
  test(`${weapon} destroys a deck turret and leaves the ship and other guns intact`, () => {
    const game = playing();
    game.spawnCapitalShip();
    const ship = game.capitalShips[0];
    ship.y = 0;
    const turret = ship.turrets[0];
    assert.ok(turret.hp > 1);
    const target = { x: ship.x + turret.x, y: ship.y + turret.y };
    game.player.x = target.x - (weapon === "laser" ? 0.48 : 0);
    game.player.y = target.y - 4;
    if (["laser", "mega"].includes(weapon)) {
      game.weapon = weapon;
      for (let i = 0; i < 10; i++) game.update(0.05, { fire: true });
    } else if (["missile", "bomb"].includes(weapon)) {
      game[weapon === "missile" ? "detonateMissile" : "detonateBomb"]({
        ...target,
        life: 1,
      });
    } else {
      for (let i = 0; i < 4; i++) {
        game.bullets.push({
          id: ++game.serial,
          ...target,
          vx: 0,
          vy: 0,
          life: 1,
          friendly: true,
        });
        game.update(0);
      }
    }
    assert.equal(turret.destroyed, true);
    assert.equal(turret.hp, 0);
    assert.equal(ship.turrets.length, 6);
    assert.equal(ship.turrets.filter((t) => !t.destroyed).length, 5);
    assert.equal(game.kills, 0);
    const frozenAim = turret.aim;
    game.bullets = [];
    for (const gun of ship.turrets) gun.fireCooldown = 0;
    game.update(0.05);
    assert.equal(game.bullets.filter((b) => !b.friendly).length, 5);
    assert.equal(turret.aim, frozenAim);
    assert.ok(turret.wreckAge > 0);
  });
}

test("destroyed deck guns turn black and smoke without changing other turrets or clones", async () => {
  const { default: CapitalShip } = await import("../assets/js/CapitalShip.js");
  const resources = [];
  const system = new CapitalShip((r) => {
    resources.push(r);
    return r;
  });
  const mesh = system.createMesh();
  const fresh = system.createMesh();
  const game = playing();
  game.spawnCapitalShip();
  const ship = game.capitalShips[0];
  Object.assign(ship.turrets[0], {
    destroyed: true,
    wreckAge: 1,
    flashUntil: 100,
  });
  system.animate(mesh, ship, false);
  const gun = mesh.getObjectByName("turret-0");
  for (const part of gun.children.filter(
    (p) => p.isMesh && p.name !== "muzzle" && p.name !== "smoke",
  ))
    assert.equal(part.material.color.getHexString(), "090909");
  assert.equal(gun.getObjectByName("muzzle").visible, false);
  const smoke = gun.getObjectByName("smoke");
  assert.equal(smoke.visible, true);
  const moving = Array.from(smoke.instanceMatrix.array);
  ship.turrets[0].wreckAge = 2;
  system.animate(mesh, ship, false);
  assert.notDeepEqual(Array.from(smoke.instanceMatrix.array), moving);
  system.animate(mesh, ship, true);
  const still = Array.from(smoke.instanceMatrix.array);
  ship.turrets[0].wreckAge = 3;
  system.animate(mesh, ship, true);
  assert.deepEqual(Array.from(smoke.instanceMatrix.array), still);
  assert.equal(
    mesh.getObjectByName("turret-1").getObjectByName("smoke").visible,
    false,
  );
  assert.notEqual(
    fresh.getObjectByName("turret-0").children[0].material.color.getHexString(),
    "090909",
  );
  resources.forEach((r) => r.dispose());
});

test("deck turret explodes once at its world position on the fatal hit", () => {
  const game = playing();
  const events = [];
  game.onEvent = (event) => events.push(event);
  game.spawnCapitalShip();
  const ship = game.capitalShips[0];
  ship.x = 2;
  ship.y = 3;
  const target = game.capitalTurretTargets()[0];
  game.damageCapitalTurret(target, 1);
  assert.equal(events.filter((event) => event.type === "explosion").length, 0);
  game.damageCapitalTurret(target, 3);
  const blasts = events.filter((event) => event.type === "explosion");
  assert.equal(blasts.length, 1);
  assert.equal(blasts[0].x, ship.x + target.turret.x);
  assert.equal(blasts[0].y, ship.y + target.turret.y);
  assert.equal(blasts[0].capitalTurret, true);
  assert.equal(blasts[0].color, "orange");
  assert.equal(blasts[0].blocky, true);
  assert.ok(blasts[0].size > 0);
  game.damageCapitalTurret(target, 100);
  assert.equal(events.filter((event) => event.type === "explosion").length, 1);
  assert.equal(target.turret.destroyed, true);
  assert.equal(ship.turrets.length, 6);
});
