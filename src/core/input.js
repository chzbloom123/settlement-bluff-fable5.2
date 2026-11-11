// All keyboard and mouse handling lives here so the rest of the game can just
// ask "is forward held?" without caring about browser events.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();

    // Mouse movement accumulated since the last frame, in pixels.
    this.mouseDX = 0;
    this.mouseDY = 0;

    this.pointerLocked = false;
    this.sensitivity = 0.0022;

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
    this.mouseDX += e.movementX || 0;
    this.mouseDY += e.movementY || 0;
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

  /** Read and clear the accumulated mouse delta. Call once per frame. */
  consumeMouse() {
    const dx = this.mouseDX * this.sensitivity;
    const dy = this.mouseDY * this.sensitivity;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }
}
