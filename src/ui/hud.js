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
    this.toast = document.getElementById('toast');
    this._toastTimer = 0;

    this.statsVisible = false;
    this._accum = 0;
    this._notice = '';
    this._noticeTimer = 0;
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

  toggleStats(force) {
    this.statsVisible = force ?? !this.statsVisible;
    this.stats.classList.toggle('hidden', !this.statsVisible);
    this._accum = 1; // refresh the readout on the very next frame
  }

  /** Show a short message at the bottom of the screen for a moment. */
  showToast(message, seconds = 1.8) {
    this.toast.textContent = message;
    this.toast.classList.remove('faded');
    this._toastTimer = seconds;
  }

  /** Show a short message on the last line of the performance panel. */
  notify(message, seconds = 2.5) {
    this._notice = message;
    this._noticeTimer = seconds;
    this._accum = 1;
  }

  /**
   * Called every frame. `info` is a function so the numbers are only gathered
   * on the frames that actually redraw the readout (twice a second).
   */
  update(dt, info) {
    this._accum += dt;
    if (this._noticeTimer > 0) this._noticeTimer -= dt;
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.toast.classList.add('faded');
    }

    if (this.statsVisible && this._accum >= 0.5) {
      this._accum = 0;
      const i = info();
      const s = i.stats;
      this.stats.textContent = [
        s ? `${s.avgFps.toFixed(0)} fps  (${s.avgMs.toFixed(1)} ms)` : '-- fps',
        s ? `1% low ${s.low1Fps.toFixed(0)} fps` : '',
        s ? `worst ${s.worstMs.toFixed(0)} ms` : '',
        `${i.quality}  ${i.width}x${i.height}`,
        `${i.drawCalls} draws  ${(i.triangles / 1000).toFixed(0)}k tris`,
        `x ${i.x.toFixed(0)}  z ${i.z.toFixed(0)}`,
        this._noticeTimer > 0 ? this._notice : 'F4 copy report',
      ].join('\n');
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
