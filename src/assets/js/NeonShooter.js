import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ShooterGame, advanceSimulation } from "./ShooterGame";
import { POWER_ICONS, STAR_ICON } from "./BlockIcons";
import { POWERUPS } from "./Powerups";
import CanyonBackground from "./CanyonBackground";
import CivilianShip from "./CivilianShip";
import GroundDefenses from "./GroundDefenses";
import CapitalShip, { capitalRumble } from "./CapitalShip";
import MuzzleFlashes from "./MuzzleFlashes";
import OrbTrails from "./OrbTrails";
import SpeedTrails from "./SpeedTrails.js";
import ElectricEffects from "./ElectricEffects.js";
import ShipFireTrails from "./ShipFireTrails";
import BlockLaser from "./BlockLaser";
import { createBulletTemplates } from "./WeaponStrength.js";
import BlockExplosionRing from "./BlockExplosionRing";
import { FLEET_DESIGNS } from "./FleetDesigns.js";

const COLORS = {
  blue: "#289dff",
  cyan: "#28eaff",
  mint: "#54ffb5",
  red: "#ff2020",
  pink: "#ff27cc",
  orange: "#ff803b",
  gold: "#ffe569",
  violet: "#8855ff",
};
const clamp = THREE.MathUtils.clamp;
const MAX_PARTICLES = 2400;
const BLOOM_STRENGTH = 0.55;
const REDUCED_BLOOM_STRENGTH = 0.35;

