// All keyboard and mouse handling lives here so the rest of the game can just
// ask "is forward held?" without caring about browser events.

const SENSITIVITY_KEY = 'hanford.mouse.v1';
const MAX_MOUSE_STEP = 350; // pixels in one mouse event; anything more is a glitch

function loadSensitivityScale() {
  try {
    const saved = parseFloat(localStorage.getItem(SENSITIVITY_KEY));
    if (Number.isFinite(saved) && saved >= 0.2 && saved <= 3) return saved;
  } catch {
    // Private-browsing mode can throw on storage access. Not fatal.
  }
  return 1;
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();

    // Mouse movement accumulated since the last frame, in pixels.
    this.mouseDX = 0;
    this.mouseDY = 0;

    this.pointerLocked = false;

    // Radians of turn per pixel of mouse travel at 100%. The player's own
    // multiplier (the [ and ] keys) is remembered between visits.
    this.baseSensitivity = 0.0020;
    this.sensitivityScale = loadSensitivityScale();

    // Listeners registered by other systems for one-shot key presses.
    this._pressHandlers = new Map();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('mousemove', this._onMouseMove);
  }

  _onKeyDown = (e) => {
    // Stop the page scrolling when the player holds space or the arrow keys.
    // F3 is "find next" in Chrome and Edge; we use it for the performance panel.
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3', 'F4'].includes(e.key)) {
      e.preventDefault();
    }
    const code = e.code;
    if (!this.keys.has(code)) {
      const handler = this._pressHandlers.get(code);
      if (handler) handler();
    }
    this.keys.add(code);
  };

  _onKeyUp = (e) => {
    this.keys.delete(e.code);
  };

  // If the player alt-tabs away, forget every held key so they don't come back
  // to a character sprinting into a wall.
  _onBlur = () => {
    this.keys.clear();
  };

  _onMouseMove = (e) => {
    if (!this.pointerLocked) return;
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    // Browsers occasionally report one enormous jump while the pointer is
    // locked (more often over remote desktop). No hand moves this far in a
    // single event, so drop it rather than spin the view.
    if (Math.abs(dx) > MAX_MOUSE_STEP || Math.abs(dy) > MAX_MOUSE_STEP) return;
    this.mouseDX += dx;
    this.mouseDY += dy;
  };

  _onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (this.onPointerLockChange) this.onPointerLockChange(this.pointerLocked);
  };

  /** Register a callback that fires once each time a key goes down. */
  onPress(code, handler) {
    this._pressHandlers.set(code, handler);
  }

  requestPointerLock() {
    // Chrome returns a promise here and rejects if the user just exited lock.
    // Swallowing it avoids a console error that means nothing to the player.
    const result = this.canvas.requestPointerLock?.();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  }

  isDown(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  get forward() { return this.isDown('KeyW', 'ArrowUp'); }
  get back()    { return this.isDown('KeyS', 'ArrowDown'); }
  get left()    { return this.isDown('KeyA', 'ArrowLeft'); }
  get right()   { return this.isDown('KeyD', 'ArrowRight'); }
  get sprint()  { return this.isDown('ShiftLeft', 'ShiftRight'); }
  get jump()    { return this.isDown('Space'); }

  /** Make the mouse faster (factor > 1) or slower. Returns the new percentage. */
  adjustSensitivity(factor) {
    this.sensitivityScale = Math.min(3, Math.max(0.2, this.sensitivityScale * factor));
    try {
      localStorage.setItem(SENSITIVITY_KEY, String(this.sensitivityScale));
    } catch {
      // Storage unavailable: the setting just won't be remembered.
    }
    return Math.round(this.sensitivityScale * 100);
  }

  /** Read and clear the accumulated mouse delta. Call once per frame. */
  consumeMouse() {
    const sensitivity = this.baseSensitivity * this.sensitivityScale;
    const dx = this.mouseDX * sensitivity;
    const dy = this.mouseDY * sensitivity;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }
}
