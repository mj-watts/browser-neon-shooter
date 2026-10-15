import { test } from "node:test";
import assert from "node:assert/strict";
import OrbTrails from "../assets/js/OrbTrails.js";

test("existing trail pixels move with the craft while preserving their orbital offsets", () => {
  const resources = [];
  const trails = new OrbTrails((resource) => {
    resources.push(resource);
    return resource;
  });
  trails.update([{ x: 3.8, y: 4 }], 0.01, false, { x: 2, y: 4 });
  trails.update([], 0, false, { x: 9, y: -3 });
  assert.equal(trails.mesh.instanceMatrix.array[12], Math.fround(10.8));
  assert.equal(trails.mesh.instanceMatrix.array[13], -3);
  assert.ok(Math.abs(trails.pixels[0].x - 1.8) < 1e-10);
  assert.equal(trails.pixels[0].y, 0);
  trails.mesh.dispose();
  resources.forEach((resource) => resource.dispose());
});

test("orb trails stay bounded, freeze with zero elapsed time and clear after expiry or restart", () => {
  const resources = [];
  const trails = new OrbTrails((resource) => {
    resources.push(resource);
    return resource;
  });
  for (let frame = 0; frame < 600; frame++) {
    trails.update(
      [0, 1, 2].map((index) => ({
        x: Math.sin(frame / 10 + index),
        y: Math.cos(frame / 10 + index),
      })),
      1 / 120,
    );
  }
  assert.ok(
    trails.mesh.count > 0 &&
      trails.mesh.count <= trails.mesh.instanceMatrix.count,
  );
  assert.equal(
    resources.length,
    2,
    "trail updates reuse geometry and material",
  );
  const paused = [...trails.mesh.instanceMatrix.array];
  trails.update([], 0);
  assert.deepEqual([...trails.mesh.instanceMatrix.array], paused);
  trails.update([], 1);
  assert.equal(trails.mesh.count, 0);
  trails.update([{ x: 1, y: 2 }], 0.01);
  trails.clear();
  assert.equal(trails.mesh.count, 0);
  assert.equal(trails.pixels.length, 0);
  trails.mesh.dispose();
  resources.forEach((resource) => resource.dispose());
});
