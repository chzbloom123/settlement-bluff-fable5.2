// The buildings. Each function here adds one structure to a MeshBuilder at a
// given position -- geometry for drawing, plus colliders so the player can't
// walk through walls.
//
// The reference is decayed mid-century small-town America: a highway strip of
// low commercial buildings, frame houses behind them, and the agricultural and
// utility structures that outlast everything else.
//
// Nothing here has a backstory. Signage is shapes and frames, never words, so
// the world stays open for whatever mythology gets written into it later.

import * as THREE from 'three';
import { box, cylinder, wallWithOpenings, cable } from './geometry.js';
import { groundHeight } from './terrain.js';
import { makeRandom } from '../core/noise.js';

const rand = makeRandom(90210);
const rng = (min, max) => min + rand() * (max - min);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

/**
 * A building's local coordinate frame. Every structure is authored around its
 * own origin facing +Z, then placed and rotated with these two helpers:
 *   xyz(localX, worldY, localZ) -> [worldX, worldY, worldZ]  (for geometry)
 *   xz(localX, localZ)          -> [worldX, worldZ]          (for colliders)
 * Spreading them straight into box()/wallWithOpenings() keeps the call sites
 * short without ever getting the argument order wrong.
 */
function frame(x, z, rotY) {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  return {
    xyz: (lx, y, lz) => [x + lx * c - lz * s, y, z + lx * s + lz * c],
    xz: (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c],
  };
}

/** A run of evenly spaced window openings for wallWithOpenings(). */
function windowRow(count, spacing, startX, sill, w, h) {
  const out = [];
  for (let i = 0; i < count; i++) out.push({ x: startX + i * spacing, y: sill, w, h });
  return out;
}

/**
 * The darkness seen through empty window and door frames: a slightly inset
 * unlit shell. Far cheaper than modelling rooms, and from outside it reads
 * exactly the same.
 */
function interiorShell(b, f, w, h, d, baseY, rotY) {
  const inset = 0.34;
  b.add('dark', box(w - inset, h - 0.2, d - inset, ...f.xyz(0, baseY + h / 2 - 0.1, 0), rotY, 4));
}

/** Four walls of a rectangular building. `walls` supplies the openings per side. */
function shell(b, f, mat, w, d, h, baseY, rotY, walls = {}) {
  const t = walls.thickness ?? 0.3;
  b.add(mat, wallWithOpenings(w, h, t, walls.front ?? [], ...f.xyz(0, baseY, d / 2), rotY));
  b.add(mat, wallWithOpenings(w, h, t, walls.back ?? [], ...f.xyz(0, baseY, -d / 2), rotY));
  b.add(mat, wallWithOpenings(d, h, t, walls.left ?? [], ...f.xyz(-w / 2, baseY, 0), rotY + Math.PI / 2));
  b.add(mat, wallWithOpenings(d, h, t, walls.right ?? [], ...f.xyz(w / 2, baseY, 0), rotY + Math.PI / 2));
}

/**
 * A gable roof: two slabs leaned against each other, plus stepped boards
 * filling the triangular gable ends.
 */
function gableRoof(b, f, w, d, baseY, ridgeH, rotY, roofMat, gableMat, skipSide = 0) {
  const halfW = w / 2 + 0.4;
  const pitch = Math.atan2(ridgeH, halfW);
  const slopeLen = Math.hypot(ridgeH, halfW);

  for (const side of [-1, 1]) {
    if (side === skipSide) continue;
    const geo = new THREE.BoxGeometry(slopeLen, 0.21, d + 0.9);
    geo.rotateZ(-side * pitch);
    geo.rotateY(rotY);
    const [rx, , rz] = f.xyz(side * halfW / 2, 0, 0);
    geo.translate(rx, baseY + ridgeH / 2, rz);
    b.add(roofMat, geo);
  }

  const steps = 5;
  for (const side of [-1, 1]) {
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const segW = (w + 0.3) * (1 - t);
      if (segW < 0.4) continue;
      b.add(gableMat, box(segW, ridgeH / steps + 0.03, 0.22,
        ...f.xyz(0, baseY + (t + 0.5) * (ridgeH / steps), side * (d / 2 + 0.06)), rotY));
    }
  }
}

