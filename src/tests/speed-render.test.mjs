import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { ShooterGame } from "../assets/js/ShooterGame.js";
import * as THREE from "three";

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

function flight(boosted, reducedMotion = false) {
  const engine = Object.create(NeonShooter.prototype);
  const positions = new THREE.BufferAttribute(new Float32Array([0, 10, -1]), 3);
  const streak = new THREE.BufferAttribute(new Float32Array(6), 3);
  Object.assign(engine, {
    mode: "game",
    reducedMotion,
    thrust: 0,
    time: 0,
    model: new ShooterGame(),
    flame: new THREE.Object3D(),
    player: new THREE.Object3D(),
    flameMaterial: { uniforms: { boost: { value: 0 }, time: { value: 0 } } },
    engineGlows: [],
    clouds: [],
    canyon: {
      uniforms: {
        travel: { value: new THREE.Vector3() },
        horizontal: { value: 0 },
      },
      update() {},
    },
    stars: { material: {}, geometry: { attributes: { position: positions } } },
    streaks: { material: {}, geometry: { attributes: { position: streak } } },
  });
  if (boosted) engine.model.collectPowerup("speed");
  return engine;
}

test("speed shows faster, longer blue streaks and maximum thrust even while reversing", () => {
  const normal = flight(false);
  const boosted = flight(true);
  normal.updateFlightEffects(0.01, 0);
  for (let i = 0; i < 100; i++) {
    boosted.model.update(0.01);
    boosted.updateFlightEffects(0.01, -1);
  }
  boosted.stars.geometry.attributes.position.setY(0, 10);
  boosted.updateFlightEffects(0.01, -1);
  assert.ok(boosted.thrust > 0.99);
  assert.ok(boosted.flameMaterial.uniforms.boost.value > 0.99);
  assert.ok(boosted.flame.scale.y > 2.08);
  assert.equal(boosted.streaks.visible, true);
  assert.equal(normal.streaks.visible, false);
  const y = (engine) => engine.stars.geometry.attributes.position.getY(0);
  assert.ok(10 - y(boosted) > (10 - y(normal)) * 1.9);
  const length = (engine) => {
    const position = engine.streaks.geometry.attributes.position;
    return position.getY(1) - position.getY(0);
  };
  assert.ok(length(boosted) > length(normal));
  boosted.model.speedTime = 0;
  for (let i = 0; i < 30; i++) {
    boosted.model.update(0.05);
    boosted.updateFlightEffects(0.05, 0);
  }
  assert.equal(boosted.streaks.visible, false);
  assert.ok(boosted.thrust < 1);
  const reduced = flight(true, true);
  reduced.updateFlightEffects(0.01, 0);
  assert.equal(reduced.streaks.visible, false);
});

test("speed pickup builds its 3D icon and publishes its HUD countdown", () => {
  const engine = Object.create(NeonShooter.prototype);
  let state;
  Object.assign(engine, {
    resources: new Set(),
    callouts: [],
    model: new ShooterGame(),
    onState: (value) => {
      state = value;
    },
  });
  const icon = engine.makePowerupIcon("speed");
  assert.ok(icon.children.length >= 4);
  engine.model.collectPowerup("speed");
  engine.publish();
  assert.deepEqual(
    state.upgrades.find((upgrade) => upgrade.id === "speed"),
    {
      id: "speed",
      label: "SPEED BOOST",
      remaining: 15,
      duration: 15,
    },
  );
  engine.model.speedTime = 0;
  engine.publish();
  assert.equal(
    state.upgrades.some((upgrade) => upgrade.id === "speed"),
    false,
  );
  for (const resource of engine.resources) resource.dispose();
});

test("ship squashes for one second on boost entry and stretches on exit, then restores its shape", () => {
  const engine = flight(true);
  for (let i = 0; i < 10; i++) {
    engine.model.update(0.05);
    engine.updateFlightEffects(0.05, 0);
  }
  assert.ok(engine.warpHeight < 0.85);
  for (let i = 0; i < 12; i++) {
    engine.model.update(0.05);
    engine.updateFlightEffects(0.05, 0);
  }
  assert.equal(engine.warpHeight, 1);
  engine.model.speedTime = 0;
  for (let i = 0; i < 10; i++) {
    engine.model.update(0.05);
    engine.updateFlightEffects(0.05, 0);
  }
  assert.ok(engine.warpHeight > 1.3);
  for (let i = 0; i < 12; i++) {
    engine.model.update(0.05);
    engine.updateFlightEffects(0.05, 0);
  }
  assert.equal(engine.warpHeight, 1);
});

test('all terrain shelves follow simulation travel, including reduced motion and boost', () => {
  for (const reduced of [false, true]) {
    const engine = flight(true, reduced);
    for (let i = 0; i < 20; i++) {
      engine.model.update(0.05);
      engine.updateFlightEffects(0.05, 0);
    }
    const travel = engine.canyon.uniforms.travel.value;
    assert.ok(travel.x > 3.6);
    assert.ok(Math.abs(travel.y - travel.x * 0.67) < 1e-6);
    assert.ok(Math.abs(travel.z - travel.x * 1.08) < 1e-6);
  }
});
