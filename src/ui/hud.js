// The heads-up display. Thin on purpose in Phase 1 -- there is nothing to
// report yet beyond the controls and a performance readout. The inventory and
// build menus will attach here in later phases.

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.controls = document.getElementById('controls');
    this.stats = document.getElementById('stats');
    this.loading = document.getElementById('loading');
    this.loadingStatus = document.getElementById('loading-status');
    this.loadingFill = document.getElementById('loading-fill');
    this.start = document.getElementById('start');

    this.statsVisible = false;
    this._frames = 0;
    this._accum = 0;
    this._fps = 0;
    this._controlsTimer = 0;
    this._controlsFaded = false;
  }

  setProgress(fraction, message) {
    this.loadingFill.style.width = `${Math.round(fraction * 100)}%`;
    if (message) this.loadingStatus.textContent = message;
  }

  /** Fade the loading screen out and reveal the click-to-start prompt. */
  finishLoading() {
    this.loading.style.opacity = '0';
    setTimeout(() => this.loading.classList.add('hidden'), 950);
    this.start.classList.remove('hidden');
    this.root.classList.remove('hidden');
  }

  showStartPrompt(visible) {
    this.start.classList.toggle('hidden', !visible);
  }

  toggleControls() {
    this.controls.classList.toggle('hidden');
  }

  toggleStats() {
    this.statsVisible = !this.statsVisible;
    this.stats.classList.toggle('hidden', !this.statsVisible);
  }

  /** Called every frame. Keeps the readout cheap by updating twice a second. */
  update(dt, info) {
    this._frames++;
    this._accum += dt;
    if (this._accum >= 0.5) {
      this._fps = this._frames / this._accum;
      this._frames = 0;
      this._accum = 0;

      if (this.statsVisible) {
        this.stats.textContent = [
          `${this._fps.toFixed(0)} fps`,
          `${info.quality}`,
          `${info.drawCalls} draws`,
          `${(info.triangles / 1000).toFixed(0)}k tris`,
          `x ${info.x.toFixed(0)}  z ${info.z.toFixed(0)}`,
        ].join('\n');
      }
    }

    // Let the control hints fade back once the player has settled in.
    if (!this._controlsFaded) {
      this._controlsTimer += dt;
      if (this._controlsTimer > 22) {
        this.controls.classList.add('faded');
        this._controlsFaded = true;
      }
    }
  }
}