// --- Individual structures --------------------------------------------------

/**
 * Filling station: a flat canopy on steel posts, a small service building and
 * pump islands underneath. The canopy is the signature shape -- a big
 * horizontal plane that catches the low sun and throws a very long shadow.
 */
export function gasStation(b, x, z, rotY = 0) {
  const g = groundHeight(x, z);
  const f = frame(x, z, rotY);

  // --- Service building, set back from the road ---
  const bw = 11, bh = 3.9, bd = 7.5, bcz = -7.5;
  const fb = frame(...f.xz(0, bcz), rotY);

  b.add('concrete', box(bw + 0.6, 0.26, bd + 0.6, ...fb.xyz(0, g + 0.13, 0), rotY, 2.2));
  interiorShell(b, fb, bw, bh, bd, g, rotY);
  shell(b, fb, 'paintCream', bw, bd, bh, g, rotY, {
    front: [
      { x: -3.0, y: 0.15, w: 3.4, h: 3.0 },   // service bay
      { x: 0.9, y: 0.15, w: 3.0, h: 3.0 },    // service bay
      { x: 4.2, y: 0.10, w: 1.1, h: 2.3 },    // office door
    ],
    left: windowRow(2, 2.6, -1.3, 1.5, 1.5, 1.3),
  });

  // Flat roof with a parapet across the front.
  b.add('rust', box(bw + 0.7, 0.28, bd + 0.7, ...fb.xyz(0, g + bh + 0.12, 0), rotY, 2.6));
  b.add('paintCream', box(bw + 0.7, 0.55, 0.24, ...fb.xyz(0, g + bh + 0.5, bd / 2), rotY));
  b.collideBox(...fb.xz(0, 0), bw + 0.6, bd + 0.6, rotY);

  // --- Canopy over the pumps ---
  const ch = 4.6, cw = 15, cd = 10, ccz = 3.5;
  b.add('paintCream', box(cw, 0.75, cd, ...f.xyz(0, g + ch, ccz), rotY, 3.0));
  b.add('rust', box(cw + 0.35, 0.3, cd + 0.35, ...f.xyz(0, g + ch + 0.52, ccz), rotY, 3.0));
  b.add('paintRed', box(cw + 0.42, 0.34, cd + 0.42, ...f.xyz(0, g + ch - 0.36, ccz), rotY, 3.0));

  for (const [px, pz] of [[-6.2, -3.6], [6.2, -3.6], [-6.2, 3.6], [6.2, 3.6]]) {
    b.add('rust', box(0.42, ch, 0.42, ...f.xyz(px, g + ch / 2, ccz + pz), rotY, 1.4));
    b.collideBox(...f.xz(px, ccz + pz), 0.7, 0.7);
  }

  // --- Pump islands ---
  for (const iz of [-2.2, 2.2]) {
    b.add('concrete', box(6.5, 0.28, 1.5, ...f.xyz(0, g + 0.14, ccz + iz), rotY, 1.8));
    b.collideBox(...f.xz(0, ccz + iz), 6.5, 1.5, rotY, g + 0.28);

    for (const px of [-1.9, 1.9]) {
      b.add('paintRed', box(0.66, 1.55, 0.5, ...f.xyz(px, g + 1.05, ccz + iz), rotY, 1.0));
      b.add('rust', box(0.72, 0.16, 0.56, ...f.xyz(px, g + 1.9, ccz + iz), rotY, 1.0));
      b.add('rust', box(0.16, 0.7, 0.16, ...f.xyz(px, g + 1.5, ccz + iz + 0.4), rotY, 1.0));
      b.collideBox(...f.xz(px, ccz + iz), 0.9, 0.9);
    }
  }

  // --- Roadside pylon sign, frame intact, face long gone ---
  b.add('rust', box(0.45, 7.6, 0.45, ...f.xyz(9.5, g + 3.8, 6.0), rotY, 1.6));
  b.add('rust', box(3.6, 2.5, 0.28, ...f.xyz(9.5, g + 8.4, 6.0), rotY, 2.0));
  b.add('dark', box(3.1, 2.0, 0.14, ...f.xyz(9.5, g + 8.4, 6.12), rotY, 2.0));
  b.collideBox(...f.xz(9.5, 6.0), 0.8, 0.8);
}

