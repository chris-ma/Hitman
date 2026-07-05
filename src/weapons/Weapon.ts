import * as THREE from 'three';
import { InputManager } from '../input/InputManager';
import { EnemyManager } from '../enemies/EnemyManager';
import { Enemy } from '../enemies/Enemy';
import { World } from '../world/World';
import { ShootEffects } from './ShootEffects';
import { WeaponModel } from './WeaponModel';
import { AMMO_MAX, FIRE_COOLDOWN, WEAPON_DAMAGE, WEAPON_RANGE } from '../constants';

/**
 * Hitscan pistol: raycast from screen center against enemies + world
 * occluders (walls block bullets). Handles cooldown, ammo, and effect
 * triggering. Fires while the button is held.
 */
export class Weapon {
  ammo = AMMO_MAX;
  /** Set by Game so the HUD can flash a hit marker. */
  onHit: (() => void) | null = null;

  private cooldown = 0;
  private ray = new THREE.Raycaster();
  private muzzlePos = new THREE.Vector3();
  private dir = new THREE.Vector3();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private input: InputManager,
    private enemies: EnemyManager,
    private world: World,
    private effects: ShootEffects,
    private model: WeaponModel,
  ) {
    this.ray.far = WEAPON_RANGE;
  }

  resetAmmo(): void {
    this.ammo = AMMO_MAX;
  }

  update(dt: number): void {
    this.model.update(dt);
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.input.fireHeld && this.cooldown <= 0 && this.ammo > 0) {
      this.fire();
      this.cooldown = FIRE_COOLDOWN;
    }
  }

  private fire(): void {
    this.ammo--;
    this.model.onFire();

    this.camera.getWorldDirection(this.dir);
    this.ray.set(this.camera.position, this.dir);

    // Enemies + world geometry in one pass so walls block bullets and the
    // tracer terminates on whatever it hit.
    const targets = [...this.enemies.hittables, ...this.world.occluders, ...this.world.walkables];
    const hits = this.ray.intersectObjects(targets, false);

    let endPoint: THREE.Vector3;
    if (hits.length > 0) {
      const hit = hits[0];
      endPoint = hit.point;
      const enemy = hit.object.userData.enemy as Enemy | undefined;
      if (enemy) {
        this.enemies.applyDamage(enemy, WEAPON_DAMAGE);
        this.onHit?.();
      }
    } else {
      endPoint = this.camera.position.clone().addScaledVector(this.dir, WEAPON_RANGE);
    }

    this.model.muzzle.getWorldPosition(this.muzzlePos);
    this.effects.spawnTracer(this.muzzlePos, endPoint);
  }
}
