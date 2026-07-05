import * as THREE from 'three';
import { Enemy } from './Enemy';
import { ENEMIES } from '../world/cityData';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { ShootEffects } from '../weapons/ShootEffects';

/**
 * Spawns enemies from city data, updates them each frame (patrol + return
 * fire), and exposes their hittable meshes for the player weapon's raycaster.
 */
export class EnemyManager {
  private enemies: Enemy[] = [];
  kills = 0;
  readonly total: number;

  constructor(
    private scene: THREE.Scene,
    private world: World,
    private player: Player,
    private effects: ShootEffects,
  ) {
    for (const spec of ENEMIES) {
      const enemy = new Enemy(spec);
      this.enemies.push(enemy);
      scene.add(enemy.group);
    }
    this.total = this.enemies.length;
  }

  /** Live target meshes for the weapon raycast. */
  get hittables(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const e of this.enemies) {
      if (e.state === 'alive') out.push(...e.hittables);
    }
    return out;
  }

  /** Called by the weapon when a raycast hit lands. */
  applyDamage(enemy: Enemy, amount: number): void {
    const wasAlive = enemy.state === 'alive';
    enemy.takeDamage(amount);
    if (wasAlive && enemy.state !== 'alive') this.kills++;
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    for (const enemy of this.enemies) {
      if (enemy.state === 'dead') {
        if (enemy.group.parent) this.scene.remove(enemy.group);
        continue;
      }
      const shot = enemy.update(dt, playerPos, this.world.occluders);
      if (shot) {
        this.effects.spawnTracer(shot.from, shot.to);
        if (shot.hit) this.player.takeDamage(shot.damage);
      }
    }
  }
}