/**
 * Roadside diner: a long low box with a stainless band, a run of windows the
 * whole way along the front, and the skeleton of a rooftop sign.
 */
export function diner(b, x, z, rotY = 0) {
  const g = groundHeight(x, z);
  const f = frame(x, z, rotY);
  const w = 15, d = 8, h = 3.5;

  b.add('concrete', box(w + 1.2, 0.3, d + 1.2, ...f.xyz(0, g + 0.15, 0), rotY, 2.2));
  interiorShell(b, f, w, h, d, g, rotY);
  shell(b, f, 'paintTeal', w, d, h, g, rotY, {
    front: [...windowRow(5, 2.5, -5.0, 1.0, 1.9, 1.7), { x: 6.0, y: 0.1, w: 1.2, h: 2.4 }],
    back: [{ x: -4, y: 1.6, w: 1.0, h: 0.9 }, { x: 4.5, y: 0.1, w: 1.1, h: 2.2 }],
    left: windowRow(2, 2.4, -1.2, 1.0, 1.7, 1.7),
  });

  // Stainless skirt and parapet band -- the whole diner read in two stripes.
  b.add('rust', box(w + 0.3, 0.85, d + 0.3, ...f.xyz(0, g + 0.55, 0), rotY, 3.0));
  b.add('rust', box(w + 0.5, 0.55, d + 0.5, ...f.xyz(0, g + h + 0.12, 0), rotY, 3.0));
  b.add('paintCream', box(w + 0.2, 0.24, d + 0.2, ...f.xyz(0, g + h + 0.5, 0), rotY, 2.6));

  // Rooftop sign frame with one leg buckled outward.
  b.add('rust', box(5.4, 0.22, 0.22, ...f.xyz(-2.5, g + h + 3.4, 0), rotY, 1.6));
  b.add('rust', box(0.22, 3.0, 0.22, ...f.xyz(-5.0, g + h + 1.9, 0), rotY, 1.6));
  b.add('rust', box(0.22, 2.9, 0.22, ...f.xyz(0.0, g + h + 1.85, 0.25), rotY + 0.09, 1.6));
  b.add('rust', box(4.6, 1.7, 0.16, ...f.xyz(-2.5, g + h + 2.5, 0), rotY, 2.0));

  // Step at the door.
  b.add('concrete', box(2.0, 0.24, 1.4, ...f.xyz(6.0, g + 0.12, d / 2 + 0.7), rotY, 1.4));
  b.collideBox(...f.xz(6.0, d / 2 + 0.7), 2.0, 1.4, rotY, g + 0.24);
  b.collideBox(x, z, w + 0.6, d + 0.6, rotY);
}

/**
 * Motel: a row of identical units under one long roof with a covered walkway.
 * The repetition is the whole point -- it reads instantly at any distance.
 */
