// Every texture in the game is drawn here at load time with the 2D canvas API.
// Nothing is downloaded, which keeps the deploy self-contained and means the
// whole valley is about 400 KB of code rather than 200 MB of images.
//
// Each material gets a colour map, a roughness map and a normal map derived
// from a height field. That trio is what makes surfaces catch light like real
// concrete and rusted steel instead of looking like flat painted cardboard.

import * as THREE from 'three';
import { fbm, noise2, makeRandom, clamp } from '../core/noise.js';

const cache = new Map();

/** Build a canvas of the given size and hand its pixel buffer to `fill`. */
function paint(size, fill) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const image = ctx.createImageData(size, size);
  fill(image.data, size);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function toTexture(canvas, repeat = 1, colorSpace = THREE.SRGBColorSpace) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = colorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Turn a grayscale height field into a tangent-space normal map by measuring
 * the slope between neighbouring pixels (a Sobel-style difference). This is
 * the cheap trick that gives flat geometry the illusion of surface relief.
 */
function normalMapFrom(heights, size, strength = 2.4) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const d = image.data;

  const at = (x, y) => heights[(((y + size) % size) * size + ((x + size) % size))];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // Normalise the vector (-dx, -dy, 1) and pack it into 0..255 per channel.
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      d[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function grayTexture(values, size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < values.length; i++) {
    const v = clamp(values[i], 0, 1) * 255;
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/**
 * The workhorse. `shade(nx, ny, rand)` returns { r, g, b, height, rough } for a
 * point on the surface, and this assembles all three maps in one pass.
 */
function makeMaterialMaps(key, size, repeat, shade, normalStrength = 2.4) {
  if (cache.has(key)) return cache.get(key);

  const heights = new Float32Array(size * size);
  const roughs = new Float32Array(size * size);
  const rand = makeRandom(key.length * 7919 + size);

  const canvas = paint(size, (data) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const s = shade(x / size, y / size, rand, x, y);
        data[i * 4] = clamp(s.r, 0, 1) * 255;
        data[i * 4 + 1] = clamp(s.g, 0, 1) * 255;
        data[i * 4 + 2] = clamp(s.b, 0, 1) * 255;
        data[i * 4 + 3] = 255;
        heights[i] = s.height ?? 0.5;
        roughs[i] = s.rough ?? 0.85;
      }
    }
  });

  const maps = {
    map: toTexture(canvas, repeat),
    normalMap: normalMapFrom(heights, size, normalStrength),
    roughnessMap: grayTexture(roughs, size),
  };
  maps.roughnessMap.wrapS = maps.roughnessMap.wrapT = THREE.RepeatWrapping;
  maps.normalMap.repeat.set(repeat, repeat);
  maps.roughnessMap.repeat.set(repeat, repeat);
  cache.set(key, maps);
  return maps;
}

// --- Surface recipes --------------------------------------------------------
// Coordinates arriving in `shade` are 0..1 across the tile. Multiplying them
// before feeding the noise controls how large the features are.

export function concreteMaps() {
  return makeMaterialMaps('concrete', 512, 1, (u, v, rand) => {
    const grain = fbm(u * 90, v * 90, 4) * 0.5 + 0.5;
    const blotch = fbm(u * 9, v * 9, 3) * 0.5 + 0.5;
    const stain = Math.pow(clamp(fbm(u * 4 + 30, v * 14, 4) * 0.5 + 0.5, 0, 1), 3);

    // Hairline cracks: ridged noise pinched to a thin dark line.
    const crackField = Math.abs(fbm(u * 7, v * 7 + 11, 4));
    const crack = 1 - clamp((crackField - 0.015) * 45, 0, 1);

    // Spalled patches where the aggregate shows through.
    const spall = clamp((fbm(u * 22 + 5, v * 22 - 3, 3) - 0.3) * 5, 0, 1);

    let base = 0.52 + blotch * 0.16 + grain * 0.08 - stain * 0.2;
    base -= crack * 0.28;
    base -= spall * 0.09;

    return {
      r: base * 1.02,
      g: base * 0.99,
      b: base * 0.93,
      height: 0.55 + grain * 0.12 - crack * 0.5 - spall * 0.25,
      rough: 0.86 + grain * 0.1 - spall * 0.05,
    };
  }, 2.2);
}

