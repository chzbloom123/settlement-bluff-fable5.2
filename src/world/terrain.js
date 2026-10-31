// The ground. One large mesh whose vertices are displaced by a height function,
// plus a matching CPU-side sampler so the player and every scattered prop can
// ask "how high is the ground at this spot?" without a raycast.
//
// The valley reads north-to-south as: white bluffs across the water, the
// Columbia itself, a gravel bank, the terrace the town sits on, and then open
// sagebrush steppe climbing away to the south and east.

import * as THREE from 'three';
import { fbm, ridged, smoothstep, clamp, mix } from '../core/noise.js';
import { dirtMaps } from '../render/textures.js';

export const WORLD_SIZE = 420;      // metres across, centred on the origin
export const WATER_LEVEL = 0.0;
export const TOWN_HEIGHT = 6.4;     // the terrace the settlement is built on

// The flat area reserved for the town, in world units.
const TOWN = { minX: -80, maxX: 80, minZ: -68, maxZ: 16 };

/**
 * Height of the ground at any point. This is the single source of truth for
 * the shape of the valley -- the mesh, the player's feet and every bush all
 * read from here, so they can never disagree.
 */
export function groundHeight(x, z) {
  const rolling = fbm(x * 0.0043, z * 0.0043, 4) * 9.0;
  const detail = fbm(x * 0.021, z * 0.021, 3) * 1.15;
  const fine = fbm(x * 0.075, z * 0.075, 2) * 0.28;

  let h = 6.0 + rolling + detail + fine;

  // The steppe climbs away to the south and to the east.
  h += smoothstep(-10, 190, z) * 11.0;
  h += smoothstep(-60, 200, x) * 5.0;

  // A basalt rim along the eastern edge -- sharp crests from ridged noise.
  const rimT = smoothstep(150, 205, x);
  if (rimT > 0) {
    const crest = 22 + ridged(x * 0.011, z * 0.011, 4) * 12 + detail * 2;
    h = mix(h, crest, rimT);
  }

  // Cut the river channel through the north. Below the water line so there is
  // an actual bed rather than a painted-on surface.
  const channel = smoothstep(-74, -104, z);
  if (channel > 0) {
    const bed = -3.6 + detail * 0.7 + fine;
    h = mix(h, bed, channel);
  }

  // The far bank: pale bluffs rising steeply out of the water.
  const bluff = smoothstep(-150, -186, z);
  if (bluff > 0) {
    const face = 30 + rolling * 0.7 + ridged(x * 0.016, z * 0.02, 3) * 7 + detail * 2.5;
    h = mix(h, face, bluff);
  }

  // Finally, flatten the terrace the town stands on. The mask has soft edges
  // so the transition to open ground reads as natural slope, not a shelf.
  const t = townMask(x, z);
  if (t > 0) {
    h = mix(h, TOWN_HEIGHT + detail * 0.3 + fine * 0.5, t);
  }

  return h;
}

/** 1 inside the town terrace, 0 well outside it, smooth in between. */
export function townMask(x, z) {
  const fx = Math.min(
    smoothstep(TOWN.minX - 26, TOWN.minX + 6, x),
    1 - smoothstep(TOWN.maxX - 6, TOWN.maxX + 26, x)
  );
  const fz = Math.min(
    smoothstep(TOWN.minZ - 22, TOWN.minZ + 6, z),
    1 - smoothstep(TOWN.maxZ - 6, TOWN.maxZ + 26, z)
  );
  return fx * fz;
}

/** Surface steepness at a point, 0 = flat, 1 = vertical. Used for scattering. */
export function groundSlope(x, z, step = 1.2) {
  const hL = groundHeight(x - step, z);
  const hR = groundHeight(x + step, z);
  const hD = groundHeight(x, z - step);
  const hU = groundHeight(x, z + step);
  const dx = (hR - hL) / (2 * step);
  const dz = (hU - hD) / (2 * step);
  return clamp(Math.sqrt(dx * dx + dz * dz), 0, 1);
}

/** Outward surface normal at a point. */
export function groundNormal(x, z, step = 1.0, target = new THREE.Vector3()) {
  const hL = groundHeight(x - step, z);
  const hR = groundHeight(x + step, z);
  const hD = groundHeight(x, z - step);
  const hU = groundHeight(x, z + step);
  return target.set(hL - hR, 2 * step, hD - hU).normalize();
}

// --- Ground colouring -------------------------------------------------------

const C_DUST = new THREE.Color(0.60, 0.53, 0.39);   // dry silt loam
const C_SAGE = new THREE.Color(0.44, 0.45, 0.33);   // steppe with plant cover
const C_BASALT = new THREE.Color(0.23, 0.22, 0.21); // dark exposed rock
const C_GRAVEL = new THREE.Color(0.55, 0.52, 0.47); // river bar
const C_BLUFF = new THREE.Color(0.76, 0.72, 0.60);  // pale sediment cliffs
const C_SILT = new THREE.Color(0.34, 0.30, 0.24);   // wet channel bottom

const scratch = new THREE.Color();

function groundColor(x, z, h, slope, target) {
  // Start from the broad dust-to-sage mix, varied so it never looks uniform.
  const cover = clamp(fbm(x * 0.014 + 100, z * 0.014, 3) * 0.5 + 0.5, 0, 1);
  target.copy(C_DUST).lerp(C_SAGE, cover * 0.75);

  // Steep faces lose their soil and show rock.
  const rocky = smoothstep(0.34, 0.78, slope);
  target.lerp(C_BASALT, rocky * 0.85);

  // Pale bluff material takes over on the far bank.
  const bluff = smoothstep(-148, -180, z);
  if (bluff > 0) target.lerp(C_BLUFF, bluff * 0.9);

  // A gravel bar wherever the ground is near the water line.
  const nearWater = 1 - smoothstep(0.4, 4.2, Math.abs(h - WATER_LEVEL));
  target.lerp(C_GRAVEL, nearWater * 0.7);

  // Dark wet silt actually under the water.
  if (h < WATER_LEVEL) {
    target.lerp(C_SILT, smoothstep(0, -2.4, h) * 0.85);
  }

  // Break up the result with fine mottling so large flat areas stay alive.
  const mottle = fbm(x * 0.13, z * 0.13, 2) * 0.09;
  scratch.setRGB(target.r + mottle, target.g + mottle, target.b + mottle * 0.85);
  target.copy(scratch);

  return target;
}

// --- Mesh construction ------------------------------------------------------

export function createTerrain(settings) {
  const segments = settings.terrainSegments;
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geometry.rotateX(-Math.PI / 2); // PlaneGeometry is upright by default

  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);

    const slope = groundSlope(x, z, WORLD_SIZE / segments);
    groundColor(x, z, h, slope, color);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const maps = dirtMaps();
  // Clone so the terrain can tile its own maps far more than props do.
  const map = maps.map.clone();
  const normalMap = maps.normalMap.clone();
  const roughnessMap = maps.roughnessMap.clone();
  for (const t of [map, normalMap, roughnessMap]) {
    t.needsUpdate = true;
    t.repeat.set(90, 90);
  }

  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    roughnessMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    vertexColors: true, // tints the detail texture per-vertex
    roughness: 1.0,
    metalness: 0.0,
    dithering: true,   // hides banding across the big smooth gradients
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false; // the terrain shadowing itself costs more than it gives
  mesh.name = 'terrain';
  mesh.matrixAutoUpdate = false;

  return mesh;
}
