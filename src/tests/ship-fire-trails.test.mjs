import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import ShipFireTrails from "../assets/js/ShipFireTrails.js";

test("burning trail fills fast movement gaps, stays in world space and expires", () => {
  const resources = [];
  const trails = new ShipFireTrails((resource) => {
    resources.push(resource);
    return resource;
  });
  const ship = { id: 1, x: 0, y: 0, deathAge: 0, deathSide: 1 };
  trails.update([ship], 0.02);
  ship.x = 8;
  trails.update([ship], 0.05);
  assert.ok(trails.pixels.some((pixel) => pixel.x > 2 && pixel.x < 6));
  const oldX = trails.pixels[0].x;
  ship.x = 12;
  trails.update([ship], 0.02);
  assert.equal(trails.pixels[0].x, oldX);
  const frozen = [...trails.mesh.instanceMatrix.array];
  trails.update([ship], 0);
  assert.deepEqual([...trails.mesh.instanceMatrix.array], frozen);
  for (let i = 0; i < 300; i++) {
    ship.x += 2;
    trails.update([ship], 0.01);
  }
  assert.ok(trails.mesh.count <= trails.mesh.instanceMatrix.count);
  assert.equal(resources.length, 2);
  assert.equal(trails.mesh.material.blending, THREE.NormalBlending);
  for (let i = 0; i < trails.mesh.count; i++) {
    const offset = i * 16;
    const matrix = trails.mesh.instanceMatrix.array;
    assert.ok(Math.abs(matrix[offset] - matrix[offset + 5]) < 1e-6);
    assert.ok(
      Math.abs(
        matrix[offset + 12] / 0.18 - Math.round(matrix[offset + 12] / 0.18),
      ) < 0.001,
    );
  }
  trails.update([], 1);
  assert.equal(trails.mesh.count, 0);
  trails.update([ship], 0.01, true);
  assert.ok(trails.mesh.count > 0);
  trails.clear();
  assert.equal(trails.mesh.count, 0);
  assert.equal(trails.previous.size, 0);
  trails.mesh.dispose();
  resources.forEach((resource) => resource.dispose());
});

test("dying hull spins flat a few times at full size and stays steady with reduced motion", () => {
  const mesh = new THREE.Group();
  mesh.scale.setScalar(1.4);
  const ship = { deathAge: 0.5, deathSide: -1 };
  ShipFireTrails.animateShip(mesh, ship, false);
  assert.equal(mesh.rotation.y, 0);
  assert.equal(mesh.rotation.x, 0);
  const firstSpin = mesh.rotation.z;
  ship.deathAge = 1.4;
  ShipFireTrails.animateShip(mesh, ship, false);
  assert.ok(Math.abs(mesh.rotation.z - Math.PI) >= Math.PI * 6 - 1e-9);
  assert.notEqual(mesh.rotation.z, firstSpin);
  assert.equal(mesh.scale.x, 1.4);
  assert.equal(mesh.position.z, 0);
  ShipFireTrails.animateShip(mesh, ship, true);
  const angle = mesh.rotation.z;
  ship.deathAge = 0.9;
  ShipFireTrails.animateShip(mesh, ship, true);
  assert.equal(mesh.rotation.z, angle);
  assert.equal(mesh.rotation.y, 0);
});
