import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BuildingSpec } from './cityData';
import type { AABB } from '../utils/collision';
import {
  makeFacadeTextures,
  makeIronRailingTexture,
  makeAwningStripeTexture,
  makeRng,
  FACADE_GROUND_BAND_FRAC,
  WINDOW_X_FRAC,
  WINDOW_W_FRAC,
  WINDOW_Y_FRAC,
  WINDOW_H_FRAC,
} from './proceduralTextures';

export interface BuiltBuilding {
  group: THREE.Group;
  /**
   * XZ collision footprints. Usually one box, but canted-corner buildings
   * decompose into two boxes and the projecting central bay adds its own.
   */
  footprints: AABB[];
  /** Meshes that should block bullets and enemy line-of-sight. */
  occluders: THREE.Mesh[];
}

const ROOF_COLOR = 0x46505c; // zinc
const TRIM_COLOR = '#d9cbae'; // pale limestone for cornices, slabs, brackets
/** How far the avant-corps (projecting central bay) stands proud of the facade. */
const BAY_PROJ = 0.42;
/** Chamfer size (along each wall) of a canted street corner. */
const CANT = 3;
const plainWallCache = new Map<string, THREE.MeshStandardMaterial>();

function plainWall(colorHex: string): THREE.MeshStandardMaterial {
  let m = plainWallCache.get(colorHex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.95, envMapIntensity: 0.15 });
    plainWallCache.set(colorHex, m);
  }
  return m;
}

// Shared across every building — never instantiated per building.
const roofMat = new THREE.MeshStandardMaterial({ color: ROOF_COLOR, roughness: 0.78, metalness: 0.35, envMapIntensity: 0.35 });
const paneMat = new THREE.MeshStandardMaterial({ color: 0x232b36, roughness: 0.4, metalness: 0.15, envMapIntensity: 0.6 });
const potMat = new THREE.MeshStandardMaterial({ color: 0xc07a55, roughness: 0.85 });
const brickMat = plainWall('#b3684f');

// Real glass panes, one merged mesh per building (shared singleton material).
// MeshStandardMaterial on purpose: MeshPhysicalMaterial transmission would
// force an extra background render pass per transmissive object.
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x7e95a8, // faint blue tint
  roughness: 0.3,
  metalness: 0.15,
  transparent: true,
  opacity: 0.45,
  envMapIntensity: 0.55,
});

