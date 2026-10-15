import * as THREE from "three";

export default class CivilianShip {
  constructor(track) {
    this.track = track;
    this.template = new THREE.Group();
    const block = track(new THREE.BoxGeometry(0.18, 0.18, 0.06));
    const rows = [
      "..WWWWW..",
      ".WCCCCCW.",
      "WWCCCCCWW",
      "GWCCCCCWG",
      "GGWWWWWGG",
      "YGGWWWGGY",
      ".GGGWGGG.",
      "..GGWGG..",
      "...W.W...",
    ];
    const colors = { W: "#b3dacd", G: "#44d99d", C: "#153846", Y: "#ffc954" };
    const materials = Object.fromEntries(
      Object.entries(colors).map(([key, color]) => [
        key,
        track(new THREE.MeshBasicMaterial({ color })),
      ]),
    );
    rows.forEach((row, y) =>
      [...row].forEach((symbol, x) => {
        if (symbol === ".") return;
        const mesh = new THREE.Mesh(block, materials[symbol]);
        mesh.position.set((x - 4) * 0.2, (4 - y) * 0.2, 0);
        this.template.add(mesh);
      }),
    );
    const pixel = (parent, x, y, w, h, color) => {
      const mesh = new THREE.Mesh(
        track(new THREE.PlaneGeometry(w, h)),
        track(new THREE.MeshBasicMaterial({ color })),
      );
      mesh.position.set(x, y, 0.13);
      parent.add(mesh);
      return mesh;
    };
    // A visible human pilot: cap, smiling face, suit and a waving raised hand.
    pixel(this.template, 0, 0.36, 0.3, 0.29, "#ffd69d");
    pixel(this.template, 0, 0.52, 0.34, 0.08, "#53e9b4");
    pixel(this.template, -0.065, 0.4, 0.035, 0.04, "#15212f");
    pixel(this.template, 0.065, 0.4, 0.035, 0.04, "#15212f");
    pixel(this.template, 0, 0.28, 0.07, 0.025, "#8c482e");
    pixel(this.template, 0, 0.1, 0.29, 0.22, "#a3e7d4");
    const arm = new THREE.Group();
    arm.name = "pilot-wave";
    arm.position.set(0.2, 0.14, 0.02);
    pixel(arm, 0, 0.13, 0.075, 0.28, "#a3e7d4");
    pixel(arm, 0, 0.3, 0.1, 0.12, "#ffd69d");
    this.template.add(arm);
    for (const side of [-1, 1]) {
      const lamp = new THREE.Group();
      lamp.name = `hazard-${side}`;
      lamp.position.set(side * 0.81, -0.2, 0.06);
      const light = new THREE.Mesh(
        track(new THREE.PlaneGeometry(0.16, 0.13)),
        track(
          new THREE.MeshBasicMaterial({
            color: new THREE.Color("#ffe24a").multiplyScalar(1.6),
          }),
        ),
      );
      lamp.add(light);
      // A stepped, square beacon surround keeps the warning in the voxel style.
      pixel(lamp, -0.12, 0, 0.06, 0.06, "#ff9638");
      pixel(lamp, 0.12, 0, 0.06, 0.06, "#ff9638");
      pixel(lamp, 0, 0.11, 0.06, 0.06, "#ff9638");
      lamp.visible = false;
      this.template.add(lamp);
    }
    // Each accepted impact exposes another charred, jagged patch of hull.
    this.damageSites = [
      [-0.5, -0.25],
      [0.45, -0.48],
      [-0.6, 0.22],
      [0.5, 0.48],
    ];
    this.damageSites.forEach(([x, y], index) => {
      const damage = new THREE.Group();
      damage.name = `damage-issue-${index + 1}`;
      damage.position.set(x, y, 0.06);
      pixel(damage, 0, 0, 0.28, 0.22, "#263039");
      pixel(damage, -0.12, 0.1, 0.12, 0.12, "#473c39");
      pixel(damage, 0.1, -0.1, 0.14, 0.14, "#151d28");
      pixel(damage, -0.04, -0.03, 0.07, 0.07, "#ff852e");
      damage.visible = false;
      this.template.add(damage);
    });
    const beacon = new THREE.Group();
    const beaconPixel = track(new THREE.PlaneGeometry(0.22, 0.22));
    const beaconMaterial = track(new THREE.MeshBasicMaterial({
      color: "#6dffd0",
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }));
    for (let y = -6; y <= 6; y++) {
      for (let x = -6; x <= 6; x++) {
        const radius = Math.hypot(x, y);
        if (radius < 5.5 || radius >= 6.5) continue;
        const tile = new THREE.Mesh(beaconPixel, beaconMaterial);
        tile.position.set(x * 0.22, y * 0.22, 0);
        beacon.add(tile);
      }
    }
    beacon.name = "rescue-beacon";
    beacon.position.z = -0.05;
    this.template.add(beacon);
    this.smoke = new THREE.Group();
    const smokeBlock = track(new THREE.BoxGeometry(1, 1, 1));
    this.puffs = Array.from({ length: 16 }, () => {
      const sprite = new THREE.Mesh(
        smokeBlock,
        track(
          new THREE.MeshBasicMaterial({
            color: "#81788f",
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        ),
      );
      sprite.visible = false;
      this.smoke.add(sprite);
      return { sprite, life: 0, age: 0 };
    });
  }

  createMesh() {
    return this.template.clone(true);
  }

  animateCrash(mesh, civilian, reducedMotion) {
    if (!mesh.userData.crashMaterials) {
      mesh.userData.crashScale = mesh.scale.clone();
      const materials = new Map();
      mesh.traverse((child) => {
        if (!child.material) return;
        const original = child.material;
        if (!materials.has(original)) {
          const material = this.track(original.clone());
          material.userData.crashColor = material.color.clone();
          materials.set(original, material);
        }
        child.material = materials.get(original);
      });
      mesh.userData.crashMaterials = [...materials.values()];
    }
    const progress = Math.min(1, civilian.fallAge / civilian.fallDuration);
    mesh.scale
      .copy(mesh.userData.crashScale)
      .multiplyScalar(Math.exp(-progress * 2.6));
    mesh.position.z = 0.1 - progress * 20;
    mesh.rotation.z =
      (civilian.kind !== undefined ? Math.PI : 0) +
      (reducedMotion ? -0.25 : -0.25 - progress * progress * 2.5);
    for (const material of mesh.userData.crashMaterials) {
      material.color
        .copy(material.userData.crashColor)
        .multiplyScalar(1 - progress * 0.88);
    }
    const rescueBeacon = mesh.getObjectByName("rescue-beacon");
    if (rescueBeacon) rescueBeacon.visible = false;
    // No beacon or waving animation on the falling wreck.
    for (const side of [-1, 1]) {
      const beacon = mesh.getObjectByName(`hazard-${side}`);
      if (beacon) beacon.visible = false;
    }
    const arm = mesh.getObjectByName("pilot-wave");
    if (arm) arm.rotation.z = -0.9;
  }

  animate(mesh, civilian, time, dt, reducedMotion) {
    // A smooth once-per-second pulse makes even an undamaged civilian visible.
    const pulse = reducedMotion ? 0.5 : (1 - Math.cos(time * Math.PI * 2)) / 2;
    mesh.scale.setScalar(1 + pulse * 0.12);
    const beacon = mesh.getObjectByName("rescue-beacon");
    beacon.visible = civilian.age < 3;
    beacon.scale.setScalar(1 + pulse * 0.3);
    const damage = Math.max(0, Math.min(4, 5 - (civilian.hp ?? 5)));
    mesh.rotation.z = Math.sin(civilian.age * 0.65) * 0.04 - damage * 0.045;
    for (let stage = 1; stage <= 4; stage++)
      mesh.getObjectByName(`damage-issue-${stage}`).visible = stage <= damage;
    mesh.getObjectByName("pilot-wave").rotation.z = reducedMotion
      ? -0.4
      : -0.4 + Math.sin(time * 5) * 0.45;
    const lit = damage >= 4 && (reducedMotion || time % 1 < 0.5);
    for (const side of [-1, 1])
      mesh.getObjectByName(`hazard-${side}`).visible = lit;
    mesh.userData.smokeTime = (mesh.userData.smokeTime || 0) + dt;
    const interval = 0.18 - damage * 0.03;
    if (mesh.userData.smokeTime >= interval) {
      mesh.userData.smokeTime = 0;
      const puff =
        this.puffs.find((item) => item.life <= 0) ||
        this.puffs.reduce((oldest, item) =>
          item.age > oldest.age ? item : oldest,
        );
      puff.age = 0;
      puff.life = reducedMotion ? 0.8 : 1.8;
      const site = damage
        ? this.damageSites[(mesh.userData.smokeSite || 0) % damage]
        : [0.3, -0.35];
      mesh.userData.smokeSite = (mesh.userData.smokeSite || 0) + 1;
      // Follow the banked hull so smoke emerges directly from a damaged panel.
      const angle = mesh.rotation.z;
      puff.x =
        civilian.x + site[0] * Math.cos(angle) - site[1] * Math.sin(angle);
      puff.y =
        civilian.y + site[0] * Math.sin(angle) + site[1] * Math.cos(angle);
      puff.size = 0.18 + damage * 0.09;
      puff.opacity = 0.25 + damage * 0.13;
      puff.sprite.material.color.set(damage >= 3 ? "#44434e" : "#81788f");
      puff.vx = 0.3 + Math.random() * 0.35;
      puff.vy = 1.3;
      puff.sprite.visible = true;
    }
  }

  update(dt) {
    for (const puff of this.puffs) {
      if (puff.life <= 0) continue;
      puff.age += dt;
      const t = puff.age / puff.life;
      if (t >= 1) {
        puff.life = 0;
        puff.sprite.visible = false;
        continue;
      }
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      puff.sprite.position.set(puff.x, puff.y, 0.04);
      puff.sprite.scale.setScalar(puff.size + Math.floor(t * 5) * 0.12);
      puff.sprite.material.opacity = Math.sin(t * Math.PI) * puff.opacity;
    }
  }

  clear() {
    for (const puff of this.puffs) {
      puff.life = 0;
      puff.sprite.visible = false;
    }
  }
}
