import * as THREE from "three";

// Reuse a bounded set of square trail pixels instead of allocating new meshes.
export default class OrbTrails {
  constructor(track) {
    this.pixels = [];
    this.mesh = new THREE.InstancedMesh(
      track(new THREE.PlaneGeometry(1, 1)),
      track(
        new THREE.MeshBasicMaterial({
          color: "#54ffb5",
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
      96,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.transform = new THREE.Object3D();
  }

  update(orbs, dt, reducedMotion = false, craft = { x: 0, y: 0 }) {
    const lifetime = reducedMotion ? 0.12 : 0.35;
    this.pixels = this.pixels.filter((pixel) => {
      pixel.age += dt;
      return pixel.age < lifetime;
    });
    if (dt > 0)
      for (const orb of orbs) {
        // Store orbit offsets, so past pixels remain attached to the moving craft.
        this.pixels.push({ x: orb.x - craft.x, y: orb.y - craft.y, age: 0 });
      }
    if (this.pixels.length > 96) this.pixels.splice(0, this.pixels.length - 96);
    this.pixels.forEach((pixel, index) => {
      const size = 0.22 * (1 - pixel.age / lifetime);
      this.transform.position.set(craft.x + pixel.x, craft.y + pixel.y, 0.05);
      this.transform.scale.set(size, size, 1);
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(index, this.transform.matrix);
    });
    this.mesh.count = this.pixels.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.pixels = [];
    this.mesh.count = 0;
  }
}
