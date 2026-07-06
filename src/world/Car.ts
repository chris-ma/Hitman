import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CarSpec } from './cityData';
import type { AABB } from '../utils/collision';

export interface BuiltCars {
  group: THREE.Group;
  /** One XZ collision box per car. */
  footprints: AABB[];
  /** Merged meshes that block bullets and enemy line-of-sight. */
  occluders: THREE.Mesh[];
}

// Muted, street-worn paint — deliberately desaturated (no showroom gloss;
// envMapIntensity stays in the same detuned range as the rest of the city).
const PAINT_VARIANTS = [0x4a5560, 0x5c4b43, 0x525a4c];
const paintMats = PAINT_VARIANTS.map(
  (color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, envMapIntensity: 0.45 }),
);
const darkMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.9, metalness: 0.2 });
const windowMat = new THREE.MeshStandardMaterial({
  color: 0x1d232b,
  roughness: 0.3,
  metalness: 0.2,
  envMapIntensity: 0.5,
});
const headlightMat = new THREE.MeshStandardMaterial({
  color: 0xaaa089,
  emissive: 0xffe9b0,
  emissiveIntensity: 0.55,
  roughness: 0.4,
});
const taillightMat = new THREE.MeshStandardMaterial({
  color: 0x5a1f1a,
  emissive: 0xff2a1a,
  emissiveIntensity: 0.5,
  roughness: 0.4,
});

/** Half extents of a car's collision box in its local frame (x = width, z = length). */
const HALF_W = 0.95;
const HALF_L = 2.25;

/**
 * Low-poly parked cars. All cars merge into a handful of world-space meshes
 * (one per material: 3 paints + trim + glass + head/tail lights), so a
 * street's worth of parked metal costs ~7 draw calls total.
 */
export function buildCars(specs: CarSpec[]): BuiltCars {
  const group = new THREE.Group();
  const footprints: AABB[] = [];
  const occluders: THREE.Mesh[] = [];

  const paintGeos: THREE.BufferGeometry[][] = PAINT_VARIANTS.map(() => []);
  const darkGeos: THREE.BufferGeometry[] = [];
  const windowGeos: THREE.BufferGeometry[] = [];
  const headGeos: THREE.BufferGeometry[] = [];
  const tailGeos: THREE.BufferGeometry[] = [];

  for (const spec of specs) {
    // Authored facing +Z (front bumper at +z), then rotated/translated into place.
    const place = (geo: THREE.BufferGeometry): THREE.BufferGeometry =>
      geo.rotateY(spec.rotationY).translate(spec.x, 0, spec.z);

    const bucket = paintGeos[spec.variant % PAINT_VARIANTS.length];
    // Body shell.
    bucket.push(place(new THREE.BoxGeometry(1.8, 0.62, 4.3).translate(0, 0.66, 0)));
    // Cabin / greenhouse.
    bucket.push(place(new THREE.BoxGeometry(1.62, 0.52, 2.1).translate(0, 1.2, -0.25)));
    // Window band, slightly wider than the cabin so it reads through the paint.
    windowGeos.push(place(new THREE.BoxGeometry(1.66, 0.3, 1.9).translate(0, 1.22, -0.25)));
    // Dark underbody skirt grounds the silhouette.
    darkGeos.push(place(new THREE.BoxGeometry(1.7, 0.24, 4.0).translate(0, 0.3, 0)));
    // Wheels.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        darkGeos.push(
          place(
            new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10)
              .rotateZ(Math.PI / 2)
              .translate(sx * 0.82, 0.32, sz * 1.35),
          ),
        );
      }
    }
    // Head / tail light accents.
    for (const sx of [-1, 1]) {
      headGeos.push(place(new THREE.BoxGeometry(0.34, 0.13, 0.05).translate(sx * 0.56, 0.78, 2.16)));
      tailGeos.push(place(new THREE.BoxGeometry(0.3, 0.12, 0.05).translate(sx * 0.6, 0.78, -2.16)));
    }

    // Collision footprint (quarter-turn aware, same convention as buildings).
    const quarterTurn = Math.abs(Math.sin(spec.rotationY)) > 0.5;
    const hw = quarterTurn ? HALF_L : HALF_W;
    const hd = quarterTurn ? HALF_W : HALF_L;
    footprints.push({ minX: spec.x - hw, maxX: spec.x + hw, minZ: spec.z - hd, maxZ: spec.z + hd });
  }

  const commit = (geos: THREE.BufferGeometry[], mat: THREE.Material, blocking: boolean): void => {
    if (geos.length === 0) return;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    group.add(mesh);
    if (blocking) occluders.push(mesh);
  };

  paintGeos.forEach((geos, i) => commit(geos, paintMats[i], true));
  commit(darkGeos, darkMat, true);
  commit(windowGeos, windowMat, true);
  commit(headGeos, headlightMat, false);
  commit(tailGeos, taillightMat, false);

  return { group, footprints, occluders };
}
