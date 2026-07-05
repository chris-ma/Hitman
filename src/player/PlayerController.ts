import * as THREE from 'three';
import { InputManager } from '../input/InputManager';
import { World } from '../world/World';
import { resolveCircleAABBs } from '../utils/collision';
import {
  MOVE_SPEED,
  GRAVITY,
  JUMP_SPEED,
  EYE_HEIGHT,
  PLAYER_RADIUS,
  MOUSE_SENSITIVITY,
  MAX_PITCH,
  GROUND_SNAP_TOLERANCE,
  SPAWN_POSITION,
  SPAWN_YAW,
} from '../constants';

/**
 * Pointer-lock FPS controller: mouse-look, yaw-relative WASD, gravity + jump,
 * downward-raycast ground snapping, circle-vs-AABB building collision.
 * The camera position IS the player's eye position.
 */
export class PlayerController {
  private yaw = SPAWN_YAW;
  private pitch = 0;
  private velocityY = 0;
  private grounded = false;
  private ray = new THREE.Raycaster();
  private down = new THREE.Vector3(0, -1, 0);

  constructor(
    private camera: THREE.PerspectiveCamera,
    private input: InputManager,
    private world: World,
  ) {
    camera.rotation.order = 'YXZ';
    this.resetPose();
  }

  resetPose(): void {
    this.camera.position.set(SPAWN_POSITION.x, SPAWN_POSITION.y, SPAWN_POSITION.z);
    this.yaw = SPAWN_YAW;
    this.pitch = 0;
    this.velocityY = 0;
    this.grounded = false;
    this.applyLook();
  }

  private applyLook(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  update(dt: number): void {
    const pos = this.camera.position;

    // --- Mouse look ---
    const { dx, dy } = this.input.consumeLook();
    this.yaw -= dx * MOUSE_SENSITIVITY;
    this.pitch -= dy * MOUSE_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -MAX_PITCH, MAX_PITCH);
    this.applyLook();

    // --- Horizontal movement (yaw only, ignore pitch) ---
    let mx = 0;
    let mz = 0;
    if (this.input.isDown('KeyW')) mz -= 1;
    if (this.input.isDown('KeyS')) mz += 1;
    if (this.input.isDown('KeyA')) mx -= 1;
    if (this.input.isDown('KeyD')) mx += 1;
    if (mx !== 0 || mz !== 0) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      // Rotate local (mx, mz) by yaw: local -Z is camera forward.
      const wx = mx * cos + mz * sin;
      const wz = -mx * sin + mz * cos;
      pos.x += wx * MOVE_SPEED * dt;
      pos.z += wz * MOVE_SPEED * dt;
    }

    // --- Building / tower-leg collision (XZ push-out) ---
    resolveCircleAABBs(pos, PLAYER_RADIUS, this.world.collidables);

    // --- Gravity + jump ---
    if (this.input.isDown('Space') && this.grounded) {
      this.velocityY = JUMP_SPEED;
      this.grounded = false;
    }
    this.velocityY -= GRAVITY * dt;
    pos.y += this.velocityY * dt;

    // --- Ground snap: raycast down from the eye ---
    this.ray.set(new THREE.Vector3(pos.x, pos.y + 0.5, pos.z), this.down);
    this.ray.far = EYE_HEIGHT + 3;
    const hits = this.ray.intersectObjects(this.world.walkables, false);
    this.grounded = false;
    if (hits.length > 0) {
      const groundY = hits[0].point.y;
      const feetY = pos.y - EYE_HEIGHT;
      if (this.velocityY <= 0 && feetY <= groundY + GROUND_SNAP_TOLERANCE) {
        pos.y = groundY + EYE_HEIGHT;
        this.velocityY = 0;
        this.grounded = true;
      }
    }

    // Safety net: never fall through the world.
    if (pos.y < EYE_HEIGHT - 2) {
      pos.y = EYE_HEIGHT;
      this.velocityY = 0;
      this.grounded = true;
    }
  }
}
