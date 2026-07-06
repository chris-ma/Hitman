// Gameplay tuning constants, kept in one place.

// Player
export const MOVE_SPEED = 9; // units / second
export const GRAVITY = 28; // units / second^2
export const JUMP_SPEED = 9.5;
export const EYE_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.45;
export const PLAYER_MAX_HEALTH = 100;
export const GROUND_SNAP_TOLERANCE = 0.3; // how far above ground we still snap down
export const MOUSE_SENSITIVITY = 0.0022;
export const MAX_PITCH = Math.PI / 2 - 0.02; // ~±89°

// Touch controls
export const TOUCH_LOOK_MULTIPLIER = 1.7; // relative to MOUSE_SENSITIVITY, drag feels slower than a mouse flick
export const TOUCH_JOYSTICK_RADIUS = 55; // px the knob can travel from center before clamping

// Weapon
export const MAGAZINE_SIZE = 15;
export const RESERVE_AMMO_MAX = 150;
export const RELOAD_TIME = 1.0; // seconds; auto-reload when the magazine empties
export const FIRE_COOLDOWN = 0.14; // seconds between shots (held fire)
export const WEAPON_DAMAGE = 25;
export const WEAPON_RANGE = 300;

// Enemies
export const ENEMY_MAX_HEALTH = 100;
export const ENEMY_FIRE_RANGE = 45;
export const ENEMY_FIRE_INTERVAL = 1.6; // seconds between enemy shots
export const ENEMY_DAMAGE = 9;
export const ENEMY_ACCURACY = 0.6; // chance a shot in range/LOS actually hits
export const ENEMY_DEATH_DURATION = 0.35; // fall+fade seconds

// Effects
export const TRACER_LIFETIME = 0.09;
export const MUZZLE_FLASH_TIME = 0.05;

// World
export const SPAWN_POSITION = { x: 60, y: EYE_HEIGHT, z: 0 };
export const SPAWN_YAW = Math.PI / 2; // face -X, straight down the boulevard toward the tower

// Invisible perimeter: the built district's extent (buildings x in [-86, 89],
// plaza x in [-197, -107] / z in [-55, 55], enemy patrols out to |z| = 65)
// plus margin. The player position is clamped to this box every frame.
export const WORLD_BOUND_MIN_X = -204;
export const WORLD_BOUND_MAX_X = 95;
export const WORLD_BOUND_MIN_Z = -70;
export const WORLD_BOUND_MAX_Z = 70;
