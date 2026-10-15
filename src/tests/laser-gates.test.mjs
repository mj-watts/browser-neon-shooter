import { test } from "node:test";
import assert from "node:assert/strict";
import { ShooterGame } from "../assets/js/ShooterGame.js";
import GroundDefenses from "../assets/js/GroundDefenses.js";
import BlockLaser from "../assets/js/BlockLaser.js";

function gateGame() {
  const game = new ShooterGame(
    () => {},
    () => 0.5,
  );
  game.phase = "intermission";
  game.elapsed = -100;
  game.scenerySpeed = 0;
  game.spawnLaserGate();
  game.groundEnemies.forEach((t) => {
    t.y = 0;
  });
  game.updateGroundEnemies(0);
  return game;
}

test("paired emitters span the arena and block crossing even with shields", () => {
  const game = gateGame();
  assert.equal(game.groundEnemies.length, 2);
  assert.equal(game.gateLasers.length, 1);
  assert.ok(game.groundEnemies[0].x < 0 && game.groundEnemies[1].x > 0);
  game.player.y = -1.1;
  game.shieldTime = 10;
  game.update(0.05, { target: { x: 0, y: 8 } });
  assert.ok(game.player.y <= -1);
  assert.equal(game.lives, 2);
});

test("destroying either turret breaks the beam immediately and leaves a scrolling noncombat wreck", () => {
  for (const side of [0, 1]) {
    const game = gateGame();
    const turret = game.groundEnemies[side];
    game.destroyGroundEnemy(turret);
    assert.equal(game.gateLasers.length, 0);
    assert.equal(game.groundWrecks.length, 1);
    assert.equal(game.groundWrecks[0].id, turret.id);
    assert.equal(game.groundEnemies.includes(turret), false);
    game.destroyGroundEnemy(turret);
    assert.equal(game.groundWrecks.length, 1);
    game.player.y = -1.1;
    game.update(0.05, { up: true });
    assert.ok(game.player.y > -1);
    game.scenerySpeed = 3.6;
    game.update(0.05);
    assert.ok(game.groundWrecks[0].y < 0);
    game.groundWrecks[0].y = -100;
    game.update(0.05);
    assert.equal(game.groundWrecks.length, 0);
    game.reset();
    assert.equal(game.gateLasers.length, 0);
  }
});

test("bullets destroy gate emitters through normal combat", () => {
  const game = gateGame();
  const turret = game.groundEnemies[0];
  turret.hp = 1;
  game.bullets.push({
    id: ++game.serial,
    x: turret.x,
    y: turret.y,
    vx: 0,
    vy: 0,
    life: 1,
    friendly: true,
  });
  game.update(0.01);
  assert.equal(game.gateLasers.length, 0);
  assert.equal(game.groundWrecks.length, 1);
});

test("gate and wreck graphics use square tiles, red light and persistent smoke and occasional embers", () => {
  const resources = [];
  const track = (r) => {
    resources.push(r);
    return r;
  };
  const defenses = new GroundDefenses(track);
  const mesh = defenses.createMesh("laserTurret");
  defenses.animate(
    mesh,
    {
      kind: "laserTurret",
      aim: -Math.PI / 2,
      age: 2,
      destroyed: true,
      wreckAge: 1,
    },
    false,
  );
  assert.equal(mesh.getObjectByName("aimed-gun").visible, true);
  assert.ok(mesh.getObjectByName("wreck-effects").visible);
  assert.ok(mesh.getObjectByName("smoke").count > 0);
  assert.equal(mesh.getObjectByName("sparks"), undefined);
  const embers = mesh.getObjectByName("embers");
  assert.equal(embers.count, 2);
  const before = [...embers.instanceMatrix.array];
  const hull = mesh.getObjectByName("hull");
  assert.deepEqual(
    [...hull.instanceMatrix.array],
    [
      ...defenses.templates.laserTurret.getObjectByName("hull").instanceMatrix
        .array,
    ],
  );
  for (const part of [hull, mesh.getObjectByName("aimed-gun").children[0]]) {
    assert.ok([...part.instanceColor.array].every((value) => value < 0.02));
  }
  defenses.animate(
    mesh,
    { destroyed: true, aim: -Math.PI / 2, wreckAge: 1.1 },
    false,
  );
  assert.notDeepEqual([...embers.instanceMatrix.array], before);
  const beam = new BlockLaser(track);
  beam.update({ x: -8, endX: 8, y: 0, top: 0, width: 1.2, color: "red" });
  assert.ok(beam.tiles.count > 100);
  assert.ok(beam.tiles.material.color.r > beam.tiles.material.color.g * 4);
  beam.update(null);
  assert.equal(beam.visible, false);
  resources.forEach((r) => r.dispose());
});

test("gates spawn on a timer, pause with play and do not overlap", () => {
  const game = new ShooterGame(
    () => {},
    () => 0.5,
  );
  game.phase = "intermission";
  game.elapsed = -100;
  game.gateCooldown = 0;
  game.update(0.01);
  assert.equal(game.gateLasers.length, 1);
  const firstIds = game.groundEnemies.filter((t) => t.gateId).map((t) => t.id);
  game.spawnLaserGate();
  assert.deepEqual(
    game.groundEnemies.filter((t) => t.gateId).map((t) => t.id),
    firstIds,
  );
  const y = game.groundEnemies[0].y;
  const timer = game.gateCooldown;
  game.paused = true;
  game.update(0.05);
  assert.equal(game.groundEnemies[0].y, y);
  assert.equal(game.gateCooldown, timer);
});

