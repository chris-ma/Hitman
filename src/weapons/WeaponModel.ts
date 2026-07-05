import * as THREE from 'three';
import { makeFlashTexture } from '../world/proceduralTextures';
import { MUZZLE_FLASH_TIME } from '../constants';

/**
 * Primitive pistol viewmodel parented to the camera (lower-right), with a
 * muzzle anchor for tracers and an additive sprite muzzle flash.
 * Also handles a small recoil kick.
 */
export class WeaponModel {
  readonly muzzle: THREE.Object3D;
  private group: THREE.Group;
  private flashSprite: THREE.Sprite;
  private flashTimer = 0;
  private recoil = 0;
  private readonly baseZ = -0.5;

  constructor(camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();
    this.group.position.set(0.25, -0.22, this.baseZ);
    camera.add(this.group);

    const dark = new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.5, metalness: 0.6 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x3a2e26, roughness: 0.85 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.34), dark);
    this.group.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.24, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.26);
    this.group.add(barrel);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.16, 0.1), grip);
    handle.position.set(0, -0.12, 0.1);
    handle.rotation.x = -0.25;
    this.group.add(handle);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.02), dark);
    sight.position.set(0, 0.075, -0.1);
    this.group.add(sight);

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.02, -0.4);
    this.group.add(this.muzzle);

    this.flashSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeFlashTexture(),
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.flashSprite.scale.setScalar(0.3);
    this.flashSprite.visible = false;
    this.muzzle.add(this.flashSprite);
  }

  onFire(): void {
    this.flashTimer = MUZZLE_FLASH_TIME;
    this.flashSprite.material.rotation = Math.random() * Math.PI * 2;
    this.flashSprite.visible = true;
    this.recoil = 0.06;
  }

  update(dt: number): void {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flashSprite.visible = false;
    }
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - dt * 0.6);
      this.group.position.z = this.baseZ + this.recoil;
      this.group.rotation.x = this.recoil * 1.5;
    }
  }
}
