// Hand-authored city block data. The main boulevard runs east-west along the
// X axis (road z in [-8, 8], sidewalks out to |z| = 12, building fronts at
// |z| = 12). A cross street runs north-south at x in [-8, 8]. The Eiffel
// Tower stands on a plaza at the west end of the boulevard.

export interface BuildingSpec {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number; // wall height (roof adds ~3-4 more)
  floors: number;
  roofType: 'mansard' | 'flat';
  rotationY?: number;
  facadeColorHex?: string;
  /** Cut the street corner facing the junction at 45° (boulevard corner buildings). */
  canted?: boolean;
}

export interface CarSpec {
  x: number;
  z: number;
  /** Yaw. City data uses axis-aligned quarter turns only (0, ±PI/2, PI). */
  rotationY: number;
  /** Index into the shared paint-color variants. */
  variant: number;
}

export interface StreetlightSpec {
  x: number;
  z: number;
}

export interface TreeSpec {
  x: number;
  z: number;
}

export interface EnemySpec {
  x: number;
  z: number;
  /** Optional second waypoint => two-point patrol; omitted => stationary. */
  patrolTo?: { x: number; z: number };
  shoots: boolean;
  facing?: number; // initial yaw for stationary enemies
}

const CREAM = '#e3d5b8';
const BEIGE = '#dccbaa';
const PALE = '#e9dcc4';
const SAND = '#d8c5a0';

// North row fronts face +Z (toward the street at z = -12), south row faces -Z.
export const BUILDINGS: BuildingSpec[] = [
  // North row (z = -18, fronts at z = -12)
  { x: -78, z: -18, width: 16, depth: 12, height: 24, floors: 7, roofType: 'mansard', facadeColorHex: CREAM },
  { x: -60, z: -18, width: 16, depth: 12, height: 27, floors: 8, roofType: 'mansard', facadeColorHex: BEIGE },
  { x: -42, z: -18, width: 16, depth: 12, height: 22, floors: 6, roofType: 'flat', facadeColorHex: PALE },
  { x: -24, z: -18, width: 14, depth: 12, height: 25, floors: 7, roofType: 'mansard', facadeColorHex: SAND, canted: true },
  { x: 24, z: -18, width: 14, depth: 12, height: 26, floors: 7, roofType: 'mansard', facadeColorHex: CREAM, canted: true },
  { x: 42, z: -18, width: 16, depth: 12, height: 23, floors: 6, roofType: 'mansard', facadeColorHex: PALE },
  { x: 60, z: -18, width: 16, depth: 12, height: 27, floors: 8, roofType: 'flat', facadeColorHex: BEIGE },
  { x: 78, z: -18, width: 16, depth: 12, height: 24, floors: 7, roofType: 'mansard', facadeColorHex: SAND },

  // South row (z = +18, fronts at z = +12)
  { x: -70, z: 18, width: 20, depth: 12, height: 25, floors: 7, roofType: 'mansard', facadeColorHex: BEIGE },
  { x: -48, z: 18, width: 18, depth: 12, height: 22, floors: 6, roofType: 'mansard', facadeColorHex: PALE },
  { x: -27, z: 18, width: 16, depth: 12, height: 27, floors: 8, roofType: 'flat', facadeColorHex: CREAM, canted: true },
  { x: 25, z: 18, width: 16, depth: 12, height: 24, floors: 7, roofType: 'mansard', facadeColorHex: SAND, canted: true },
  { x: 45, z: 18, width: 18, depth: 12, height: 26, floors: 7, roofType: 'mansard', facadeColorHex: CREAM },
  { x: 66, z: 18, width: 16, depth: 12, height: 22, floors: 6, roofType: 'mansard', facadeColorHex: BEIGE },
  { x: 83, z: 18, width: 12, depth: 12, height: 25, floors: 7, roofType: 'flat', facadeColorHex: PALE },

  // Along the cross street, north and south of the boulevard
  { x: -19, z: -46, width: 12, depth: 18, height: 24, floors: 7, roofType: 'mansard', facadeColorHex: CREAM },
  { x: 19, z: -46, width: 12, depth: 18, height: 26, floors: 7, roofType: 'mansard', facadeColorHex: SAND },
  { x: -19, z: 46, width: 12, depth: 18, height: 22, floors: 6, roofType: 'mansard', facadeColorHex: BEIGE },
  { x: 19, z: 46, width: 12, depth: 18, height: 25, floors: 7, roofType: 'flat', facadeColorHex: PALE },
];

