import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import BlockLaser from "../assets/js/BlockLaser.js";
import BlockExplosionRing from "../assets/js/BlockExplosionRing.js";

test("block lasers keep tiles square, follow angled beams and reuse resources", () => {
  const resources = [];
  const laser = new BlockLaser((resource) => {
    resources.push(resource);
    return resource;
  });
  laser.update({ x: 2, y: 3, endX: 2, top: 13, width: 1.2, color: "gold" });
  assert.ok(laser.tiles.count > 100);
  const matrix = new THREE.Matrix4().fromArray(
    laser.tiles.instanceMatrix.array,
  );
  const scale = new THREE.Vector3().setFromMatrixScale(matrix);
  assert.ok(Math.abs(scale.x - scale.y) < 1e-6);
  laser.update({ x: 2, y: 3, endX: 5, top: 13 });
  assert.ok(laser.rotation.z < 0);
  assert.equal(resources.length, 2);
  assert.ok(laser.tiles.count <= laser.tiles.instanceMatrix.count);
  laser.update(null);
  assert.equal(laser.visible, false);
  assert.equal(laser.tiles.count, 0);
  laser.tiles.dispose();
  resources.forEach((resource) => resource.dispose());
});

test("explosion blocks expand, dissipate and vanish by the end of the ring lifetime", () => {
  const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.03);
  const material = new THREE.MeshBasicMaterial({ transparent: true });
  const ring = new BlockExplosionRing(geometry, material);
  ring.update(0.1, 1, 4);
  const startRadius = Math.hypot(
    ring.instanceMatrix.array[12],
    ring.instanceMatrix.array[13],
  );
  const opacity = material.opacity;
  ring.update(0.5, 1, 4);
  assert.ok(
    Math.hypot(ring.instanceMatrix.array[12], ring.instanceMatrix.array[13]) >
      startRadius,
  );
  assert.ok(material.opacity < opacity);
  ring.update(1, 1, 4);
  for (let index = 0; index < 48; index++)
    assert.equal(ring.instanceMatrix.array[index * 16], 0);
  assert.equal(material.opacity, 0);
  ring.dispose();
  geometry.dispose();
  material.dispose();
});

test("explosion fragments drift down gently as they dissipate", () => {
  const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.03);
  const material = new THREE.MeshBasicMaterial({ transparent: true });
  const ring = new BlockExplosionRing(geometry, material);
  ring.fragments.forEach((fragment) => {
    fragment.drift = 0.2;
  });
  const centreY = () =>
    ring.fragments.reduce(
      (sum, _, index) => sum + ring.instanceMatrix.array[index * 16 + 13],
      0,
    ) / 48;
  ring.update(0.2, 1.65, 4);
  const early = centreY();
  ring.update(1.2, 1.65, 4);
  assert.ok(centreY() < early - 0.3);
  assert.ok(material.opacity > 0);
  ring.dispose();
  geometry.dispose();
  material.dispose();
});