export function rustMaps() {
  return makeMaterialMaps('rust', 512, 1, (u, v) => {
    const flake = fbm(u * 40, v * 40, 4) * 0.5 + 0.5;
    const patch = fbm(u * 7, v * 7, 4) * 0.5 + 0.5;
    const streak = fbm(u * 3, v * 26, 3) * 0.5 + 0.5;

    // Where `patch` is high the steel has gone fully to iron oxide; where it's
    // low there's still some dull grey paint clinging on.
    const oxidised = clamp((patch - 0.36) * 3.1, 0, 1);
    const t = clamp(oxidised * 0.75 + streak * 0.25, 0, 1);

    const paintR = 0.30, paintG = 0.31, paintB = 0.30;
    const rustR = 0.46, rustG = 0.21, rustB = 0.09;

    const shade = 0.72 + flake * 0.42;
    return {
      r: (paintR + (rustR - paintR) * t) * shade,
      g: (paintG + (rustG - paintG) * t) * shade,
      b: (paintB + (rustB - paintB) * t) * shade,
      height: 0.5 + flake * 0.3 + oxidised * 0.2,
      // Rust is matte, surviving paint is a little glossier.
      rough: 0.55 + t * 0.42,
    };
  }, 2.8);
}

export function paintedMaps(key, r, g, b) {
  return makeMaterialMaps(`paint-${key}`, 512, 1, (u, v) => {
    const grain = fbm(u * 70, v * 70, 3) * 0.5 + 0.5;
    // Big soft regions where paint has lifted off, revealing weathered wood.
    const peel = clamp((fbm(u * 8 + 17, v * 8 - 9, 4) - 0.12) * 3.4, 0, 1);
    const fade = fbm(u * 3, v * 3, 2) * 0.5 + 0.5;
    const board = Math.abs((v * 14) % 1 - 0.5) < 0.045 ? 0.7 : 1;

    const woodR = 0.36, woodG = 0.29, woodB = 0.22;
    const t = 1 - peel;
    const sun = 0.78 + fade * 0.3;

    return {
      r: (woodR + (r - woodR) * t) * sun * board * (0.9 + grain * 0.2),
      g: (woodG + (g - woodG) * t) * sun * board * (0.9 + grain * 0.2),
      b: (woodB + (b - woodB) * t) * sun * board * (0.9 + grain * 0.2),
      height: 0.5 + t * 0.22 + grain * 0.1 - (board < 1 ? 0.35 : 0),
      rough: 0.62 + peel * 0.32,
    };
  }, 2.0);
}

export function woodMaps() {
  return makeMaterialMaps('wood', 512, 1, (u, v) => {
    // Stretch the noise along one axis so the grain runs lengthwise.
    const grain = fbm(u * 5, v * 120, 4) * 0.5 + 0.5;
    const rings = (Math.sin(u * 46 + fbm(u * 6, v * 6, 2) * 7) * 0.5 + 0.5) * 0.3;
    const split = clamp((Math.abs(fbm(u * 12, v * 4, 3)) - 0.03) * 30, 0, 1);
    const weather = fbm(u * 2, v * 2, 3) * 0.5 + 0.5;

    // Sun-bleached silver-grey, not fresh lumber.
    const base = 0.30 + grain * 0.16 + rings * 0.1 + weather * 0.12;
    return {
      r: base * 1.06,
      g: base * 1.0,
      b: base * 0.9,
      height: 0.5 + grain * 0.25 - (1 - split) * 0.4,
      rough: 0.88 + grain * 0.1,
    };
  }, 2.6);
}

export function asphaltMaps() {
  return makeMaterialMaps('asphalt', 512, 1, (u, v) => {
    const chips = fbm(u * 130, v * 130, 3) * 0.5 + 0.5;
    const wear = fbm(u * 6, v * 6, 3) * 0.5 + 0.5;

    // Alligator cracking -- a web of thin dark lines.
    const c1 = 1 - clamp((Math.abs(fbm(u * 9, v * 9 + 4, 4)) - 0.012) * 60, 0, 1);
    const c2 = 1 - clamp((Math.abs(fbm(u * 17 + 22, v * 17, 3)) - 0.02) * 50, 0, 1);
    const crack = Math.max(c1, c2 * 0.7);

    // Sand blown across the surface, thicker where the road has worn away.
    const sand = clamp((fbm(u * 11 - 40, v * 11, 4) - 0.1) * 2.2, 0, 1) * (0.4 + wear * 0.6);

    let base = 0.14 + chips * 0.1 + wear * 0.05;
    base -= crack * 0.07;
    const dust = 0.55;
    const mixed = base + (dust - base) * sand * 0.65;

    return {
      r: mixed * 1.03,
      g: mixed * 1.0,
      b: mixed * 0.94,
      height: 0.5 + chips * 0.2 - crack * 0.45,
      rough: 0.9 + chips * 0.08,
    };
  }, 3.0);
}