// Streetlights alternate sides along the boulevard, plus a few on the cross
// street and around the tower plaza.
export const STREETLIGHTS: StreetlightSpec[] = [
  { x: 80, z: -10 },
  { x: 60, z: 10 },
  { x: 40, z: -10 },
  { x: 20, z: 10 },
  { x: -20, z: -10 },
  { x: -40, z: 10 },
  { x: -60, z: -10 },
  { x: -80, z: 10 },
  { x: -100, z: -10 },
  { x: 10, z: -35 },
  { x: -10, z: 35 },
  { x: 10, z: 60 },
];

// Pollarded plane trees lining the boulevard sidewalks (kept near the curb at
// |z| ~= 10.4, offset from the streetlights so they never overlap). Trunks are
// slim collision footprints; canopies overhang freely.
export const TREES: TreeSpec[] = [
  // North sidewalk (z = -10.4)
  { x: 70, z: -10.4 },
  { x: 52, z: -10.4 },
  { x: 30, z: -10.4 },
  { x: 16, z: -10.4 },
  { x: -14, z: -10.4 },
  { x: -32, z: -10.4 },
  { x: -50, z: -10.4 },
  { x: -72, z: -10.4 },
  { x: -86, z: -10.4 },
  // South sidewalk (z = +10.4)
  { x: 84, z: 10.4 },
  { x: 70, z: 10.4 },
  { x: 46, z: 10.4 },
  { x: 32, z: 10.4 },
  { x: -16, z: 10.4 },
  { x: -28, z: 10.4 },
  { x: -52, z: 10.4 },
  { x: -66, z: 10.4 },
  { x: -88, z: 10.4 },
  // Cross-street accents
  { x: 10.5, z: -30 },
  { x: -10.5, z: 26 },
  { x: 10.5, z: 44 },
  // Framing the tower plaza approach
  { x: -112, z: 26 },
  { x: -112, z: -26 },
];

// Wallace fountains: one at the boulevard/cross-street corner, one greeting
// visitors at the east edge of the tower plaza.
export const WALLACE_FOUNTAINS: TreeSpec[] = [
  { x: 14, z: 10 },
  { x: -112, z: -8 },
];

// Guimard Métro entrance on the plaza, opening toward the boulevard.
export const METRO_ENTRANCE = { x: -111, z: -20 };

// Parked cars hugging the curbs (road z in [-8, 8] on the boulevard, x in
// [-8, 8] on the cross street). Kept clear of crosswalks (|x| < 12 at the
// junction), enemy patrol lines (|z| = 4 lanes) and the Wallace fountains.
export const CARS: CarSpec[] = [
  // Boulevard, north curb
  { x: 46, z: -6.9, rotationY: -Math.PI / 2, variant: 0 },
  { x: 27, z: -6.9, rotationY: -Math.PI / 2, variant: 1 },
  { x: -38, z: -6.9, rotationY: Math.PI / 2, variant: 2 },
  { x: -70, z: -6.9, rotationY: Math.PI / 2, variant: 1 },
  // Boulevard, south curb
  { x: 55, z: 6.9, rotationY: Math.PI / 2, variant: 2 },
  { x: 18, z: 6.9, rotationY: Math.PI / 2, variant: 0 },
  { x: -30, z: 6.9, rotationY: Math.PI / 2, variant: 1 },
  { x: -78, z: 6.9, rotationY: Math.PI / 2, variant: 0 },
  // Cross street
  { x: 6.9, z: 40, rotationY: 0, variant: 2 },
  { x: -6.9, z: -38, rotationY: Math.PI, variant: 0 },
];

export const ENEMIES: EnemySpec[] = [
  // Boulevard
  { x: 35, z: 6, shoots: true, facing: Math.PI / 2 },
  { x: -20, z: -6, shoots: true, facing: Math.PI / 2 },
  { x: -60, z: 8, shoots: true, facing: Math.PI / 2 },
  { x: 20, z: 4, patrolTo: { x: 70, z: 4 }, shoots: true },
  { x: -50, z: -4, patrolTo: { x: -10, z: -4 }, shoots: true },
  // Cross street
  { x: 5, z: 30, shoots: false, facing: 0 },
  { x: -4, z: -30, patrolTo: { x: -4, z: -65 }, shoots: true },
  { x: 4, z: 60, patrolTo: { x: 4, z: 30 }, shoots: false },
  // Tower plaza guard
  { x: -108, z: 4, patrolTo: { x: -108, z: -6 }, shoots: true },
];
