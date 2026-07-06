import * as THREE from 'three';
import { IS_TOUCH_DEVICE } from '../utils/device';
import { makeRng } from './proceduralTextures';

// Bounding volume the debris lives in, loosely centered on the player and
// re-wrapped each frame so the effect always reads as nearby ambient detail.
const HALF_XZ = 22;
const MIN_Y = 0.25;
const MAX_Y = 3.4;

// Muted street-litter tints: dry leaf, dead olive, faded paper.
const TINTS = [0x7a5b3a, 0x6a6046, 0x8d887b];

interface Flake {
  pos: THREE.Vector3;
  /** Wind-speed multiplier. */
  speed: number;
  /** Vertical bob. */
  baseY: number;
  bobAmp: number;
  bobFreq: number;
  /** Slow tumble. */
  rotX: number;
  rotY: number;
  phase: number;
  scale: number;
}

/**
 * Ambient wind-blown debris (leaves / paper scraps): one InstancedMesh of
 * small double-sided planes drifting in a constant wind, bobbing and slowly
 * tumbling. Instances wrap around the player so the effect follows the
 * action for one draw call. Fewer instances on touch devices, matching the
 * project's mobile perf gating.
 */
export class Debris {
  private readonly mesh: THREE.InstancedMesh;
  private readonly flakes: Flake[] = [];
  private readonly wind = new THREE.Vector3(0.8, 0, 0.35); // steady westerly drift
  private time = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const count = IS_TOUCH_DEVICE ? 14 : 36;
    const geo = new THREE.PlaneGeometry(0.16, 0.12);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    // Instances teleport around the player; a static bounding sphere would cull them.
    this.mesh.frustumCulled = false;

    const rng = makeRng(777001);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const baseY = MIN_Y + rng() * (MAX_Y - MIN_Y) * 0.8;
      this.flakes.push({
        pos: new THREE.Vector3((rng() * 2 - 1) * HALF_XZ, baseY, (rng() * 2 - 1) * HALF_XZ),
        speed: 0.6 + rng() * 1.1,
        baseY,
        bobAmp: 0.15 + rng() * 0.3,
        bobFreq: 0.5 + rng() * 0.9,
        rotX: (rng() - 0.5) * 2.4,
        rotY: (rng() - 0.5) * 3.2,
        phase: rng() * Math.PI * 2,
        scale: 0.7 + rng() * 0.7,
      });
      color.setHex(TINTS[i % TINTS.length]);
      color.offsetHSL(0, 0, (rng() - 0.5) * 0.06);
      this.mesh.setColorAt(i, color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
  }

  /** Advance the drift and re-wrap instances around the player position. */
  update(dt: number, playerPos: THREE.Vector3): void {
    this.time += dt;
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      f.pos.x += this.wind.x * f.speed * dt;
      f.pos.z += this.wind.z * f.speed * dt;

      // Wrap into the box around the player (positions are stored relative
      // to the world but recycled to stay near the action).
      if (f.pos.x - playerPos.x > HALF_XZ) f.pos.x -= HALF_XZ * 2;
      else if (f.pos.x - playerPos.x < -HALF_XZ) f.pos.x += HALF_XZ * 2;
      if (f.pos.z - playerPos.z > HALF_XZ) f.pos.z -= HALF_XZ * 2;
      else if (f.pos.z - playerPos.z < -HALF_XZ) f.pos.z += HALF_XZ * 2;

      const y = f.baseY + Math.sin(this.time * f.bobFreq + f.phase) * f.bobAmp;
      this.e.set(this.time * f.rotX + f.phase, this.time * f.rotY, f.phase);
      this.q.setFromEuler(this.e);
      this.p.set(f.pos.x, y, f.pos.z);
      this.s.setScalar(f.scale);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
