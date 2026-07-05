import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BuildingSpec } from './cityData';
import type { AABB } from '../utils/collision';
import {
  makeFacadeTextures,
  makeIronRailingTexture,
  makeAwningStripeTexture,
  makeRng,
} from './proceduralTextures';

export interface BuiltBuilding {
  group: THREE.Group;
  footprint: AABB;
  /** Meshes that should block bullets and enemy line-of-sight. */
  occluders: THREE.Mesh[];
}

const ROOF_COLOR = 0x46505c; // zinc
const TRIM_COLOR = '#d9cbae'; // pale limestone for cornices, slabs, brackets
const plainWallCache = new Map<string, THREE.MeshStandardMaterial>();

function plainWall(colorHex: string): THREE.MeshStandardMaterial {
  let m = plainWallCache.get(colorHex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.95 });
    plainWallCache.set(colorHex, m);
  }
  return m;
}

// Shared across every building — never instantiated per building.
const roofMat = new THREE.MeshStandardMaterial({ color: ROOF_COLOR, roughness: 0.6, metalness: 0.35 });
const paneMat = new THREE.MeshStandardMaterial({ color: 0x232b36, roughness: 0.35, metalness: 0.15 });
const potMat = new THREE.MeshStandardMaterial({ color: 0xc07a55, roughness: 0.85 });
const brickMat = plainWall('#b3684f');

let railingMatSingleton: THREE.MeshStandardMaterial | null = null;
function railingMat(): THREE.MeshStandardMaterial {
  if (!railingMatSingleton) {
    railingMatSingleton = new THREE.MeshStandardMaterial({
      map: makeIronRailingTexture(),
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.55,
      metalness: 0.45,
    });
  }
  return railingMatSingleton;
}

// Three classic café awning color schemes, shared across all buildings.
const AWNING_SCHEMES: Array<[string, string]> = [
  ['#2e5941', '#e9e0c8'], // green / cream
  ['#7c2430', '#e9dcc4'], // burgundy / cream
  ['#27384f', '#ddd6c2'], // navy / cream
];
const awningMatCache = new Map<number, THREE.MeshStandardMaterial>();
function awningMat(scheme: number): THREE.MeshStandardMaterial {
  let m = awningMatCache.get(scheme);
  if (!m) {
    const [a, b] = AWNING_SCHEMES[scheme % AWNING_SCHEMES.length];
    m = new THREE.MeshStandardMaterial({
      map: makeAwningStripeTexture(a, b),
      side: THREE.DoubleSide,
      roughness: 0.9,
    });
    awningMatCache.set(scheme, m);
  }
  return m;
}

function facadeMaterial(cols: number, rows: number, color: string, seed: number, litRatio: number): THREE.MeshStandardMaterial {
  const { map, emissiveMap } = makeFacadeTextures(cols, rows, color, seed, litRatio);
  return new THREE.MeshStandardMaterial({
    map,
    emissive: new THREE.Color(0xffb060),
    emissiveMap,
    emissiveIntensity: 0.9,
    roughness: 0.9,
  });
}

/** Multiply a #rrggbb color's brightness by `f` (clamped). */
function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((n >> shift) & 0xff) * f)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** Scale the U coordinate of a geometry's UVs (for repeat-wrapped textures on merged geometry). */
function scaleU(geo: THREE.BufferGeometry, repeat: number): THREE.BufferGeometry {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repeat);
  return geo;
}

