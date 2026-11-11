import { describe, it, expect } from 'vitest';
import { FrameStats } from '../src/core/framestats.js';

describe('FrameStats', () => {
  it('reports nothing until a frame has been recorded', () => {
    expect(new FrameStats().summary()).toBeNull();
  });

  it('averages steady frames', () => {
    const stats = new FrameStats(100);
    for (let i = 0; i < 50; i++) stats.push(20);
    const s = stats.summary();
    expect(s.frames).toBe(50);
    expect(s.avgFps).toBeCloseTo(50, 3);
    expect(s.low1Fps).toBeCloseTo(50, 3);
    expect(s.worstMs).toBeCloseTo(20, 3);
  });

  it('shows a hitch in the 1% low even when the average looks fine', () => {
    const stats = new FrameStats(200);
    for (let i = 0; i < 199; i++) stats.push(10);
    stats.push(100); // one long stall
    const s = stats.summary();
    expect(s.avgFps).toBeGreaterThan(90);
    expect(s.low1Fps).toBeLessThan(20);
    expect(s.worstMs).toBeCloseTo(100, 3);
  });

  it('forgets the oldest frames once full', () => {
    const stats = new FrameStats(10);
    for (let i = 0; i < 10; i++) stats.push(100);
    for (let i = 0; i < 10; i++) stats.push(10);
    const s = stats.summary();
    expect(s.frames).toBe(10);
    expect(s.worstMs).toBeCloseTo(10, 3);
  });

  it('ignores nonsense durations', () => {
    const stats = new FrameStats(10);
    stats.push(0);
    stats.push(-5);
    stats.push(NaN);
    expect(stats.summary()).toBeNull();
  });
});
