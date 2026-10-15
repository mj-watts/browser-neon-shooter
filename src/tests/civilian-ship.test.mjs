import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import CivilianShip from "../assets/js/CivilianShip.js";

test("falling civilian shrinks and darkens without changing surviving civilians or allocating each frame", () => {
  const resources = [];
  const system = new CivilianShip((resource) => {
    resources.push(resource);
    return resource;
  }, new THREE.Texture());
  const wreck = system.createMesh(),
    survivor = system.createMesh();
  const original = survivor.children[0].material.color.clone();
  system.animateCrash(wreck, { fallAge: 0, fallDuration: 4 }, false);
  const count = resources.length;
  system.animateCrash(wreck, { fallAge: 3.5, fallDuration: 4 }, false);
  assert.ok(wreck.scale.x < 0.15);
  assert.ok(wreck.position.z < -15);
  assert.ok(wreck.children[0].material.color.r < original.r * 0.3);
  assert.ok(survivor.children[0].material.color.equals(original));
  assert.equal(resources.length, count);
  assert.equal(wreck.getObjectByName("hazard-1").visible, false);
  resources.forEach((resource) => resource.dispose());
});

test("civilian clones wave, keep steady hazards for reduced motion, and reuse smoke resources", () => {
  const resources = [];
  const glow = new THREE.Texture();
  const system = new CivilianShip((resource) => {
    resources.push(resource);
    return resource;
  }, glow);
  const resourceCount = resources.length;
  const mesh = system.createMesh();
  const civilian = { x: 0, y: 0, age: 0, hit: true, hp: 1 };
  system.animate(mesh, civilian, 0, 0.2, false);
  const arm = mesh.getObjectByName("pilot-wave").rotation.z;
  system.animate(mesh, civilian, 0.3, 0.2, false);
  assert.notEqual(mesh.getObjectByName("pilot-wave").rotation.z, arm);
  for (let i = 0; i < 100; i++) {
    system.animate(mesh, civilian, i / 10, 0.1, false);
    system.update(0.1);
  }
  assert.equal(resources.length, resourceCount);
  assert.equal(system.puffs.length, 16);
  system.animate(mesh, civilian, 12, 0.1, true);
  assert.equal(mesh.getObjectByName("hazard-1").visible, true);
  assert.equal(mesh.getObjectByName("hazard--1").visible, true);
  const second = system.createMesh();
  assert.notEqual(
    second.getObjectByName("pilot-wave"),
    mesh.getObjectByName("pilot-wave"),
  );
  assert.equal(resources.length, resourceCount);
  system.clear();
  assert.ok(
    system.puffs.every((puff) => !puff.sprite.visible && puff.life === 0),
  );
  resources.forEach((resource) => resource.dispose());
  glow.dispose();
});

test("each impact adds block damage and thicker smoke, with hazards only at four hits", () => {
  const resources = [];
  const system = new CivilianShip((resource) => {
    resources.push(resource);
    return resource;
  }, new THREE.Texture());
  const mesh = system.createMesh();
  const survivor = system.createMesh();
  const civilian = { x: 2, y: 3, age: 1, hp: 5 };
  const count = resources.length;
  let lastSize = 0;
  let lastOpacity = 0;
  for (let hits = 0; hits <= 4; hits++) {
    system.clear();
    civilian.hp = 5 - hits;
    system.animate(mesh, civilian, 0.25, 0.2, false);
    let visibleDamage = 0;
    mesh.traverse((child) => {
      if (child.name.startsWith("damage-issue-") && child.visible)
        visibleDamage++;
    });
    assert.equal(visibleDamage, hits);
    assert.equal(mesh.getObjectByName("hazard-1").visible, hits === 4);
    system.update(0.2);
    const puff = system.puffs.find((item) => item.life > 0);
    assert.equal(puff.sprite.geometry.type, "BoxGeometry");
    assert.ok(puff.sprite.scale.x > lastSize);
    assert.ok(puff.sprite.material.opacity > lastOpacity);
    lastSize = puff.sprite.scale.x;
    lastOpacity = puff.sprite.material.opacity;
  }
  system.animate(mesh, civilian, 0.75, 0, false);
  assert.equal(mesh.getObjectByName("hazard-1").visible, false);
  system.animate(mesh, civilian, 0.75, 0, true);
  assert.equal(mesh.getObjectByName("hazard-1").visible, true);
  assert.equal(resources.length, count);
  survivor.traverse((child) => {
    if (child.name.startsWith("damage-issue-"))
      assert.equal(child.visible, false);
  });
  mesh.traverse((child) => assert.equal(child.isSprite, undefined));
  resources.forEach((resource) => resource.dispose());
});


test("healthy civilian pulses with a visible rescue ring and stays steady for reduced motion", () => {
  const resources = [];
  const system = new CivilianShip((resource) => {
    resources.push(resource);
    return resource;
  });
  const mesh = system.createMesh();
  const civilian = { x: 0, y: 0, age: 0, hp: 5 };
  const ring = mesh.getObjectByName("rescue-beacon");
  system.animate(mesh, civilian, 0, 0, false);
  const size = mesh.scale.x;
  const ringSize = ring.scale.x;
  system.animate(mesh, civilian, 0.5, 0, false);
  assert.ok(mesh.scale.x > size);
  assert.ok(ring.visible && ring.scale.x > ringSize);
  system.animate(mesh, civilian, 0, 0, true);
  const steadySize = mesh.scale.x;
  const steadyRingSize = ring.scale.x;
  system.animate(mesh, civilian, 0.5, 0, true);
  assert.equal(mesh.scale.x, steadySize);
  assert.equal(ring.scale.x, steadyRingSize);
  assert.ok(ring.children.length > 20);
  assert.ok(ring.children.every((tile) => tile.geometry.type === "PlaneGeometry"));
  civilian.age = 2.99;
  system.animate(mesh, civilian, 2.99, 0, false);
  assert.equal(ring.visible, true);
  civilian.age = 3;
  system.animate(mesh, civilian, 3, 0, false);
  assert.equal(ring.visible, false);
  civilian.age = 4;
  system.animate(mesh, civilian, 4, 0, true);
  assert.equal(ring.visible, false);
  system.animateCrash(mesh, { fallAge: 0, fallDuration: 4 }, false);
  assert.equal(ring.visible, false);
  resources.forEach((resource) => resource.dispose());
});
