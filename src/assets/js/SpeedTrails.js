import * as THREE from "three";

// World-space blocks leave three broken ribbons behind the engine and wings.
export default class SpeedTrails {
  constructor(track) {
    this.blocks = [];
    this.accumulator = 0;
    this.mesh = new THREE.InstancedMesh(
      track(new THREE.BoxGeometry(1, 1, 1)),
      track(
        new THREE.MeshBasicMaterial({
          color: "#70dfff",
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
      240,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.transform = new THREE.Object3D();
  }

  update(dt, craft, intensity, reducedMotion = false) {
    if (reducedMotion) {
      this.clear();
      return;
    }
    this.blocks = this.blocks.filter((block) => {
      block.age += dt;
      block.x += block.vx * dt;
      block.y += block.vy * dt;
      return block.age < 0.55;
    });
    if (intensity > 0.01) {
      this.accumulator += dt;
      const interval = 1 / 60;
      const backX = Math.sin(craft.bank),
        backY = -Math.cos(craft.bank);
      while (this.accumulator >= interval) {
        this.accumulator -= interval;
        for (const lane of [-0.65, 0, 0.65]) {
          const age = this.accumulator;
          const speed = 24 + intensity * 12;
          this.blocks.push({
            x:
              craft.x +
              backX * (0.9 + age * speed) +
              Math.cos(craft.bank) * lane,
            y:
              craft.y +
              backY * (0.9 + age * speed) +
              Math.sin(craft.bank) * lane,
            vx: backX * speed,
            vy: backY * speed,
            age,
            bank: craft.bank,
            intensity,
          });
        }
      }
    } else this.accumulator = 0;
    if (this.blocks.length > 240)
      this.blocks.splice(0, this.blocks.length - 240);
    this.blocks.forEach((block, index) => {
      const fade = (1 - block.age / 0.55) * block.intensity;
      this.transform.position.set(block.x, block.y, 0.45);
      this.transform.rotation.z = block.bank;
      this.transform.scale.set(0.12 * fade, 0.38 * fade, 0.1 * fade);
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(index, this.transform.matrix);
    });
    this.mesh.count = this.blocks.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.blocks = [];
    this.accumulator = 0;
    this.mesh.count = 0;
  }
}