export function motel(b, x, z, rotY = 0, units = 6) {
  const g = groundHeight(x, z);
  const f = frame(x, z, rotY);
  const unitW = 4.4;
  const w = unitW * units, d = 7.0, h = 3.2;

  b.add('concrete', box(w + 0.8, 0.28, d + 3.2, ...f.xyz(0, g + 0.14, 0.8), rotY, 2.4));
  interiorShell(b, f, w, h, d, g, rotY);

  const front = [];
  for (let i = 0; i < units; i++) {
    const ux = -w / 2 + unitW * (i + 0.5);
    front.push({ x: ux - 1.1, y: 0.05, w: 1.05, h: 2.25 });   // door
    front.push({ x: ux + 0.9, y: 1.00, w: 1.50, h: 1.35 });   // window
  }
  shell(b, f, 'paintCream', w, d, h, g, rotY, {
    front,
    back: windowRow(units, unitW, -w / 2 + unitW / 2, 1.7, 0.9, 0.8),
  });

  // Low roof overhanging far enough to shade the walkway.
  b.add('rust', box(w + 0.6, 0.3, d + 4.0, ...f.xyz(0, g + h + 0.16, 1.0), rotY, 3.2));
  b.add('paintTeal', box(w + 0.6, 0.44, 0.26, ...f.xyz(0, g + h + 0.42, d / 2 + 2.9), rotY));

  // Walkway posts, one knocked out of true.
  for (let i = 0; i <= units; i++) {
    const px = -w / 2 + unitW * i;
    b.add('rust', box(0.2, h, 0.2, ...f.xyz(px, g + h / 2, d / 2 + 2.6), rotY + (i === 2 ? 0.15 : 0), 1.2));
  }

  // Freestanding sign at the end of the lot.
  b.add('rust', box(0.4, 6.4, 0.4, ...f.xyz(w / 2 + 4.5, g + 3.2, d / 2 + 3.0), rotY, 1.6));
  b.add('paintTeal', box(2.8, 3.6, 0.3, ...f.xyz(w / 2 + 4.5, g + 7.2, d / 2 + 3.0), rotY, 2.2));
  b.add('rust', box(3.2, 0.26, 0.44, ...f.xyz(w / 2 + 4.5, g + 9.1, d / 2 + 3.0), rotY, 1.8));
  b.collideBox(...f.xz(w / 2 + 4.5, d / 2 + 3.0), 0.8, 0.8);

  b.collideBox(x, z, w + 0.6, d + 0.6, rotY);
}

/**
 * A commercial block with a false front -- the tall flat parapet that hides a
 * low roof and makes a one-storey shop look like two. Ubiquitous on any main
 * street of the period.
 */
export function storefront(b, x, z, rotY = 0, variant = 0) {
  const g = groundHeight(x, z);
  const f = frame(x, z, rotY);
  const w = variant === 0 ? 9.5 : 12.5;
  const d = 10.0, h = 6.4;
  const paint = pick(['paintRed', 'paintBlue', 'paintCream', 'paintTeal']);

  b.add('concrete', box(w + 0.6, 0.3, d + 0.6, ...f.xyz(0, g + 0.15, 0), rotY, 2.2));
  interiorShell(b, f, w, h, d, g, rotY);
  shell(b, f, 'concrete', w, d, h, g, rotY, {
    thickness: 0.35,
    back: windowRow(2, 3.0, -1.5, 4.3, 0.9, 1.2),
    left: windowRow(3, 2.8, -2.8, 4.3, 0.9, 1.2),
  });
  // The painted street-facing wall goes on last so it wins the shared plane.
  b.add(paint, wallWithOpenings(w, h, 0.36, [
    { x: -w / 4 - 0.4, y: 0.75, w: w / 2 - 1.2, h: 2.5 },  // display window
    { x: w / 4 + 0.4, y: 0.75, w: w / 2 - 1.2, h: 2.5 },   // display window
    { x: 0, y: 0.05, w: 1.4, h: 2.6 },                     // recessed door
    ...windowRow(3, w / 3.4, -w / 3.4, 4.2, 1.0, 1.5),     // upper sashes
  ], ...f.xyz(0, g, d / 2), rotY));

  // False front and cornice.
  b.add(paint, box(w + 0.3, 1.3, 0.42, ...f.xyz(0, g + h + 0.65, d / 2), rotY));
  b.add('concrete', box(w + 0.8, 0.3, 0.85, ...f.xyz(0, g + h + 1.35, d / 2 + 0.1), rotY));
  b.add('rust', box(w - 0.4, 0.22, d - 0.4, ...f.xyz(0, g + h + 0.12, 0), rotY, 3.0));

  // A sagging awning over the display windows.
  if (variant === 0) {
    b.add('paintRed', box(w - 0.6, 0.15, 2.3, ...f.xyz(0, g + 3.55, d / 2 + 1.1), rotY, 2.4));
    b.add('rust', box(0.12, 0.95, 0.12, ...f.xyz(-w / 2 + 0.8, g + 3.1, d / 2 + 2.1), rotY, 1.0));
    b.add('rust', box(0.12, 0.95, 0.12, ...f.xyz(w / 2 - 0.8, g + 3.1, d / 2 + 2.1), rotY, 1.0));
  }

  b.collideBox(x, z, w + 0.5, d + 0.5, rotY);
}

