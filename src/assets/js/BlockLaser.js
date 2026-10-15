import * as THREE from "three";
import { WEAPON_STRENGTHS } from "./WeaponStrength.js";

// Fixed-size square tiles preserve the pixel grid as beam length changes.
export default class BlockLaser extends THREE.Group {
  constructor(track) {
    super();
    this.tiles = new THREE.InstancedMesh(
      track(new THREE.BoxGeometry(0.88, 0.88, 0.03)),
      track(
        new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true }),
      ),
      8192,
    );
    this.tiles.count = 0;
    this.tiles.frustumCulled = false;
    this.tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.add(this.tiles);
    this.transform = new THREE.Object3D();
    this.visible = false;
  }

  update(laser) {
    this.visible = !!laser;
    if (!laser) {
      this.tiles.count = 0;
      return;
    }
    const dx = laser.endX - laser.x,
      dy = laser.top - laser.y;
    this.tiles.material.opacity = laser.warning ? 0.45 : 1;
    const length = Math.hypot(dx, dy);
    const width = laser.width || 0.1;
    const columns = Math.max(
      laser.strength === 3 ? 3 : 1,
      Math.round(width / 0.14),
    );
    const cell = width / columns;
    const rows = Math.ceil(length / cell);
    this.position.set(laser.x, laser.y, 0.5);
    this.rotation.z = -Math.atan2(dx, dy);
    const profile = WEAPON_STRENGTHS[laser.strength || 1];
    const edge = new THREE.Color(
      laser.color === "red"
        ? "#ff182e"
        : laser.color === "gold"
          ? "#ffcc00"
          : laser.strength
            ? profile.color
            : "#28eaff",
    ).multiplyScalar(2);
    const centre = new THREE.Color(
      profile.core || profile.color,
    ).multiplyScalar(2);
    this.tiles.material.color.copy(
      laser.strength ? new THREE.Color("white") : edge,
    );
    const tileEdge = laser.strength ? edge : new THREE.Color("white");
    let index = 0;
    for (let row = 0; row < rows && index < 8192; row++) {
      const height = Math.min(cell, length - row * cell);
      for (let column = 0; column < columns && index < 8192; column++) {
        this.transform.position.set(
          (column - (columns - 1) / 2) * cell,
          row * cell + height / 2,
          0,
        );
        this.transform.scale.set(cell, height, 1);
        this.transform.updateMatrix();
        this.tiles.setColorAt(
          index,
          laser.strength === 3 && column > 0 && column < columns - 1
            ? centre
            : tileEdge,
        );
        this.tiles.setMatrixAt(index++, this.transform.matrix);
      }
    }
    this.tiles.count = index;
    this.tiles.instanceMatrix.needsUpdate = true;
    this.tiles.instanceColor.needsUpdate = true;
  }
}
