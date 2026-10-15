import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import SpeedTrails from "../assets/js/SpeedTrails.js";

test("warp trails use bounded blocks behind the ship, follow bank and fade after boost", () => {
  const resources = [];
  const trails = new SpeedTrails((resource) => {
    resources.push(resource);
    return resource;
  });
  assert.equal(trails.mesh.geometry.type, "BoxGeometry");
  const craft = { x: 2, y: 5, bank: 0 };
  trails.update(0.05, craft, 1);
  assert.ok(trails.mesh.count > 0);
  assert.ok(trails.blocks.every((block) => block.y < craft.y));
  const firstY = trails.blocks[0].y;
  trails.update(0.05, craft, 1);
  assert.ok(trails.blocks[0].y < firstY);
  for (let i = 0; i < 1000; i++) trails.update(0.05, craft, 1);
  assert.ok(trails.mesh.count <= 240);
  trails.clear();
  trails.update(0.05, { x: 0, y: 0, bank: Math.PI / 2 }, 1);
  assert.ok(trails.blocks.every((block) => block.x > 0));
  for (let i = 0; i < 20; i++) trails.update(0.05, craft, 0);
  assert.equal(trails.mesh.count, 0);
  trails.update(0.05, craft, 1, true);
  assert.equal(trails.mesh.count, 0);
  const matrix = new THREE.Matrix4();
  trails.mesh.getMatrixAt(0, matrix);
  trails.mesh.dispose();
  resources.forEach((resource) => resource.dispose());
});
