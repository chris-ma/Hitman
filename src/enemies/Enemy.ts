import * as THREE from 'three';
import type { EnemySpec } from '../world/cityData';
import {
  ENEMY_MAX_HEALTH,
  ENEMY_FIRE_RANGE,
  ENEMY_FIRE_INTERVAL,
  ENEMY_ACCURACY,
  ENEMY_DAMAGE,
  ENEMY_DEATH_DURATION,
} from '../constants';

export type EnemyState = 'alive' | 'dying' | 'dead';

const SUIT = 0x3c3c4c;
const SKIN = 0xd9a184;
const PATROL_SPEED = 2.2;
const FLASH_TIME = 0.12;

export interface EnemyShotResult {
  hit: boolean;
  from: THREE.Vector3;
  to: THREE.Vector3;
  damage: number;
}

/**
 * Capsule-primitive hostile. Stationary or two-point ping-pong patrol;
 * optionally returns periodic hitscan fire when the player is in range and
 * line-of-sight. Death is a scripted fall-over + fade.
 */
export class Enemy {
  readonly group = new THREE.Group();
  readonly hittables: THREE.Mesh[] = [];
  state: EnemyState = 'alive';
  private health = ENEMY_MAX_HEALTH;
  private materials: THREE.MeshStandardMaterial[] = [];
  private flashTimer = 0;
  private deathT = 0;
  private fireTimer = Math.random() * ENEMY_FIRE_INTERVAL;
  private patrolT = Math.random();
  private patrolDir = 1;
  private headWorld = new THREE.Vector3();
  private losRay = new THREE.Raycaster();
  private tmp = new THREE.Vector3();

  constructor(private spec: EnemySpec) {
    this.group.position.set(spec.x, 0, spec.z);
    if (spec.facing !== undefined) this.group.rotation.y = spec.facing;

    const bodyMat = new THREE.MeshStandardMaterial({ color: SUIT, roughness: 0.85 });
    const headMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.9 });
    const tieMat = new THREE.MeshStandardMaterial({ color: 0xb02030, roughness: 0.8 });
    this.materials = [bodyMat, headMat, tieMat];

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 10), bodyMat);
    body.position.y = 0.82; // spans ~0.05 .. 1.59
    this.group.add(body);
    this.hittables.push(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), headMat);
    head.position.y = 1.8;
    this.group.add(head);
    this.hittables.push(head);

    const shirtMat = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.9 });
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.04), shirtMat);
    shirt.position.set(0, 1.22, 0.295);
    this.group.add(shirt);
    this.materials.push(shirtMat);

    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.03), tieMat);
    tie.position.set(0, 1.22, 0.325);
    this.group.add(tie);

    // --- Cosmetic detail (not raycast targets, no gameplay effect) ---

    // Short dark hair: a cap over the top of the head sphere.
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.95 });
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.215, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hairMat,
    );
    hair.position.y = 1.815;
    this.group.add(hair);
    this.materials.push(hairMat);

    // Suit arms hanging at the sides.
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.52, 3, 7), bodyMat);
      arm.position.set(s * 0.4, 1.1, 0);
      arm.rotation.z = s * -0.14;
      this.group.add(arm);
    }

    // Armed guards visibly carry a pistol at the right hip.
    if (spec.shoots) {
      const gunMat = new THREE.MeshStandardMaterial({ color: 0x1c1e23, roughness: 0.4, metalness: 0.6 });
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.26), gunMat);
      gun.position.set(0.42, 0.82, 0.2);
      gun.rotation.x = -0.15;
      this.group.add(gun);
      this.materials.push(gunMat);
    }

    for (const m of this.hittables) m.userData.enemy = this;
  }

  takeDamage(amount: number): void {
    if (this.state !== 'alive') return;
    this.health -= amount;
    this.flashTimer = FLASH_TIME;
    for (const m of this.materials) m.emissive.setHex(0xaa1111);
    if (this.health <= 0) this.startDying();
  }

  private startDying(): void {
    this.state = 'dying';
    this.deathT = 0;
    for (const m of this.materials) {
      m.transparent = true;
      m.emissive.setHex(0x000000);
    }
    // Stop being a raycast target immediately.
    for (const m of this.hittables) m.userData.enemy = undefined;
  }

  /**
   * Advance one frame. Returns a shot description when this enemy fires at
   * the player this frame, else null. `occluders` block line-of-sight.
   */
  update(dt: number, playerPos: THREE.Vector3, occluders: THREE.Object3D[]): EnemyShotResult | null {
    if (this.state === 'dying') {
      this.deathT += dt / ENEMY_DEATH_DURATION;
      const t = Math.min(this.deathT, 1);
      this.group.rotation.x = (t * Math.PI) / 2; // pivot at the feet: falls flat
      this.group.position.y = t * 0.3; // keep the fallen body from sinking into the ground
      for (const m of this.materials) m.opacity = 1 - t * 0.9;
      if (this.deathT >= 1.4) this.state = 'dead';
      return null;
    }
    if (this.state === 'dead') return null;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) for (const m of this.materials) m.emissive.setHex(0x000000);
    }

    // Patrol: linear ping-pong between the two waypoints.
    if (this.spec.patrolTo) {
      const a = this.spec;
      const b = this.spec.patrolTo;
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      if (dist > 0.01) {
        this.patrolT += (this.patrolDir * (PATROL_SPEED * dt)) / dist;
        if (this.patrolT >= 1) {
          this.patrolT = 1;
          this.patrolDir = -1;
        } else if (this.patrolT <= 0) {
          this.patrolT = 0;
          this.patrolDir = 1;
        }
        const px = a.x + (b.x - a.x) * this.patrolT;
        const pz = a.z + (b.z - a.z) * this.patrolT;
        this.group.rotation.y = Math.atan2(
          (b.x - a.x) * this.patrolDir,
          (b.z - a.z) * this.patrolDir,
        );
        this.group.position.set(px, 0, pz);
      }
    }

    // Return fire.
    if (!this.spec.shoots) return null;
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return null;

    this.headWorld.set(this.group.position.x, 1.8, this.group.position.z);
    const toPlayer = this.tmp.subVectors(playerPos, this.headWorld);
    const dist = toPlayer.length();
    if (dist > ENEMY_FIRE_RANGE) return null;

    // Line-of-sight check against buildings.
    this.losRay.set(this.headWorld, toPlayer.clone().normalize());
    this.losRay.far = dist - 0.5;
    if (this.losRay.intersectObjects(occluders, false).length > 0) return null;

    this.fireTimer = ENEMY_FIRE_INTERVAL * (0.8 + Math.random() * 0.4);
    // Face the player when firing.
    this.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);

    const hit = Math.random() < ENEMY_ACCURACY;
    const to = playerPos.clone();
    if (!hit) {
      to.x += (Math.random() - 0.5) * 2.5;
      to.y += (Math.random() - 0.5) * 2;
      to.z += (Math.random() - 0.5) * 2.5;
    }
    return { hit, from: this.headWorld.clone(), to, damage: ENEMY_DAMAGE };
  }
}
