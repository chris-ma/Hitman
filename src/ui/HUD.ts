import './hud.css';
import { PLAYER_MAX_HEALTH } from '../constants';
import { IS_TOUCH_DEVICE } from '../utils/device';

export type OverlayMode = 'start' | 'paused' | 'dead' | 'none';

/**
 * Plain-DOM overlay HUD. All setters cache the last applied value and only
 * touch the DOM when something actually changed.
 */
export class HUD {
  onOverlayClick: (() => void) | null = null;

  private root: HTMLDivElement;
  private healthFill: HTMLDivElement;
  private ammoEl: HTMLDivElement;
  private objectiveEl: HTMLDivElement;
  private hitmarker: HTMLDivElement;
  private damageEl: HTMLDivElement;
  private overlay: HTMLDivElement;
  private overlayTitle: HTMLHeadingElement;
  private overlayBody: HTMLParagraphElement;
  private overlayPrompt: HTMLDivElement;

  private lastHealth = -1;
  private lastAmmo = -1;
  private lastObjective = '';
  private overlayMode: OverlayMode = 'none';
  private hitTimer: ReturnType<typeof setTimeout> | null = null;
  private damageTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    container.appendChild(this.root);

    this.damageEl = this.el('div', 'hud-damage');
    this.el('div', 'hud-crosshair');
    this.hitmarker = this.el('div', 'hud-hitmarker');

    const vitals = this.el('div', 'hud-vitals');
    const bar = document.createElement('div');
    bar.className = 'hud-healthbar';
    this.healthFill = document.createElement('div');
    this.healthFill.className = 'hud-healthbar-fill';
    bar.appendChild(this.healthFill);
    vitals.appendChild(bar);

    this.ammoEl = this.el('div', 'hud-ammo');
    this.objectiveEl = this.el('div', 'hud-objective');

    this.overlay = this.el('div', 'hud-overlay');
    this.overlayTitle = document.createElement('h1');
    this.overlayBody = document.createElement('p');
    this.overlayPrompt = document.createElement('div');
    this.overlayPrompt.className = 'prompt';
    this.overlay.append(this.overlayTitle, this.overlayBody, this.overlayPrompt);
    this.overlay.addEventListener('click', () => this.onOverlayClick?.());

    this.setOverlay('start');
  }

  private el(tag: 'div', className: string): HTMLDivElement {
    const e = document.createElement(tag);
    e.className = className;
    this.root.appendChild(e);
    return e;
  }

  setHealth(health: number): void {
    if (health === this.lastHealth) return;
    this.lastHealth = health;
    const pct = Math.max(0, (health / PLAYER_MAX_HEALTH) * 100);
    this.healthFill.style.width = `${pct}%`;
    this.healthFill.classList.toggle('low', pct <= 30);
  }

  setAmmo(ammo: number): void {
    if (ammo === this.lastAmmo) return;
    this.lastAmmo = ammo;
    this.ammoEl.innerHTML = `${ammo} <span>RNDS</span>`;
  }

  setObjective(kills: number, total: number): void {
    const text =
      kills >= total
        ? 'All hostiles eliminated — district secured'
        : `${kills} / ${total} hostiles eliminated`;
    if (text === this.lastObjective) return;
    this.lastObjective = text;
    this.objectiveEl.textContent = text;
    this.objectiveEl.classList.toggle('done', kills >= total);
  }

  flashHitmarker(): void {
    this.hitmarker.classList.add('show');
    if (this.hitTimer) clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => this.hitmarker.classList.remove('show'), 70);
  }

  flashDamage(): void {
    this.damageEl.classList.add('show');
    if (this.damageTimer) clearTimeout(this.damageTimer);
    this.damageTimer = setTimeout(() => this.damageEl.classList.remove('show'), 120);
  }

  setOverlay(mode: OverlayMode): void {
    if (mode === this.overlayMode) return;
    this.overlayMode = mode;
    if (mode === 'none') {
      this.overlay.classList.add('hidden');
      return;
    }
    this.overlay.classList.remove('hidden');
    this.overlayTitle.classList.toggle('death', mode === 'dead');
    const tapWord = IS_TOUCH_DEVICE ? 'Tap' : 'Click';
    if (mode === 'start') {
      this.overlayTitle.textContent = 'Paris Contract';
      this.overlayBody.innerHTML = IS_TOUCH_DEVICE
        ? 'Eliminate all hostiles in the district.<br>Left stick to move &middot; drag right side to aim &middot; FIRE to shoot &middot; JUMP to jump'
        : 'Eliminate all hostiles in the district.<br>WASD to move &middot; mouse to aim &middot; click to fire &middot; Space to jump &middot; Esc to pause';
      this.overlayPrompt.textContent = `${tapWord} to play`;
    } else if (mode === 'paused') {
      this.overlayTitle.textContent = 'Paused';
      this.overlayBody.innerHTML = IS_TOUCH_DEVICE
        ? 'Controls released.'
        : 'Pointer released.<br>(If the click does nothing, wait a second and click again.)';
      this.overlayPrompt.textContent = `${tapWord} to resume`;
    } else {
      this.overlayTitle.textContent = 'You Died';
      this.overlayBody.textContent = 'The contract remains open.';
      this.overlayPrompt.textContent = `${tapWord} to respawn`;
    }
  }
}
