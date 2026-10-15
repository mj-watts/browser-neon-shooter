import * as THREE from "three";

// World-space flame fragments linger behind the wreck. GPU resources stay bounded.
export default class ShipFireTrails {
  constructor(track) {
    this.pixels = [];
    this.previous = new Map();
    this.mesh = new THREE.InstancedMesh(
      track(new THREE.PlaneGeometry(1, 1)),
      track(
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.NormalBlending,
        }),
      ),
      768,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.transform = new THREE.Object3D();
    this.hot = new THREE.Color("#ffd05a");
    this.cool = new THREE.Color("#ff3d08");
    this.color = new THREE.Color();
  }

  static animateShip(mesh, ship, reducedMotion) {
    mesh.position.z = 0;
    const progress = Math.min(1, ship.deathAge / 1.4);
    mesh.rotation.z =
      Math.PI + (reducedMotion ? 0 : ship.deathSide * progress * Math.PI * 6);
    mesh.rotation.y = 0;
    mesh.rotation.x = 0;
  }

  update(ships, dt, reducedMotion = false) {
    if (dt <= 0) return;
    const lifetime = reducedMotion ? 0.16 : 0.28;
    this.pixels = this.pixels.filter((pixel) => {
      pixel.age += dt;
      return pixel.age < lifetime;
    });
    const alive = new Set();
    for (const ship of ships) {
      alive.add(ship.id);
      const previous = this.previous.get(ship.id) || ship;
      const distance = Math.hypot(ship.x - previous.x, ship.y - previous.y);
      // Short, separated square embers follow the wreck rather than a glowing ribbon.
      const steps = Math.min(96, Math.max(1, Math.ceil(distance / 0.18)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = previous.x + (ship.x - previous.x) * t;
        const y = previous.y + (ship.y - previous.y) * t;
        for (const lane of reducedMotion ? [0] : [0, i % 2 ? -1 : 1]) {
          this.pixels.push({
            x: x - ship.deathSide * 0.3,
            y: y + lane * 0.18,
            age: dt * (1 - t),
            size: lane === 0 ? 0.36 : 0.18,
          });
        }
      }
      this.previous.set(ship.id, { x: ship.x, y: ship.y });
    }
    for (const id of this.previous.keys())
      if (!alive.has(id)) this.previous.delete(id);
    if (this.pixels.length > 768)
      this.pixels.splice(0, this.pixels.length - 768);
    this.pixels.forEach((pixel, index) => {
      const progress = Math.min(1, pixel.age / lifetime);
      const size = progress < 0.5 ? pixel.size : 0.18;
      this.transform.position.set(
        Math.round(pixel.x / 0.18) * 0.18,
        Math.round((pixel.y - progress * 0.18) / 0.18) * 0.18,
        0.15,
      );
      this.transform.scale.set(size * 0.85, size * 0.85, 1);
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(index, this.transform.matrix);
      this.color
        .copy(this.hot)
        .lerp(this.cool, progress)
        .multiplyScalar(1 - progress);
      this.mesh.setColorAt(index, this.color);
    });
    this.mesh.count = this.pixels.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.pixels = [];
    this.previous.clear();
    this.mesh.count = 0;
  }
}
