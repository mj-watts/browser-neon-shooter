import * as THREE from "three";

// Square fragments expand together, then drift apart and disappear unevenly.
export default class BlockExplosionRing extends THREE.InstancedMesh {
  constructor(geometry, material) {
    super(geometry, material, 48);
    this.frustumCulled = false;
    this.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.transform = new THREE.Object3D();
    this.fragments = Array.from({ length: 48 }, (_, index) => ({
      angle: (index / 48) * Math.PI * 2,
      drift: 0.1 + Math.random() * 0.3,
      fadeAt: 0.6 + Math.random() * 0.4,
    }));
  }

  update(age, life, size) {
    this.visible = age >= 0;
    const progress = Math.max(0, Math.min(1, age / life));
    const radius = 0.1 + size * (1 - (1 - progress) ** 2);
    const cell = 0.14 + size * 0.018;
    this.fragments.forEach((fragment, index) => {
      const spread = radius + size * fragment.drift * progress ** 2;
      const angle = fragment.angle + fragment.drift * progress * 0.15;
      this.transform.position.set(
        Math.round((Math.cos(angle) * spread) / cell) * cell +
          Math.sin(age * 1.6 + fragment.angle) * progress * 0.12,
        Math.round((Math.sin(angle) * spread) / cell) * cell -
          Math.max(0, age) ** 2 * 0.25,
        0,
      );
      const scale =
        progress < fragment.fadeAt ? cell * (1 - progress * 0.6) : 0;
      this.transform.scale.set(scale, scale, 1);
      this.transform.updateMatrix();
      this.setMatrixAt(index, this.transform.matrix);
    });
    this.material.opacity = (1 - progress) ** 1.3 * 0.8 * (this.userData.opacity ?? 1);
    this.instanceMatrix.needsUpdate = true;
  }
}
