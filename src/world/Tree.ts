import * as THREE from 'three';
import type { AABB } from '../utils/collision';
import type { TreeSpec } from './cityData';
import { makeRng } from './proceduralTextures';

export interface BuiltTrees {
  group: THREE.Group;
  /** Slim trunk-only footprints — canopies never collide. */
  footprints: AABB[];
}

/**
 * Boulevard plane trees ("arbres en rideau"): tall mottled trunk with a
 * pruned, boxy-round canopy. All trunks share one InstancedMesh and all
 * canopy blobs share another, so an entire avenue of trees costs 2 draw calls.
 */
export function buildTrees(specs: TreeSpec[]): BuiltTrees {
  const group = new THREE.Group();
  const footprints: AABB[] = [];

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.27, 3.6, 7);
  trunkGeo.translate(0, 1.8, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a7f6a, roughness: 0.95 }); // mottled plane bark
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, specs.length);

  // Two canopy blobs per tree: a wide main crown and a smaller top tuft.
  const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, specs.length * 2);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();

  specs.forEach((spec, i) => {
    const rng = makeRng(((Math.round(spec.x * 3) * 2654435761) ^ Math.round(spec.z * 3)) >>> 0);
    const s = 0.85 + rng() * 0.35;

    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    m.compose(new THREE.Vector3(spec.x, 0.1, spec.z), q, new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m);

    // Main crown: wide flattened blob (pollarded look).
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    m.compose(
      new THREE.Vector3(spec.x, 0.1 + s * 4.3, spec.z),
      q,
      new THREE.Vector3(s * 2.1, s * 1.55, s * 2.1),
    );
    canopies.setMatrixAt(i * 2, m);
    canopies.setColorAt(i * 2, color.setHSL(0.24 + rng() * 0.04, 0.32, 0.26 + rng() * 0.07));

    // Top tuft, slightly offset.
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    m.compose(
      new THREE.Vector3(spec.x + (rng() - 0.5) * 0.7, 0.1 + s * 5.4, spec.z + (rng() - 0.5) * 0.7),
      q,
      new THREE.Vector3(s * 1.3, s * 1.0, s * 1.3),
    );
    canopies.setMatrixAt(i * 2 + 1, m);
    canopies.setColorAt(i * 2 + 1, color.setHSL(0.25 + rng() * 0.04, 0.34, 0.3 + rng() * 0.06));

    const half = 0.35;
    footprints.push({ minX: spec.x - half, maxX: spec.x + half, minZ: spec.z - half, maxZ: spec.z + half });
  });

  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;

  group.add(trunks, canopies);
  return { group, footprints };
}
