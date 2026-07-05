import * as THREE from 'three';
import type { BuildingSpec } from './cityData';
import type { AABB } from '../utils/collision';
import { makeFacadeTextures } from './proceduralTextures';

export interface BuiltBuilding {
  group: THREE.Group;
  footprint: AABB;
  /** Meshes that should block bullets and enemy line-of-sight. */
  occluders: THREE.Mesh[];
}

const ROOF_COLOR = 0x46505c; // zinc
const plainWallCache = new Map<string, THREE.MeshStandardMaterial>();

function plainWall(colorHex: string): THREE.MeshStandardMaterial {
  let m = plainWallCache.get(colorHex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.95 });
    plainWallCache.set(colorHex, m);
  }
  return m;
}

function facadeMaterial(cols: number, rows: number, color: string): THREE.MeshStandardMaterial {
  const { map, emissiveMap } = makeFacadeTextures(cols, rows, color);
  return new THREE.MeshStandardMaterial({
    map,
    emissive: new THREE.Color(0xffb060),
    emissiveMap,
    emissiveIntensity: 0.9,
    roughness: 0.9,
  });
}

/** Build one Haussmannian building from its spec. Group origin is at ground level (y=0) at (x, z). */
export function buildBuilding(spec: BuildingSpec): BuiltBuilding {
  const group = new THREE.Group();
  group.position.set(spec.x, 0, spec.z);
  if (spec.rotationY) group.rotation.y = spec.rotationY;

  const color = spec.facadeColorHex ?? '#e3d5b8';
  const occluders: THREE.Mesh[] = [];

  // Window columns scale with facade width; one texture for front/back, one for the sides.
  const colsFB = Math.max(3, Math.round(spec.width / 3));
  const colsLR = Math.max(3, Math.round(spec.depth / 3));
  const rows = Math.max(3, spec.floors - 1); // ground floor is the shopfront band

  const matFB = facadeMaterial(colsFB, rows, color);
  const matLR = facadeMaterial(colsLR, rows, color);
  const matPlain = plainWall(color);

  // Box material order: +x, -x, +y, -y, +z, -z
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.width, spec.height, spec.depth), [
    matLR,
    matLR,
    matPlain,
    matPlain,
    matFB,
    matFB,
  ]);
  body.position.y = spec.height / 2;
  group.add(body);
  occluders.push(body);

  // Cornice: thin slab slightly proud of the walls, very Haussmann.
  const cornice = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width + 0.6, 0.5, spec.depth + 0.6),
    plainWall('#d9cbae'),
  );
  cornice.position.y = spec.height + 0.25;
  group.add(cornice);

  if (spec.roofType === 'mansard') {
    // 4-sided tapered cylinder rotated 45° => pyramid-frustum whose flat faces
    // align with the walls. Radius 1 at 45° gives a half-extent of cos(45°).
    const roofH = 3.5;
    const geo = new THREE.CylinderGeometry(0.55, 1, 1, 4, 1);
    const roof = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: ROOF_COLOR, roughness: 0.6, metalness: 0.35 }));
    roof.rotation.y = Math.PI / 4;
    const half = Math.SQRT1_2; // cos(45°)
    roof.scale.set(spec.width / 2 / half, roofH, spec.depth / 2 / half);
    roof.position.y = spec.height + 0.5 + roofH / 2;
    group.add(roof);
    occluders.push(roof);

    // A couple of chimney stacks (terracotta pots skipped, stylized box).
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 0.8), plainWall('#b3684f'));
    chimney.position.set(spec.width * 0.25, spec.height + roofH + 0.8, 0);
    group.add(chimney);
  } else {
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width - 1, 0.8, spec.depth - 1),
      new THREE.MeshStandardMaterial({ color: ROOF_COLOR, roughness: 0.7, metalness: 0.3 }),
    );
    cap.position.y = spec.height + 0.9;
    group.add(cap);
    occluders.push(cap);
  }

  // Footprint for collision. Supports the 0/90° rotations used by city data.
  const quarterTurn = spec.rotationY ? Math.abs(Math.sin(spec.rotationY)) > 0.5 : false;
  const hw = (quarterTurn ? spec.depth : spec.width) / 2;
  const hd = (quarterTurn ? spec.width : spec.depth) / 2;
  const footprint: AABB = {
    minX: spec.x - hw,
    maxX: spec.x + hw,
    minZ: spec.z - hd,
    maxZ: spec.z + hd,
  };

  return { group, footprint, occluders };
}