export default class NeonShooter {
  constructor(canvas, { onState, onError, onEvent, reducedMotion = false }) {
    this.canvas = canvas;
    this.onState = onState;
    this.onError = onError;
    this.onEvent = onEvent;
    this.reducedMotion = reducedMotion;
    this.resources = new Set();
    this.entities = new Map();
    this.particles = [];
    this.debris = [];
    this.rings = [];
    this.callouts = [];
    this.calloutSerial = 0;
    this.time = 0;
    this.progress = 0;
    this.mode = "transition";
    this.input = {};
    this.flash = 0;
    this.shake = 0;
    this.disposed = false;
    this.model = new ShooterGame((event) => this.event(event));
    this.model.scenerySpeed = reducedMotion ? 3.6 : 8;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        powerPreference: "high-performance",
      });
      this.contextLost = (event) => {
        event.preventDefault();
        this.onError?.();
        this.dispose();
      };
      canvas.addEventListener("webglcontextlost", this.contextLost);
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
      this.renderer.setClearColor(0x080318, 1);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.95;
      this.scene = new THREE.Scene();
      this.projectileScene = new THREE.Scene();
      this.camera = new THREE.OrthographicCamera(-12, 12, 16, -16, 0.1, 100);
      this.camera.position.z = 40;
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(
        new THREE.Vector2(800, 1000),
        reducedMotion ? REDUCED_BLOOM_STRENGTH : BLOOM_STRENGTH,
        0.12,
        0.95,
      );
      this.composer.addPass(this.bloom);
      // Tiny highlights become blocky in the coarse bloom mips. Render their
      // own radial halos after bloom; solid hulls and pickups stay below its threshold.
      const projectilePass = new RenderPass(this.projectileScene, this.camera);
      projectilePass.clear = false;
      this.composer.addPass(projectilePass);
      this.composer.addPass(new OutputPass());
      this.glowTexture = this.makeGlowTexture();
      this.civilianShips = new CivilianShip(
        (resource) => this.track(resource),
        this.glowTexture,
      );
      this.scene.add(this.civilianShips.smoke);
      this.shipFireTrails = new ShipFireTrails((resource) =>
        this.track(resource),
      );
      this.projectileScene.add(this.shipFireTrails.mesh);
      this.groundDefenses = new GroundDefenses((resource) =>
        this.track(resource),
      );
      this.capitalShip = new CapitalShip((resource) => this.track(resource));
      this.makeShotTrails();
      this.electricEffects = new ElectricEffects((resource) => this.track(resource));
      this.projectileScene.add(this.electricEffects.group);
      this.makeBackground();
      this.canyon = new CanyonBackground((resource) => this.track(resource));
      this.scene.add(this.canyon.mesh);
      this.makeParticleSystem();
      this.makeDebrisSystem();
      this.player = this.makeShip("cyan", 0, true);
      this.player.scale.setScalar(0.75);
      this.fleetTemplates = Object.fromEntries(
        Object.entries(FLEET_DESIGNS).map(([side, design]) => {
          const ship = this.makeShip(design.color, 0, false, design);
          return [side, ship];
        }),
      );
      this.scene.add(this.player);
      this.enemyTemplates = [0, 1, 2].map((kind) =>
        this.makeShip(kind === 1 ? "orange" : "pink", kind),
      );
      this.heavyTemplate = this.makeShip("gold", 2);
      this.heavyTemplate.scale.multiplyScalar(1.4);
      this.shapes = {
        friendly: this.makeBlockGeometry(["X", "X", "X", "X"], 0.12, 0.09),
        hostile: this.track(new THREE.BoxGeometry(0.22, 0.22, 0.22)),
        bomb: this.track(new THREE.SphereGeometry(0.22, 12, 8)),
        star: this.makeStarGeometry(),
        life: this.makeBlockGeometry(
          [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."],
          0.15,
          0.18,
        ),
      };
      this.materials = {
        friendly: this.material("cyan", 2.2),
        hostile: this.material("pink", 1.9),
        star: this.material("gold", 0.95),
        life: this.material("red", 0.95),
        bomb: this.material("orange", 2.2),
        shrapnel: this.material("orange", 2),
      };
      this.bulletTemplates = createBulletTemplates(
        this.shapes.friendly,
        (resource) => this.track(resource),
      );
      this.haloMaterials = Object.fromEntries(
        ["blue", "cyan", "pink", "gold", "mint", "red", "orange", "violet"].map(
          (color) => [
            color,
            this.track(
              new THREE.SpriteMaterial({
                map: this.glowTexture,
                color: COLORS[color],
                opacity: 0.38,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
              }),
            ),
          ],
        ),
      );
      this.powerTemplates = Object.fromEntries(
        Object.keys(POWERUPS).map((power) => [
          power,
          this.makePowerupIcon(power),
        ]),
      );
      this.missileTemplate = this.makeMissile();
      this.missilePods = new THREE.Group();
      for (const side of [-1, 1]) {
        const pod = this.missileTemplate.clone(true);
        pod.position.set(side * 1.1, -0.05, 0.35);
        pod.scale.setScalar(1.25);
        this.missilePods.add(pod);
      }
      this.missilePods.visible = false;
      this.player.add(this.missilePods);
      this.makeUpgradeEffects();
      this.ringGeometry = this.track(new THREE.BoxGeometry(0.9, 0.9, 0.03));
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
      this.resize();
      this.visible = true;
      this.lastTime = performance.now();
      this.frame = requestAnimationFrame((now) => this.animate(now));
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  track(resource) {
    this.resources.add(resource);
    return resource;
  }

  material(name, intensity = 2) {
    return this.track(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(COLORS[name] || name).multiplyScalar(intensity),
      }),
    );
  }

  tubes(paths, color, radius = 0.055) {
    const geometries = paths.map((points) => {
      const curve = new THREE.CatmullRomCurve3(
        points.map(([x, y, z = 0.38]) => new THREE.Vector3(x, y, z)),
        false,
        "centripetal",
        0.1,
      );
      return new THREE.TubeGeometry(curve, points.length * 5, radius, 5, false);
    });
    const geometry = this.track(mergeGeometries(geometries));
    geometries.forEach((item) => item.dispose());
    return new THREE.Mesh(geometry, this.material(color, 1.8));
  }

  makeShip(color, kind = 0, player = false, design = null) {
    // Blue/violet swept wings and an amber core, built entirely from individual blocks.
    const hero = [
      "....B...B....",
      "...BBBBBBB...",
      "...VBBGBBV...",
      "..CVBBGBBVC..",
      ".CVVBGGGBVVC.",
      "CVVPPGGGPPVVC",
      "CVVPBBBBBPVVC",
      "CVVP.BBB.PVVC",
      "CVV..PBP..VVC",
      "CV...P.P...VC",
      "C...........C",
    ];
    const enemies = [
      [
        "....P....",
        "...PPP...",
        ".PPPPPPP.",
        "PPVPVPVPP",
        "PP.PPP.PP",
        "P...P...P",
      ],
      [
        "OO.....OO",
        "OOO...OOO",
        ".OOVVVOO.",
        "..OOGOO..",
        ".OOVVVOO.",
        "OO.....OO",
      ],
      [
        "..PPPPP..",
        ".PPVVVPP.",
        "PPVPGPVPP",
        "PPVVVVVPP",
        ".PP...PP.",
        "..P...P..",
      ],
    ];
    const rows = design?.rows ?? (player ? hero : enemies[kind]);
    const cell = player || design ? 0.26 : 0.29;
    const palette = {
      B: "#293ecb",
      V: "#8138cd",
      P: player ? "#ed35d7" : COLORS[color],
      C: "#32d8ef",
      G: "#ffbf32",
      O: "#fa7437",
      ...design?.palette,
    };
    const blocks = [];
    rows.forEach((row, r) =>
      [...row].forEach((symbol, c) => {
        if (symbol === ".") return;
        blocks.push({
          x: (c - (row.length - 1) / 2) * cell,
          y: ((rows.length - 1) / 2 - r) * cell,
          z: symbol === "G" ? 0.16 : symbol === "B" ? 0.08 : 0,
          color: palette[symbol],
          size: cell * 0.9,
          symbol,
        });
      }),
    );
    const group = new THREE.Group();
    const geometry = this.track(
      new THREE.BoxGeometry(cell * 0.88, cell * 0.88, cell * 0.72),
    );
    const material = this.track(
      new THREE.MeshBasicMaterial({ color: "#ffffff" }),
    );
    const cubes = new THREE.InstancedMesh(geometry, material, blocks.length);
    const transform = new THREE.Object3D();
    const edgeParts = [];
    const edge = new THREE.EdgesGeometry(geometry);
    blocks.forEach((block, index) => {
      transform.position.set(block.x, block.y, block.z);
      transform.updateMatrix();
      cubes.setMatrixAt(index, transform.matrix);
      cubes.setColorAt(
        index,
        new THREE.Color(block.color).multiplyScalar(0.95),
      );
      edgeParts.push(edge.clone().translate(block.x, block.y, block.z));
    });
    group.add(cubes);
    const edges = this.track(mergeGeometries(edgeParts));
    edge.dispose();
    edgeParts.forEach((part) => part.dispose());
    group.add(
      new THREE.LineSegments(
        edges,
        this.track(
          new THREE.LineBasicMaterial({
            color: player ? "#58c9ff" : COLORS[color],
            transparent: true,
            opacity: 0.65,
          }),
        ),
      ),
    );
    // Match each escort hull to 90% of the hero's width despite different silhouettes.
    const hullWidth = Math.max(...rows.map((row) => row.length)) - 0.12;
    group.scale.setScalar(
      design ? (0.75 * 0.9 * (hero[0].length - 0.12)) / hullWidth
        : player ? 0.62 : 0.52,
    );
    group.rotation.x = 0.16;
    group.userData.blocks = blocks;
    if (design) {
      const exhaustMaterial = this.track(
        new THREE.SpriteMaterial({
          map: this.glowTexture,
          color: COLORS[color],
          opacity: 0.6,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      for (const engine of design.engines) {
        const exhaust = new THREE.Sprite(exhaustMaterial);
        exhaust.position.set(
          engine * cell,
          (-rows.length * cell) / 2 - 0.35,
          -0.12,
        );
        exhaust.scale.set(0.38, 1.3, 1);
        group.add(exhaust);
      }
    }
    if (player) {
      this.flameMaterial = this.track(
        new THREE.ShaderMaterial({
          uniforms: {
            time: { value: 0 },
            boost: { value: 0 },
            drift: { value: new THREE.Vector2() },
          },
          vertexShader: `varying vec2 vUv; uniform vec2 drift;
            void main(){vUv=uv;vec3 p=position;p.xy+=drift*pow(1.-uv.y,2.);
            gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
          fragmentShader: `varying vec2 vUv; uniform float time; uniform float boost;
          void main(){
            float x=(vUv.x-.5)*2., y=vUv.y, tail=1.-y;
            float core=exp(-x*x/(.003+y*.028))*pow(y,1.8);
            float sheath=exp(-x*x/(.012+.12*sin(tail*3.14159)))*pow(y,.8)*.45;
            float wisps=0.;
            for(int i=0;i<5;i++){
              float lane=float(i)-2.;
              float bend=lane*(.018+tail*.14)+sin(tail*(18.+float(i)*3.)-time*(5.+float(i)))*tail*.065;
              float width=.009+y*.008;
              wisps+=exp(-pow((x-bend)/width,2.))*pow(y,.75)*.55;
            }
            float diamonds=pow(max(0.,sin(tail*42.-time*12.)),10.)*core*.35;
            vec3 cool=mix(vec3(.28,.05,1.),vec3(.12,.9,1.),pow(y,2.));
            vec3 hot=mix(vec3(1.,.25,.015),vec3(1.,.95,.2),y);
            vec3 color=mix(cool,hot,boost);
            vec3 rgb=color*(sheath+wisps*1.4+diamonds)+mix(vec3(.7,.95,1.),vec3(1.,1.,.65),boost)*core*2.;
            float fade=smoothstep(0.,.12,y)*(1.-smoothstep(.88,1.,abs(x)));
            float alpha=clamp(core*.9+sheath*.8+wisps*.55,0.,1.)*fade;
            gl_FragColor=vec4(rgb*(1.3+boost*.5),alpha);
          }`,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const flame = new THREE.Mesh(
        this.track(new THREE.PlaneGeometry(1.6, 6.2)),
        this.flameMaterial,
      );
      flame.position.set(0, -4, -0.12);
      this.flame = flame;
      this.thrust = 0;
      group.add(flame);
      // Crisp flowing ribbons sit above bloom so the individual energy layers
      // remain readable around the white-hot plume instead of merging into it.
      this.exhaustRibbons = new THREE.Mesh(
        this.track(new THREE.PlaneGeometry(1.6, 6.2)),
        this.track(
          new THREE.ShaderMaterial({
            uniforms: this.flameMaterial.uniforms,
            vertexShader: this.flameMaterial.vertexShader,
            fragmentShader: `varying vec2 vUv; uniform float time; uniform float boost;
            void main(){float x=(vUv.x-.5)*2., y=vUv.y, tail=1.-y;
              vec3 rgb=vec3(0.);float alpha=0.;
              for(int i=0;i<5;i++){
                float lane=float(i)-2.;
                float bend=lane*(.025+tail*.22)+sin(tail*(20.+float(i)*2.)-time*(4.+float(i)))*tail*.075;
                float line=exp(-pow((x-bend)/(.008+y*.007),2.))*pow(y,.6)*smoothstep(0.,.12,y);
                vec3 cool=mix(vec3(.65,.08,1.),vec3(.08,.8,1.),.5+.5*sin(float(i)*1.8));
                vec3 hot=mix(vec3(1.,.35,.025),vec3(1.,.9,.25),y);
                rgb+=mix(cool,hot,boost)*line*1.7;
                alpha+=line*.7;
              }
              gl_FragColor=vec4(rgb,clamp(alpha,0.,1.));
            }`,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        ),
      );
      this.exhaustRibbons.matrixAutoUpdate = false;
      this.exhaustRibbons.visible = false;
      this.projectileScene.add(this.exhaustRibbons);
      // Overlapping soft aura, hot nozzle and white core add depth to the plume.
      this.engineGlows = [
        ["#783fff", "#ff8e24", 2.5, 2.8, 0.28],
        ["#3eeeff", "#fff160", 1.0, 1.6, 0.45],
        ["#e5ffff", "#fffbd1", 0.35, 0.65, 0.7],
      ].map(([cool, hot, width, height, opacity]) => {
        const material = this.track(
          new THREE.SpriteMaterial({
            map: this.glowTexture,
            color: cool,
            opacity,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const sprite = new THREE.Sprite(material);
        sprite.position.set(0, -0.98, -0.08);
        sprite.scale.set(width, height, 1);
        group.add(sprite);
        return {
          sprite,
          width,
          height,
          opacity,
          cool: new THREE.Color(cool),
          hot: new THREE.Color(hot),
        };
      });
    }
    return group;
  }

  makeDebrisSystem() {
    const geometry = this.track(new THREE.PlaneGeometry(1, 1));
    this.debrisMesh = new THREE.InstancedMesh(
      geometry,
      this.track(
        new THREE.MeshBasicMaterial({
          color: "#ffffff",
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
      1100,
    );
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.count = 0;
    this.debrisMesh.frustumCulled = false;
    this.projectileScene.add(this.debrisMesh);
    this.debrisTransform = new THREE.Object3D();
    this.debrisColor = new THREE.Color();
  }

  scatterShip(event, hero = false, fraction = 1) {
    const ship = hero
      ? this.player
      : event.heavy
        ? this.heavyTemplate
        : this.enemyTemplates[event.kind || 0];
    const angle = hero
      ? this.player.rotation.z
      : (this.entities.get(`enemy-${event.enemyId}`)?.rotation.z ?? Math.PI);
    const scale = ship.scale.x;
    for (const block of ship.userData.blocks) {
      if (Math.random() > fraction) continue;
      const x = (block.x * Math.cos(angle) - block.y * Math.sin(angle)) * scale;
      const y = (block.x * Math.sin(angle) + block.y * Math.cos(angle)) * scale;
      const direction = Math.atan2(y, x) + (Math.random() - 0.5) * 0.8;
      const speed =
        (3 + Math.random() * 7) *
        (event.heavy ? 1.5 : 1) *
        (this.reducedMotion ? 0.4 : 1);
      this.debris.push({
        x: event.x + x,
        y: event.y + y,
        vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed,
        color: new THREE.Color(block.color),
        size: block.size * scale,
        life: (event.heavy ? 2.6 : 1.8) + Math.random() * 0.6,
      });
    }
    if (this.debris.length > 1100)
      this.debris.splice(0, this.debris.length - 1100);
  }

  updateDebris(dt) {
    this.debris = this.debris.filter((block) => block.life > 0);
    this.debris.forEach((block, index) => {
      block.life -= dt;
      block.x += block.vx * dt;
      block.y += block.vy * dt;
      block.vx *= Math.exp(-dt * 1.2);
      block.vy *= Math.exp(-dt * 1.2);
      const fade = Math.min(1, Math.max(0, block.life) / 1.1);
      this.debrisTransform.position.set(block.x, block.y, 0.4);
      this.debrisTransform.rotation.set(0, 0, 0);
      this.debrisTransform.scale.set(block.size, block.size, 1);
      this.debrisTransform.updateMatrix();
      this.debrisMesh.setMatrixAt(index, this.debrisTransform.matrix);
      this.debrisColor.copy(block.color).multiplyScalar(fade * fade * 0.95);
      this.debrisMesh.setColorAt(index, this.debrisColor);
    });
    this.debrisMesh.count = this.debris.length;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (this.debrisMesh.instanceColor)
      this.debrisMesh.instanceColor.needsUpdate = true;
  }

  makeBlockGeometry(rows, cell, depth = cell) {
    const cube = new THREE.BoxGeometry(cell * 0.89, cell * 0.89, depth);
    const pieces = [];
    rows.forEach((row, y) =>
      [...row].forEach((symbol, x) => {
        if (symbol !== ".")
          pieces.push(
            cube
              .clone()
              .translate(
                (x - (row.length - 1) / 2) * cell,
                ((rows.length - 1) / 2 - y) * cell,
                0,
              ),
          );
      }),
    );
    const geometry = this.track(mergeGeometries(pieces));
    cube.dispose();
    pieces.forEach((piece) => piece.dispose());
    return geometry;
  }

  makeStarGeometry() {
    return this.makeBlockGeometry(STAR_ICON, 0.105, 0.13);
  }

  makePowerupIcon(power) {
    const color = POWERUPS[power].color;
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(
        this.track(new THREE.BoxGeometry(1.5, 1.5, 0.16)),
        this.track(new THREE.MeshBasicMaterial({ color: "#17102f" })),
      ),
    );
    const frame = Array.from({ length: 11 }, (_, y) =>
      y === 0 || y === 10 ? "XXXXXXXXXXX" : "X.........X",
    );
    group.add(
      new THREE.Mesh(
        this.makeBlockGeometry(frame, 0.15, 0.3),
        this.material(color, 0.95),
      ),
    );
    const glyph = new THREE.Mesh(
      this.makeBlockGeometry(POWER_ICONS[power], 0.17, 0.12),
      this.material(color, 0.95),
    );
    glyph.position.z = 0.16;
    group.add(glyph);
    const back = glyph.clone();
    back.position.z = -0.16;
    back.rotation.y = Math.PI;
    group.add(back);
    return group;
  }

  makeMissile() {
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(
        this.makeBlockGeometry(
          ["..X..", ".XXX.", ".XXX.", ".XXX.", "XXXXX", "X.X.X", "..X.."],
          0.11,
          0.13,
        ),
        this.material("orange", 0.95),
      ),
    );
    return group;
  }

  makeUpgradeEffects() {
    this.muzzleFlashes = new MuzzleFlashes(
      (resource) => this.track(resource),
      this.glowTexture,
    );
    this.projectileScene.add(this.muzzleFlashes.group);
    this.orbTrails = new OrbTrails((resource) => this.track(resource));
    this.projectileScene.add(this.orbTrails.mesh);
    this.speedTrails = new SpeedTrails((resource) => this.track(resource));
    this.projectileScene.add(this.speedTrails.mesh);
    this.orbTemplates = Object.fromEntries(
      ["orbit", "wingmen"].map((kind) => {
        const color = kind === "orbit" ? "mint" : "cyan";
        const orb = new THREE.Group();
        orb.add(
          new THREE.Mesh(
            this.makeBlockGeometry(
              [".XXX.", "XXXXX", "XXXXX", "XXXXX", ".XXX."],
              0.14,
              0.14,
            ),
            this.material(color, 0.95),
          ),
        );
        return [kind, orb];
      }),
    );
    this.laserMeshes = Array.from({ length: 2 }, () => {
      const beam = new BlockLaser((resource) => this.track(resource));
      this.projectileScene.add(beam);
      return beam;
    });
    this.gateLaserMesh = new BlockLaser((resource) => this.track(resource));
    this.projectileScene.add(this.gateLaserMesh);
    this.turretLaserMeshes = Array.from({ length: 3 }, () => {
      const beam = new BlockLaser((resource) => this.track(resource));
      this.projectileScene.add(beam);
      return beam;
    });
    const insideShield = (x, y) =>
      Math.max(Math.abs(x), Math.abs(y)) <= 7 &&
      Math.abs(x) + Math.abs(y) <= 10;
    const shieldRows = Array.from({ length: 15 }, (_, row) =>
      Array.from({ length: 15 }, (_, column) => {
        const x = column - 7,
          y = row - 7;
        const edge = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => !insideShield(x + dx, y + dy));
        return insideShield(x, y) && edge ? "X" : ".";
      }).join(""),
    );
    this.shieldBubble = new THREE.Mesh(
      this.makeBlockGeometry(shieldRows, 0.18, 0.08),
      this.track(
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(COLORS.mint).multiplyScalar(0.95),
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
        }),
      ),
    );
    this.shieldBubble.visible = false;
    this.scene.add(this.shieldBubble);
  }

  makeShotTrails() {
    this.shotTrails = [];
    this.shotPositions = new Map();
    this.trailTransform = new THREE.Object3D();
    this.trailColor = new THREE.Color();
    this.trailMesh = new THREE.InstancedMesh(
      this.track(new THREE.PlaneGeometry(1, 1)),
      this.track(
        new THREE.MeshBasicMaterial({
          color: "white",
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
      2400,
    );
    this.trailMesh.setColorAt(0, new THREE.Color(COLORS.cyan));
    this.trailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trailMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.trailMesh.count = 0;
    this.trailMesh.frustumCulled = false;
    // Crisp square trail pixels render after bloom like the projectile heads.
    this.projectileScene.add(this.trailMesh);
  }

  updateShotTrails(dt) {
    const lifetime = this.reducedMotion ? 0.12 : 0.34;
    this.shotTrails = this.shotTrails.filter((trail) => {
      trail.age += dt;
      return trail.age < lifetime;
    });
    const alive = new Set();
    if (this.mode === "game")
      for (const bullet of this.model.bullets) {
        if (!bullet.friendly || bullet.kind === "missile") continue;
        alive.add(bullet.id);
        const previous = this.shotPositions.get(bullet.id);
        if (previous && dt > 0) {
          const dx = bullet.x - previous.x,
            dy = bullet.y - previous.y;
          const length = Math.hypot(dx, dy);
          if (length > 0.001) {
            const count = Math.ceil(length / 0.12);
            for (let tile = 0; tile < count; tile++) {
              const fraction = (tile + 0.5) / count;
              this.shotTrails.push({
                x: previous.x + dx * fraction,
                y: previous.y + dy * fraction,
                length: Math.min(0.12, length / count) * 0.88,
                angle: -Math.atan2(dx, dy),
                age: 0,
              });
            }
          }
        }
        this.shotPositions.set(bullet.id, { x: bullet.x, y: bullet.y });
      }
    for (const id of this.shotPositions.keys())
      if (!alive.has(id)) this.shotPositions.delete(id);
    if (this.shotTrails.length > 2400)
      this.shotTrails.splice(0, this.shotTrails.length - 2400);
    this.shotTrails.forEach((trail, index) => {
      const fade = Math.pow(1 - trail.age / lifetime, 2);
      this.trailTransform.position.set(trail.x, trail.y, 0.08);
      this.trailTransform.rotation.set(0, 0, trail.angle);
      this.trailTransform.scale.set(0.1, trail.length, 1);
      this.trailTransform.updateMatrix();
      this.trailMesh.setMatrixAt(index, this.trailTransform.matrix);
      this.trailColor.set(COLORS.cyan).multiplyScalar(fade);
      this.trailMesh.setColorAt(index, this.trailColor);
    });
    this.trailMesh.count = this.shotTrails.length;
    this.trailMesh.instanceMatrix.needsUpdate = true;
    this.trailMesh.instanceColor.needsUpdate = true;
  }

  clearShotTrails() {
    this.shotTrails = [];
    this.shotPositions.clear();
    this.trailMesh.count = 0;
  }

  makeGlowTexture() {
    // Explicit radial alpha prevents point sprites and small bloom sources from reading as quads.
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const radius = Math.hypot(
          ((x + 0.5) / size) * 2 - 1,
          ((y + 0.5) / size) * 2 - 1,
        );
        const alpha =
          radius < 1
            ? Math.exp(-radius * radius * 6) * Math.pow(1 - radius * radius, 2)
            : 0;
        const offset = (y * size + x) * 4;
        data[offset] = data[offset + 1] = data[offset + 2] = 255;
        data[offset + 3] = Math.round(alpha * 255);
      }
    const texture = this.track(new THREE.DataTexture(data, size, size));
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  makeBackground() {
    const count = 950;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 55;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 44;
      positions[i * 3 + 2] = -2 - Math.random() * 15;
      const color = new THREE.Color(
        i % 4 === 0 ? "#c47fff" : "#85c5e4",
      ).multiplyScalar(0.35 + Math.random() * 0.55);
      colors.set(color.toArray(), i * 3);
    }
    const geometry = this.track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.stars = new THREE.Points(
      geometry,
      this.track(
        new THREE.PointsMaterial({
          size: 0.065,
          vertexColors: true,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        }),
      ),
    );
    this.scene.add(this.stars);
    const streakGeometry = this.track(new THREE.BufferGeometry());
    streakGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(150 * 6), 3),
    );
    this.streaks = new THREE.LineSegments(
      streakGeometry,
      this.track(
        new THREE.LineBasicMaterial({
          color: "#9ceaff",
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    this.scene.add(this.streaks);
    this.clouds = [];
    // Soft nebula clouds are procedural, so the experience needs no image downloads.
    for (const [x, y, color] of [
      [-9, 4, "#512078"],
      [9, -8, "#163d79"],
      [4, 12, "#33145c"],
    ]) {
      const material = this.track(
        new THREE.ShaderMaterial({
          uniforms: { color: { value: new THREE.Color(color) } },
          vertexShader:
            "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
          fragmentShader:
            "varying vec2 vUv; uniform vec3 color; void main(){vec2 p=vUv-.5;float a=exp(-dot(p,p)*12.)*.35;gl_FragColor=vec4(color,a);}",
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const cloud = new THREE.Mesh(
        this.track(new THREE.PlaneGeometry(30, 30)),
        material,
      );
      cloud.position.set(x, y, -18);
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  makeParticleSystem() {
    const geometry = this.track(new THREE.BufferGeometry());
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array(MAX_PARTICLES * 3),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(
        new Float32Array(MAX_PARTICLES * 3),
        3,
      ).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      "size",
      new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      "alpha",
      new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const material = this.track(
      new THREE.ShaderMaterial({
        uniforms: { pixelScale: { value: 30 } },
        vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vColor; varying float vAlpha; uniform float pixelScale;
        void main(){vColor=color;vAlpha=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size*pixelScale;}`,
        fragmentShader: `varying vec3 vColor; varying float vAlpha;
        void main(){vec2 p=gl_PointCoord-.5;float d=length(p)*2.;if(d>=1.) discard;float glow=exp(-d*d*6.)*(1.-smoothstep(.7,1.,d));float core=exp(-d*d*60.);gl_FragColor=vec4(vColor*(1.+core*2.),glow*vAlpha);}`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.particleMesh = new THREE.Points(geometry, material);
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
  }

  setTextSeeds(seeds) {
    this.textSeeds = seeds;
    if (this.textMesh) {
      this.scene.remove(this.textMesh);
      for (const resource of [this.textMesh.geometry, this.textMesh.material]) {
        resource.dispose();
        this.resources.delete(resource);
      }
      this.textMesh = null;
    }
  }

  setProgress(progress) {
    this.progress = progress;
  }

  setInput(input) {
    this.input = input;
  }

  setVisible(visible) {
    if (this.visible === visible || this.disposed) return;
    this.visible = visible;
    cancelAnimationFrame(this.frame);
    if (visible) {
      this.lastTime = performance.now();
      this.frame = requestAnimationFrame((now) => this.animate(now));
    }
  }

  start() {
    this.mode = "game";
    this.notice = null;
    this.model.reset();
    this.primaryFlashUntil = this.companionFlashUntil = 0;
    this.muzzleFlashes.clear();
    this.orbTrails.clear();
    this.speedTrails?.clear();
    this.electricEffects?.clear();
    this.civilianShips.clear();
    this.shipFireTrails.clear();
    this.civilianPenalty = null;
    this.thrust = 0;
    this.speedWasActive = false;
    this.warpAge = 1;
    this.warpHeight = 1;
    this.exhaustAccumulator = 0;
    this.callouts = [];
    this.clearShotTrails();
    this.laserMeshes.forEach((beam) => {
      beam.visible = false;
    });
    this.gateLaserMesh.update(null);
    this.turretLaserMeshes.forEach((beam) => beam.update(null));
    this.shieldBubble.visible = false;
    this.entities.forEach((mesh) => this.removeEntity(mesh));
    this.entities.clear();
    this.particles = [];
    for (const ring of this.rings) {
      this.scene.remove(ring.mesh);
      ring.mesh.dispose();
      ring.mesh.material.dispose();
      this.resources.delete(ring.mesh.material);
    }
    this.rings = [];
    this.debris = [];
    this.debrisMesh.count = 0;
    this.flash = 0;
    this.shake = 0;
    this.publish();
  }

  setPaused(value) {
    this.model.paused = value;
    this.publish();
  }

  transition() {
    this.mode = "transition";
    this.muzzleFlashes.clear();
    this.orbTrails.clear();
    this.speedTrails?.clear();
    this.electricEffects?.clear();
    this.civilianShips.clear();
    this.shipFireTrails.clear();
    this.callouts = [];
    this.clearShotTrails();
    this.model.paused = true;
    this.entities.forEach((mesh) => this.removeEntity(mesh));
    this.entities.clear();
    this.debris = [];
    this.debrisMesh.count = 0;
    this.laserMeshes.forEach((beam) => {
      beam.visible = false;
    });
    this.gateLaserMesh.update(null);
    this.turretLaserMeshes.forEach((beam) => beam.update(null));
    this.shieldBubble.visible = false;
  }

  publish() {
    this.callouts = this.callouts.filter(
      (item) => this.model.clock - item.start < 2,
    );
    this.onState?.({
      fleetRadio:
        this.model.fleetRadioTime > 0 && this.model.phase !== "gameover",
      fleetRadioMessage: this.model.fleetRadioMessage,
      callouts: this.callouts.map((item) => {
        const progress = clamp((this.model.clock - item.start) / 2, 0, 1);
        return {
          ...item,
          left:
            item.kind === "wave"
              ? 50
              : clamp(50 + (item.x / this.viewWidth) * 100, 18, 82),
          top:
            item.kind === "wave"
              ? 46
              : clamp(50 - (item.y / this.viewHeight) * 100, 20, 80),
          scale: this.reducedMotion ? 1 : 0.65 + progress * 1.25,
          opacity: Math.pow(1 - progress, 0.8),
        };
      }),
      civilianPenalty:
        this.civilianPenalty?.until > this.model.clock
          ? this.civilianPenalty
          : null,
      civilians: this.model.civilians
        .filter((item) => item.y < 15.5 && item.y > -16)
        .map((item) => ({
          id: item.id,
          hit: item.hit,
          hp: item.hp,
          left: clamp(50 + (item.x / this.viewWidth) * 100, 10, 90),
          top: clamp(50 - ((item.y + 1.3) / this.viewHeight) * 100, 9, 92),
        })),
      phase: this.model.phase,
      paused: this.model.paused,
      wave: this.model.wave,
      score: this.model.score,
      lives: this.model.lives,
      missileCount: this.model.missileCount,
      kills: this.model.kills,
      rescues: this.model.rescues,
      message: this.model.message,
      upgrades: [
        ...(this.model.weaponTime > 0
          ? [
              {
                id: this.model.weapon,
                label: POWERUPS[this.model.weapon].label,
                remaining: this.model.weaponTime,
                duration: POWERUPS[this.model.weapon].duration,
              },
            ]
          : []),
        ...(this.model.shieldTime > 0
          ? [
              {
                id: "shield",
                label: "SHIELD",
                remaining: this.model.shieldTime,
                duration: POWERUPS.shield.duration,
              },
            ]
          : []),
        ...[
          ["orbit", this.model.orbitTime],
          ["speed", this.model.speedTime],
          [this.model.companionMode, this.model.companionTime],
          ["scatter", this.model.scatterTime],
          ["emp", this.model.empTime],
          ["chain", this.model.chainTime],
          ["fleet", this.model.fleetTime],
          ["assault", this.model.assaultTime],
        ]
          .filter(([, remaining]) => remaining > 0)
          .map(([id, remaining]) => ({
            id,
            label:
              POWERUPS[id].label +
              (id === "orbit" ? ` ×${this.model.orbitCount}` : ""),
            remaining,
            duration: POWERUPS[id].duration,
          })),
      ],
      notice:
        this.notice && this.notice.until > this.model.clock
          ? this.notice.text
          : "",
    });
  }

  resize() {
    if (this.disposed) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    const aspect = width / height;
    // Keep the complete 24x32 playfield visible on narrow phones and wide monitors.
    this.viewHeight = Math.max(32, 24 / aspect);
    this.viewWidth = this.viewHeight * aspect;
    this.camera.left = -this.viewWidth / 2;
    this.camera.right = this.viewWidth / 2;
    this.camera.top = this.viewHeight / 2;
    this.camera.bottom = -this.viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.canyon.resize(this.viewWidth, this.viewHeight);
    this.model.setPlayfield(this.viewWidth, this.viewHeight);
    this.particleMesh.material.uniforms.pixelScale.value =
      (height / this.viewHeight) * this.renderer.getPixelRatio();
  }

  pointerToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width - 0.5) * this.viewWidth / this.camera.zoom,
      y: (0.5 - (clientY - rect.top) / rect.height) * this.viewHeight / this.camera.zoom,
    };
  }

  addParticle(
    x,
    y,
    vx,
    vy,
    color,
    size,
    life,
    z = 0.6,
    gravity = 0,
    source = null,
  ) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      source,
      x,
      y,
      vx,
      vy,
      color: new THREE.Color(COLORS[color] || color).multiplyScalar(2),
      size,
      life,
      maxLife: life,
      gravity,
      z,
    });
  }

  burst(x, y, size, color = "pink", largeBlast = false, blocky = false, opacity = 1) {
    const lastParticle = this.particles.at(-1);
    const secondary = color === "cyan" || color === "mint" ? "pink" : "cyan";
    if (this.reducedMotion) size *= 0.65;
    if (!blocky) {
      this.addParticle(
        x,
        y,
        0,
        0,
        "#fff5e8",
        size * (largeBlast ? 0.85 : 2.8),
        largeBlast ? 0.065 : 0.16,
        1,
      );
      if (!largeBlast)
        this.addParticle(x, y, 0, 0, color, size * 5.5, 0.55, 0.9);
    }
    const count = Math.floor(
      size * (this.reducedMotion ? 12 : blocky ? 24 : 55),
    );
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2,
        speed = (1 + Math.random() * 7) * size;
      if (blocky) {
        this.debris.push({
          x,
          y,
          vx: Math.cos(angle) * speed * 0.5,
          vy: Math.sin(angle) * speed * 0.5,
          color: new THREE.Color(i % 4 === 0 ? "#ffdf69" : "#ff6c22"),
          size: i % 3 === 0 ? 0.36 : 0.18,
          life: 0.6 + Math.random() * 0.4,
        });
      } else {
        this.addParticle(
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          i % 5 === 0
            ? "#fff9cc"
            : largeBlast && i % 3 === 0
              ? secondary
              : color,
          0.07 + Math.random() * 0.21,
          0.9 + Math.random() * 1.4,
          0.6,
          this.reducedMotion ? 0.15 : 0.6,
        );
      }
    }
    if (blocky && this.debris.length > 1100)
      this.debris.splice(0, this.debris.length - 1100);
    for (let i = 0; i < 2; i++) {
      const material = this.track(
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(COLORS[color] || color).multiplyScalar(
            blocky ? 1 : 3,
          ),
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      const mesh = new BlockExplosionRing(this.ringGeometry, material);
      mesh.position.set(x, y, opacity < 1 ? -24 : 0.4);
      mesh.userData.opacity = opacity;
      mesh.material.color.multiplyScalar(opacity);
      this.scene.add(mesh);
      this.rings.push({
        mesh,
        age: -i * 0.12,
        life: 1.35 + i * 0.3,
        size: size * (blocky ? 1.4 + i * 0.4 : 2.8 + i),
      });
    }
    for (const particle of this.particles.slice(this.particles.indexOf(lastParticle) + 1)) {
      particle.opacity = opacity;
      if (opacity < 1) {
        particle.z = -24;
        particle.color.multiplyScalar(opacity);
      }
    }
    this.shake = Math.min(0.26, this.shake + size * 0.045);
    this.flash = Math.min(0.22, this.flash + size * 0.035);
  }

  event(event) {
    this.onEvent?.(event);
    const { type, x, y, size } = event;
    if (type === "playerFalling" || type === "playerCrash") {
      this.exhaustAccumulator = 0;
      this.orbTrails.clear();
      this.speedTrails?.clear();
      this.electricEffects?.clear();
      this.particles = this.particles.filter(
        (particle) => particle.source !== "heroThrust",
      );
    }
    if (type === "empPulse") {
      this.electricEffects?.pulse(x, y, Math.hypot(this.viewWidth, this.viewHeight), this.reducedMotion);
      this.notice = { text: "EMP PULSE · TURRETS DISABLED", until: this.model.clock + POWERUPS.emp.duration };
    }
    if (type === "chainLightning") this.electricEffects?.lightning(event.points, this.reducedMotion);
    if (type === "shot") {
      if (Number.isFinite(x)) this.primaryFlashUntil = this.model.clock + 0.06;
      else this.companionFlashUntil = this.model.clock + 0.06;
    }
    if (type === "explosion") {
      if (!event.capitalTurret) this.scatterShip(event);
      this.burst(x, y, size, event.color, true, !!event.blocky);
      if (event.heavy) this.addCallout("KaBoom!", "blast", x, y);
    }
    if (type === "gateExplosion") this.burst(x, y, 1.1, "orange", false, true);
    if (type === "groundExplosion") {
      const mesh = this.entities.get(`ground-${event.groundId}`);
      const aim = mesh?.getObjectByName("aimed-gun").rotation.z || 0;
      for (const block of this.groundDefenses.debris(event.groundKind, aim)) {
        const direction = Math.random() * Math.PI * 2;
        const speed = (3 + Math.random() * 8) * (this.reducedMotion ? 0.4 : 1);
        this.debris.push({
          x: x + block.x,
          y: y + block.y,
          vx: Math.cos(direction) * speed,
          vy: Math.sin(direction) * speed,
          color: new THREE.Color(block.color),
          size: block.size,
          life: 1.8 + Math.random(),
        });
      }
      this.burst(
        x,
        y,
        size,
        event.groundKind === "tank" ? "mint" : "orange",
        true,
      );
      if (event.groundKind === "tank")
        this.addCallout("KaBoom!", "blast", x, y);
    }
    if (type === "capitalIncoming")
      this.notice = {
        text: "DREADNOUGHT PASSING BELOW · WATCH THE TURRETS",
        until: this.model.clock + 4,
      };
    if (type === "laserGateTutorial")
      this.notice = {
        text: "SHOOT THE TURRETS · DESTROY EITHER TO BREAK THE LASER",
        until: this.model.clock + 5,
      };
    if (type === "groundIncoming")
      this.notice = {
        text:
          event.kind === "laserTurret"
            ? "LASER BARRIER · DESTROY EITHER TURRET"
            : event.kind === "tank"
              ? "ARMOURED TANK · MISSILES ONLY"
              : "CANYON TURRET INBOUND",
        until: this.model.clock + 3,
      };
    if (type === "groundShot") this.burst(x, y, size, "orange");
    if (type === "armourImpact") this.burst(x, y, size, "gold");
    if (type === "impact") this.burst(x, y, size, "cyan");
    if (type === "playerCrash") this.scatterShip(event, true);
    if (type === "hit" && this.model.lives > 0)
      this.scatterShip(event, true, 0.2);
    if ((type === "hit" && this.model.lives > 0) || type === "playerCrash")
      this.burst(
        x, y, size, type === "playerCrash" ? "orange" : "cyan",
        true, false, type === "playerCrash" ? 0.4 : 1,
      );
    if (type === "collect") {
      for (let i = 0; i < 12; i++)
        this.addParticle(
          x,
          y,
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 6,
          "gold",
          0.2,
          0.4,
        );
    }
    if (type === "missileExplosion" || type === "scatterExplosion") {
      this.burst(x, y, size, "orange", true);
      this.addCallout("KaBoom!", "blast", x, y);
    }
    if (type === "civilianIncoming") {
      this.notice = {
        text: "CIVILIAN IN DISTRESS · HOLD FIRE",
        until: this.model.clock + 3,
      };
    }
    if (type === "civilianHit") {
      const messages = [
        "THAT WAS A CIVILIAN. WATCH YOUR FIRE.",
        "THE WAVING PILOT WAS A CLUE.",
        "THEY NEEDED HELP. YOU GAVE THEM BULLETS.",
      ];
      this.civilianPenalty = {
        id: ++this.calloutSerial,
        text: messages[Math.floor(Math.random() * messages.length)],
        until: this.model.clock + 2.5,
      };
      if (!event.fatal) this.burst(x, y, 0.35, "gold");
    }
    if (type === "civilianKilled") {
      this.civilianPenalty = {
        id: ++this.calloutSerial,
        text: "CIVILIAN LOST. FIVE HITS WERE TOO MANY.",
        until: this.model.clock + 3,
      };
    }
    if (type === "civilianCrash" || type === "enemyCrash") {
      // A small, distant impact without the full-screen flash or camera shake.
      const shake = this.shake,
        flash = this.flash;
      this.burst(x, y, event.size, "orange", false, false, 0.3);
      this.shake = shake;
      this.flash = flash;
    }
    if (type === "civilianRescued") {
      this.notice = {
        text: "CIVILIAN RESCUED · THANK YOU! +10,000 POINTS",
        until: this.model.clock + 4,
      };
    }
    if (type === "life") {
      this.burst(x, y, 1.1, "mint");
      this.notice = {
        text: event.restored ? "EXTRA LIFE +1" : "LIVES FULL",
        until: this.model.clock + 2.5,
      };
    }
    if (type === "supply" || type === "powerup") {
      const label = POWERUPS[event.power].label;
      this.notice = {
        text: `${label} ${type === "supply" ? "INBOUND" : "ONLINE"}`,
        until: this.model.clock + 2.5,
      };
      if (type === "powerup") {
        this.burst(x, y, 0.65, event.power === "shield" ? "mint" : "cyan");
      }
    }
    if (type === "waveClear") {
      this.burst(x, y, Math.min(size, 0.65), "gold");
      if (event.perfect) {
        const phrases = [
          "Good job!",
          "Nailed 'em!",
          "Beautiful!",
          "Outstanding!",
          "Keep it up!",
          "Nicely done!",
          "You’re fired.",
          "Get your ass to Mars",
          "Good shot!",
          "That hit the spot.",
        ];
        this.addCallout(
          phrases[Math.floor(Math.random() * phrases.length)],
          "wave",
          0,
          0,
        );
      }
    }
  }

  addCallout(text, kind, x, y) {
    this.callouts.push({
      id: ++this.calloutSerial,
      angle: this.reducedMotion
        ? 0
        : (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 8),
      text,
      kind,
      x,
      y,
      start: this.model.clock,
    });
    if (this.callouts.length > 6) this.callouts.shift();
  }

  removeEntity(mesh) {
    mesh.removeFromParent();
    mesh.userData.crashMaterials?.forEach((material) => {
      material.dispose();
      this.resources.delete(material);
    });
    mesh.traverse((child) => {
      if (child.isInstancedMesh) child.dispose();
    });
  }

  syncEntities(dt) {
    const alive = new Set();
    const sync = (entity, type) => {
      const key = `${type}-${entity.id}`;
      alive.add(key);
      let mesh = this.entities.get(key);
      if (!mesh) {
        if (type === "capital") mesh = this.capitalShip.createMesh();
        else if (type === "fleet")
          mesh = this.fleetTemplates[entity.side].clone(true);
        else if (type === "orb") mesh = this.orbTemplates.orbit.clone(true);
        else if (type === "companion")
          mesh = this.orbTemplates.wingmen.clone(true);
        else if (type === "ground" || type === "cart")
          mesh = this.groundDefenses.createMesh(entity.kind);
        else if (type === "civilian") mesh = this.civilianShips.createMesh();
        else if (type === "enemy")
          mesh = (
            entity.heavy ? this.heavyTemplate : this.enemyTemplates[entity.kind]
          ).clone(true);
        else if (type === "pickup" && entity.kind === "powerup")
          mesh = this.powerTemplates[entity.power].clone(true);
        else if (type === "bullet" && entity.kind === "missile")
          mesh = this.missileTemplate.clone(true);
        else if (type === "bullet" && entity.kind === "bomb")
          mesh = new THREE.Mesh(this.shapes.bomb, this.materials.bomb);
        else if (type === "bullet" && entity.friendly && !entity.kind)
          mesh = this.bulletTemplates[entity.strength || 1].clone(true);
        else
          mesh = new THREE.Mesh(
            type === "pickup"
              ? entity.kind === "life"
                ? this.shapes.life
                : this.shapes.star
              : entity.friendly
                ? this.shapes.friendly
                : this.shapes.hostile,
            type === "pickup"
              ? entity.kind === "life"
                ? this.materials.life
                : this.materials.star
              : entity.friendly
                ? entity.kind === "shrapnel"
                  ? this.materials.shrapnel
                  : this.materials.friendly
                : this.materials.hostile,
          );
        if (
          type === "bullet" &&
          entity.kind !== "missile"
        ) {
          const color =
            entity.friendly
                ? ["bomb", "shrapnel"].includes(entity.kind)
                  ? "orange"
                  : entity.strength === 3
                    ? "violet"
                    : entity.strength === 2
                      ? "orange"
                      : "blue"
                : "pink";
          const halo = new THREE.Sprite(this.haloMaterials[color]);
          if (entity.kind === "bomb") halo.scale.set(1.3, 1.3, 1);
          else if (entity.friendly) halo.scale.set(0.3, 0.6, 1);
          else halo.scale.set(1.3, 1.3, 1);
          halo.position.z = -0.04;
          mesh.add(halo);
        }
        if (type === "cart") mesh.scale.setScalar(0.55);
        this.entities.set(key, mesh);
        (["enemy", "capital"].includes(type)
          ? this.scene
          : this.projectileScene
        ).add(mesh);
      }
      mesh.position.set(
        entity.x,
        entity.y,
        type === "capital"
          ? -0.8
          : type === "ground" || type === "cart"
            ? -1
            : 0.1,
      );
      if (type === "capital")
        this.capitalShip.animate(mesh, entity, this.reducedMotion);
      if (type === "fleet") mesh.rotation.z = entity.bank;
      if (type === "ground" || type === "cart") {
        // Match the canyon shelf's horizontal camera parallax.
        mesh.position.x -=
          this.canyon.uniforms.horizontal.value *
          (type === "cart" ? 0.0125 : 0.003) *
          this.viewWidth;
        this.groundDefenses.animate(mesh, entity, this.reducedMotion);
      }
      if (type === "civilian" && entity.falling)
        this.civilianShips.animateCrash(mesh, entity, this.reducedMotion);
      else if (type === "civilian")
        this.civilianShips.animate(
          mesh,
          entity,
          this.time,
          dt,
          this.reducedMotion,
        );
      if (type === "enemy") {
        const template = entity.heavy
          ? this.heavyTemplate
          : this.enemyTemplates[entity.kind];
        mesh.scale.copy(template.scale).multiplyScalar(entity.scale ?? 1);
        mesh.visible = entity.age >= 0;
        if (entity.flyaway)
          ShipFireTrails.animateShip(mesh, entity, this.reducedMotion);
        else if (entity.falling)
          this.civilianShips.animateCrash(mesh, entity, this.reducedMotion);
        else mesh.rotation.z = Math.PI + Math.sin(entity.age * 2) * 0.08;
      }
      if (type === "pickup" && entity.kind === "powerup") {
        mesh.rotation.y = this.time * 1.2;
        mesh.rotation.z = Math.sin(this.time * 1.5) * 0.12;
        mesh.scale.setScalar(1 + Math.sin(this.time * 3) * 0.04);
      } else if (type === "pickup") {
        mesh.rotation.z = this.time * 1.4;
        mesh.rotation.y = Math.sin(this.time * 2) * 0.3;
        mesh.scale.setScalar(entity.value === 10 ? 2.1 : 0.8);
      }
      if (type === "bullet" && entity.friendly)
        mesh.rotation.z = -Math.atan2(entity.vx, entity.vy);
      if (type === "bullet" && !entity.friendly)
        mesh.scale.setScalar(1 + Math.sin(this.time * 14) * 0.12);
    };
    for (const ship of this.model.capitalShips) sync(ship, "capital");
    for (const ground of this.model.groundEnemies) sync(ground, "ground");
    for (const wreck of this.model.groundWrecks) sync(wreck, "ground");
    for (const enemy of this.model.enemies) sync(enemy, "enemy");
    for (const enemy of this.model.fallingEnemies) sync(enemy, "enemy");
    for (const enemy of this.model.flyawayEnemies) sync(enemy, "enemy");
    for (const civilian of this.model.civilians) sync(civilian, "civilian");
    for (const civilian of this.model.fallingCivilians)
      sync(civilian, "civilian");
    for (const bullet of this.model.bullets) sync(bullet, "bullet");
    for (const pickup of this.model.pickups) sync(pickup, "pickup");
    for (const orb of this.model.orbs) sync(orb, "orb");
    for (const orb of this.model.companions) sync(orb, "companion");
    for (const ship of this.model.fleet) sync(ship, "fleet");
    for (const cart of this.model.assaultFleet) sync(cart, "cart");
    if (this.model.lasers.length) this.onEvent?.({ type: "laser" });
    this.laserMeshes.forEach((mesh, index) => {
      mesh.update(
        this.model.phase === "gameover" ? null : this.model.lasers[index],
      );
    });
    const gate =
      this.model.phase === "gameover" ? null : this.model.gateLasers[0];
    const parallax =
      this.canyon.uniforms.horizontal.value * 0.003 * this.viewWidth;
    this.gateLaserMesh.update(
      gate
        ? { ...gate, x: gate.x - parallax, endX: gate.endX - parallax }
        : null,
    );
    this.turretLaserMeshes.forEach((mesh, index) => {
      const beam = this.model.sceneryStopped
        ? null
        : this.model.turretLasers[index];
      mesh.update(
        beam
          ? { ...beam, x: beam.x - parallax, endX: beam.endX - parallax }
          : null,
      );
    });
    this.updateMuzzleFlashes();
    for (const [key, mesh] of this.entities)
      if (!alive.has(key)) {
        this.removeEntity(mesh);
        this.entities.delete(key);
      }
  }

  updateMuzzleFlashes() {
    const game = this.model;
    const muzzles = [];
    if (this.mode === "game" && !game.sceneryStopped) {
      const { x, y, bank } = game.player;
      const firing =
        this.input.fire && ["playing", "intermission"].includes(game.phase);
      const primaryVisible = this.reducedMotion
        ? firing
        : game.clock < this.primaryFlashUntil;
      if (primaryVisible && ["guns", "machine"].includes(game.weapon)) {
        for (const side of [-0.24, 0.24])
          muzzles.push({
            x: x + side * Math.cos(bank) - 0.8 * Math.sin(bank),
            y: y + side * Math.sin(bank) + 0.8 * Math.cos(bank),
            angle: bank,
            opacity: this.reducedMotion
              ? 0.7
              : Math.max(0, (this.primaryFlashUntil - game.clock) / 0.06),
          });
      }
      if (this.reducedMotion ? firing : game.clock < this.companionFlashUntil) {
        for (const orb of game.companions)
          muzzles.push({
            x: orb.x,
            y: orb.y + 0.4,
            opacity: this.reducedMotion
              ? 0.7
              : Math.max(0, (this.companionFlashUntil - game.clock) / 0.06),
          });
      }
      for (const laser of game.lasers)
        muzzles.push({
          x: laser.x,
          y: laser.y,
          angle: -Math.atan2(laser.endX - laser.x, laser.top - laser.y),
          width: Math.max(1, (laser.width || 0) / 0.3),
          height: laser.width > 1 ? 1.4 : 1,
          opacity: this.reducedMotion ? 0.7 : 0.9,
        });
    }
    this.muzzleFlashes.update(muzzles);
  }

  emitHeroExhaust(dt, { rotation, boost, velocityX, velocityY }) {
    if (this.model.lives <= 0 || this.model.sceneryStopped) {
      this.exhaustAccumulator = 0;
      return;
    }
    this.exhaustAccumulator = (this.exhaustAccumulator || 0) + dt;
    const interval = this.reducedMotion ? 1 / 30 : 1 / 60;
    while (this.exhaustAccumulator >= interval) {
      this.exhaustAccumulator -= interval;
      const backX = Math.sin(rotation),
        backY = -Math.cos(rotation);
      const sideX = Math.cos(rotation),
        sideY = Math.sin(rotation);
      const count = this.reducedMotion ? 1 : 4;
      for (let i = 0; i < count; i++) {
        const lane = (Math.random() - 0.5) * 0.3;
        const spread = (Math.random() - 0.5) * 1.2;
        const speed =
          (6 + Math.random() * 5 + boost * 5) * (this.reducedMotion ? 0.45 : 1);
        const reverse = this.thrust < -0.15;
        const color =
          boost > 0.15
            ? i % 2
              ? "gold"
              : "#fff5be"
            : ["cyan", "violet", "pink", "#c7faff"][i];
        // Dense sparks and softer energy motes retain world-space momentum.
        this.addParticle(
          this.model.player.x + backX * 0.85 + sideX * lane,
          this.model.player.y + backY * 0.85 + sideY * lane,
          velocityX * 0.16 + backX * speed + sideX * spread,
          velocityY * 0.16 + backY * speed + sideY * spread,
          color,
          i < 2 ? 0.045 + Math.random() * 0.04 : 0.1 + Math.random() * 0.12,
          reverse ? 0.2 + Math.random() * 0.15 : 0.5 + Math.random() * 0.45,
          0.6,
          0,
          "heroThrust",
        );
      }
    }
  }

  updateParticles(dt) {
    this.particles = this.particles.filter((particle) => particle.life > 0);
    const attributes = this.particleMesh.geometry.attributes;
    this.particles.forEach((p, index) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 0.8);
      p.vy *= Math.exp(-dt * 0.8);
      p.vy -= p.gravity * dt;
      attributes.position.setXYZ(index, p.x, p.y, p.z);
      attributes.color.setXYZ(index, p.color.r, p.color.g, p.color.b);
      attributes.size.setX(
        index,
        p.size * (0.4 + 0.6 * Math.max(0, p.life / p.maxLife)),
      );
      attributes.alpha.setX(index, Math.max(0, p.life / p.maxLife) * (p.opacity ?? 1));
    });
    for (const attribute of Object.values(attributes))
      attribute.needsUpdate = true;
    this.particleMesh.geometry.setDrawRange(0, this.particles.length);
    this.rings = this.rings.filter((ring) => {
      ring.age += dt;
      if (ring.age > ring.life) {
        this.scene.remove(ring.mesh);
        ring.mesh.dispose();
        ring.mesh.material.dispose();
        this.resources.delete(ring.mesh.material);
        return false;
      }
      ring.mesh.update(ring.age, ring.life, ring.size);
      return true;
    });
  }

  updateText() {
    if (!this.textSeeds?.length) return;
    if (!this.textMesh) {
      const geometry = this.track(new THREE.BufferGeometry());
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array(this.textSeeds.length * 3),
          3,
        ),
      );
      this.textMesh = new THREE.Points(
        geometry,
        this.track(
          new THREE.PointsMaterial({
            color: "#c4c1ff",
            size: 0.065,
            map: this.glowTexture,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        ),
      );
      this.textMesh.frustumCulled = false;
      this.scene.add(this.textMesh);
    }
    const p = this.progress;
    this.textMesh.visible = this.mode === "transition" && p > 0.001 && p < 1;
    if (!this.textMesh.visible) return;
    const attr = this.textMesh.geometry.attributes.position;
    const rect = this.canvas.getBoundingClientRect();
    const dissolve = THREE.MathUtils.smoothstep(p, 0.05, 0.65);
    this.textSeeds.forEach((seed, i) => {
      const sx = (seed.x / rect.width - 0.5) * this.viewWidth;
      const sy =
        (0.5 - (seed.y - window.scrollY) / rect.height) * this.viewHeight;
      const targetY =
        ((((seed.y * 0.043 - this.time * (2 + p * 35)) % 38) + 38) % 38) - 19;
      attr.setXYZ(
        i,
        THREE.MathUtils.lerp(sx, seed.scatterX, dissolve),
        THREE.MathUtils.lerp(sy, targetY, dissolve),
        0,
      );
    });
    attr.needsUpdate = true;
    this.textMesh.material.opacity =
      Math.min(1, p * 8) * (1 - THREE.MathUtils.smoothstep(p, 0.8, 1));
  }

  updateFlightEffects(dt, verticalMotion) {
    const speedBoost = this.mode === "game" && this.model.speedTime > 0;
    const intensity = this.mode === "game" ? this.model.speedIntensity : 0;
    // Orthographic pullback: preserve world bounds while easing to a wider view.
    const zoom = this.mode === "game" && !this.reducedMotion
      ? 1 - intensity * 0.08 : 1;
    if (this.camera.zoom !== zoom) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
    const sceneryMultiplier = 1 + intensity * 1.35;
    if (speedBoost !== (this.speedWasActive || false)) {
      this.warpAge = 0;
      this.warpDirection = speedBoost ? 1 : -1;
    }
    this.speedWasActive = speedBoost;
    this.warpAge = Math.min(1, (this.warpAge ?? 1) + dt);
    const pulse = this.reducedMotion || this.model.sceneryStopped || this.warpAge >= 1
      ? 0 : Math.sin(this.warpAge * Math.PI) ** 2;
    this.warpHeight = 1 + pulse * (this.warpDirection > 0 ? -0.25 : 0.45);
    this.thrust = THREE.MathUtils.lerp(
      this.thrust,
      THREE.MathUtils.lerp(verticalMotion, 1, intensity),
      1 - Math.exp(-dt * 16),
    );
    const flameLength =
      this.thrust >= 0 ? 1 + this.thrust * 1.1 : 1 + this.thrust * 0.65;
    this.flame.scale.set(
      1 + Math.max(0, this.thrust) * 0.4,
      flameLength,
      1,
    );
    this.flame.position.y = -0.9 - 3.1 * flameLength;
    const boost = Math.max(0, this.thrust);
    this.flameMaterial.uniforms.boost.value = boost;
    for (const glow of this.engineGlows) {
      glow.sprite.material.color.lerpColors(glow.cool, glow.hot, boost);
      const strength =
        this.thrust < 0 ? 1 + this.thrust * 0.4 : 1 + boost * 0.35;
      glow.sprite.scale.set(
        glow.width * strength,
        glow.height * strength,
        1,
      );
      glow.sprite.material.opacity = glow.opacity * Math.min(1.1, strength);
    }
    const canyonReveal =
      this.mode === "game"
        ? 1
        : THREE.MathUtils.smoothstep(this.progress, 0.65, 1);
    const sceneryStopped =
      this.mode === "game" && this.model.sceneryStopped;
    const sceneryDt =
      dt * (this.mode === "game" ? this.model.sceneryMotion : 1) * sceneryMultiplier;
    this.canyon.update(
      sceneryDt,
      this.reducedMotion
        ? 0.2
        : this.mode === "game"
          ? 10
          : 2 + this.progress * 18,
      sceneryStopped
        ? this.canyon.uniforms.horizontal.value
        : this.mode === "game"
          ? this.model.player.x / this.model.bounds.x
          : 0,
      canyonReveal,
    );
    if (this.mode === "game") {
      // Use the simulation's world travel for every shelf, matching ground units.
      const travel = this.model.groundTravel;
      this.canyon.uniforms.travel.value.set(travel, travel * 0.67, travel * 1.08);
    }
    this.clouds.forEach((cloud) => {
      cloud.visible = canyonReveal < 0.8;
    });
    this.stars.material.opacity = 0.9 * (1 - canyonReveal * 0.85);
    this.streaks.visible = canyonReveal < 0.8 || (intensity > 0.001 && !this.reducedMotion);
    this.streaks.material.opacity = this.mode === "game" ? intensity * 0.85 : 0.35;
    const speed = this.reducedMotion
      ? 0.5
      : this.mode === "game"
        ? 17
        : 1 + this.progress * this.progress * 85;
    const positions = this.stars.geometry.attributes.position;
    const streak = this.streaks.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      if (sceneryDt === 0) continue;
      let y =
        positions.getY(i) - sceneryDt * speed * (0.45 + (i % 5) * 0.15);
      const wrapY = Math.max(22, this.viewHeight / this.camera.zoom / 2 + 4);
      if (y < -wrapY) y = wrapY;
      positions.setY(i, y);
      if (i < 150) {
        const x = positions.getX(i);
        streak.setXYZ(i * 2, x, y, -1);
        streak.setXYZ(
          i * 2 + 1,
          x,
          y + (this.reducedMotion ? 0.04 : 0.1 + speed * sceneryMultiplier * 0.035 + intensity * 1.4),
          -1,
        );
      }
    }
    positions.needsUpdate = true;
    streak.needsUpdate = true;
    this.flameMaterial.uniforms.time.value =
      this.time * (this.reducedMotion ? 0.2 : 1);
    return boost;
  }

  animate(now) {
    if (this.disposed) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    try {
      const frozen =
        this.mode === "game" &&
        (this.model.paused || this.model.phase === "gameover");
      if (!frozen) {
        this.time += dt;
        const previousX = this.model.player.x;
        const previousY = this.model.player.y;
        if (this.mode === "game") {
          advanceSimulation(this.model, dt, this.input);
        }
        const verticalMotion =
          this.mode === "game" && dt > 0
            ? clamp((this.model.player.y - previousY) / (16 * dt), -1, 1)
            : 0;
        const boost = this.updateFlightEffects(dt, verticalMotion);
        this.player.position.set(
          this.mode === "game" ? this.model.player.x : 0,
          this.mode === "game"
            ? this.model.player.y
            : THREE.MathUtils.lerp(
                -24,
                -10.5,
                THREE.MathUtils.smoothstep(this.progress, 0.5, 1),
              ),
          this.mode === "game" ? this.model.player.z : 1,
        );
        const fallProgress =
          this.model.phase === "dying"
            ? Math.min(1, this.model.elapsed / 2.4)
            : 0;
        const shipScale = 0.75 * (1 - fallProgress * 0.55);
        this.player.scale.set(shipScale, shipScale * this.warpHeight, shipScale);
        const rotation = this.mode === "game" ? this.model.player.bank : 0;
        this.player.rotation.z =
          this.model.phase === "dying" && this.reducedMotion ? -0.25 : rotation;
        const velocityX = dt > 0 ? (this.model.player.x - previousX) / dt : 0;
        const velocityY = dt > 0 ? (this.model.player.y - previousY) / dt : 0;
        const drift = this.flameMaterial.uniforms.drift.value;
        const localX =
          velocityX * Math.cos(rotation) + velocityY * Math.sin(rotation);
        const localY =
          -velocityX * Math.sin(rotation) + velocityY * Math.cos(rotation);
        drift.lerp(
          new THREE.Vector2(-localX * 0.07, -localY * 0.035),
          1 - Math.exp(-dt * 10),
        );
        this.player.visible =
          this.mode === "transition" ||
          this.model.lives > 0 ||
          this.model.phase === "dying";
        if (
          this.mode === "game" &&
          this.model.phase !== "gameover" &&
          this.model.player.invulnerable > 0 &&
          this.model.shieldTime <= 0
        )
          this.player.visible = Math.sin(this.time * 22) > 0.05;
        this.player.updateMatrixWorld(true);
        this.speedTrails?.update(
          dt, this.model.player,
          this.mode === "game" && !this.model.sceneryStopped ? this.model.speedIntensity : 0,
          this.reducedMotion,
        );
        this.exhaustRibbons.matrix.copy(this.flame.matrixWorld);
        this.flame.visible = this.model.lives > 0;
        this.exhaustRibbons.visible =
          this.player.visible && this.model.lives > 0;
        for (const glow of this.engineGlows)
          glow.sprite.visible = this.model.lives > 0;
        if (this.model.phase === "dying") {
          this.addParticle(
            this.model.player.x,
            this.model.player.y,
            0,
            1.5,
            "orange",
            0.22,
            0.6,
          );
        }
        this.missilePods.visible =
          this.mode === "game" &&
          this.model.missileCount > 0 &&
          this.model.phase !== "gameover";
        this.shieldBubble.visible =
          this.mode === "game" &&
          this.model.shieldTime > 0 &&
          this.model.phase !== "gameover";
        this.shieldBubble.position.copy(this.player.position);
        this.shieldBubble.scale.setScalar(
          1 +
            Math.sin(this.time * (this.model.shieldTime < 2 ? 15 : 4)) * 0.035,
        );
        if (this.mode === "game") {
          this.syncEntities(dt);
          for (const missile of this.model.bullets.filter(
            (bullet) => bullet.kind === "missile",
          )) {
            const speed = Math.hypot(missile.vx, missile.vy) || 1;
            this.addParticle(
              missile.x - missile.vx / speed * 0.4,
              missile.y - missile.vy / speed * 0.4,
              -missile.vx * 0.3,
              -missile.vy * 0.3,
              "orange",
              0.18,
              0.45,
            );
          }
          this.emitHeroExhaust(dt, { rotation, boost, velocityX, velocityY });
        }
        if (this.textMesh && this.mode === "game")
          this.textMesh.visible = false;
        this.updateText();
        this.updateShotTrails(dt);
        this.orbTrails.update(
          this.mode === "game" && this.model.phase !== "gameover"
            ? this.model.orbs
            : [],
          dt,
          this.reducedMotion,
          this.model.player,
        );
        this.updateParticles(dt);
        this.shipFireTrails.update(
          this.mode === "game" ? this.model.flyawayEnemies : [],
          dt,
          this.reducedMotion,
        );
        this.electricEffects?.update(dt);
        this.updateDebris(dt);
        this.civilianShips.update(dt);
      }
      const rumble =
        this.mode === "game" && !this.model.paused && !this.model.sceneryStopped
          ? capitalRumble(
              this.model.capitalShips,
              this.model.playfieldHeight || 32,
              this.reducedMotion,
            )
          : 0;
      const shake =
        this.reducedMotion ||
        frozen ||
        (this.mode === "game" && this.model.sceneryStopped)
          ? 0
          : this.shake;
      this.camera.position.x =
        (Math.random() - 0.5) * shake +
        (Math.sin(this.time * 38) * 0.6 + Math.sin(this.time * 61) * 0.25) *
          rumble;
      this.camera.position.y =
        (Math.random() - 0.5) * shake +
        (Math.cos(this.time * 32) * 0.6 + Math.sin(this.time * 53) * 0.25) *
          rumble;
      this.shake *= Math.exp(-dt * 9);
      this.flash *= Math.exp(-dt * 12);
      this.bloom.strength =
        (this.reducedMotion ? REDUCED_BLOOM_STRENGTH : BLOOM_STRENGTH) +
        this.flash * (this.reducedMotion ? 0 : 0.6);
      this.composer.render();
      if (now - (this.lastPublished || 0) > 80) {
        this.publish();
        this.lastPublished = now;
      }
      this.frame = requestAnimationFrame((time) => this.animate(time));
    } catch (error) {
      this.onError?.(error);
      this.dispose();
    }
  }

  dispose() {
    this.disposed = true;
    this.orbTrails?.mesh.dispose();
    this.speedTrails?.mesh.dispose();
    this.shipFireTrails?.mesh.dispose();
    this.laserMeshes?.forEach((beam) => beam.tiles.dispose());
    this.gateLaserMesh?.tiles.dispose();
    this.turretLaserMeshes?.forEach((beam) => beam.tiles.dispose());
    this.rings?.forEach((ring) => ring.mesh.dispose());
    if (this.contextLost)
      this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.resources.forEach((resource) => resource.dispose());
    this.resources.clear();
    this.composer?.passes.forEach((pass) => pass.dispose?.());
    this.composer?.dispose();
    this.renderer?.dispose();
    this.debris = [];
    this.scene?.clear();
    this.projectileScene?.clear();
    this.entities.clear();
    this.particles = [];
    this.rings = [];
  }
}