/** Merge a bucket of pre-transformed geometries into one mesh (one draw call). */
function mergedMesh(geos: THREE.BufferGeometry[], mat: THREE.Material): THREE.Mesh | null {
  if (geos.length === 0) return null;
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return null;
  return new THREE.Mesh(merged, mat);
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** Build one Haussmannian building from its spec. Group origin is at ground level (y=0) at (x, z). */
export function buildBuilding(spec: BuildingSpec): BuiltBuilding {
  const group = new THREE.Group();
  group.position.set(spec.x, 0, spec.z);
  if (spec.rotationY) group.rotation.y = spec.rotationY;

  // Deterministic per-building randomness derived from position.
  const seed = ((Math.round(spec.x * 7) * 73856093) ^ (Math.round(spec.z * 7) * 19349663)) >>> 0;
  const rng = makeRng(seed);

  // Slight per-building tonal variation on top of the 4 limestone swatches.
  const color = shadeHex(spec.facadeColorHex ?? '#e3d5b8', 0.93 + rng() * 0.12);
  const litRatio = 0.16 + rng() * 0.26;
  const occluders: THREE.Mesh[] = [];

  // Window columns scale with facade width; one texture for front/back, one for the sides.
  const colsFB = Math.max(3, Math.round(spec.width / 3));
  const colsLR = Math.max(3, Math.round(spec.depth / 3));
  const rows = Math.max(3, spec.floors - 1); // ground floor is the shopfront band

  const matFB = facadeMaterial(colsFB, rows, color, seed, litRatio);
  const matLR = facadeMaterial(colsLR, rows, color, seed + 101, litRatio);
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
    plainWall(TRIM_COLOR),
  );
  cornice.position.y = spec.height + 0.25;
  group.add(cornice);

  // ---------------------------------------------------------------------
  // Street-facing detail. Built in a local frame where the facade runs
  // along X and faces +Z, then the whole subgroup is rotated toward the
  // nearest street. Everything is merged per material to keep draw calls low.
  // ---------------------------------------------------------------------
  const frontIsX = spec.depth > spec.width; // cross-street buildings front on ±X
  const frontSign = (frontIsX ? -Math.sign(spec.x) : -Math.sign(spec.z)) || 1;
  const facadeLen = frontIsX ? spec.depth : spec.width;
  const facadeCols = frontIsX ? colsLR : colsFB;
  const wallHalfOut = (frontIsX ? spec.width : spec.depth) / 2;

  const front = new THREE.Group();
  front.rotation.y = frontIsX ? (frontSign > 0 ? Math.PI / 2 : -Math.PI / 2) : frontSign > 0 ? 0 : Math.PI;
  group.add(front);

  const trimGeos: THREE.BufferGeometry[] = [];
  const railGeos: THREE.BufferGeometry[] = [];
  const awningGeos: THREE.BufferGeometry[] = [];
  const dormerGeos: THREE.BufferGeometry[] = [];
  const dormerCapGeos: THREE.BufferGeometry[] = [];
  const paneGeos: THREE.BufferGeometry[] = [];

  // --- Real 3D wrought-iron balconies at the levels the facade texture marks.
  const upperWorld = spec.height * 0.84; // texture: bottom 16% is the shopfront band
  const rowWorld = upperWorld / rows;
  const balconyRows = [1, rows - 2].filter((r) => r >= 0 && r < rows && rows >= 4);
  const balconyLen = facadeLen - 1.0;
  const RAIL_H = 0.85;
  for (const r of balconyRows) {
    const yFloor = spec.height - (r + 0.85) * rowWorld; // matches texture band
    // Floor slab, protruding ~0.45 from the wall.
    trimGeos.push(box(balconyLen, 0.14, 0.62, 0, yFloor - 0.07, wallHalfOut + 0.14));
    // Railing: front strip + two small returns to the wall.
    railGeos.push(
      scaleU(new THREE.PlaneGeometry(balconyLen, RAIL_H), Math.round(balconyLen / 1.1)).translate(
        0,
        yFloor + RAIL_H / 2,
        wallHalfOut + 0.43,
      ),
    );
    for (const s of [-1, 1]) {
      railGeos.push(
        scaleU(new THREE.PlaneGeometry(0.45, RAIL_H), 1)
          .rotateY(Math.PI / 2)
          .translate(s * balconyLen * 0.5, yFloor + RAIL_H / 2, wallHalfOut + 0.21),
      );
    }
  }

  // --- Modillion brackets under the cornice lip (dentil rhythm).
  const modillionCount = Math.max(6, Math.round(facadeLen / 1.1));
  for (let i = 0; i < modillionCount; i++) {
    const mx = -facadeLen / 2 + ((i + 0.5) * facadeLen) / modillionCount;
    trimGeos.push(box(0.18, 0.28, 0.26, mx, spec.height - 0.14, wallHalfOut + 0.17));
  }

  // --- Ground-floor café awnings over 1-2 of the shopfront openings.
  const shops = Math.max(2, Math.round(facadeCols / 1.5));
  const shopW = facadeLen / shops;
  const scheme = Math.floor(rng() * AWNING_SCHEMES.length);
  const awningCount = 1 + (rng() < 0.5 ? 1 : 0);
  const firstShop = Math.floor(rng() * shops);
  const shopSlots = new Set<number>();
  shopSlots.add(firstShop);
  if (awningCount > 1) shopSlots.add((firstShop + 1 + Math.floor(rng() * (shops - 1))) % shops);
  const bandTop = 0.16 * spec.height;
  for (const s of shopSlots) {
    const cx = -facadeLen / 2 + (s + 0.5) * shopW;
    const aw = shopW * 0.82;
    const yTop = Math.min(bandTop * 0.82, 3.4);
    const stripes = Math.max(2, Math.round(aw / 1.2));
    // Sloped canopy: top edge on the wall, falling outward.
    const slope = scaleU(new THREE.PlaneGeometry(aw, 1.35), stripes);
    slope.translate(0, -0.675, 0); // hang from the top edge
    slope.rotateX(-1.0); // down 0.73, out 1.13
    slope.translate(cx, yTop, wallHalfOut + 0.03);
    awningGeos.push(slope);
    // Hanging valance at the outer edge.
    awningGeos.push(
      scaleU(new THREE.PlaneGeometry(aw, 0.28), stripes).translate(cx, yTop - 0.73 - 0.13, wallHalfOut + 1.16),
    );
  }

  if (spec.roofType === 'mansard') {
    // 4-sided tapered cylinder rotated 45° => pyramid-frustum whose flat faces
    // align with the walls. Radius 1 at 45° gives a half-extent of cos(45°).
    const roofH = 3.5;
    const geo = new THREE.CylinderGeometry(0.55, 1, 1, 4, 1);
    const roof = new THREE.Mesh(geo, roofMat);
    roof.rotation.y = Math.PI / 4;
    const half = Math.SQRT1_2; // cos(45°)
    roof.scale.set(spec.width / 2 / half, roofH, spec.depth / 2 / half);
    roof.position.y = spec.height + 0.5 + roofH / 2;
    group.add(roof);
    occluders.push(roof);

    // --- Dormer windows (lucarnes) punched through the street-facing slope.
    const dormerCount = Math.min(4, Math.max(2, Math.round(facadeLen / 5)));
    const roofBase = spec.height + 0.5;
    const t = 0.32; // fraction up the mansard slope
    const outAt = wallHalfOut * (1 - 0.45 * t); // slope half-extent at that height
    for (let i = 0; i < dormerCount; i++) {
      const dx = (-(dormerCount - 1) / 2 + i) * (facadeLen / dormerCount);
      const dy = roofBase + roofH * t + 0.28;
      // Dormer box, half-buried in the slope.
      dormerGeos.push(box(0.95, 1.05, 1.15, dx, dy, outAt - 0.25));
      // Tiny zinc pyramid cap.
      dormerCapGeos.push(
        new THREE.ConeGeometry(0.78, 0.5, 4).rotateY(Math.PI / 4).translate(dx, dy + 0.77, outAt - 0.25),
      );
      // Dark window pane on the street face.
      paneGeos.push(new THREE.PlaneGeometry(0.58, 0.72).translate(dx, dy + 0.05, outAt + 0.33));
    }

    // --- Chimney stack with a cluster of terracotta pots near one ridge end.
    addChimney(group, spec, rng, spec.height + roofH + 0.35);
  } else {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(spec.width - 1, 0.8, spec.depth - 1), roofMat);
    cap.position.y = spec.height + 0.9;
    group.add(cap);
    occluders.push(cap);

    // Flat roofs get a low parapet trim and a chimney too.
    trimGeos.push(box(facadeLen + 0.4, 0.35, 0.3, 0, spec.height + 0.65, wallHalfOut + 0.05));
    addChimney(group, spec, rng, spec.height + 1.3);
  }

  // Commit the merged detail meshes (one draw call per material bucket).
  const buckets: Array<[THREE.BufferGeometry[], THREE.Material]> = [
    [trimGeos, plainWall(TRIM_COLOR)],
    [railGeos, railingMat()],
    [awningGeos, awningMat(scheme)],
    [dormerGeos, matPlain],
    [dormerCapGeos, roofMat],
    [paneGeos, paneMat],
  ];
  for (const [geos, mat] of buckets) {
    const mesh = mergedMesh(geos, mat);
    if (mesh) front.add(mesh);
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

/** Brick chimney stack topped with 2-3 terracotta pots, offset along the ridge. */
function addChimney(group: THREE.Group, spec: BuildingSpec, rng: () => number, baseY: number): void {
  const alongX = spec.width >= spec.depth; // ridge runs along the longer axis
  const extent = (alongX ? spec.width : spec.depth) / 2;
  const offset = (0.35 + rng() * 0.25) * extent * (rng() < 0.5 ? -1 : 1);
  const cx = alongX ? offset : 0;
  const cz = alongX ? 0 : offset;

  const stack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 0.8), brickMat);
  stack.position.set(cx, baseY + 0.45, cz);
  group.add(stack);

  const potCount = 2 + (rng() < 0.6 ? 1 : 0);
  const potGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < potCount; i++) {
    const px = cx + (-(potCount - 1) / 2 + i) * 0.34;
    const h = 0.5 + rng() * 0.25;
    potGeos.push(new THREE.CylinderGeometry(0.09, 0.12, h, 7).translate(px, baseY + 1.2 + h / 2, cz));
  }
  const pots = mergedMesh(potGeos, potMat);
  if (pots) group.add(pots);
}
