import { PLAYER_MAX_HEALTH } from '../constants';

/** Player vitals. Position/orientation live in PlayerController. */
export class Player {
  health = PLAYER_MAX_HEALTH;
  /** Fired whenever the player takes damage (HUD flash hook). */
  onDamaged: (() => void) | null = null;

  get alive(): boolean {
    return this.health > 0;
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.onDamaged?.();
  }

  reset(): void {
    this.health = PLAYER_MAX_HEALTH;
  }
}
