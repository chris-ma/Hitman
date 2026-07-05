import { IS_TOUCH_DEVICE } from '../utils/device';

/**
 * Keyboard + mouse + pointer-lock handling on desktop; on touch devices the
 * same public surface (isDown/consumeLook/fireHeld/locked/lock/unlock) is
 * instead driven by TouchControls, so PlayerController, Weapon, and Game
 * don't need to know which input scheme is active.
 */
export class InputManager {
  readonly isTouch = IS_TOUCH_DEVICE;

  private keys = new Set<string>();
  private lookDX = 0;
  private lookDY = 0;
  /** Touch joystick axes only; unused on desktop (keys are read directly). */
  private touchMoveX = 0;
  private touchMoveZ = 0;
  fireHeld = false;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));

    document.addEventListener('mousemove', (e) => {
      if (this.isTouch || !this.locked) return;
      // Browsers can emit one giant spurious delta right as the lock engages;
      // ignore implausible spikes so the view doesn't snap.
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (this.isTouch) return;
      if (e.button === 0 && this.locked) this.fireHeld = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (this.isTouch) return;
      if (e.button === 0) this.fireHeld = false;
    });

    document.addEventListener('pointerlockchange', () => {
      if (this.isTouch) return;
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.fireHeld = false;
        this.keys.clear();
      }
      this.onLockChange?.(this.locked);
    });
  }

  /** Desktop: request pointer lock. Touch: there's no lock concept, just flip to "playing". */
  lock(): void {
    if (this.isTouch) {
      this.locked = true;
      this.onLockChange?.(true);
      return;
    }
    // Browsers may reject relock attempts right after an Esc unlock; the user
    // just clicks again, so swallow the rejection.
    const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    p?.catch?.(() => {});
  }

  unlock(): void {
    if (this.isTouch) {
      if (!this.locked) return;
      this.locked = false;
      this.fireHeld = false;
      this.keys.clear();
      this.touchMoveX = 0;
      this.touchMoveZ = 0;
      this.onLockChange?.(false);
      return;
    }
    if (this.locked) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Used by touch buttons (jump) to synthesize digital key state. */
  simulateKeyDown(code: string): void {
    this.keys.add(code);
  }

  simulateKeyUp(code: string): void {
    this.keys.delete(code);
  }

  /** Used by the touch look-drag zone; pre-scaled by the caller. */
  addLookDelta(dx: number, dy: number): void {
    this.lookDX += dx;
    this.lookDY += dy;
  }

  /** Used by the touch joystick; x/z each in [-1, 1], magnitude may be < 1. */
  setTouchMove(x: number, z: number): void {
    this.touchMoveX = x;
    this.touchMoveZ = z;
  }

  /** Returns and clears the accumulated mouse/touch-look delta. */
  consumeLook(): { dx: number; dy: number } {
    const out = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return out;
  }

  /**
   * Movement axes in local space, x = strafe (+right), z = forward/back (+back).
   * Digital (WASD) is unnormalized (diagonals can exceed length 1, the caller
   * clamps); analog (touch joystick) preserves partial magnitude for walking.
   */
  getMoveAxes(): { x: number; z: number } {
    if (this.isTouch) return { x: this.touchMoveX, z: this.touchMoveZ };
    let mx = 0;
    let mz = 0;
    if (this.keys.has('KeyW')) mz -= 1;
    if (this.keys.has('KeyS')) mz += 1;
    if (this.keys.has('KeyA')) mx -= 1;
    if (this.keys.has('KeyD')) mx += 1;
    return { x: mx, z: mz };
  }
}
