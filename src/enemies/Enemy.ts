import * as THREE from 'three';
import type { EnemySpec } from '../world/cityData';
import { makeRng } from '../world/proceduralTextures';
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

function lathe(points: Array<[number, number]>, segments: number): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

// ---------------------------------------------------------------------------
// Shared body geometry, authored once at module load and reused by every
// enemy (same pattern as shared materials — zero extra draw calls). Lathe
// profiles replace the old uniform capsules: the torso tapers from a broader
// chest to a narrower waist, thighs taper into shins, biceps into forearms.
// All spans match the capsules they replace (torso ~0.78..1.59 etc.) so the
// walk-cycle pivots and hit registration are unchanged.
// ---------------------------------------------------------------------------

// Torso: hips → waist → chest → shoulders. Spans world y 0.78..1.59.
const TORSO_GEO = lathe(
  [
    [0.02, 0.0],
    [0.24, 0.025],
    [0.295, 0.09], // hips
    [0.27, 0.3], // waist
    [0.3, 0.5],
    [0.335, 0.64], // chest
    [0.32, 0.73], // shoulders
    [0.2, 0.79],
    [0.02, 0.81],
  ],
  12,
).translate(0, 0.78, 0);

// Leg: hangs below the hip pivot (y 0 at the pivot, -0.75 at the sole).
const LEG_GEO = lathe(
  [
    [0.02, 0.0],
    [0.08, 0.015],
    [0.088, 0.06], // ankle
    [0.1, 0.28], // calf
    [0.105, 0.42], // knee
    [0.135, 0.6], // thigh
    [0.145, 0.7],
    [0.09, 0.745],
    [0.02, 0.75],
  ],
  10,
).translate(0, -0.75, 0);

// Arm: hangs below the shoulder pivot (y 0 at the pivot, -0.69 at the hand).
const ARM_GEO = lathe(
  [
    [0.015, 0.0],
    [0.055, 0.012],
    [0.06, 0.05], // wrist
    [0.072, 0.28], // forearm
    [0.082, 0.45], // elbow
    [0.095, 0.58], // bicep
    [0.09, 0.665],
    [0.02, 0.69],
  ],
  8,
).translate(0, -0.69, 0);

