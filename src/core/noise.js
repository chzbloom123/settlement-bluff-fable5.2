// Deterministic noise. Everything in the world -- terrain shape, where a sage
// bush lands, the grain in a concrete texture -- is derived from these functions,
// so the same SEED always produces the exact same valley.

export const SEED = 20260803;

/** Tiny deterministic pseudo-random generator (mulberry32). */
export function makeRandom(seed = SEED) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Classic Perlin noise, seeded ------------------------------------------

const perm = new Uint8Array(512);
{
  const rand = makeRandom(SEED);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates shuffle so the gradient table is scrambled but reproducible.
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

function grad2(hash, x, y) {
  switch (hash & 3) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    default: return -x - y;
  }
}

/** Perlin noise in 2D. Returns roughly -1..1. */
export function noise2(x, y) {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const aa = perm[perm[xi] + yi];
  const ab = perm[perm[xi] + yi + 1];
  const ba = perm[perm[xi + 1] + yi];
  const bb = perm[perm[xi + 1] + yi + 1];

  const x1 = lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u);
  const x2 = lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u);
  return lerp(x1, x2, v);
}

/**
 * Fractal noise: several octaves of Perlin stacked, each finer and quieter.
 * This is what gives terrain both big rolling shapes and small detail.
 */
export function fbm(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/**
 * Ridged noise -- absolute value flipped, which turns smooth hills into sharp
 * crests. Used for the basalt and the cut of the bluffs.
 */
export function ridged(x, y, octaves = 4) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += (1 - Math.abs(noise2(x * freq, y * freq))) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return (sum / norm) * 2 - 1;
}

// --- Small math helpers used all over the world code ------------------------

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const mix = lerp;

/** Smooth 0..1 ramp between two edges. Works in either direction. */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
