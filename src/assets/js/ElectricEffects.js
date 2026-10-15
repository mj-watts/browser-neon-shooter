import * as THREE from "three";

// Reuse one bounded arc buffer and one pulse ring, including repeated pickups.
export default class ElectricEffects {
  constructor(track) {
    this.group = new THREE.Group();
    const geometry = track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    geometry.setDrawRange(0, 0);
    this.arcs = new THREE.LineSegments(geometry, track(new THREE.LineBasicMaterial({
      color: "#c4b5ff", transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })));
    this.arcs.frustumCulled = false;
    this.ring = new THREE.Mesh(track(new THREE.RingGeometry(0.96, 1, 96)), track(new THREE.MeshBasicMaterial({
      color: "#85f5ff", transparent: true, opacity: 0.65,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })));
    this.group.add(this.arcs, this.ring);
    this.clear();
  }

  lightning(points, reducedMotion = false) {
    const position = this.arcs.geometry.attributes.position;
    let count = 0;
    for (let i = 1; i < Math.min(points.length, 5); i++) {
      const from = points[i - 1], to = points[i];
      const dx = to.x - from.x, dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      let previous = from;
      for (let step = 1; step <= 8; step++) {
        const offset = step === 8 || reducedMotion ? 0 : (step % 2 ? 0.23 : -0.23);
        const next = { x: from.x + dx * step / 8 - dy / length * offset,
          y: from.y + dy * step / 8 + dx / length * offset };
        position.setXYZ(count++, previous.x, previous.y, 2);
        position.setXYZ(count++, next.x, next.y, 2);
        previous = next;
      }
    }
    position.needsUpdate = true;
    this.arcs.geometry.setDrawRange(0, count);
    this.arcAge = 0;
    this.arcs.material.opacity = reducedMotion ? 0.5 : 0.95;
    this.arcs.visible = count > 0;
  }

  pulse(x, y, radius, reducedMotion = false) {
    this.pulseAge = 0;
    this.radius = radius;
    this.reducedMotion = reducedMotion;
    this.ring.position.set(x, y, 2);
    this.ring.scale.setScalar(reducedMotion ? radius : 0.01);
    this.ring.material.opacity = reducedMotion ? 0.2 : 0.65;
    this.ring.visible = true;
  }

  update(dt) {
    this.arcAge += dt;
    this.arcs.visible = this.arcs.visible && this.arcAge < 0.18;
    if (this.ring.visible) {
      this.pulseAge += dt;
      const progress = Math.min(1, this.pulseAge / 0.75);
      if (!this.reducedMotion) this.ring.scale.setScalar(Math.max(0.01, this.radius * progress));
      this.ring.material.opacity = (this.reducedMotion ? 0.2 : 0.65) * (1 - progress);
      this.ring.visible = progress < 1;
    }
  }

  clear() {
    this.arcAge = this.pulseAge = 0;
    this.arcs.visible = this.ring.visible = false;
  }
}
