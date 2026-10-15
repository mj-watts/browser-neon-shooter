import { test } from "node:test";
import assert from "node:assert/strict";
import GroundDefenses from "../assets/js/GroundDefenses.js";

test("sand carts have four exposed wheels, an open cockpit and a forward gun", () => {
  const resources = [];
  const defenses = new GroundDefenses((resource) => { resources.push(resource); return resource; });
  const cart = defenses.createMesh("cart");
  const wheels = cart.children.filter((child) => child.name.startsWith("wheel-"));
  assert.equal(wheels.length, 4);
  assert.ok(wheels.every((wheel) => Math.abs(wheel.position.x) > 0.5));
  assert.ok(cart.getObjectByName("open-cockpit"));
  assert.ok(cart.getObjectByName("aimed-gun"));
  defenses.animate(cart, { kind: "cart", age: 1, aim: 0 }, false);
  assert.equal(resources.length, 2);
  resources.forEach((resource) => resource.dispose());
});

test("ground machinery clones, aims independently and moves flat tracks without allocating resources", () => {
  const resources = [];
  const defenses = new GroundDefenses((resource) => {
    resources.push(resource);
    return resource;
  });
  const tank = defenses.createMesh("tank");
  const turret = defenses.createMesh("turret");
  defenses.animate(turret, { kind: "turret", aim: 0.8, age: 1 }, false);
  assert.equal(turret.getObjectByName("aimed-gun").rotation.z, 0.8);
  const initial = [...tank.getObjectByName("hull").instanceMatrix.array];
  for (let i = 0; i < 20; i++)
    defenses.animate(tank, { kind: "tank", aim: -0.4, age: i * 0.07 }, false);
  assert.notDeepEqual(
    [...tank.getObjectByName("hull").instanceMatrix.array],
    initial,
  );
  assert.deepEqual(
    [...defenses.templates.tank.getObjectByName("hull").instanceMatrix.array],
    initial,
  );
  assert.equal(resources.length, 2);
  assert.ok(defenses.debris("tank", 0.8).length > 40);
  assert.equal(defenses.geometry.type, "PlaneGeometry");
  for (const mesh of [tank, turret])
    mesh.traverse((child) => {
      if (child.isInstancedMesh) child.dispose();
    });
  resources.forEach((resource) => resource.dispose());
});

test("canyon borders interpolate straight segments with sharp corners", async () => {
  const { canyonWall } = await import(
    "../assets/js/CanyonTerrain.js"
  );
  for (const phase of [-0.9, 0.9, 3.4]) {
    const left = canyonWall(0.5, phase);
    const centre = canyonWall(1, phase);
    const right = canyonWall(1.5, phase);
    assert.ok(Math.abs(centre - (left + right) / 2) < 1e-12);
    const before = canyonWall(2, phase) - canyonWall(1.99, phase);
    const after = canyonWall(2.01, phase) - canyonWall(2, phase);
    assert.ok(Math.abs(before - after) > 1e-8);
  }
});
