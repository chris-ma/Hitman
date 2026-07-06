import * as THREE from 'three';
import type { AABB } from '../utils/collision';

export interface BuiltTower {
  group: THREE.Group;
  /** Small AABBs around each base leg so the player can walk under the arch but not through iron. */
  footprints: AABB[];
}

const IRON = new THREE.MeshStandardMaterial({ color: 0x4d4038, roughness: 0.8, metalness: 0.4, envMapIntensity: 0.6 });

/** Cylinder strut from a to b. */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), IRON);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

/**
 * Stylized Eiffel Tower, ~135 units tall (buildings are ~22-27), so it
 * dominates the skyline as a landmark. Built from tapered leg struts in three
 * stacked sections with X cross-bracing, platform slabs at the section breaks,
 * and a spire + antenna.
 */
export function buildEiffelTower(x: number, z: number): BuiltTower {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  // Corner half-spreads at each level (real silhouette: wide splayed base,
  // pinching in fast to the first platform, then a slow taper).
  const levels = [
    { y: 0, s: 21 },
    { y: 20, s: 13.5 },
    { y: 38, s: 8.5 }, // first platform
    { y: 64, s: 5 }, // second platform
    { y: 92, s: 2.4 },
    { y: 116, s: 0.9 }, // top platform / spire base
  ];
  const legRadius = [1.5, 1.15, 0.85, 0.6, 0.42, 0.3];

  const corner = (s: number, y: number, cx: number, cz: number) => new THREE.Vector3(cx * s, y, cz * s);
  const corners: Array<[number, number]> = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  // Legs: one strut per corner per level segment.
  for (let i = 0; i < levels.length - 1; i++) {
    const lo = levels[i];
    const hi = levels[i + 1];
    for (const [cx, cz] of corners) {
      group.add(strut(corner(lo.s, lo.y, cx, cz), corner(hi.s, hi.y, cx, cz), legRadius[i]));
    }
  }

  // X cross-bracing between adjacent legs per section (stylized ironwork).
  const braceRadius = [0.4, 0.32, 0.26, 0.2, 0.15];
  const edges: Array<[[number, number], [number, number]]> = [
    [[1, 1], [1, -1]],
    [[1, -1], [-1, -1]],
    [[-1, -1], [-1, 1]],
    [[-1, 1], [1, 1]],
  ];
  for (let i = 0; i < levels.length - 1; i++) {
    const lo = levels[i];
    const hi = levels[i + 1];
    for (const [a, b] of edges) {
      group.add(strut(corner(lo.s, lo.y, a[0], a[1]), corner(hi.s, hi.y, b[0], b[1]), braceRadius[i]));
      group.add(strut(corner(lo.s, lo.y, b[0], b[1]), corner(hi.s, hi.y, a[0], a[1]), braceRadius[i]));
    }
    // Horizontal ring at the top of each section.
    for (const [a, b] of edges) {
      group.add(strut(corner(hi.s, hi.y, a[0], a[1]), corner(hi.s, hi.y, b[0], b[1]), braceRadius[i] * 0.9));
    }
  }

  // Base arches: shallow horizontal beams suggesting the arch under each face.
  for (const [a, b] of edges) {
    const pa = corner(15, 13, a[0], a[1]);
    const pb = corner(15, 13, b[0], b[1]);
    group.add(strut(pa, pb, 0.5));
  }

  // Platform slabs at the section breaks.
  const platform = (y: number, s: number, thickness: number) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(s * 2 + 2.5, thickness, s * 2 + 2.5), IRON);
    p.position.y = y;
    group.add(p);
  };
  platform(38, 8.5, 1.6);
  platform(64, 5, 1.3);
  platform(116, 0.9, 1.0);

  // Spire + antenna.
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.4, 10, 8), IRON);
  spire.position.y = 121;
  group.add(spire);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 10, 6), IRON);
  antenna.position.y = 131;
  group.add(antenna);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffdd88, emissiveIntensity: 3 }),
  );
  beacon.position.y = 136;
  group.add(beacon);

  // Collision: a box around each base leg (foot region only — you can walk
  // beneath the tower between the legs).
  const footprints: AABB[] = corners.map(([cx, cz]) => {
    const legX = x + cx * 21;
    const legZ = z + cz * 21;
    const half = 4.5;
    return { minX: legX - half, maxX: legX + half, minZ: legZ - half, maxZ: legZ + half };
  });

  return { group, footprints };
}
