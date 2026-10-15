import * as THREE from "three";

export const WEAPON_STRENGTHS = {
  1: { color: "#289dff" },
  2: { color: "#ff803b" },
  3: { color: "#8855ff", core: "#ffffff" },
};

// Templates share geometry and materials across every shot.
export function createBulletTemplates(geometry, track) {
  return Object.fromEntries(
    Object.entries(WEAPON_STRENGTHS).map(([strength, profile]) => {
      const bullet = new THREE.Group();
      const shell = new THREE.Mesh(
        geometry,
        track(
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(profile.color).multiplyScalar(2),
          }),
        ),
      );
      shell.scale.x = Number(strength) === 3 ? 2 : 1;
      bullet.add(shell);
      if (profile.core) {
        const core = new THREE.Mesh(
          geometry,
          track(
            new THREE.MeshBasicMaterial({
              color: new THREE.Color(profile.core).multiplyScalar(2),
            }),
          ),
        );
        core.scale.set(0.7, 0.8, 0.5);
        core.position.z = 0.07;
        bullet.add(core);
      }
      return [strength, bullet];
    }),
  );
}
