import * as THREE from 'three';
import { SceneSetup } from './SceneSetup';
import type { GameState } from './GameState';
import { InputManager } from '../input/InputManager';
import { TouchControls } from '../input/TouchControls';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { PlayerController } from '../player/PlayerController';
import { Weapon } from '../weapons/Weapon';
import { WeaponModel } from '../weapons/WeaponModel';
import { ShootEffects } from '../weapons/ShootEffects';
import { EnemyManager } from '../enemies/EnemyManager';
import { HUD } from '../ui/HUD';

/**
 * Top-level orchestration and the render loop.
 * Per-frame order (while playing): input → player controller → weapon →
 * enemies → HUD → render. Effects decay and rendering run in every state so
 * the scene is never frozen black behind the overlays.
 */
export class Game {
  private state: GameState = 'menu';
  private setup: SceneSetup;
  private input: InputManager;
  private world: World;
  private player: Player;
  private controller: PlayerController;
  private effects: ShootEffects;
  private weapon: Weapon;
  private enemies: EnemyManager;
  private hud: HUD;
  private touchControls: TouchControls | null = null;
  private clock = new THREE.Clock();

  constructor(container: HTMLElement) {
    this.setup = new SceneSetup(container);
    const { scene, camera, renderer } = this.setup;

    this.input = new InputManager(renderer.domElement);
    this.world = new World(scene);
    this.player = new Player();
    this.controller = new PlayerController(camera, this.input, this.world);
    this.effects = new ShootEffects(scene);
    const weaponModel = new WeaponModel(camera);
    this.hud = new HUD(container);
    if (this.input.isTouch) {
      this.touchControls = new TouchControls(container, this.input);
    }
    this.enemies = new EnemyManager(scene, this.world, this.player, this.effects);
    this.weapon = new Weapon(camera, this.input, this.enemies, this.world, this.effects, weaponModel);

    this.weapon.onHit = () => this.hud.flashHitmarker();
    this.player.onDamaged = () => this.hud.flashDamage();

    this.hud.onOverlayClick = () => {
      if (this.state === 'dead') this.respawn();
      if (this.input.isTouch) {
        // Best-effort immersion; both silently no-op where unsupported (notably iOS Safari).
        document.documentElement.requestFullscreen?.().catch(() => {});
        (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => {});
      }
      this.input.lock();
    };

    this.input.onLockChange = (locked) => {
      if (locked) {
        this.state = 'playing';
        this.hud.setOverlay('none');
      } else if (this.player.alive) {
        this.state = 'menu';
        this.hud.setOverlay('paused');
      }
      // If dead, the death overlay set in onDeath() stays up.
      this.touchControls?.setPlaying(locked);
    };

    renderer.setAnimationLoop(() => this.tick());

    // Dev-only handle for debugging / automated smoke tests.
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__game = this;
    }
  }

  private respawn(): void {
    this.player.reset();
    this.weapon.resetAmmo();
    this.controller.resetPose();
  }

  private onDeath(): void {
    this.state = 'dead';
    this.input.unlock();
    this.hud.setOverlay('dead');
    this.touchControls?.setPlaying(false);
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.state === 'playing') {
      this.controller.update(dt);
      this.weapon.update(dt);
      this.enemies.update(dt, this.setup.camera.position);
      if (!this.player.alive) this.onDeath();
    }

    this.effects.update(dt);

    this.hud.setHealth(this.player.health);
    this.hud.setAmmo(this.weapon.ammo);
    this.hud.setObjective(this.enemies.kills, this.enemies.total);

    this.setup.renderer.render(this.setup.scene, this.setup.camera);
  }
}
