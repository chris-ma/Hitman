import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AABB } from '../utils/collision';
import { makeMetroSignTexture } from './proceduralTextures';

export interface BuiltMetro {
  group: THREE.Group;
  footprint: AABB;
}

const guimardGreen = new THREE.MeshStandardMaterial({ color: 0x2c4636, roughness: 0.5, metalness: 0.45, envMapIntensity: 1.4 });
const lampMat = new THREE.MeshStandardMaterial({
  color: 0xffb36b,
  emissive: 0xff8c3a,
  emissiveIntensity: 1.6,
});

/**
 * Guimard-style Art Nouveau Métro entrance: cast-iron balustrade around the
 * stair pit, two plant-stem posts with amber globe lamps, and the arched
 * MÉTROPOLITAIN sign between them. Opening faces +Z. Decorative — the whole
 * pit is fenced off for collision so the player can't fall into a fake hole.
 */
export function buildMetroEntrance(x: number, z: number): BuiltMetro {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  // --- Cast-iron work, merged into one mesh.
  const geos: THREE.BufferGeometry[] = [];

  // Balustrade panels around three sides of the pit (open toward +Z).
  geos.push(new THREE.BoxGeometry(0.22, 0.95, 4.6).translate(-1.55, 0.55, 0)); // west side
  geos.push(new THREE.BoxGeometry(0.22, 0.95, 4.6).translate(1.55, 0.55, 0)); // east side
  geos.push(new THREE.BoxGeometry(3.32, 0.95, 0.22).translate(0, 0.55, -2.3)); // back
  // Top rails, slightly proud (the classic fat Guimard hand-rail).
  geos.push(new THREE.BoxGeometry(0.3, 0.12, 4.7).translate(-1.55, 1.08, 0));
  geos.push(new THREE.BoxGeometry(0.3, 0.12, 4.7).translate(1.55, 1.08, 0));
  geos.push(new THREE.BoxGeometry(3.42, 0.12, 0.3).translate(0, 1.08, -2.3));
  // Escutcheon bumps along the side panels (stylized cartouches).
  for (const sx of [-1.55, 1.55]) {
    for (let i = 0; i < 3; i++) {
      geos.push(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 8).rotateZ(Math.PI / 2).translate(sx, 0.62, -1.4 + i * 1.4));
    }
  }

  // Two plant-stem posts at the open end, curving toward each other.
  for (const sx of [-1.55, 1.55]) {
    const lean = Math.sign(sx) * 0.16; // top of the stem drifts toward the center
    const stem = new THREE.CylinderGeometry(0.055, 0.11, 3.6, 7);
    stem.rotateZ(lean);
    stem.translate(sx, 1.8, 2.15);
    geos.push(stem);
    // Drooping bud over the lamp.
    const bud = new THREE.ConeGeometry(0.16, 0.5, 7);
    bud.rotateZ(Math.PI + lean * 2);
    bud.translate(sx - Math.sign(sx) * 0.55, 3.85, 2.15);
    geos.push(bud);
  }

  const iron = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  group.add(new THREE.Mesh(iron, guimardGreen));

  // Amber globe lamps hanging from the buds.
  for (const sx of [-1.55, 1.55]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), lampMat);
    lamp.position.set(sx - Math.sign(sx) * 0.55, 3.52, 2.15);
    group.add(lamp);
  }

  // MÉTROPOLITAIN sign panel spanning the posts.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 0.55),
    new THREE.MeshStandardMaterial({
      map: makeMetroSignTexture(),
      emissive: 0x3c2f10,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.6,
    }),
  );
  sign.position.set(0, 3.05, 2.15);
  group.add(sign);

  // Fake stair pit: a near-black recess with a few descending step edges.
  const pit = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, 4.3),
    new THREE.MeshBasicMaterial({ color: 0x07080a }),
  );
  pit.rotation.x = -Math.PI / 2;
  pit.position.set(0, 0.16, 0);
  group.add(pit);
  const stepGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    stepGeos.push(new THREE.BoxGeometry(2.6, 0.03, 0.32).translate(0, 0.17, 1.9 - i * 0.34));
  }
  const steps = mergeGeometries(stepGeos, false)!;
  for (const g of stepGeos) g.dispose();
  group.add(
    new THREE.Mesh(steps, new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 1 })),
  );

  // One AABB over the whole entrance: balustrade + pit are all no-go.
  return {
    group,
    footprint: { minX: x - 1.8, maxX: x + 1.8, minZ: z - 2.55, maxZ: z + 2.55 },
  };
}
