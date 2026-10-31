// Shared geometry helpers and the material library.
//
// Buildings are assembled from a lot of boxes. Rather than adding one mesh per
// box (which would mean thousands of draw calls), everything sharing a material
// is merged into a single mesh at load time. The MeshBuilder below is what
// collects the pieces and does that merge.
//
// The Phase 3 building system will construct player-placed structures with the
// same helpers, so it is worth keeping these general.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  concreteMaps, rustMaps, woodMaps, asphaltMaps, glassMaps, paintedMaps, chainlinkTexture,
} from '../render/textures.js';

// --- Materials --------------------------------------------------------------

let materials = null;

/** Build (once) the set of materials every structure draws from. */
export function getMaterials() {
  if (materials) return materials;

  const standard = (maps, opts = {}) => new THREE.MeshStandardMaterial({
    ...maps,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 1.0,
    metalness: 0.0,
    ...opts,
  });

  materials = {
    concrete: standard(concreteMaps(), { color: 0xb9b2a4 }),
    rust: standard(rustMaps(), { metalness: 0.65, roughness: 0.85, color: 0xa89a8c }),
    wood: standard(woodMaps(), { color: 0xa39d90 }),
    asphalt: standard(asphaltMaps(), { color: 0x9c968c }),

    // Peeling paint in a few mid-century small-town colours.
    paintCream: standard(paintedMaps('cream', 0.80, 0.74, 0.58)),
    paintRed: standard(paintedMaps('red', 0.55, 0.20, 0.15)),
    paintTeal: standard(paintedMaps('teal', 0.24, 0.45, 0.44)),
    paintBlue: standard(paintedMaps('blue', 0.28, 0.36, 0.50)),

    // Interiors seen through empty windows. Nearly black, never lit.
    dark: new THREE.MeshBasicMaterial({ color: 0x0a0908 }),

    glass: new THREE.MeshStandardMaterial({
      ...glassMaps(),
      color: 0x9fb0b4,
      roughness: 0.14,
      metalness: 0.1,
      transparent: true,
      opacity: 0.34,
    }),

    chainlink: new THREE.MeshStandardMaterial({
      map: chainlinkTexture(),
      transparent: false,
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      roughness: 0.72,
      metalness: 0.5,
      color: 0xa6a29a,
    }),
  };

  return materials;
}

// --- Geometry helpers -------------------------------------------------------

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/**
 * Rescale a box's UVs so its texture is measured in metres rather than
 * stretched to fit each face. Without this a 12 m wall and a 1 m post show
 * concrete at wildly different grain sizes, which instantly looks fake.
 */
function scaleBoxUVs(geometry, w, h, d, texScale, offsetU = 0, offsetV = 0) {
  const uv = geometry.attributes.uv;
  // BoxGeometry emits its six faces in a fixed order: +X, -X, +Y, -Y, +Z, -Z.
  // Each face spans two of the box's dimensions.
  const spans = [
    [d, h], [d, h],   // +X, -X
    [w, d], [w, d],   // +Y, -Y
    [w, h], [w, h],   // +Z, -Z
  ];
  const perFace = uv.count / 6;
  for (let face = 0; face < 6; face++) {
    const [su, sv] = spans[face];
    for (let i = 0; i < perFace; i++) {
      const idx = face * perFace + i;
      uv.setXY(
        idx,
        uv.getX(idx) * (su / texScale) + offsetU,
        uv.getY(idx) * (sv / texScale) + offsetV
      );
    }
  }
  uv.needsUpdate = true;
}

/**
 * A box, positioned and optionally rotated, with sensible texture scaling.
 * Dimensions are in metres; position is the centre of the box.
 */
export function box(w, h, d, x, y, z, rotY = 0, texScale = 2.2, uvJitter = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  scaleBoxUVs(g, w, h, d, texScale, uvJitter, uvJitter * 0.7);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

/** A cylinder -- posts, pipes, tanks, silos. */
export function cylinder(radius, height, x, y, z, segments = 14, radiusTop = radius) {
  const g = new THREE.CylinderGeometry(radiusTop, radius, height, segments, 1, false);
  // Wrap the texture around by circumference so it isn't smeared.
  const uv = g.attributes.uv;
  const circumference = Math.PI * 2 * radius;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * (circumference / 2.4), uv.getY(i) * (height / 2.4));
  }
  g.translate(x, y, z);
  return g;
}

/** A thin plate, used for signs, panels and roofing. */
export function plate(w, h, x, y, z, rotY = 0, rotX = 0, texScale = 2.2) {
  return box(w, 0.09, h, x, y, z, rotY, texScale);
}

/**
 * A wall with holes cut in it for doors and windows.
 * The wall runs along local X, centred on (x, z), and `openings` are given as
 * { x, y, w, h } where x is measured from the wall's centre and y from its base.
 */
