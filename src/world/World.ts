import * as THREE from 'three';
import { BUILDINGS, STREETLIGHTS, TREES, WALLACE_FOUNTAINS, METRO_ENTRANCE } from './cityData';
import { buildBuilding } from './Building';
import { buildGround } from './Ground';
import { buildStreetlight } from './Streetlight';
import { buildEiffelTower } from './EiffelTower';
import { buildTrees } from './Tree';
import { buildWallaceFountain } from './WallaceFountain';
import { buildMetroEntrance } from './MetroEntrance';
import type { AABB } from '../utils/collision';
import { SPAWN_POSITION } from '../constants';

export const TOWER_POSITION = { x: -140, z: 0 };
const MAX_REAL_STREETLIGHT_LIGHTS = 5;

/** Set shadow flags on every mesh (incl. InstancedMesh) under `obj`. */
function setShadow(obj: THREE.Object3D, cast: boolean, receive: boolean): void {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}

/**
 * Owns all static scenery and exposes the three lists gameplay code needs:
 * - walkables: meshes the ground-snap raycast tests
 * - collidables: XZ AABBs the player circle is pushed out of
 * - occluders: meshes that block bullets and enemy line-of-sight
 */
export class World {
  readonly walkables: THREE.Mesh[] = [];
  readonly collidables: AABB[] = [];
  readonly occluders: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    const ground = buildGround();
    scene.add(ground.group);
    // Receive only: flat ground casting a shadow on itself is wasted work.
    setShadow(ground.group, false, true);
    this.walkables.push(...ground.walkables);

    for (const spec of BUILDINGS) {
      const built = buildBuilding(spec);
      scene.add(built.group);
      setShadow(built.group, true, true);
      this.collidables.push(built.footprint);
      this.occluders.push(...built.occluders);
    }

    // Real PointLights only for the streetlights closest to spawn.
    const bySpawnDistance = [...STREETLIGHTS].sort((a, b) => {
      const da = (a.x - SPAWN_POSITION.x) ** 2 + (a.z - SPAWN_POSITION.z) ** 2;
      const db = (b.x - SPAWN_POSITION.x) ** 2 + (b.z - SPAWN_POSITION.z) ** 2;
      return da - db;
    });
    const withLight = new Set(bySpawnDistance.slice(0, MAX_REAL_STREETLIGHT_LIGHTS));
    for (const spec of STREETLIGHTS) {
      const light = buildStreetlight(spec.x, spec.z, withLight.has(spec));
      scene.add(light);
      setShadow(light, true, true);
    }

    const tower = buildEiffelTower(TOWER_POSITION.x, TOWER_POSITION.z);
    scene.add(tower.group);
    setShadow(tower.group, true, true);
    this.collidables.push(...tower.footprints);

    // Boulevard plane trees (2 draw calls total via instancing). Only the
    // slim trunks collide — canopies overhang the sidewalk freely.
    const trees = buildTrees(TREES);
    scene.add(trees.group);
    setShadow(trees.group, true, true);
    this.collidables.push(...trees.footprints);

    // Wallace fountains at a boulevard corner and on the plaza edge.
    for (const spot of WALLACE_FOUNTAINS) {
      const fountain = buildWallaceFountain(spot.x, spot.z);
      scene.add(fountain.group);
      setShadow(fountain.group, true, true);
      this.collidables.push(fountain.footprint);
    }

    // Guimard Métro entrance on the plaza.
    const metro = buildMetroEntrance(METRO_ENTRANCE.x, METRO_ENTRANCE.z);
    scene.add(metro.group);
    setShadow(metro.group, true, true);
    this.collidables.push(metro.footprint);
  }
}
