/**
 * 'menu'    — pre-lock or paused (overlay shown, sim frozen, still rendering)
 * 'playing' — pointer locked, full simulation running
 * 'dead'    — death overlay shown, sim frozen until respawn click
 */
export type GameState = 'menu' | 'playing' | 'dead';
