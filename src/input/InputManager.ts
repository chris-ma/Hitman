/**
 * Keyboard + mouse + pointer-lock handling. Mouse deltas accumulate between
 * frames and are consumed once per frame by the player controller.
 */
export class InputManager {
  private keys = new Set<string>();
  private lookDX = 0;
  private lookDY = 0;
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
      if (!this.locked) return;
      // Browsers can emit one giant spurious delta right as the lock engages;
      // ignore implausible spikes so the view doesn't snap.
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.locked) this.fireHeld = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireHeld = false;
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.fireHeld = false;
        this.keys.clear();
      }
      this.onLockChange?.(this.locked);
    });
  }

  lock(): void {
    // Browsers may reject relock attempts right after an Esc unlock; the user
    // just clicks again, so swallow the rejection.
    const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    p?.catch?.(() => {});
  }

  unlock(): void {
    if (this.locked) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Returns and clears the accumulated mouse delta. */
  consumeLook(): { dx: number; dy: number } {
    const out = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return out;
  }
}
