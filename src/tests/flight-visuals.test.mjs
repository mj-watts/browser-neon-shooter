import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { ShooterGame } from '../assets/js/ShooterGame.js';
import { FLEET_DESIGNS } from '../assets/js/FleetDesigns.js';
const hooks = registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('./') && !specifier.endsWith('.js') ? `${specifier}.js` : specifier, context);
}});
const { default: NeonShooter } = await import('../assets/js/NeonShooter.js');
hooks.deregister();
function renderer() {
  return Object.assign(Object.create(NeonShooter.prototype), {
    glowTexture: new THREE.Texture(), resources: new Set(), entities: new Map(), scene: new THREE.Scene(), projectileScene: new THREE.Scene(),
    model: new ShooterGame(), laserMeshes: [], turretLaserMeshes: [], gateLaserMesh: { update() {} },
    canyon: { uniforms: { horizontal: { value: 0 } } }, viewWidth: 24,
    updateMuzzleFlashes() {}, time: 0, particles: [], debris: [], rings: [], shake: 0, flash: 0,
  });
}
test('missile and powerup bodies have no glow sprites or overbright materials', () => {
  const engine = renderer();
  engine.haloMaterials = { gold: new THREE.SpriteMaterial() };
  for (const mesh of [engine.makeMissile(), engine.makePowerupIcon('speed')]) {
    mesh.traverse(child => {
      assert.equal(Boolean(child.isSprite), false);
      if (child.material?.color) assert.ok(Math.max(...child.material.color.toArray()) <= 1);
    });
  }
});
test('fleet hulls are almost as wide as the hero hull', () => {
  const engine = renderer();
  const hero = engine.makeShip('cyan', 0, true);
  hero.scale.setScalar(0.75);
  const hullWidth = mesh => { mesh.updateMatrixWorld(true); return new THREE.Box3().setFromObject(mesh.children[0]).getSize(new THREE.Vector3()).x; };
  for (const design of Object.values(FLEET_DESIGNS)) {
    const ratio = hullWidth(engine.makeShip(design.color, 0, false, design)) / hullWidth(hero);
    assert.ok(ratio > 0.85 && ratio < 1, `fleet/hero width ${ratio}`);
  }
});
test('missiles rotate their nose along velocity, and pickups have no halos', () => {
  const engine = renderer();
  engine.missileTemplate = new THREE.Group();
  engine.shapes = { star: new THREE.BoxGeometry(), life: new THREE.BoxGeometry() };
  engine.materials = { star: new THREE.MeshBasicMaterial(), life: new THREE.MeshBasicMaterial() };
  engine.haloMaterials = { gold: new THREE.SpriteMaterial(), red: new THREE.SpriteMaterial() };
  engine.model.pickups = [{ id: 2, kind: 'star', x: 0, y: 0 }, { id: 3, kind: 'life', x: 2, y: 0 }];
  for (const [vx, vy] of [[0, 18], [18, 0], [-10, -10], [0, -18]]) {
    engine.model.bullets = [{ id: 1, kind: 'missile', friendly: true, x: 0, y: 0, vx, vy }];
    engine.syncEntities(0.01);
    const nose = new THREE.Vector3(0, 1, 0).applyQuaternion(engine.entities.get('bullet-1').quaternion);
    const velocity = new THREE.Vector3(vx, vy, 0).normalize();
    assert.ok(nose.distanceTo(velocity) < 1e-6);
  }
  for (const id of [2, 3]) assert.equal(engine.entities.get(`pickup-${id}`).children.length, 0);
});
test('crash explosions stay faded throughout their lifetime', () => {
  const engine = renderer();
  engine.ringGeometry = new THREE.BoxGeometry();
  engine.makeParticleSystem();
  engine.event({ type: 'enemyCrash', x: 0, y: 0, size: 0.55 });
  assert.ok(engine.particles.length > 0);
  assert.ok(engine.particles.every(p => p.opacity <= 0.4 && p.z < -20));
  engine.updateParticles(0.01);
  assert.ok(engine.rings.every(r => r.mesh.material.opacity < 0.35 && r.mesh.position.z < -20));
  assert.ok(engine.particleMesh.geometry.attributes.alpha.getX(0) < 0.4);
  assert.equal(engine.shake, 0);
  assert.equal(engine.flash, 0);
});
test('player missiles patrol between waves, ignore offscreen enemies, then acquire a visible target', () => {
  const game = new ShooterGame(() => {}, () => 0.5);
  game.phase = 'intermission'; game.elapsed = -100;
  game.groundCooldown = game.capitalCooldown = game.gateCooldown = game.civilianCooldown = game.supplyCooldown = 100;
  game.update(0.05, { missile: true });
  const missile = game.bullets.find(b => b.kind === 'missile');
  for (let i = 0; i < 160; i++) game.update(0.05);
  assert.ok(game.bullets.includes(missile));
  assert.ok(Math.abs(missile.x) < 12 && Math.abs(missile.y) < 16);
  const target = { id: 999, age: 3.5, kind: 0, x: 100, y: 5, hp: 100, origin: 100, pattern: 0, fireAt: Infinity };
  game.enemies = [target];
  for (let i = 0; i < 8; i++) game.update(0.05);
  assert.ok(Math.abs(missile.vx) < 14, 'offscreen target must not pull a patrol missile away');
  target.x = target.origin = 0; target.y = 5; target.age = 3.5;
  let acquired = false;
  for (let i = 0; i < 120 && game.bullets.includes(missile); i++) {
    game.update(0.05);
    acquired ||= Math.hypot(missile.vx, missile.vy) > 16;
  }
  assert.ok(acquired);
  assert.equal(game.bullets.includes(missile), false);
});

test('background stars are crisp, and every terrain shelf scrolls and stops with time', async () => {
  const { default: CanyonBackground } = await import('../assets/js/CanyonBackground.js');
  const engine = renderer();
  engine.makeBackground();
  assert.equal(engine.stars.material.map, null);
  assert.ok([...engine.stars.geometry.attributes.color.array].every(channel => channel <= 1));
  const canyon = new CanyonBackground(resource => engine.track(resource));
  canyon.resize(48, 32);
  assert.equal(canyon.uniforms.width.value, 48);
  assert.equal(canyon.mesh.scale.y, 32);
  canyon.update(1, 10, 1, 1);
  assert.deepEqual(canyon.uniforms.travel.value.toArray(), [3.5999999999999996, 6.7, 10.8]);
  assert.equal(canyon.mesh.visible, true);
  const travelled = canyon.uniforms.travel.value.clone();
  canyon.update(0, 10, 0, 0);
  assert.deepEqual(canyon.uniforms.travel.value, travelled);
  assert.equal(canyon.mesh.visible, false);
  for (const resource of engine.resources) resource.dispose();
});