/**
 * A frame house shell. The roof may be intact, half fallen in, or gone
 * entirely -- that variety is what keeps a residential street from looking
 * like a catalogue page.
 */
export function house(b, x, z, rotY = 0, roofState = 'intact') {
  const g = groundHeight(x, z);
  const f = frame(x, z, rotY);
  const w = rng(8.0, 10.5), d = rng(7.0, 9.0), h = 3.1;
  const paint = pick(['paintCream', 'paintBlue', 'paintTeal', 'paintRed']);
  const floor = g + 0.45;

  b.add('concrete', box(w + 0.5, 0.6, d + 0.5, ...f.xyz(0, g + 0.22, 0), rotY, 2.0));
  interiorShell(b, f, w, h, d, floor, rotY);
  shell(b, f, paint, w, d, h, floor, rotY, {
    thickness: 0.26,
    front: [{ x: -w / 4, y: 0.9, w: 1.5, h: 1.5 }, { x: w / 4, y: 0.05, w: 1.1, h: 2.3 }],
    back: [{ x: 0, y: 0.9, w: 1.6, h: 1.4 }],
    left: windowRow(2, 3.2, -1.6, 0.95, 1.3, 1.45),
    right: [{ x: 1.4, y: 0.95, w: 1.3, h: 1.45 }],
  });

  // Porch across the front.
  b.add('wood', box(w - 1.0, 0.24, 3.0, ...f.xyz(0, floor - 0.04, d / 2 + 1.5), rotY, 1.6));
  b.collideBox(...f.xz(0, d / 2 + 1.5), w - 1.0, 3.0, rotY, floor + 0.2);
  for (const lx of [-w / 2 + 1.2, 0, w / 2 - 1.2]) {
    b.add('wood', box(0.18, h - 0.3, 0.18, ...f.xyz(lx, floor + (h - 0.3) / 2, d / 2 + 2.7), rotY, 1.0));
  }
  b.add('wood', box(w - 0.8, 0.22, 3.6, ...f.xyz(0, floor + h - 0.18, d / 2 + 1.5), rotY, 2.0));

  if (roofState === 'gone') {
    // Only the top plate and a few snapped rafters remain.
    for (let i = 0; i < 5; i++) {
      b.add('wood', box(rng(2.0, 5.0), 0.16, 0.2,
        ...f.xyz(rng(-w / 3, w / 3), floor + h + rng(-0.2, 0.5), rng(-d / 3, d / 3)),
        rotY + rng(-0.9, 0.9), 1.4));
    }
  } else {
    const ridgeH = 2.0;
    gableRoof(b, f, w, d, floor + h, ridgeH, rotY, 'wood', paint,
      roofState === 'collapsed' ? 1 : 0);

    if (roofState === 'collapsed') {
      for (let i = 0; i < 8; i++) {
        b.add('wood', box(rng(1.5, 4.0), 0.14, 0.2,
          ...f.xyz(rng(0.5, w / 2), floor + rng(0.3, 1.4), rng(-d / 2, d / 2)),
          rotY + rng(-1.2, 1.2), 1.4));
      }
    }

    // Brick chimney riding above the ridge.
    b.add('concrete', box(0.85, h + ridgeH + 1.0, 0.85,
      ...f.xyz(w / 4, floor + (h + ridgeH + 1.0) / 2, -d / 4), rotY, 1.2));
  }

  b.collideBox(x, z, w + 0.4, d + 0.4, rotY);
}