// Painted wrought iron with a thin lacquer clearcoat (deliberately narrow
// scope: railings only — facade/ground/glass shininess stays detuned).
let railingMatSingleton: THREE.MeshPhysicalMaterial | null = null;
function railingMat(): THREE.MeshPhysicalMaterial {
  if (!railingMatSingleton) {
    railingMatSingleton = new THREE.MeshPhysicalMaterial({
      map: makeIronRailingTexture(),
      transparent: true,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.4,
      envMapIntensity: 0.6,
      clearcoat: 0.4,
      clearcoatRoughness: 0.35,
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
  const { map, emissiveMap, bumpMap } = makeFacadeTextures(cols, rows, color, seed, litRatio);
  return new THREE.MeshStandardMaterial({
    map,
    emissive: new THREE.Color(0xffb060),
    emissiveMap,
    emissiveIntensity: 0.9,
    roughness: 0.9,
    bumpMap,
    bumpScale: 0.035,
    envMapIntensity: 0.18,
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

/** Remap the U coordinate of a geometry's UVs into [u0, u1] (facade sub-spans). */
function remapU(geo: THREE.BufferGeometry, u0: number, u1: number): THREE.BufferGeometry {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
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
  const footprints: AABB[] = [];

  // Window columns scale with facade width; one texture for front/back, one for the sides.
  const colsFB = Math.max(3, Math.round(spec.width / 3));
  const colsLR = Math.max(3, Math.round(spec.depth / 3));
  const rows = Math.max(3, spec.floors - 1); // ground floor is the shopfront band

  const matFB = facadeMaterial(colsFB, rows, color, seed, litRatio);
  const matLR = facadeMaterial(colsLR, rows, color, seed + 101, litRatio);
  const matPlain = plainWall(color);

  // ---------------------------------------------------------------------
  // Facade frame. The street-facing detail is built in a local frame where
  // the facade runs along X and faces +Z, then the whole subgroup is rotated
  // toward the nearest street.
  // ---------------------------------------------------------------------
  const frontIsX = spec.depth > spec.width; // cross-street buildings front on ±X
  const frontSign = (frontIsX ? -Math.sign(spec.x) : -Math.sign(spec.z)) || 1;
  const facadeLen = frontIsX ? spec.depth : spec.width;
  const wallHalfOut = (frontIsX ? spec.width : spec.depth) / 2;

  // Canted (angled) street corner: only boulevard-row corner buildings, cut
  // on the corner that faces the junction. Breaks the uniform-box-grid read.
  const canted = !!spec.canted && !frontIsX && !spec.rotationY;
  const cant = canted ? CANT : 0;
  const wcx = -Math.sign(spec.x) || 1; // world-x side of the junction corner
  // Chamfer end of the facade, expressed in front-local X.
  const cantSideLocal = canted ? wcx * (frontSign > 0 ? 1 : -1) : 0;

  // Effective front-facade span (shortened at a canted corner) and its center.
  const faLen = facadeLen - cant;
  const faOff = (-cantSideLocal * cant) / 2;
  const facadeColsFront = canted ? Math.max(3, Math.round(faLen / 3)) : frontIsX ? colsLR : colsFB;
  const matFront = canted ? facadeMaterial(facadeColsFront, rows, color, seed + 7, litRatio) : frontIsX ? matLR : matFB;

  // ---------------------------------------------------------------------
  // Main body volume.
  // ---------------------------------------------------------------------
  if (!canted) {
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

    // Footprint for collision. Supports the 0/90° rotations used by city data.
    const quarterTurn = spec.rotationY ? Math.abs(Math.sin(spec.rotationY)) > 0.5 : false;
    const hw = (quarterTurn ? spec.depth : spec.width) / 2;
    const hd = (quarterTurn ? spec.width : spec.depth) / 2;
    footprints.push({ minX: spec.x - hw, maxX: spec.x + hw, minZ: spec.z - hd, maxZ: spec.z + hd });
  } else {
    // Chamfered-rectangle silhouette, extruded to the wall height. The solid
    // (plain limestone) is the occluder/shadow caster; textured facade planes
    // sit 0.02 outside each wall so the window grids stay per-face aligned.
    const w = spec.width;
    const d = spec.depth;
    const fs = frontSign;
    const cx = (wcx * w) / 2;
    const cz = (fs * d) / 2;
    const corners: Array<[number, number]> = [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ];
    const pts: Array<[number, number]> = [];
    for (let k = 0; k < 4; k++) {
      const [px, py] = corners[k];
      if (px === cx && py === cz) {
        const [ax, ay] = corners[(k + 3) % 4];
        const [bx, by] = corners[(k + 1) % 4];
        pts.push([px - Math.sign(px - ax) * cant, py - Math.sign(py - ay) * cant]);
        pts.push([px + Math.sign(bx - px) * cant, py + Math.sign(by - py) * cant]);
      } else {
        pts.push([px, py]);
      }
    }
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) shape.lineTo(pts[k][0], pts[k][1]);
    shape.closePath();
    const solidGeo = new THREE.ExtrudeGeometry(shape, { depth: spec.height, bevelEnabled: false });
    // Shape (x, y) → world (x, z); extrusion depth becomes wall height.
    solidGeo.rotateX(Math.PI / 2);
    solidGeo.translate(0, spec.height, 0);
    const solid = new THREE.Mesh(solidGeo, matPlain);
    group.add(solid);
    occluders.push(solid);

    // Back facade plane (full width).
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, spec.height), matFB);
    back.position.set(0, spec.height / 2, -fs * (d / 2 + 0.02));
    back.rotation.y = fs > 0 ? Math.PI : 0;
    group.add(back);

    // Side facade planes: far side full depth, junction side shortened by the
    // chamfer. Same material, merged into one mesh.
    const sideGeos = [
      new THREE.PlaneGeometry(d, spec.height)
        .rotateY((-wcx * Math.PI) / 2)
        .translate(-wcx * (w / 2 + 0.02), spec.height / 2, 0),
      new THREE.PlaneGeometry(d - cant, spec.height)
        .rotateY((wcx * Math.PI) / 2)
        .translate(wcx * (w / 2 + 0.02), spec.height / 2, (-fs * cant) / 2),
    ];
    const sides = mergedMesh(sideGeos, matLR);
    if (sides) group.add(sides);

    // Chamfer facade plane (single window column).
    const chamMat = facadeMaterial(1, rows, color, seed + 202, litRatio);
    const cham = new THREE.Mesh(new THREE.PlaneGeometry(cant * Math.SQRT2, spec.height), chamMat);
    const nx = wcx / Math.SQRT2;
    const nz = fs / Math.SQRT2;
    cham.position.set(cx - (wcx * cant) / 2 + nx * 0.02, spec.height / 2, cz - (fs * cant) / 2 + nz * 0.02);
    cham.rotation.y = Math.atan2(nx, nz);
    group.add(cham);

    // Two-box decomposition of the chamfered footprint (covers everything but
    // the sliver outside the diagonal — good enough for player-radius collision).
    const stripX: [number, number] = wcx > 0 ? [w / 2 - cant, w / 2] : [-w / 2, -w / 2 + cant];
    const mainX: [number, number] = wcx > 0 ? [-w / 2, w / 2 - cant] : [-w / 2 + cant, w / 2];
    const stripZ: [number, number] = fs > 0 ? [-d / 2, d / 2 - cant] : [-d / 2 + cant, d / 2];
    footprints.push({
      minX: spec.x + mainX[0],
      maxX: spec.x + mainX[1],
      minZ: spec.z - d / 2,
      maxZ: spec.z + d / 2,
    });
    footprints.push({
      minX: spec.x + stripX[0],
      maxX: spec.x + stripX[1],
      minZ: spec.z + stripZ[0],
      maxZ: spec.z + stripZ[1],
    });
  }

  // Cornice: thin slab slightly proud of the walls, very Haussmann.
  const cornice = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width + 0.6, 0.5, spec.depth + 0.6),
    plainWall(TRIM_COLOR),
  );
  cornice.position.y = spec.height + 0.25;
  group.add(cornice);

  // ---------------------------------------------------------------------
  // Street-facing detail. Everything is merged per material to keep draw
  // calls low.
  // ---------------------------------------------------------------------
  const front = new THREE.Group();
  front.rotation.y = frontIsX ? (frontSign > 0 ? Math.PI / 2 : -Math.PI / 2) : frontSign > 0 ? 0 : Math.PI;
  group.add(front);

  const trimGeos: THREE.BufferGeometry[] = [];
  const railGeos: THREE.BufferGeometry[] = [];
  const awningGeos: THREE.BufferGeometry[] = [];
  const dormerGeos: THREE.BufferGeometry[] = [];
  const dormerCapGeos: THREE.BufferGeometry[] = [];
  const paneGeos: THREE.BufferGeometry[] = [];
  const glassGeos: THREE.BufferGeometry[] = [];
  const facadeGeos: THREE.BufferGeometry[] = []; // front-facade planes (bay + canted wall)

  // --- Avant-corps: the central ~third of the facade projects BAY_PROJ out
  // for the full height. Snapped to whole window columns so the projecting
  // face reuses the front facade texture (a U-remapped sub-span) and its
  // painted windows stay on grid.
  let bayCols = Math.max(1, Math.round(facadeColsFront * 0.34));
  if ((facadeColsFront - bayCols) % 2 !== 0) {
    // Keep the flanking sections symmetric (whole columns each side).
    const down = bayCols - 1;
    const up = bayCols + 1;
    bayCols = down >= 1 && Math.abs(down - facadeColsFront * 0.34) <= Math.abs(up - facadeColsFront * 0.34) ? down : up;
  }
  const hasBay = bayCols >= 1 && facadeColsFront - bayCols >= 2 && rows >= 4;
  const cellW = faLen / facadeColsFront;
  const bayW = bayCols * cellW;
  const bayStartCol = (facadeColsFront - bayCols) / 2;
  const bayOut = wallHalfOut + BAY_PROJ;

  if (hasBay) {
    // Projecting facade face, sampling the same texture columns it covers.
    facadeGeos.push(
      remapU(
        new THREE.PlaneGeometry(bayW, spec.height),
        bayStartCol / facadeColsFront,
        (bayStartCol + bayCols) / facadeColsFront,
      ).translate(faOff, spec.height / 2, bayOut),
    );
    // Side returns of the projection (plain limestone).
    for (const s of [-1, 1]) {
      dormerGeos.push(
        new THREE.PlaneGeometry(BAY_PROJ, spec.height)
          .rotateY((s * Math.PI) / 2)
          .translate(faOff + (s * bayW) / 2, spec.height / 2, wallHalfOut + BAY_PROJ / 2),
      );
    }
    // Cornice continuation over the projection plus a small roofline cresting.
    trimGeos.push(box(bayW + 0.6, 0.5, BAY_PROJ + 0.6, faOff, spec.height + 0.25, wallHalfOut + BAY_PROJ / 2));
    trimGeos.push(box(bayW * 0.8, 0.55, 0.32, faOff, spec.height + 0.75, bayOut - 0.12));
    trimGeos.push(box(bayW * 0.42, 0.35, 0.3, faOff, spec.height + 1.18, bayOut - 0.13));

    // The bay stands proud of the body's collision box; give it its own thin
    // footprint so the camera can't clip into its face. (City data uses no
    // rotated buildings; skip the transform gymnastics if that ever changes.)
    if (!spec.rotationY) {
      if (!frontIsX) {
        const worldOffX = faOff * (frontSign > 0 ? 1 : -1);
        const z0 = spec.z + frontSign * wallHalfOut;
        const z1 = spec.z + frontSign * bayOut;
        footprints.push({
          minX: spec.x + worldOffX - bayW / 2,
          maxX: spec.x + worldOffX + bayW / 2,
          minZ: Math.min(z0, z1),
          maxZ: Math.max(z0, z1),
        });
      } else {
        const worldOffZ = faOff * (frontSign > 0 ? -1 : 1);
        const x0 = spec.x + frontSign * wallHalfOut;
        const x1 = spec.x + frontSign * bayOut;
        footprints.push({
          minX: Math.min(x0, x1),
          maxX: Math.max(x0, x1),
          minZ: spec.z + worldOffZ - bayW / 2,
          maxZ: spec.z + worldOffZ + bayW / 2,
        });
      }
    }
  }

  // Canted buildings: the front wall is a textured plane over the extruded solid.
  if (canted) {
    facadeGeos.push(new THREE.PlaneGeometry(faLen, spec.height).translate(faOff, spec.height / 2, wallHalfOut + 0.02));
  }

  // --- Corner quoins: real alternating long/short blocks, slightly proud of
  // the wall, down both ends of the front facade (replaces the painted-only
  // quoins doing all the work before).
  {
    const bandTopY = FACADE_GROUND_BAND_FRAC * spec.height;
    for (const side of [-1, 1]) {
      const edgeX = faOff + (side * faLen) / 2;
      let i = 0;
      for (let y = bandTopY; y + 0.85 < spec.height - 0.25; y += 0.95, i++) {
        const w = i % 2 === 0 ? 1.0 : 0.62;
        trimGeos.push(box(w, 0.85, 0.13, edgeX - (side * w) / 2, y + 0.425, wallHalfOut + (canted ? 0.02 : 0)));
      }
    }
  }

  // --- Real 3D wrought-iron balconies at the levels the facade texture marks.
  const upperWorld = spec.height * (1 - FACADE_GROUND_BAND_FRAC); // above the shopfront band
  const rowWorld = upperWorld / rows;
  const balconyRows = [1, rows - 2].filter((r) => r >= 0 && r < rows && rows >= 4);
  const RAIL_H = 0.85;
  for (const r of balconyRows) {
    const yFloor = spec.height - (r + 0.85) * rowWorld; // matches texture band
    // Segments: flanking sections at the wall plane, bay section pushed out.
    const segments: Array<[number, number, number]> = []; // [centerX, len, wallZ]
    if (hasBay) {
      const x1 = faOff - faLen / 2 + 0.5;
      const x2 = faOff - bayW / 2 - 0.06;
      const flankLen = x2 - x1;
      if (flankLen > 0.8) {
        segments.push([(x1 + x2) / 2, flankLen, wallHalfOut]);
        segments.push([-(x1 + x2) / 2 + 2 * faOff, flankLen, wallHalfOut]);
      }
      segments.push([faOff, bayW - 0.2, bayOut]);
    } else {
      segments.push([faOff, faLen - 1.0, wallHalfOut]);
    }
    for (const [cx, len, wallZ] of segments) {
      // Floor slab, protruding ~0.45 from the wall.
      trimGeos.push(box(len, 0.14, 0.62, cx, yFloor - 0.07, wallZ + 0.14));
      // Railing: front strip + two small returns to the wall.
      railGeos.push(
        scaleU(new THREE.PlaneGeometry(len, RAIL_H), Math.max(1, Math.round(len / 1.1))).translate(
          cx,
          yFloor + RAIL_H / 2,
          wallZ + 0.43,
        ),
      );
      for (const s of [-1, 1]) {
        railGeos.push(
          scaleU(new THREE.PlaneGeometry(0.45, RAIL_H), 1)
            .rotateY(Math.PI / 2)
            .translate(cx + (s * len) / 2, yFloor + RAIL_H / 2, wallZ + 0.21),
        );
      }
    }
  }

  // --- Real glass panes over the painted window grid (front facade only,
  // like the balconies). Recomputes the exact grid makeFacadeTextures()
  // paints — same shared fractions — so glass and painted frames align.
  // The window sits centered in its cell (X_FRAC + W_FRAC/2 = 0.5), so this
  // also holds on faces where the texture U direction is mirrored.
  {
    const paneW = cellW * WINDOW_W_FRAC;
    const baseOut = wallHalfOut + (canted ? 0.055 : 0.02);
    for (let r = 0; r < rows; r++) {
      const paneH = rowWorld * WINDOW_H_FRAC;
      const py = spec.height - (r + WINDOW_Y_FRAC + WINDOW_H_FRAC / 2) * rowWorld;
      for (let c = 0; c < facadeColsFront; c++) {
        const px = faOff - faLen / 2 + (c + WINDOW_X_FRAC + WINDOW_W_FRAC / 2) * cellW;
        const inBay = hasBay && c >= bayStartCol && c < bayStartCol + bayCols;
        // Just proud of the painted stone, well behind the balcony rail (+0.43).
        glassGeos.push(new THREE.PlaneGeometry(paneW, paneH).translate(px, py, inBay ? bayOut + 0.03 : baseOut));
      }
    }
  }

  // --- Modillion brackets under the cornice lip (dentil rhythm).
  const modillionCount = Math.max(6, Math.round(faLen / 1.1));
  for (let i = 0; i < modillionCount; i++) {
    const mx = faOff - faLen / 2 + ((i + 0.5) * faLen) / modillionCount;
    const inBay = hasBay && Math.abs(mx - faOff) < bayW / 2;
    trimGeos.push(box(0.18, 0.28, 0.26, mx, spec.height - 0.14, wallHalfOut + 0.17 + (inBay ? BAY_PROJ : 0)));
  }

  // --- Ground-floor café awnings over 1-2 of the shopfront openings.
  const shops = Math.max(2, Math.round(facadeColsFront / 1.5));
  const shopW = faLen / shops;
  const scheme = Math.floor(rng() * AWNING_SCHEMES.length);
  const awningCount = 1 + (rng() < 0.5 ? 1 : 0);
  const firstShop = Math.floor(rng() * shops);
  const shopSlots = new Set<number>();
  shopSlots.add(firstShop);
  if (awningCount > 1) shopSlots.add((firstShop + 1 + Math.floor(rng() * (shops - 1))) % shops);
  const bandTop = 0.16 * spec.height;
  for (const s of shopSlots) {
    const cx = faOff - faLen / 2 + (s + 0.5) * shopW;
    const aw = shopW * 0.82;
    // Awnings that overlap the projecting bay hang from the bay face instead.
    const overBay = hasBay && cx + aw / 2 > faOff - bayW / 2 && cx - aw / 2 < faOff + bayW / 2;
    const wallZ = wallHalfOut + (overBay ? BAY_PROJ : 0);
    const yTop = Math.min(bandTop * 0.82, 3.4);
    const stripes = Math.max(2, Math.round(aw / 1.2));
    // Sloped canopy: top edge on the wall, falling outward.
    const slope = scaleU(new THREE.PlaneGeometry(aw, 1.35), stripes);
    slope.translate(0, -0.675, 0); // hang from the top edge
    slope.rotateX(-1.0); // down 0.73, out 1.13
    slope.translate(cx, yTop, wallZ + 0.03);
    awningGeos.push(slope);
    // Hanging valance at the outer edge.
    awningGeos.push(
      scaleU(new THREE.PlaneGeometry(aw, 0.28), stripes).translate(cx, yTop - 0.73 - 0.13, wallZ + 1.16),
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
    const dormerCount = Math.min(4, Math.max(2, Math.round(faLen / 5)));
    const roofBase = spec.height + 0.5;
    const t = 0.32; // fraction up the mansard slope
    const outAt = wallHalfOut * (1 - 0.45 * t); // slope half-extent at that height
    for (let i = 0; i < dormerCount; i++) {
      const dx = faOff + (-(dormerCount - 1) / 2 + i) * (faLen / dormerCount);
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
    trimGeos.push(box(faLen + 0.4, 0.35, 0.3, faOff, spec.height + 0.65, wallHalfOut + 0.05));
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
    [glassGeos, glassMat],
    [facadeGeos, matFront],
  ];
  for (const [geos, mat] of buckets) {
    const mesh = mergedMesh(geos, mat);
    if (mesh) front.add(mesh);
  }

  return { group, footprints, occluders };
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
