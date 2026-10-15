import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import * as THREE from "three";
import { ShooterGame } from "../assets/js/ShooterGame.js";
import OrbTrails from "../assets/js/OrbTrails.js";

// Match Vite's extension resolution when importing the browser renderer in Node.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(
      specifier.startsWith("./") && !specifier.endsWith(".js")
        ? `${specifier}.js`
        : specifier,
      context,
    );
  },
});
const { default: NeonShooter } = await import("../assets/js/NeonShooter.js");
hooks.deregister();

test("enemy sync preserves template sizes and applies formation scale once", () => {
  const engine = Object.create(NeonShooter.prototype);
  const template = new THREE.Group();
  template.scale.setScalar(0.52);
  const heavy = template.clone();
  heavy.scale.multiplyScalar(1.4);
  Object.assign(engine, {
    model: new ShooterGame(),
    entities: new Map(),
    scene: new THREE.Scene(),
    enemyTemplates: [template],
    heavyTemplate: heavy,
    laserMeshes: [],
    turretLaserMeshes: [],
    gateLaserMesh: { update() {} },
    canyon: { uniforms: { horizontal: { value: 0 } } },
    viewWidth: 24,
    updateMuzzleFlashes() {},
  });
  engine.model.enemies = [
    { id: 1, kind: 0, x: 0, y: 0, age: 0 },
    { id: 2, kind: 0, x: 2, y: 0, age: 0, heavy: true },
    { id: 3, kind: 0, x: 4, y: 0, age: 0, scale: 0.7 },
  ];
  for (let frame = 0; frame < 3; frame++) {
    engine.syncEntities(0);
    assert.equal(engine.entities.get("enemy-1").scale.x, 0.52);
    assert.equal(engine.entities.get("enemy-2").scale.x, 0.52 * 1.4);
    assert.equal(engine.entities.get("enemy-3").scale.x, 0.52 * 0.7);
  }
});

for (const paused of [true, false]) {
  test(`Game Over keeps the rendered scene still with pause ${paused}`, () => {
    const engine = Object.create(NeonShooter.prototype);
    let rendered = 0;
    let error;
    Object.assign(engine, {
      mode: "game",
      model: new ShooterGame(),
      time: 8,
      lastTime: 1000,
      lastPublished: 1000,
      camera: { position: { x: 0, y: 0 } },
      bloom: {},
      shake: 0,
      flash: 0,
      composer: {
        render() {
          rendered++;
        },
      },
      onError(value) {
        error = value;
      },
      dispose() {},
      publish() {},
    });
    engine.model.phase = "gameover";
    engine.model.paused = paused;
    const originalFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = () => 1;
    try {
      engine.animate(1050);
      assert.equal(
        engine.time,
        8,
        "scenery and entity animation time stays frozen",
      );
      assert.equal(error, undefined);
      assert.equal(
        rendered,
        1,
        "the stopped scene still renders behind the overlay",
      );
    } finally {
      globalThis.requestAnimationFrame = originalFrame;
    }
  });
}

for (const phase of ["dying", "crashed", "gameover"]) {
  test(`hero thrust stops during ${phase} and death clears old thrust only`, () => {
    const engine = Object.create(NeonShooter.prototype);
    engine.model = new ShooterGame();
    engine.model.phase = "playing";
    engine.particles = [];
    const motion = { rotation: 0, boost: 0, velocityX: 0, velocityY: 0 };
    engine.emitHeroExhaust(0.05, motion);
    assert.ok(engine.particles.length > 0, "a live hero emits thrust");
    assert.ok(
      engine.particles.every((particle) => particle.source === "heroThrust"),
    );
    const explosion = { source: "explosion", life: 1 };
    engine.particles.push(explosion);
    const resources = [];
    engine.orbTrails = new OrbTrails((resource) => {
      resources.push(resource);
      return resource;
    });
    engine.orbTrails.update([{ x: 1, y: 2 }], 0.01);
    assert.ok(engine.orbTrails.mesh.count > 0);
    engine.model.phase = phase;
    engine.model.lives = 0;
    engine.event({ type: "playerFalling" });
    assert.equal(engine.orbTrails.mesh.count, 0);
    assert.deepEqual(engine.orbTrails.pixels, []);
    assert.deepEqual(engine.particles, [explosion]);
    engine.emitHeroExhaust(0.05, motion);
    assert.deepEqual(engine.particles, [explosion]);
    assert.equal(engine.exhaustAccumulator, 0);
    engine.orbTrails.mesh.dispose();
    resources.forEach((resource) => resource.dispose());
  });
}