/** A small church: a plain hall with a square bell tower. Best silhouette in town. */
export function church(b, x, z, rotY = 0) {
  const g = groundHeight(x, z);
  const f = frame(x, z, rotY);
  const w = 9.0, d = 15.0, h = 5.4;

  b.add('concrete', box(w + 0.6, 0.4, d + 0.6, ...f.xyz(0, g + 0.2, 0), rotY, 2.2));
  interiorShell(b, f, w, h, d, g, rotY);

  const tallWindows = windowRow(4, 3.2, -4.8, 1.6, 0.85, 2.4);
  shell(b, f, 'paintCream', w, d, h, g, rotY, {
    front: [{ x: 0, y: 0.1, w: 1.8, h: 2.8 }, { x: 0, y: 3.4, w: 1.2, h: 1.3 }],
    left: tallWindows,
    right: tallWindows,
  });
  gableRoof(b, f, w, d, g + h, 3.0, rotY, 'rust', 'paintCream');

  // Bell tower at the front, open arches at the top.
  const tw = 3.4, th = 11.0, tz = d / 2 - 1.0;
  const ft = frame(...f.xz(0, tz), rotY);
  const belfry = [{ x: 0, y: th - 3.0, w: 1.7, h: 2.0 }];
  shell(b, ft, 'paintCream', tw, tw, th, g, rotY, {
    thickness: 0.28,
    front: [{ x: 0, y: 0.1, w: 1.5, h: 2.6 }, ...belfry],
    back: belfry,
    left: belfry,
    right: belfry,
  });
  b.add('dark', box(tw - 0.6, 2.0, tw - 0.6, ...ft.xyz(0, g + th - 2.0, 0), rotY, 3));

  // Pyramid cap and a plain finial.
  const cap = new THREE.ConeGeometry(tw * 0.82, 2.6, 4);
  cap.rotateY(Math.PI / 4 + rotY);
  const [cx, , cz] = ft.xyz(0, 0, 0);
  cap.translate(cx, g + th + 1.3, cz);
  b.add('rust', cap);
  b.add('rust', box(0.14, 1.5, 0.14, ...ft.xyz(0, g + th + 3.3, 0), rotY, 1.0));

  b.collideBox(...ft.xz(0, 0), tw + 0.3, tw + 0.3, rotY);
  b.collideBox(x, z, w + 0.5, d + 0.5, rotY);
}

/** Water tower: splayed legs, riveted tank, catwalk. Visible from anywhere. */
export function waterTower(b, x, z) {
  const g = groundHeight(x, z);
  const legH = 13.0, spread = 3.6, tankR = 3.9;

  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const geo = new THREE.BoxGeometry(0.3, legH, 0.3);
    geo.rotateZ(-lx * 0.11);
    geo.rotateX(lz * 0.11);
    geo.translate(x + lx * spread * 0.62, g + legH / 2, z + lz * spread * 0.62);
    b.add('rust', geo);
    b.collideBox(x + lx * spread * 0.72, z + lz * spread * 0.72, 0.7, 0.7);
  }

  // Horizontal bracing rings at two heights.
  for (const h of [legH * 0.34, legH * 0.68]) {
    const t = 1 - (h / legH) * 0.38;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], c = corners[(i + 1) % 4];
      const ax = x + a[0] * spread * t, az = z + a[1] * spread * t;
      const bx = x + c[0] * spread * t, bz = z + c[1] * spread * t;
      const len = Math.hypot(bx - ax, bz - az);
      const ang = Math.atan2(bz - az, bx - ax);
      b.add('rust', box(len, 0.16, 0.16, (ax + bx) / 2, g + h, (az + bz) / 2, -ang, 1.4));
    }
  }

  b.add('rust', cylinder(tankR, 5.4, x, g + legH + 2.7, z, 18));
  const cap = new THREE.ConeGeometry(tankR + 0.15, 2.1, 18);
  cap.translate(x, g + legH + 6.45, z);
  b.add('rust', cap);
  const bottom = new THREE.ConeGeometry(tankR, 1.6, 18);
  bottom.rotateX(Math.PI);
  bottom.translate(x, g + legH - 0.8, z);
  b.add('rust', bottom);
  b.add('rust', cylinder(0.12, 1.6, x, g + legH + 8.0, z, 6));

  const ring = new THREE.TorusGeometry(tankR + 0.5, 0.07, 5, 24);
  ring.rotateX(Math.PI / 2);
  ring.translate(x, g + legH + 1.1, z);
  b.add('rust', ring);
}

