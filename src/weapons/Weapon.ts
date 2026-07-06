import * as THREE from 'three';
import { InputManager } from '../input/InputManager';
import { EnemyManager } from '../enemies/EnemyManager';
import { Enemy } from '../enemies/Enemy';
import { World } from '../world/World';
import { ShootEffects } from './ShootEffects';
import { WeaponModel } from './WeaponModel';
import { MAGAZINE_SIZE, RESERVE_AMMO_MAX, RELOAD_TIME, FIRE_COOLDOWN, WEAPON_DAMAGE, WEAPON_RANGE } from '../constants';

/**
 * Hitscan pistol: raycast from screen center against enemies + world
 * occluders (walls block bullets). Handles cooldown, the magazine/reserve
 * ammo split with an automatic reload on an empty magazine, and effect
 * triggering. Fires while the button is held.
 */
export class Weapon {
  magazineAmmo = MAGAZINE_SIZE;
  reserveAmmo = RESERVE_AMMO_MAX;
  /** Set by Game so the HUD can flash a hit marker. */
  onHit: (() => void) | null = null;

  private cooldown = 0;
  private reloadTimer = 0;
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

  get reloading(): boolean {
    return this.reloadTimer > 0;
  }

  resetAmmo(): void {
    this.magazineAmmo = MAGAZINE_SIZE;
    this.reserveAmmo = RESERVE_AMMO_MAX;
    this.reloadTimer = 0;
  }

  update(dt: number): void {
    this.model.update(dt);
    if (this.cooldown > 0) this.cooldown -= dt;

    // Reload gate: same countdown pattern as the fire cooldown. When the
    // timer completes, top the magazine up from reserve.
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const moved = Math.min(MAGAZINE_SIZE - this.magazineAmmo, this.reserveAmmo);
        this.magazineAmmo += moved;
        this.reserveAmmo -= moved;
      }
      return; // firing is blocked while reloading
    }

    if (this.input.fireHeld && this.cooldown <= 0 && this.magazineAmmo > 0) {
      this.fire();
      this.cooldown = FIRE_COOLDOWN;
    }
  }

  private fire(): void {
    this.magazineAmmo--;
    // Auto-reload the moment the magazine runs dry (if there's reserve left;
    // otherwise the player is simply out of ammo).
    if (this.magazineAmmo === 0 && this.reserveAmmo > 0) this.reloadTimer = RELOAD_TIME;
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
