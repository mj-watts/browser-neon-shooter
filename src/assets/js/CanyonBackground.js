import * as THREE from "three";
import { canyonWallShader } from "./CanyonTerrain.js";
import { terrainSceneryShader } from "./TerrainScenery.js";

// Three overlapping shelves: the deepest lip scrolls slowest, the nearest fastest.
export default class CanyonBackground {
  constructor(track) {
    this.uniforms = {
      travel: { value: new THREE.Vector3() },
      height: { value: 32 },
      width: { value: 24 },
      horizontal: { value: 0 },
      reveal: { value: 0 },
      floorColor: { value: new THREE.Color("#1c0d31") },
      deepColor: { value: new THREE.Color("#241044") },
      middleColor: { value: new THREE.Color("#2d1260") },
      nearColor: { value: new THREE.Color("#341374") },
      deepEdge: { value: new THREE.Color("#452071") },
      middleEdge: { value: new THREE.Color("#5e40bf") },
      nearEdge: { value: new THREE.Color("#8d32b5") },
      deepContour: { value: new THREE.Color("#6d47a3") },
      middleContour: { value: new THREE.Color("#775bcc") },
      nearContour: { value: new THREE.Color("#a853d3") },
    };
    this.mesh = new THREE.Mesh(
      // Overscan keeps the terrain covering the wider boost camera view.
      track(new THREE.PlaneGeometry(1.2, 1.2)),
      track(
        new THREE.ShaderMaterial({
          uniforms: this.uniforms,
          vertexShader: `varying vec2 vUv;
          void main(){vUv=(uv-.5)*1.2+.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
          fragmentShader: `varying vec2 vUv;
          uniform vec3 travel;
          uniform float height, width, horizontal, reveal;
          uniform vec3 floorColor, deepColor, middleColor, nearColor;
          uniform vec3 deepEdge, middleEdge, nearEdge;
          uniform vec3 deepContour, middleContour, nearContour;
          ${canyonWallShader}
          ${terrainSceneryShader}
          vec3 shelf(vec3 under, vec3 fill, vec3 edge, float x, float boundary, float thickness, vec2 point, float cellSize, vec3 contourColor, float layer){
            float mask=smoothstep(boundary-.002,boundary+.002,x);
            vec3 mapped=terrainMap(fill,contourColor,point+layer*5.,28./sqrt(cellSize/.6));
            mapped=terrainDetails(mapped,point,layer);
            vec3 color=mix(under,mapped,mask);
            // Keep each shelf's contours attached to its own scrolling rock surface.
            float shadow=exp(-abs(x-(boundary-.012))*65.)*(1.-mask);
            color*=1.-shadow*.2;
            float rim=1.-smoothstep(thickness,thickness+.0015,abs(x-boundary));
            color=mix(color,edge,rim*.85);
            return color;
          }
          void main(){
            float side=vUv.x<.5?-1.:1.;
            float x=abs(vUv.x*2.-1.);
            float y=(vUv.y-.5)*height;
            float deep=.43+wall(y+travel.x,side*.9);
            float middle=.61+wall(y+travel.y,side*1.4+2.);
            float near=.79+wall(y+travel.z,side*.7+4.);
            float worldX=(vUv.x-.5)*width;
            vec3 color=floorColor*(.94+.06*cos(x*3.));
            vec2 floorPoint=vec2(worldX,y+travel.x*.45);
            color=terrainMap(color,deepContour*.65,floorPoint,36.);
            color=terrainDetails(color,floorPoint,0.);
            color=shelf(color,deepColor,deepEdge,x+horizontal*side*.006,deep,.0015,vec2(worldX+horizontal*.003*width,y+travel.x),.6,deepContour,1.);
            color=shelf(color,middleColor,middleEdge,x+horizontal*side*.014,middle,.0025,vec2(worldX+horizontal*.007*width,y+travel.y),1.2,middleContour,2.);
            color=shelf(color,nearColor,nearEdge,x+horizontal*side*.025,near,.0018,vec2(worldX+horizontal*.0125*width,y+travel.z),2.4,nearContour,3.);
            gl_FragColor=vec4(color,reveal);
          }`,
          transparent: true,
          depthWrite: false,
        }),
      ),
    );
    this.mesh.position.z = -25;
    this.mesh.frustumCulled = false;
  }

  resize(width, height) {
    this.mesh.scale.set(width, height, 1);
    this.uniforms.height.value = height;
    this.uniforms.width.value = width;
  }

  update(dt, speed, horizontal, reveal) {
    const travel = this.uniforms.travel.value;
    travel.x += dt * speed * 0.36;
    travel.y += dt * speed * 0.67;
    travel.z += dt * speed * 1.08;
    this.uniforms.horizontal.value = THREE.MathUtils.lerp(
      this.uniforms.horizontal.value,
      horizontal,
      1 - Math.exp(-dt * 5),
    );
    this.uniforms.reveal.value = reveal;
    this.mesh.visible = reveal > 0.001;
  }
}