/** Grain silos with a head house across the top. Reads as agriculture, not industry. */
export function silos(b, x, z, count = 3) {
  const g = groundHeight(x, z);
  const r = 3.4, h = 17.0;

  for (let i = 0; i < count; i++) {
    const sx = x + (i - (count - 1) / 2) * (r * 2 + 0.5);
    b.add('concrete', cylinder(r, h, sx, g + h / 2, z, 20));
    const cap = new THREE.ConeGeometry(r + 0.1, 1.6, 20);
    cap.translate(sx, g + h + 0.8, z);
    b.add('rust', cap);
    b.collideBox(sx, z, r * 2, r * 2);
  }

  const span = count * (r * 2 + 0.5);
  b.add('rust', box(span, 3.4, r * 1.8, x, g + h + 3.0, z, 0, 3.0));
  b.add('concrete', box(4.0, h * 0.92, 3.0, x - span / 2 - 2.0, g + h * 0.46, z, 0, 2.6));
  b.collideBox(x - span / 2 - 2.0, z, 4.0, 3.0);
}

/** Utility pole with crossarms. Returns its top so wires can be strung to it. */
export function utilityPole(b, x, z, lean = 0) {
  const g = groundHeight(x, z);
  const h = 9.2;

  const geo = new THREE.CylinderGeometry(0.16, 0.22, h, 8);
  geo.rotateZ(lean);
  geo.translate(x, g + h / 2, z);
  b.add('wood', geo);

  const topY = g + h - 0.7;
  b.add('wood', box(2.6, 0.16, 0.16, x, topY, z, 0, 1.2));
  b.add('wood', box(1.9, 0.14, 0.14, x, topY - 1.1, z, 0, 1.2));
  for (const ox of [-1.1, 0, 1.1]) {
    b.add('glass', box(0.12, 0.2, 0.12, x + ox, topY + 0.18, z));
  }

  b.collideBox(x, z, 0.5, 0.5);
  return { x, y: topY, z };
}

/** Sagging wires strung along a run of pole tops. */
export function powerLine(b, tops) {
  for (let i = 0; i < tops.length - 1; i++) {
    const a = tops[i], c = tops[i + 1];
    const span = Math.hypot(c.x - a.x, c.z - a.z);
    const sag = Math.min(1.9, span * 0.055);

    for (const ox of [-1.1, 1.1]) {
      b.add('rust', cable(
        new THREE.Vector3(a.x + ox, a.y + 0.18, a.z),
        new THREE.Vector3(c.x + ox, c.y + 0.18, c.z), sag, 10, 0.038));
    }
    // One span's lower wire has come down and hangs much closer to the road.
    if (i !== 1) {
      b.add('rust', cable(
        new THREE.Vector3(a.x, a.y - 1.1, a.z),
        new THREE.Vector3(c.x, c.y - 1.1, c.z), sag * 1.6, 10, 0.032));
    }
  }
}

/** A stripped car body sitting low on flat tyres. */
export function carHulk(b, x, z, rotY = 0) {
  const g = groundHeight(x, z);
  const f = frame(x, z, rotY);
  const len = rng(4.4, 5.2), wid = 1.95;

  b.add('rust', box(len, 0.75, wid, ...f.xyz(0, g + 0.62, 0), rotY, 1.8));
  b.add('rust', box(len * 0.48, 0.72, wid - 0.22, ...f.xyz(-0.15, g + 1.32, 0), rotY, 1.8));
  b.add('dark', box(len * 0.44, 0.62, wid - 0.4, ...f.xyz(-0.15, g + 1.34, 0), rotY, 1.8));
  b.add('rust', box(len * 0.2, 0.3, wid + 0.12, ...f.xyz(len * 0.36, g + 0.92, 0), rotY, 1.4));

  for (const [wx, wz] of [[-len * 0.31, -wid / 2], [len * 0.31, -wid / 2],
                          [-len * 0.31, wid / 2], [len * 0.31, wid / 2]]) {
    const tyre = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
    tyre.rotateX(Math.PI / 2);
    tyre.scale(1, 1, 0.78); // squashed flat against the ground
    tyre.rotateY(rotY);
    const [px, , pz] = f.xyz(wx, 0, wz);
    tyre.translate(px, g + 0.26, pz);
    b.add('dark', tyre);
  }

  b.collideBox(x, z, len, wid, rotY, g + 1.05);
}

