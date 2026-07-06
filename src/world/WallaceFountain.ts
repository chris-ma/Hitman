import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AABB } from '../utils/collision';

export interface BuiltFountain {
  group: THREE.Group;
  footprint: AABB;
}

// The classic Wallace dark green, shared across all instances.
const wallaceGreen = new THREE.MeshStandardMaterial({ color: 0x1e3b2a, roughness: 0.8, metalness: 0.4, envMapIntensity: 0.6 });
const waterMat = new THREE.MeshStandardMaterial({ color: 0x2b4a52, roughness: 0.15, metalness: 0.1, envMapIntensity: 1.2 });

let ironGeoCache: THREE.BufferGeometry | null = null;

/** All cast-iron parts merged into one reusable geometry (one draw call per fountain). */
function ironGeometry(): THREE.BufferGeometry {
  if (ironGeoCache) return ironGeoCache;
  const geos: THREE.BufferGeometry[] = [];

  // Octagonal plinth + basin.
  geos.push(new THREE.CylinderGeometry(1.0, 1.15, 0.35, 8).translate(0, 0.175, 0));
  geos.push(new THREE.CylinderGeometry(0.88, 0.98, 0.5, 8).translate(0, 0.6, 0));
  // Central pedestal rising out of the basin.
  geos.push(new THREE.CylinderGeometry(0.34, 0.52, 0.7, 8).translate(0, 1.15, 0));

  // Four caryatid figures: slender columns leaning slightly inward, with
  // small head knobs, supporting the dome.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const r = 0.34;
    const fig = new THREE.CylinderGeometry(0.075, 0.11, 1.1, 6);
    fig.rotateX(0.1); // lean inward (before orienting around the axis)
    fig.rotateY(a + Math.PI); // face outward
    fig.translate(Math.cos(a) * r, 2.02, Math.sin(a) * r);
    geos.push(fig);
    geos.push(new THREE.SphereGeometry(0.09, 6, 5).translate(Math.cos(a) * r * 0.82, 2.62, Math.sin(a) * r * 0.82));
  }

  // Entablature ring, ribbed dome and finial.
  geos.push(new THREE.CylinderGeometry(0.44, 0.38, 0.14, 8).translate(0, 2.72, 0));
  const dome = new THREE.SphereGeometry(0.42, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 1.2, 1);
  dome.translate(0, 2.78, 0);
  geos.push(dome);
  geos.push(new THREE.ConeGeometry(0.08, 0.28, 6).translate(0, 3.4, 0));

  ironGeoCache = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  return ironGeoCache;
}

/**
 * A Wallace fountain — the little dark-green cast-iron drinking fountain
 * found on Paris sidewalks: octagonal basin, four caryatids, ribbed dome.
 */
export function buildWallaceFountain(x: number, z: number): BuiltFountain {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  group.add(new THREE.Mesh(ironGeometry(), wallaceGreen));

  // Still water inside the basin.
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.82, 8), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.78;
  group.add(water);

  const half = 1.0;
  return {
    group,
    footprint: { minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half },
  };
}