const HEAD_GEO = new THREE.SphereGeometry(0.21, 12, 10);
const HAIR_GEO = new THREE.SphereGeometry(0.215, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
const SHIRT_GEO = new THREE.BoxGeometry(0.2, 0.4, 0.04);
const TIE_GEO = new THREE.BoxGeometry(0.07, 0.34, 0.03);
const GUN_GEO = new THREE.BoxGeometry(0.05, 0.1, 0.26);

export interface EnemyShotResult {
  hit: boolean;
  from: THREE.Vector3;
  to: THREE.Vector3;
  damage: number;
}

/**
 * Lathe-profile primitive hostile. Stationary or two-point ping-pong patrol;
 * optionally returns periodic hitscan fire when the player is in range and
 * line-of-sight. Death is a scripted fall-over + fade. Proportions vary
 * per enemy (seeded from spawn position) so the guards aren't identical.
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
  /** Per-enemy overall height multiplier (proportion variation). */
  private heightScale = 1;
  // Walk-cycle state. walkPhase only advances while actually patrolling, so a
  // phase of 0 (or any frozen value) evaluates to a coherent standing pose.
  private walkPhase = 0;
  private idleT = Math.random() * 100; // desync idle sway between guards
  private readonly upperBody = new THREE.Group();
  private readonly legGroupL: THREE.Group;
  private readonly legGroupR: THREE.Group;
  private readonly armGroupL: THREE.Group;
  private readonly armGroupR: THREE.Group;

  constructor(private spec: EnemySpec) {
    this.group.position.set(spec.x, 0, spec.z);
    if (spec.facing !== undefined) this.group.rotation.y = spec.facing;

    // Deterministic per-enemy proportions, seeded from the spawn position
    // (same scheme as building facade seeds). Pure transform variation on
    // shared geometry — no extra geometry or draw calls.
    const prng = makeRng(((Math.round(spec.x * 7) * 73856093) ^ (Math.round(spec.z * 7) * 19349663)) >>> 0);
    this.heightScale = 0.96 + prng() * 0.1; // 0.96..1.06
    const torsoW = 0.94 + prng() * 0.14; // chest/shoulder width
    const torsoD = 0.95 + prng() * 0.1; // chest depth
    const legT = 0.95 + prng() * 0.12; // leg thickness
    const armT = 0.95 + prng() * 0.1; // arm thickness
    const headW = 0.95 + prng() * 0.1;
    const headD = 0.96 + prng() * 0.09;
    this.group.scale.y = this.heightScale;

    const bodyMat = new THREE.MeshStandardMaterial({ color: SUIT, roughness: 0.85 });
    const headMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.9 });
    const tieMat = new THREE.MeshStandardMaterial({ color: 0xb02030, roughness: 0.8 });
    this.materials = [bodyMat, headMat, tieMat];

    // Everything above the hips lives in upperBody so the walk bob can move
    // it as one unit without lifting the legs off the ground. The leg pivot
    // groups stay direct children of `group` and swing from the hips.
    this.group.add(this.upperBody);

    // Torso: tapered lathe spanning the same ~0.78..1.59 band the old
    // capsule occupied, stopping at the hips so the legs articulate below.
    const torso = new THREE.Mesh(TORSO_GEO, bodyMat);
    torso.scale.set(torsoW, 1, torsoD);
    this.upperBody.add(torso);
    this.hittables.push(torso);

    // Legs: hip-pivot groups at y=0.78; the mesh hangs below the pivot so
    // rotating the group swings the leg like a pendulum.
    const makeLeg = (s: number): THREE.Group => {
      const hip = new THREE.Group();
      hip.position.set(s * 0.11, 0.78, 0);
      const leg = new THREE.Mesh(LEG_GEO, bodyMat);
      leg.scale.set(legT, 1, legT);
      hip.add(leg);
      this.group.add(hip);
      this.hittables.push(leg);
      return hip;
    };
    this.legGroupL = makeLeg(-1);
    this.legGroupR = makeLeg(1);

    const head = new THREE.Mesh(HEAD_GEO, headMat);
    head.position.y = 1.8;
    head.scale.set(headW, 1, headD);
    this.upperBody.add(head);
    this.hittables.push(head);

    const shirtMat = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.9 });
    const shirt = new THREE.Mesh(SHIRT_GEO, shirtMat);
    shirt.position.set(0, 1.24, 0.272 * torsoD);
    this.upperBody.add(shirt);
    this.materials.push(shirtMat);

    const tie = new THREE.Mesh(TIE_GEO, tieMat);
    tie.position.set(0, 1.22, 0.302 * torsoD);
    this.upperBody.add(tie);

    // --- Cosmetic detail (not raycast targets, no gameplay effect) ---

    // Short dark hair: a cap over the top of the head sphere.
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.95 });
    const hair = new THREE.Mesh(HAIR_GEO, hairMat);
    hair.position.y = 1.815;
    hair.scale.set(headW, 1, headD);
    this.upperBody.add(hair);
    this.materials.push(hairMat);

    // Suit arms hanging at the sides, each in a shoulder-pivot group so the
    // walk cycle can swing them. The static outward tilt lives on the group;
    // the mesh offset keeps the arm's rest position identical to before.
    const makeArm = (s: number): THREE.Group => {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.4 * torsoW, 1.445, 0);
      shoulder.rotation.z = s * -0.14;
      const arm = new THREE.Mesh(ARM_GEO, bodyMat);
      arm.scale.set(armT, 1, armT);
      shoulder.add(arm);
      this.upperBody.add(shoulder);
      return shoulder;
    };
    this.armGroupL = makeArm(-1);
    this.armGroupR = makeArm(1);

    // Armed guards visibly carry a pistol at the right hip. Thin lacquer
    // clearcoat gives the gunmetal a subtle sheen (narrow-scope A4 material).
    if (spec.shoots) {
      const gunMat = new THREE.MeshPhysicalMaterial({
        color: 0x1c1e23,
        roughness: 0.4,
        metalness: 0.6,
        clearcoat: 0.4,
        clearcoatRoughness: 0.35,
      });
      const gun = new THREE.Mesh(GUN_GEO, gunMat);
      gun.position.set(0.42, 0.82, 0.2);
      gun.rotation.x = -0.15;
      this.upperBody.add(gun);
      this.materials.push(gunMat);
    }

    for (const m of this.hittables) m.userData.enemy = this;

    // Every body part casts a shadow so enemies visually ground on the street.
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
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
        // Unsigned on purpose: the atan2 below keeps the model facing its
        // direction of travel, so in local space it always walks forward.
        // Signing this by patrolDir would moonwalk the legs after turns.
        const STRIDE_LENGTH = 1.3;
        this.walkPhase += (PATROL_SPEED * dt * Math.PI * 2) / STRIDE_LENGTH;
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

    // Walk cycle: recomputed fresh each frame as a pure function of walkPhase
    // (no incremental drift). When walkPhase isn't advancing this settles into
    // a neutral stand — no special-casing for stationary enemies needed.
    // Contralateral gait: each leg pairs with the opposite arm.
    const LEG_SWING = 0.5;
    const ARM_SWING = 0.35;
    const BOB = 0.03;
    this.legGroupL.rotation.x = LEG_SWING * Math.sin(this.walkPhase);
    this.legGroupR.rotation.x = LEG_SWING * Math.sin(this.walkPhase + Math.PI);
    this.armGroupR.rotation.x = ARM_SWING * Math.sin(this.walkPhase);
    this.armGroupL.rotation.x = ARM_SWING * Math.sin(this.walkPhase + Math.PI);
    // A walker's centre of mass dips twice per stride.
    this.upperBody.position.y = BOB * Math.abs(Math.sin(this.walkPhase));

    // Stationary guards get a barely-there sway so they read as alive.
    this.idleT += dt;
    if (!this.spec.patrolTo) {
      this.upperBody.rotation.z = 0.015 * Math.sin(this.idleT * 0.7);
    }

    // Return fire.
    if (!this.spec.shoots) return null;
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return null;

    this.headWorld.set(this.group.position.x, 1.8 * this.heightScale, this.group.position.z);
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
