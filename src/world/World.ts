import * as THREE from 'three';
import { BUILDINGS, STREETLIGHTS } from './cityData';
import { buildBuilding } from './Building';
import { buildGround } from './Ground';
import { buildStreetlight } from './Streetlight';
import { buildEiffelTower } from './EiffelTower';
import type { AABB } from '../utils/collision';
import { SPAWN_POSITION } from '../constants';

export const TOWER_POSITION = { x: -140, z: 0 };
const MAX_REAL_STREETLIGHT_LIGHTS = 5;

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
    this.walkables.push(...ground.walkables);

    for (const spec of BUILDINGS) {
      const built = buildBuilding(spec);
      scene.add(built.group);
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
      scene.add(buildStreetlight(spec.x, spec.z, withLight.has(spec)));
    }

    const tower = buildEiffelTower(TOWER_POSITION.x, TOWER_POSITION.z);
    scene.add(tower.group);
    this.collidables.push(...tower.footprints);
  }
}