export function dirtMaps() {
  return makeMaterialMaps('dirt', 512, 1, (u, v) => {
    const grit = fbm(u * 150, v * 150, 3) * 0.5 + 0.5;
    const clods = fbm(u * 26, v * 26, 4) * 0.5 + 0.5;
    const patch = fbm(u * 5, v * 5, 3) * 0.5 + 0.5;
    const pebble = clamp((fbm(u * 60 + 12, v * 60, 2) - 0.42) * 8, 0, 1);

    const base = 0.42 + clods * 0.16 + grit * 0.07 + patch * 0.1;
    return {
      r: base * 1.1,
      g: base * 1.0,
      b: base * 0.79,
      height: 0.5 + clods * 0.25 + pebble * 0.3 + grit * 0.08,
      rough: 0.93 + grit * 0.05,
    };
  }, 2.0);
}

export function glassMaps() {
  return makeMaterialMaps('glass', 256, 1, (u, v) => {
    const grime = fbm(u * 20, v * 20, 4) * 0.5 + 0.5;
    const streak = fbm(u * 3, v * 30, 3) * 0.5 + 0.5;
    const base = 0.05 + grime * 0.07 + streak * 0.04;
    return {
      r: base * 0.85,
      g: base * 0.95,
      b: base * 1.05,
      height: 0.5 + grime * 0.05,
      rough: 0.18 + grime * 0.35,
    };
  }, 1.4);
}

// --- Cutout textures for vegetation and fencing -----------------------------
// These use the drawing API rather than per-pixel maths because a few hundred
// strokes make a far more convincing bush than any noise function.

export function grassTuftTexture() {
  if (cache.has('grass-tuft')) return cache.get('grass-tuft');
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const rand = makeRandom(4242);
  const blades = 46;
  for (let i = 0; i < blades; i++) {
    const rootX = size * (0.12 + rand() * 0.76);
    const height = size * (0.42 + rand() * 0.5);
    const lean = (rand() - 0.5) * size * 0.42;
    const width = 1.6 + rand() * 2.9;

    // Dry cheatgrass: straw at the tip, a little green left at the base.
    const dry = 0.55 + rand() * 0.45;
    const r = Math.round(150 + dry * 60);
    const g = Math.round(132 + dry * 44);
    const b = Math.round(72 + dry * 30);

    ctx.strokeStyle = `rgba(${r},${g},${b},${0.75 + rand() * 0.25})`;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rootX, size);
    ctx.quadraticCurveTo(rootX + lean * 0.35, size - height * 0.55, rootX + lean, size - height);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set('grass-tuft', tex);
  return tex;
}

export function sagebrushTexture() {
  if (cache.has('sagebrush')) return cache.get('sagebrush');
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const rand = makeRandom(1337);

  // Woody trunk and main limbs first.
  ctx.strokeStyle = 'rgba(84,70,55,0.95)';
  ctx.lineCap = 'round';
  const limbs = 6;
  for (let i = 0; i < limbs; i++) {
    const spread = (i / (limbs - 1) - 0.5) * size * 0.62;
    ctx.lineWidth = 5 - Math.abs(spread) / size * 5;
    ctx.beginPath();
    ctx.moveTo(size * 0.5, size);
    ctx.quadraticCurveTo(size * 0.5 + spread * 0.3, size * 0.62, size * 0.5 + spread, size * 0.34);
    ctx.stroke();
  }

  // Then the silver-green foliage as many small soft dabs.
  for (let i = 0; i < 900; i++) {
    // Bias the cloud into a rounded crown shape.
    const a = rand() * Math.PI * 2;
    const rr = Math.pow(rand(), 0.55);
    const cx = size * 0.5 + Math.cos(a) * rr * size * 0.42;
    const cy = size * 0.42 + Math.sin(a) * rr * size * 0.34;
    if (cy > size * 0.94) continue;

    const shade = 0.62 + rand() * 0.38;
    const r = Math.round(126 * shade + 34);
    const g = Math.round(138 * shade + 40);
    const b = Math.round(104 * shade + 28);
    ctx.fillStyle = `rgba(${r},${g},${b},${0.35 + rand() * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 2.4 + rand() * 4.4, 1.6 + rand() * 3, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set('sagebrush', tex);
  return tex;
}

export function chainlinkTexture() {
  if (cache.has('chainlink')) return cache.get('chainlink');
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  // Two opposing diagonal families make the classic diamond mesh.
  ctx.lineWidth = 3.4;
  const step = size / 8;
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? 'rgba(126,124,118,0.95)' : 'rgba(96,92,86,0.95)';
    for (let i = -8; i < 16; i++) {
      ctx.beginPath();
      if (pass === 0) {
        ctx.moveTo(i * step, 0);
        ctx.lineTo(i * step + size, size);
      } else {
        ctx.moveTo(i * step, size);
        ctx.lineTo(i * step + size, 0);
      }
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set('chainlink', tex);
  return tex;
}
