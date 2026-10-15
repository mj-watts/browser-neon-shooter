import * as THREE from "three";

// A fixed pool of small yellow cores, tapered tips and soft halos.
export default class MuzzleFlashes {
  constructor(track, glowTexture) {
    this.group = new THREE.Group();
    const circle = track(new THREE.CircleGeometry(0.14, 16));
    const tip = new THREE.Shape();
    tip.moveTo(-0.1, 0.05);
    tip.lineTo(0, 0.48);
    tip.lineTo(0.1, 0.05);
    tip.closePath();
    const triangle = track(new THREE.ShapeGeometry(tip));
    this.flashes = Array.from({ length: 6 }, () => {
      const flash = new THREE.Group();
      const material = track(
        new THREE.MeshBasicMaterial({
          color: "#ffe078",
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      flash.add(
        new THREE.Mesh(circle, material),
        new THREE.Mesh(triangle, material),
      );
      const halo = new THREE.Sprite(
        track(
          new THREE.SpriteMaterial({
            map: glowTexture,
            color: "#ffd34d",
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        ),
      );
      halo.scale.set(0.8, 0.8, 1);
      halo.position.z = -0.01;
      flash.add(halo);
      flash.visible = false;
      this.group.add(flash);
      return flash;
    });
  }

  update(muzzles) {
    this.flashes.forEach((flash, index) => {
      const muzzle = muzzles[index];
      flash.visible = !!muzzle;
      if (!muzzle) return;
      flash.position.set(muzzle.x, muzzle.y, 2);
      flash.rotation.z = muzzle.angle || 0;
      flash.scale.set(muzzle.width || 1, muzzle.height || 1, 1);
      const opacity = muzzle.opacity ?? 1;
      flash.children[0].material.opacity = opacity;
      flash.children[2].material.opacity = opacity * 0.3;
    });
  }

  clear() {
    this.update([]);
  }
}