/** Chain-link fence run between two points, posts leaning at random. */
export function fenceRun(b, x1, z1, x2, z2, height = 2.1) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const ang = Math.atan2(dz, dx);
  const posts = Math.max(2, Math.round(len / 3.0));

  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    const px = x1 + dx * t, pz = z1 + dz * t;
    const geo = new THREE.CylinderGeometry(0.055, 0.055, height, 6);
    geo.rotateZ((rand() - 0.5) * 0.16);
    geo.translate(px, groundHeight(px, pz) + height / 2, pz);
    b.add('rust', geo);
  }

  for (let i = 0; i < posts; i++) {
    const t0 = i / posts, t1 = (i + 1) / posts;
    const ax = x1 + dx * t0, az = z1 + dz * t0;
    const bx = x1 + dx * t1, bz = z1 + dz * t1;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const spanLen = Math.hypot(bx - ax, bz - az);

    const geo = new THREE.PlaneGeometry(spanLen, height);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) {
      uv.setXY(k, uv.getX(k) * spanLen / 1.4, uv.getY(k) * height / 1.4);
    }
    geo.rotateY(-ang);
    geo.translate(mx, groundHeight(mx, mz) + height / 2 - 0.06, mz);
    b.add('chainlink', geo);
  }
}

/** A pile of collapsed material: broken concrete, timber, twisted sheet metal. */
export function debrisPile(b, x, z, radius = 2.6) {
  const chunks = Math.round(radius * 4);
  for (let i = 0; i < chunks; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.pow(rand(), 0.6) * radius;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const pg = groundHeight(px, pz);
    // Material heaps up toward the middle of the pile.
    const heap = (1 - r / radius) * rng(0.05, 0.5);

    const kind = rand();
    if (kind < 0.45) {
      b.add('concrete', box(rng(0.4, 1.2), rng(0.15, 0.4), rng(0.4, 1.0),
        px, pg + heap, pz, rand() * Math.PI, 1.2));
    } else if (kind < 0.8) {
      b.add('wood', box(rng(0.9, 2.6), 0.12, rng(0.12, 0.26),
        px, pg + heap, pz, rand() * Math.PI, 1.4));
    } else {
      b.add('rust', box(rng(0.7, 1.8), 0.06, rng(0.5, 1.2),
        px, pg + heap, pz, rand() * Math.PI, 1.6));
    }
  }
}

/** A road surface laid onto the terrain, following its contour. */
export function roadStrip(b, x1, z1, x2, z2, width = 8.5) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const ang = Math.atan2(dz, dx);
  const steps = Math.ceil(len / 6);

  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const ax = x1 + dx * t0, az = z1 + dz * t0;
    const bx = x1 + dx * t1, bz = z1 + dz * t1;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const segLen = Math.hypot(bx - ax, bz - az) + 0.2;
    // Float a few centimetres proud of the ground to avoid z-fighting.
    b.add('asphalt', box(segLen, 0.16, width, mx, groundHeight(mx, mz) + 0.08, mz, -ang, 3.2, i * 0.37));
  }
}

/** Distant structures on the horizon. Pure backdrop -- no collision, no detail. */
export function horizonStructures(b) {
  const far = [
    { x: -175, z: -122, w: 26, h: 22, d: 18 },
    { x: -148, z: -134, w: 14, h: 30, d: 14 },
    { x: -198, z: -104, w: 20, h: 16, d: 22 },
    { x: 172, z: 104, w: 22, h: 18, d: 20 },
  ];
  for (const s of far) {
    const g = groundHeight(s.x, s.z);
    b.add('concrete', box(s.w, s.h, s.d, s.x, g + s.h / 2, s.z, rng(-0.3, 0.3), 6.0));
    b.add('concrete', cylinder(1.6, s.h * 1.5, s.x + s.w * 0.7, g + s.h * 0.75, s.z, 12));
  }
}