test("laser barriers block from either side including fast swept crossings", () => {
  const game = gateGame();
  game.player.invulnerable = 10;
  game.player.y = 5;
  game.blockLaserGates(-5);
  assert.ok(game.player.y < -1);
  game.player.y = -5;
  game.blockLaserGates(5);
  assert.ok(game.player.y > 1);
  game.player.y = 7;
  game.blockLaserGates(8);
  assert.equal(game.player.y, 7);
});

test("wreck rendering leaves the other turret intact and supports reduced motion", () => {
  const defenses = new GroundDefenses((r) => r);
  const wreck = defenses.createMesh("laserTurret");
  const survivor = defenses.createMesh("laserTurret");
  const hull = survivor.getObjectByName("hull");
  const colors = [...hull.instanceColor.array];
  const matrices = [...hull.instanceMatrix.array];
  for (const age of [0, 1, 10]) {
    defenses.animate(wreck, { destroyed: true, aim: 0, wreckAge: age }, true);
  }
  assert.deepEqual([...hull.instanceColor.array], colors);
  assert.deepEqual([...hull.instanceMatrix.array], matrices);
  assert.equal(survivor.getObjectByName("aimed-gun").visible, true);
  assert.equal(survivor.getObjectByName("wreck-effects").visible, false);
});

test("laser contact costs a life immediately through defensive upgrades without draining every frame", () => {
  for (const upgrade of ["shieldTime", "orbitTime"]) {
    const game = gateGame();
    const events = [];
    game.onEvent = (event) => events.push(event);
    game[upgrade] = 10;
    game.player.y = -1.1;
    game.update(0.05, { up: true });
    assert.equal(game.lives, 2);
    assert.equal(events.filter((event) => event.type === "hit").length, 1);
    for (let i = 0; i < 10; i++) game.update(0.05, { up: true });
    assert.equal(game.lives, 2);
    game.player.invulnerable = 0;
    game.lives = 1;
    game.update(0.05, { up: true });
    assert.equal(game.lives, 0);
    assert.equal(game.phase, "dying");
    assert.equal(
      events.filter((event) => event.type === "hit" && event.fatal).length,
      1,
    );
  }
});

test("the first two visible barriers teach shooting turrets once each, resetting per game", () => {
  const events = [];
  const game = new ShooterGame(
    (event) => events.push(event),
    () => 0.5,
  );
  game.scenerySpeed = 0;
  game.groundCooldown = 100;
  for (let encounter = 0; encounter < 3; encounter++) {
    game.groundEnemies = [];
    game.spawnLaserGate();
    game.updateGroundEnemies(0);
    assert.equal(
      events.filter((e) => e.type === "laserGateTutorial").length,
      Math.min(encounter, 2),
    );
    game.groundEnemies.forEach((t) => {
      t.y = 14;
    });
    game.updateGroundEnemies(0);
    assert.equal(
      events.filter((e) => e.type === "laserGateTutorial").length,
      Math.min(encounter + 1, 2),
    );
    assert.ok(
      game.groundEnemies.every((t) =>
        encounter < 2 ? t.highlightUntil > t.age : !t.highlightUntil,
      ),
    );
    game.updateGroundEnemies(0);
    assert.equal(
      events.filter((e) => e.type === "laserGateTutorial").length,
      Math.min(encounter + 1, 2),
    );
  }
  game.reset();
  game.spawnLaserGate();
  game.groundEnemies.forEach((t) => {
    t.y = 14;
  });
  game.updateGroundEnemies(0);
  assert.equal(events.filter((e) => e.type === "laserGateTutorial").length, 3);
});

test("tutorial highlights brighten each turret independently then restore its colors", () => {
  const resources = [];
  const defenses = new GroundDefenses((r) => {
    resources.push(r);
    return r;
  });
  const highlighted = defenses.createMesh("laserTurret");
  const other = defenses.createMesh("laserTurret");
  const hull = highlighted.getObjectByName("hull");
  const original = [...hull.instanceColor.array];
  defenses.animate(
    highlighted,
    { kind: "laserTurret", aim: 0, age: 0, highlightUntil: 2 },
    false,
  );
  assert.notDeepEqual([...hull.instanceColor.array], original);
  assert.deepEqual(
    [...other.getObjectByName("hull").instanceColor.array],
    original,
  );
  defenses.animate(
    highlighted,
    { kind: "laserTurret", aim: 0, age: 3, highlightUntil: 2 },
    false,
  );
  assert.deepEqual([...hull.instanceColor.array], original);
  defenses.animate(
    highlighted,
    { kind: "laserTurret", aim: 0, age: 0, highlightUntil: 2 },
    true,
  );
  const reduced = [...hull.instanceColor.array];
  defenses.animate(
    highlighted,
    { kind: "laserTurret", aim: 0, age: 0.6, highlightUntil: 2 },
    true,
  );
  assert.deepEqual([...hull.instanceColor.array], reduced);
  resources.forEach((r) => r.dispose());
});
