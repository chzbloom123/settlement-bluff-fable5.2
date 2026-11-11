// Frame-time bookkeeping for the performance panel.
//
// Average frames-per-second hides stutter: a game can average 60 fps and still
// hitch badly. So alongside the average this tracks the "1% low" -- the frame
// rate of the slowest one percent of recent frames -- and the single worst
// frame. Those two numbers are what "does it feel smooth" actually means.
//
// No Three.js or browser APIs in here, so it can be unit tested on its own.

export class FrameStats {
  /** @param {number} capacity how many recent frames to remember */
  constructor(capacity = 600) {
    this.samples = new Float32Array(capacity);
    this.count = 0;   // how many slots hold real data
    this.next = 0;    // where the next sample is written
  }

  /** Record one frame's duration in milliseconds. */
  push(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return;
    this.samples[this.next] = ms;
    this.next = (this.next + 1) % this.samples.length;
    if (this.count < this.samples.length) this.count++;
  }

  reset() {
    this.count = 0;
    this.next = 0;
  }

  /** Summarise the remembered frames. Returns null until there is data. */
  summary() {
    if (this.count === 0) return null;

    const sorted = Array.from(this.samples.subarray(0, this.count)).sort((a, b) => a - b);
    const total = sorted.reduce((sum, ms) => sum + ms, 0);
    const avgMs = total / sorted.length;

    // The slowest 1% of frames (always at least one).
    const slowCount = Math.max(1, Math.round(sorted.length * 0.01));
    const slow = sorted.slice(sorted.length - slowCount);
    const lowMs = slow.reduce((sum, ms) => sum + ms, 0) / slow.length;

    return {
      frames: sorted.length,
      avgMs,
      avgFps: 1000 / avgMs,
      low1Fps: 1000 / lowMs,
      worstMs: sorted[sorted.length - 1],
    };
  }
}
