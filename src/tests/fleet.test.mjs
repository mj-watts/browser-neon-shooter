import { test } from "node:test";
import assert from "node:assert/strict";
import { ShooterGame } from "../assets/js/ShooterGame.js";

function arena() {
  const game = new ShooterGame(
    () => {},
    () => 0.5,
  );
  game.phase = "intermission";
  game.elapsed = -100;
  game.supplyCooldown = game.civilianCooldown = game.groundCooldown = 100;
  return game;
}

test("fleet enters from below, follows the hero rear flanks and fires independently", () => {
  const game = arena();
  game.collectPowerup("fleet");
  assert.equal(game.fleetTime, 10);
  assert.equal(game.fleet.length, 4);
  assert.ok(game.fleet.every((ship) => ship.y < game.bounds.bottom - 2));
  for (let i = 0; i < 25; i++) game.update(0.05);
  game.update(0.05, { right: true, up: true });
  for (let i = 0; i < 5; i++) game.update(0.05);
  assert.ok(game.fleet[0].x < game.player.x);
  assert.ok(game.fleet[3].x > game.player.x);
  assert.ok(
    game.fleet.every(
      (ship) => ship.y === game.player.y - 1.4 * Math.abs(ship.side),
    ),
  );
  assert.ok(game.bullets.some((shot) => shot.kind === "fleet"));
  for (let i = 0; i < 40; i++) game.update(0.05);
  assert.equal(game.fleetRadioTime, 0);
});

test("formed fleet follows movement and banking with a subtle stagger", () => {
  const game = arena();
  game.collectPowerup("fleet");
  for (let i = 0; i < 75; i++) game.updateFleet(0.02);
  const positions = game.fleet.map(({ x, y }) => ({ x, y }));
  game.player.x += 2;
  game.player.y += 1;
  game.player.bank = 0.3;
  game.updateFleet(0.02);
  for (const [index, ship] of game.fleet.entries()) {
    assert.equal(ship.x, positions[index].x);
    assert.equal(ship.y, positions[index].y);
    assert.equal(ship.bank, 0);
  }
  for (let i = 0; i < 5; i++) game.updateFleet(0.02);
  const inner = game.fleet.filter((ship) => Math.abs(ship.side) === 1);
  const outer = game.fleet.filter((ship) => Math.abs(ship.side) === 2);
  assert.ok(inner.every((ship) => ship.bank > 0));
  assert.ok(outer.every((ship) => ship.bank === 0));
  for (let i = 0; i < 10; i++) game.updateFleet(0.02);
  for (const ship of game.fleet) {
    assert.equal(ship.x, game.player.x + ship.side * 2.4);
    assert.equal(ship.y, game.player.y - Math.abs(ship.side) * 1.4);
    assert.equal(ship.bank, game.player.bank);
  }
});

test("fleet pauses, departs after ten seconds and sweeps armour and shots along its path", () => {
  const game = arena();
  game.collectPowerup("fleet");
  game.paused = true;
  game.update(0.05);
  assert.equal(game.fleetTime, 10);
  game.paused = false;
  for (let i = 0; i < 200; i++) game.update(0.05);
  assert.equal(game.fleetTime, 0);
  assert.ok(game.fleet.every((ship) => ship.departing));
  const ship = game.fleet[0];
  game.enemies = [
    { id: 1000, x: ship.x, y: ship.y + 0.5, age: 0, hp: 99, heavy: true },
  ];
  game.groundEnemies = [
    { id: 1001, kind: "tank", x: ship.x, y: ship.y + 0.6, hp: 99 },
  ];
  game.bullets.push({
    id: 1002,
    x: ship.x,
    y: ship.y + 0.7,
    friendly: false,
    life: 1,
  });
  game.updateFleet(0.05);
  game.hitFleet();
  assert.equal(game.enemies.length, 0);
  assert.equal(game.groundEnemies.length, 0);
  assert.ok(game.bullets.find((shot) => shot.id === 1002).life < 0);
  for (let i = 0; i < 100; i++) {
    game.updateFleet(0.05);
    game.hitFleet();
  }
  assert.equal(game.fleet.length, 0);
});

test("fleet recollection stays at four fighters and replay clears fighters and radio", () => {
  const game = arena();
  game.collectPowerup("fleet");
  game.update(0.05);
  game.collectPowerup("fleet");
  assert.equal(game.fleet.length, 4);
  assert.equal(game.fleetTime, 10);
  assert.equal(game.fleetRadioTime, 3);
  game.reset();
  assert.deepEqual(game.fleet, []);
  assert.equal(game.fleetTime, 0);
  assert.equal(game.fleetRadioTime, 0);
});

test("departure collisions run in gameplay and ignore civilians and unspawned enemies", () => {
  const game = arena();
  game.collectPowerup("fleet");
  for (let i = 0; i < 30; i++) game.update(0.05);
  game.fleetTime = 0.01;
  const ship = game.fleet[0];
  const age = (18 - (ship.y + 0.5)) / 3.62 - 0.05;
  game.enemies = [
    {
      id: 1000,
      age,
      origin: ship.x - Math.sin((age + 0.05) * 1.15) * game.bounds.x * 0.06,
      pattern: 0,
      hp: 99,
      heavy: true,
      fireAt: 100,
    },
    { id: 1001, x: ship.x, y: ship.y, age: -10, hp: 1 },
  ];
  game.spawnCivilian();
  const civilian = game.civilians[0];
  civilian.origin = ship.x;
  civilian.y = ship.y;
  game.update(0.05);
  assert.equal(game.kills, 1);
  assert.deepEqual(
    game.enemies.map((enemy) => enemy.id),
    [1001],
  );
  assert.equal(civilian.hp, 5);
  game.phase = "gameover";
  const position = game.fleet[0].y;
  game.update(0.05);
  assert.equal(game.fleet[0].y, position);
});

test("fleet radio says goodbye once at departure and expires without repeating", () => {
  const game = arena();
  game.collectPowerup("fleet");
  assert.equal(game.fleetRadioMessage, "Roger, on way!");
  for (let i = 0; i < 200; i++) game.update(0.05);
  assert.equal(game.fleetRadioMessage, "Good job guys!");
  assert.equal(game.fleetRadioTime, 3);
  game.update(0.05);
  assert.ok(game.fleetRadioTime < 3);
  game.paused = true;
  const time = game.fleetRadioTime;
  game.update(0.05);
  assert.equal(game.fleetRadioTime, time);
  game.paused = false;
  for (let i = 0; i < 80; i++) game.update(0.05);
  assert.equal(game.fleetRadioTime, 0);
  game.collectPowerup("fleet");
  assert.equal(game.fleetRadioMessage, "Roger, on way!");
  game.reset();
  assert.equal(game.fleetRadioMessage, "");
});
