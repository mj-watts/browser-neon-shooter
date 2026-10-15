import * as THREE from "three";

// Flat pixel machinery: fixed emplacement, tracked hull, independently aimed gun.
export default class GroundDefenses {
  constructor(track) {
    this.geometry = track(new THREE.PlaneGeometry(0.175, 0.175));
    this.material = track(new THREE.MeshBasicMaterial({ color: "white" }));
    this.templates = Object.fromEntries(
      ["turret", "tank", "laserTurret", "cart"].map((kind) => [kind, this.build(kind)]),
    );
  }

  pixels(rows, palette) {
    const blocks = [];
    rows.forEach((row, y) => {
      [...row].forEach((symbol, x) => {
        if (symbol !== ".")
          blocks.push({
            x: (x - (row.length - 1) / 2) * 0.2,
            y: ((rows.length - 1) / 2 - y) * 0.2,
            color: palette[symbol],
            size: 0.175,
          });
      });
    });
    const mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      blocks.length,
    );
    const transform = new THREE.Object3D();
    blocks.forEach((block, index) => {
      transform.position.set(block.x, block.y, 0);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      mesh.setColorAt(index, new THREE.Color(block.color));
    });
    mesh.userData.blocks = blocks;
    return mesh;
  }

  build(kind) {
    if (kind === "cart") return this.buildCart();
    const group = new THREE.Group();
    const tank = kind === "tank";
    const palette = {
      D: "#1d1638",
      B: tank ? "#287b67" : "#504470",
      E: tank ? "#7bf9a5" : kind === "laserTurret" ? "#ff183b" : "#ffa257",
      G: tank ? "#c7ff87" : kind === "laserTurret" ? "#ff6975" : "#ffe098",
      T: "#2c2641",
    };
    // Wide platform / separate dark caterpillar tracks identify ground units.
    const hull = this.pixels(
      tank
        ? [
            "TT.BBB.TT",
            "TEBBBBBET",
            "TTBBBBBTT",
            "TEBGGGBET",
            "TTBBBBBTT",
            "TEBBBBBET",
            "TT.BBB.TT",
          ]
        : [
            "..EEEEE..",
            ".EBBBBBE.",
            "EBBDBDBBE",
            "EBDBBBDBE",
            "EBBBGBBBE",
            "EBDBBBDBE",
            "EBBDBDBBE",
            ".EBBBBBE.",
            "..EEEEE..",
          ],
      palette,
    );
    hull.name = "hull";
    group.add(hull);
    const gun = new THREE.Group();
    gun.name = "aimed-gun";
    gun.position.z = 0.06;
    gun.add(
      this.pixels(
        ["..G..", "..G..", "..E..", ".BBB.", "EBGBE", ".BBB.", "..E.."],
        palette,
      ),
    );
    group.add(gun);
    if (kind === "laserTurret") {
      const effects = new THREE.Group();
      effects.name = "wreck-effects";
      effects.visible = false;
      for (const [name, count] of [
        ["smoke", 12],
        ["embers", 2],
      ]) {
        const tiles = new THREE.InstancedMesh(
          this.geometry,
          this.material,
          count,
        );
        tiles.name = name;
        tiles.frustumCulled = false;
        tiles.position.z = 0.15;
        effects.add(tiles);
      }
      group.add(effects);
    }
    return group;
  }

  buildCart() {
    const group = new THREE.Group();
    const palette = { S: "#d6a45c", H: "#ffe1a0", D: "#463322", T: "#201d21", R: "#72665a", G: "#b7f6ff" };
    const hull = this.pixels([
      "..HHH..", "..SSS..", ".RSSSR.", "..S.S..",
      "..S.S..", ".RSSSR.", "..SSS..", "..HHH..",
    ], palette);
    hull.name = "hull";
    group.add(hull);
    const cockpit = this.pixels(["H...H", "H.D.H", "H.D.H", "HHHHH"], palette);
    cockpit.name = "open-cockpit";
    cockpit.position.z = 0.03;
    group.add(cockpit);
    for (const x of [-0.72, 0.72]) {
      for (const y of [-0.55, 0.55]) {
        const wheel = this.pixels(["TT", "TR", "TT"], palette);
        wheel.name = `wheel-${x}-${y}`;
        wheel.position.set(x, y, 0.01);
        group.add(wheel);
      }
    }
    const gun = new THREE.Group();
    gun.name = "aimed-gun";
    gun.position.set(0, 0.55, 0.07);
    gun.add(this.pixels([".G.", ".G.", ".D.", "SDS"], palette));
    group.add(gun);
    return group;
  }

  createMesh(kind) {
    return this.templates[kind].clone(true);
  }

  animate(mesh, entity, reducedMotion) {
    const gun = mesh.getObjectByName("aimed-gun");
    gun.rotation.z = entity.aim;
    if (entity.destroyed) {
      const transform = new THREE.Object3D();
      if (!mesh.userData.destroyed) {
        mesh.userData.destroyed = true;
        // Keep the complete turret silhouette, including its barrel.
        for (const part of [mesh.getObjectByName("hull"), gun.children[0]]) {
          for (let index = 0; index < part.count; index++)
            part.setColorAt(index, new THREE.Color("#090909"));
          part.instanceColor.needsUpdate = true;
        }
      }
      const effects = mesh.getObjectByName("wreck-effects");
      effects.visible = true;
      for (const name of ["smoke", "embers"]) {
        const tiles = effects.getObjectByName(name);
        for (let index = 0; index < tiles.count; index++) {
          const smoke = name === "smoke";
          const phase =
            ((reducedMotion ? 0.4 : entity.wreckAge * (smoke ? 0.5 : 2)) +
              index / tiles.count) %
            1;
          // Embers sit on the wreck; short flashes replace flying sparks.
          const glowing = reducedMotion || phase < 0.18;
          transform.position.set(
            smoke
              ? Math.sin(index * 1.7 + phase * 3) * (0.2 + phase * 0.4)
              : index === 0
                ? -0.4
                : 0.4,
            smoke ? 0.2 + phase * 2.3 : index === 0 ? 0.2 : -0.4,
            0,
          );
          transform.rotation.z = 0;
          transform.scale.setScalar(smoke ? 1 + phase * 2.3 : glowing ? 1 : 0);
          transform.updateMatrix();
          tiles.setMatrixAt(index, transform.matrix);
          tiles.setColorAt(
            index,
            new THREE.Color(
              smoke ? (index % 2 ? "#49454e" : "#69636b") : "#ff671c",
            ),
          );
        }
        tiles.instanceMatrix.needsUpdate = true;
        tiles.instanceColor.needsUpdate = true;
      }
      return;
    }
    if (entity.kind === "laserTurret") {
      const highlighting = entity.age < (entity.highlightUntil || 0);
      if (highlighting || mesh.userData.highlighting) {
        // Two gentle white/gold pulses; reduced motion keeps a steady highlight.
        const strength = highlighting
          ? reducedMotion
            ? 0.65
            : 0.45 +
              0.45 *
                Math.cos((entity.highlightUntil - entity.age) * Math.PI * 2)
          : 0;
        for (const part of [mesh.getObjectByName("hull"), gun.children[0]]) {
          part.userData.blocks.forEach((block, index) => {
            part.setColorAt(
              index,
              new THREE.Color(block.color).lerp(
                new THREE.Color("#fff3b0"),
                strength,
              ),
            );
          });
          part.instanceColor.needsUpdate = true;
        }
      }
      mesh.userData.highlighting = highlighting;
    }
    // Track pads crawl along the hull rather than spinning the whole tank.
    if (entity.kind === "tank") {
      const hull = mesh.getObjectByName("hull");
      const transform = new THREE.Object3D();
      hull.userData.blocks.forEach((block, index) => {
        const track = Math.abs(block.x) >= 0.6;
        const offset =
          reducedMotion || !track ? 0 : ((entity.age * 1.5) % 0.2) - 0.1;
        transform.position.set(block.x, block.y + offset, 0);
        transform.updateMatrix();
        hull.setMatrixAt(index, transform.matrix);
      });
      hull.instanceMatrix.needsUpdate = true;
    }
  }

  debris(kind, aim) {
    const blocks = [];
    const template = this.templates[kind];
    template
      .getObjectByName("hull")
      .userData.blocks.forEach((block) => blocks.push({ ...block }));
    template
      .getObjectByName("aimed-gun")
      .children[0].userData.blocks.forEach((block) =>
        blocks.push({
          ...block,
          x: block.x * Math.cos(aim) - block.y * Math.sin(aim),
          y: block.x * Math.sin(aim) + block.y * Math.cos(aim),
        }),
      );
    return blocks;
  }
}
