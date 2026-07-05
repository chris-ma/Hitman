import './touch-controls.css';
import type { InputManager } from './InputManager';
import { TOUCH_LOOK_MULTIPLIER, TOUCH_JOYSTICK_RADIUS } from '../constants';

const LOOK_SCALE = TOUCH_LOOK_MULTIPLIER; // pre-scale so PlayerController's single MOUSE_SENSITIVITY multiply feels right for both inputs

/**
 * On-screen touch controls for mobile/landscape play: a left-thumb movement
 * joystick, a right-side drag-to-look zone, and fire/jump/pause buttons.
 * Only instantiated when InputManager.isTouch is true. Talks to InputManager
 * through its public surface (setTouchMove/addLookDelta/fireHeld/simulateKey*)
 * so PlayerController/Weapon/Game stay input-scheme-agnostic.
 */
export class TouchControls {
  private root: HTMLDivElement;
  private pauseBtn: HTMLButtonElement;

  private joyBase: HTMLDivElement;
  private joyKnob: HTMLDivElement;
  private joyTouchId: number | null = null;
  private joyCenter = { x: 0, y: 0 };

  private lookTouchId: number | null = null;
  private lookLast = { x: 0, y: 0 };

  private fireTouchId: number | null = null;

  constructor(container: HTMLElement, private input: InputManager) {
    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    container.appendChild(this.root);

    // Right-side drag-to-look zone sits behind the buttons in paint order so
    // the buttons swallow their own touches first (handlers below call
    // stopPropagation on button start events as a second guard).
    const lookZone = document.createElement('div');
    lookZone.className = 'touch-lookzone';
    this.root.appendChild(lookZone);
    this.wireLookZone(lookZone);

    this.joyBase = document.createElement('div');
    this.joyBase.className = 'touch-joy-base';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'touch-joy-knob';
    this.joyBase.appendChild(this.joyKnob);
    this.root.appendChild(this.joyBase);
    this.wireJoystick();

    const jumpBtn = document.createElement('button');
    jumpBtn.className = 'touch-btn touch-jump-btn';
    jumpBtn.textContent = 'JUMP';
    this.root.appendChild(jumpBtn);
    this.wireJumpButton(jumpBtn);

    const fireBtn = document.createElement('button');
    fireBtn.className = 'touch-btn touch-fire-btn';
    fireBtn.textContent = 'FIRE';
    this.root.appendChild(fireBtn);
    this.wireFireButton(fireBtn);

    this.pauseBtn = document.createElement('button');
    this.pauseBtn.className = 'touch-btn touch-pause-btn';
    this.pauseBtn.textContent = '⏸';
    this.root.appendChild(this.pauseBtn);
    this.pauseBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.input.unlock();
    });

    this.setPlaying(false);
  }

  /** Hides gameplay controls (and the pause button) while an overlay is up. */
  setPlaying(playing: boolean): void {
    this.root.classList.toggle('playing', playing);
  }

  private wireJoystick(): void {
    const base = this.joyBase;

    const start = (e: TouchEvent) => {
      if (this.joyTouchId !== null) return;
      const t = e.changedTouches[0];
      this.joyTouchId = t.identifier;
      const rect = base.getBoundingClientRect();
      this.joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      e.preventDefault();
      e.stopPropagation();
      updateFromTouch(t);
    };

    const updateFromTouch = (t: Touch) => {
      let dx = t.clientX - this.joyCenter.x;
      let dy = t.clientY - this.joyCenter.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, TOUCH_JOYSTICK_RADIUS);
      if (dist > 0.001) {
        dx = (dx / dist) * clamped;
        dy = (dy / dist) * clamped;
      }
      this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / TOUCH_JOYSTICK_RADIUS;
      const nz = dy / TOUCH_JOYSTICK_RADIUS;
      this.input.setTouchMove(nx, nz);
    };

    const move = (e: TouchEvent) => {
      if (this.joyTouchId === null) return;
      const t = findTouch(e.changedTouches, this.joyTouchId);
      if (!t) return;
      e.preventDefault();
      updateFromTouch(t);
    };

    const end = (e: TouchEvent) => {
      if (this.joyTouchId === null) return;
      const t = findTouch(e.changedTouches, this.joyTouchId);
      if (!t) return;
      this.joyTouchId = null;
      this.joyKnob.style.transform = 'translate(0, 0)';
      this.input.setTouchMove(0, 0);
    };

    base.addEventListener('touchstart', start, { passive: false });
    base.addEventListener('touchmove', move, { passive: false });
    base.addEventListener('touchend', end);
    base.addEventListener('touchcancel', end);
  }

  private wireLookZone(zone: HTMLDivElement): void {
    const start = (e: TouchEvent) => {
      if (this.lookTouchId !== null) return;
      const t = e.changedTouches[0];
      this.lookTouchId = t.identifier;
      this.lookLast = { x: t.clientX, y: t.clientY };
    };

    const move = (e: TouchEvent) => {
      if (this.lookTouchId === null) return;
      const t = findTouch(e.changedTouches, this.lookTouchId);
      if (!t) return;
      e.preventDefault();
      const dx = t.clientX - this.lookLast.x;
      const dy = t.clientY - this.lookLast.y;
      this.lookLast = { x: t.clientX, y: t.clientY };
      // Pre-scale so PlayerController's flat MOUSE_SENSITIVITY multiply gives
      // touch drags their own feel instead of the mouse's raw-pixel-delta feel.
      this.input.addLookDelta(dx * LOOK_SCALE, dy * LOOK_SCALE);
    };

    const end = (e: TouchEvent) => {
      const t = findTouch(e.changedTouches, this.lookTouchId);
      if (!t) return;
      this.lookTouchId = null;
    };

    zone.addEventListener('touchstart', start, { passive: true });
    zone.addEventListener('touchmove', move, { passive: false });
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
  }

  private wireFireButton(btn: HTMLButtonElement): void {
    const start = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.fireTouchId !== null) return;
      this.fireTouchId = e.changedTouches[0].identifier;
      this.input.fireHeld = true;
    };
    const end = (e: TouchEvent) => {
      const t = findTouch(e.changedTouches, this.fireTouchId);
      if (!t) return;
      this.fireTouchId = null;
      this.input.fireHeld = false;
    };
    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('touchend', end);
    btn.addEventListener('touchcancel', end);
  }

  private wireJumpButton(btn: HTMLButtonElement): void {
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.input.simulateKeyDown('Space');
    }, { passive: false });
    const release = () => this.input.simulateKeyUp('Space');
    btn.addEventListener('touchend', release);
    btn.addEventListener('touchcancel', release);
  }
}

function findTouch(list: TouchList, id: number | null): Touch | null {
  if (id === null) return null;
  for (let i = 0; i < list.length; i++) {
    if (list[i].identifier === id) return list[i];
  }
  return null;
}
