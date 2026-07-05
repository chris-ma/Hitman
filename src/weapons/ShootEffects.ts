import * as THREE from 'three';
import { TRACER_LIFETIME } from '../constants';

interface Tracer {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number; // 1 -> 0
}

const POOL_SIZE = 16;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Pooled bullet tracers (thin additive cylinders, reused — no per-shot
 * geometry allocation). Used by both the player weapon and enemy return fire.
 */
export class ShootEffects {
  private pool: Tracer[] = [];
  private next = 0;
  private tmpDir = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.CylinderGeometry(0.025, 0.025, 1, 4, 1, true);
    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffd27a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.pool.push({ mesh, material, life: 0 });
    }
  }

  spawnTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const t = this.pool[this.next];
    this.next = (this.next + 1) % POOL_SIZE;

    this.tmpDir.subVectors(to, from);
    const len = this.tmpDir.length();
    if (len < 0.01) return;

    t.mesh.position.copy(from).addScaledVector(this.tmpDir, 0.5);
    t.mesh.scale.set(1, len, 1);
    t.mesh.quaternion.setFromUnitVectors(UP, this.tmpDir.normalize());
    t.mesh.visible = true;
    t.material.opacity = 0.9;
    t.life = 1;
  }

  update(dt: number): void {
    for (const t of this.pool) {
      if (t.life <= 0) continue;
      t.life -= dt / TRACER_LIFETIME;
      if (t.life <= 0) {
        t.mesh.visible = false;
        t.material.opacity = 0;
      } else {
        t.material.opacity = 0.9 * t.life;
      }
    }
  }
}
