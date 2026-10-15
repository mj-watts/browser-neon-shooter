import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// A continuous engine rumble, eased in and out by the visible hull overlap.
export function capitalRumble(ships, height, reducedMotion) {
  if (reducedMotion) return 0;
  return ships.reduce((strength, ship) => {
    const overlap = THREE.MathUtils.clamp(
      (height / 2 + ship.length / 2 - Math.abs(ship.y)) / (ship.length / 2),
      0,
      1,
    );
    return Math.max(strength, overlap * overlap * (3 - 2 * overlap) * 0.48);
  }, 0);
}

// Dim the lower flight layer so the hero remains visually closer.
const DISTANCE_SHADE = 0.32;

export default class CapitalShip {
  constructor(track) {
    this.template = new THREE.Group();
    const plates = [];
    // Broad stepped armour, glowing edge markers, bridge and central hangar.
    for (let row = 0; row < 48; row++) {
      const y = 11.75 - row * 0.5;
      const half = row < 8 ? 3 + Math.floor(row / 2) : row > 41 ? 10 : 13;
      for (let col = -half; col <= half; col++) {
        const edge = Math.abs(col) === half;
        const spine = Math.abs(col) <= 2;
        const hangar = row > 14 && row < 31 && Math.abs(col) < 5;
        const bridge = row > 5 && row < 10 && Math.abs(col) < 3;
        const engine = row > 43 && (Math.abs(col) < 3 || Math.abs(col) > 7);
        const color = engine
          ? "#ff853d"
          : bridge
            ? "#8ac9ce"
            : edge && row % 4 === 0
              ? "#d67849"
              : hangar
                ? "#171629"
                : spine
                  ? "#67627a"
                  : edge
                    ? "#7b7289"
                    : row % 6 === 0 || col % 6 === 0
                      ? "#343044"
                      : "#4b475c";
        const plate = new THREE.BoxGeometry(0.47, 0.47, spine ? 0.2 : 0.1);
        plate.translate(col * 0.5, y, spine ? 0.12 : 0);
        const rgb = new THREE.Color(color);
        const colors = new Float32Array(plate.attributes.position.count * 3);
        for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
        plate.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        plates.push(plate);
      }
    }
    const geometry = track(mergeGeometries(plates));
    plates.forEach((plate) => plate.dispose());
    geometry.computeBoundingBox();
    const hull = new THREE.Mesh(
      geometry,
      track(
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          color: new THREE.Color("white").multiplyScalar(DISTANCE_SHADE),
        }),
      ),
    );
    hull.name = "hull";
    this.template.add(hull);
    const shadow = new THREE.Mesh(
      geometry,
      track(
        new THREE.MeshBasicMaterial({
          color: "#050312",
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        }),
      ),
    );
    shadow.name = "shadow";
    shadow.position.set(0.35, -0.45, -0.35);
    shadow.scale.set(1.06, 1.03, 1);
    this.template.add(shadow);
    const metal = track(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#93899f").multiplyScalar(DISTANCE_SHADE),
      }),
    );
    const dark = track(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#282438").multiplyScalar(DISTANCE_SHADE),
      }),
    );
    const light = track(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#ffe099").multiplyScalar(0.55),
        toneMapped: false,
      }),
    );
    this.wreckMaterial = track(
      new THREE.MeshBasicMaterial({ color: "#090909" }),
    );
    const smokeGeometry = track(new THREE.PlaneGeometry(0.3, 0.3));
    const smokeMaterial = track(
      new THREE.MeshBasicMaterial({ color: "white", depthWrite: false }),
    );
    this.smokeTransform = new THREE.Object3D();
    const baseGeometry = track(new THREE.BoxGeometry(1.35, 1.25, 0.15));
    const barrelGeometry = track(new THREE.BoxGeometry(0.2, 1.2, 0.12));
    const flashGeometry = track(new THREE.PlaneGeometry(0.55, 0.75));
    for (let i = 0; i < 6; i++) {
      const gun = new THREE.Group();
      gun.name = `turret-${i}`;
      gun.position.z = 0.4;
      gun.add(new THREE.Mesh(baseGeometry, dark));
      for (const side of [-1, 1]) {
        const barrel = new THREE.Mesh(barrelGeometry, metal);
        barrel.position.set(side * 0.3, 0.5, 0.1);
        gun.add(barrel);
      }
      const flash = new THREE.Mesh(flashGeometry, light);
      flash.name = "muzzle";
      flash.position.set(0, 1.25, 0.12);
      flash.visible = false;
      gun.add(flash);
      const smoke = new THREE.InstancedMesh(smokeGeometry, smokeMaterial, 10);
      smoke.name = "smoke";
      smoke.visible = false;
      smoke.frustumCulled = false;
      smoke.position.z = 0.3;
      for (let index = 0; index < smoke.count; index++)
        smoke.setColorAt(
          index,
          new THREE.Color(index % 2 ? "#49454e" : "#69636b"),
        );
      gun.add(smoke);
      this.template.add(gun);
    }
  }

  createMesh() {
    return this.template.clone(true);
  }

  animate(mesh, ship, reducedMotion) {
    mesh.getObjectByName("hull").scale.x = ship.width / 14;
    mesh.getObjectByName("shadow").scale.x = (ship.width / 14) * 1.06;
    ship.turrets.forEach((turret, index) => {
      const gun = mesh.getObjectByName(`turret-${index}`);
      gun.position.set(turret.x, turret.y, 0.4);
      gun.rotation.z = turret.aim;
      gun.getObjectByName("muzzle").visible =
        !turret.destroyed && !reducedMotion && turret.flashUntil > ship.age;
      const smoke = gun.getObjectByName("smoke");
      smoke.visible = !!turret.destroyed;
      if (!turret.destroyed) return;
      for (const part of gun.children)
        if (part.isMesh && part.name !== "muzzle" && part.name !== "smoke")
          part.material = this.wreckMaterial;
      // Smoke rises along the deck regardless of the frozen gun's aim.
      smoke.rotation.z = -turret.aim;
      for (let index = 0; index < smoke.count; index++) {
        const phase =
          ((reducedMotion ? 0.4 : turret.wreckAge * 0.5) +
            index / smoke.count) %
          1;
        const transform = this.smokeTransform;
        transform.position.set(
          Math.sin(index * 1.7 + phase * 3) * (0.2 + phase * 0.4),
          0.2 + phase * 2.3,
          0,
        );
        transform.scale.setScalar(1 + phase * 2.3);
        transform.updateMatrix();
        smoke.setMatrixAt(index, transform.matrix);
      }
      smoke.instanceMatrix.needsUpdate = true;
    });
  }
}