export function wallWithOpenings(length, height, thickness, openings, x, y, z, rotY = 0) {
  const parts = [];
  const sorted = [...openings].sort((a, b) => (a.x - a.w / 2) - (b.x - b.w / 2));

  // Solid columns between the openings.
  let cursor = -length / 2;
  for (const o of sorted) {
    const left = o.x - o.w / 2;
    if (left > cursor + 0.01) {
      const w = left - cursor;
      parts.push(box(w, height, thickness, cursor + w / 2, height / 2, 0, 0, 2.2, cursor * 0.31));
    }
    cursor = Math.max(cursor, o.x + o.w / 2);
  }
  if (cursor < length / 2 - 0.01) {
    const w = length / 2 - cursor;
    parts.push(box(w, height, thickness, cursor + w / 2, height / 2, 0, 0, 2.2, cursor * 0.31));
  }

  // The sill below each opening and the header above it.
  for (const o of sorted) {
    if (o.y > 0.01) {
      parts.push(box(o.w, o.y, thickness, o.x, o.y / 2, 0, 0, 2.2, o.x * 0.17));
    }
    const topOfOpening = o.y + o.h;
    if (topOfOpening < height - 0.01) {
      const hh = height - topOfOpening;
      parts.push(box(o.w, hh, thickness, o.x, topOfOpening + hh / 2, 0, 0, 2.2, o.x * 0.17));
    }
  }

  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (rotY) merged.rotateY(rotY);
  merged.translate(x, y, z);
  return merged;
}

/**
 * A hanging cable between two points, sagging under its own weight.
 * Uses a catenary approximation -- a parabola is close enough at this scale.
 */
export function cable(from, to, sag = 1.4, segments = 12, radius = 0.045) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = new THREE.Vector3().lerpVectors(from, to, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    points.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, segments, radius, 5, false);
}

// --- Mesh builder -----------------------------------------------------------

/**
 * Collects geometry by material name and merges each group into one mesh.
 * Also collects axis-aligned boxes used for player collision.
 */
export class MeshBuilder {
  constructor(name = 'structures') {
    this.name = name;
    this.groups = new Map();   // material name -> geometry[]
    this.colliders = [];       // { minX, maxX, minZ, maxZ, top }
  }

  /** Queue a geometry to be drawn with the named material. */
  add(materialName, geometry) {
    if (!geometry) return this;
    if (!this.groups.has(materialName)) this.groups.set(materialName, []);
    this.groups.get(materialName).push(geometry);
    return this;
  }

  /** Queue several geometries at once. */
  addAll(materialName, geometries) {
    for (const g of geometries) this.add(materialName, g);
    return this;
  }

  /**
   * Register a solid the player cannot walk through. `top` is the height the
   * player is lifted to if they are standing on it (a stoop or a low wall);
   * anything taller than their step height blocks instead.
   */
  collide(minX, minZ, maxX, maxZ, top = Infinity) {
    this.colliders.push({ minX, minZ, maxX, maxZ, top });
    return this;
  }

  /** Convenience: a collider centred on a point, optionally rotated. */
  collideBox(cx, cz, w, d, rotY = 0, top = Infinity) {
    if (Math.abs(rotY) < 0.01) {
      this.collide(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, top);
    } else {
      // Approximate a rotated box with its bounding square. Good enough for
      // walking into a wall, and far cheaper than proper oriented boxes.
      const c = Math.abs(Math.cos(rotY));
      const s = Math.abs(Math.sin(rotY));
      const ew = (w * c + d * s) / 2;
      const ed = (w * s + d * c) / 2;
      this.collide(cx - ew, cz - ed, cx + ew, cz + ed, top);
    }
    return this;
  }

  /** Merge everything and return a Group ready to add to the scene. */
  build({ castShadow = true, receiveShadow = true } = {}) {
    const mats = getMaterials();
    const group = new THREE.Group();
    group.name = this.name;

    for (const [materialName, geometries] of this.groups) {
      if (geometries.length === 0) continue;
      const material = mats[materialName];
      if (!material) {
        console.warn(`Unknown material "${materialName}" -- skipping ${geometries.length} pieces.`);
        continue;
      }

      const merged = geometries.length === 1
        ? geometries[0]
        : mergeGeometries(geometries, false);

      if (!merged) {
        console.warn(`Could not merge geometry for "${materialName}".`);
        continue;
      }
      if (geometries.length > 1) for (const g of geometries) g.dispose();

      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = castShadow && materialName !== 'dark';
      mesh.receiveShadow = receiveShadow;
      mesh.name = `${this.name}:${materialName}`;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }

    return group;
  }
}
