// Ground cover: sagebrush, dry cheatgrass, basalt rubble and dead cottonwoods.
//
// There are tens of thousands of these, so every category is a single
// InstancedMesh -- one draw call each. The plants sway with a wind function
// injected into the standard material's shader, which costs nothing on the CPU
// and does more for the feeling of the place than any other single effect.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundHeight, groundSlope, groundNormal, WORLD_SIZE, WATER_LEVEL, townMask } from './terrain.js';
import { grassTuftTexture, sagebrushTexture, dirtMaps, woodMaps } from '../render/textures.js';
import { makeRandom } from '../core/noise.js';
import { MAIN_STREET_Z, BACK_STREET_Z, CROSS_STREET_X } from './town.js';

// Shared clock uniform so every plant sways in the same wind.
const windTime = { value: 0 };

/**
 * Patch the wind into a standard material. The sway is driven by each
 * instance's world position so neighbouring plants move slightly out of phase,
 * which is what stops a field from looking like it's breathing in unison.
 */
function applyWind(material, strength = 0.09) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime;
    shader.uniforms.uWindStrength = { value: strength };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */ `
        #include <common>
        uniform float uWindTime;
        uniform float uWindStrength;
      `)
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 windOrigin = instanceMatrix[3].xyz;
        #else
          vec3 windOrigin = vec3(0.0);
        #endif
        // Two gusts at different speeds and scales, summed.
        float gust = sin(uWindTime * 1.15 + windOrigin.x * 0.09 + windOrigin.z * 0.07);
        gust += 0.45 * sin(uWindTime * 2.6 + windOrigin.x * 0.31 - windOrigin.z * 0.19);
        // Only the top of the plant moves; the root stays put.
        float influence = max(transformed.y, 0.0) * uWindStrength;
        transformed.x += gust * influence;
        transformed.z += gust * influence * 0.55;
      `);
  };
  // Materials with different shader patches must not share a compiled program.
  material.customProgramCacheKey = () => `wind-${strength}`;
}

/** Advance the wind. Called once per frame from the main loop. */
export function updateWind(elapsed) {
  windTime.value = elapsed;
}

// --- Placement rules --------------------------------------------------------

/** How close a point is to the paved streets, so nothing grows in the road. */
function distanceToRoads(x, z) {
  const dMain = Math.abs(z - MAIN_STREET_Z) + (Math.abs(x) > 88 ? 40 : 0);
  const dBack = Math.abs(z - BACK_STREET_Z) + (Math.abs(x) > 64 ? 40 : 0);
  const dCross = Math.abs(x - CROSS_STREET_X) + (z < -48 || z > 16 ? 40 : 0);
  return Math.min(dMain, dBack, dCross);
}

/** True if the point sits inside any structure's footprint. */
function insideCollider(x, z, colliders, margin = 0.4) {
  for (const c of colliders) {
    if (x > c.minX - margin && x < c.maxX + margin &&
        z > c.minZ - margin && z < c.maxZ + margin) return true;
  }
  return false;
}

/**
 * Find `count` valid spots for vegetation. Returns positions plus the ground
 * normal, so plants can lie back into a slope instead of standing bolt upright.
 */
function samplePlacements(count, colliders, rand, opts = {}) {
  const {
    maxSlope = 0.55,
    minRoadDistance = 5.6,
    minHeightAboveWater = 0.5,
    townDensity = 0.35,   // how much cover survives inside the settlement
    attemptsPerHit = 6,
  } = opts;

  const placements = [];
  const half = WORLD_SIZE / 2 - 4;
  const maxAttempts = count * attemptsPerHit;
  const normal = new THREE.Vector3();

  for (let attempt = 0; attempt < maxAttempts && placements.length < count; attempt++) {
    const x = (rand() * 2 - 1) * half;
    const z = (rand() * 2 - 1) * half;

    const h = groundHeight(x, z);
    if (h < WATER_LEVEL + minHeightAboveWater) continue;
    if (groundSlope(x, z) > maxSlope) continue;
    if (distanceToRoads(x, z) < minRoadDistance) continue;

    // Thin the cover inside town -- trodden ground, gravel lots, foundations.
    const town = townMask(x, z);
    if (town > 0 && rand() > (1 - town) + town * townDensity) continue;

    if (insideCollider(x, z, colliders)) continue;

    groundNormal(x, z, 1.0, normal);
    placements.push({ x, y: h, z, nx: normal.x, nz: normal.z });
  }

  return placements;
}

// --- Cutout plant geometry --------------------------------------------------

/** Crossed vertical quads. The cheapest convincing plant there is. */
function crossedQuads(width, height, planes = 3) {
  const parts = [];
  for (let i = 0; i < planes; i++) {
    const g = new THREE.PlaneGeometry(width, height);
    g.translate(0, height / 2, 0);   // base sits at y = 0 so wind pivots correctly
    g.rotateY((i / planes) * Math.PI);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function buildInstanced(geometry, material, placements, rand, opts = {}) {
  const {
    minScale = 0.8, maxScale = 1.3, tiltToSlope = 0.55, receiveShadow = true, castShadow = false,
  } = opts;

  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();

  placements.forEach((p, i) => {
    const s = minScale + rand() * (maxScale - minScale);
    // Lean the plant with the hillside, and give each one a random facing.
    euler.set(-p.nz * tiltToSlope, rand() * Math.PI * 2, p.nx * tiltToSlope, 'YXZ');
    quat.setFromEuler(euler);
    // A little non-uniform scale so no two instances look identical.
    scale.set(s * (0.85 + rand() * 0.3), s, s * (0.85 + rand() * 0.3));
    position.set(p.x, p.y - 0.05, p.z);
    matrix.compose(position, quat, scale);
    mesh.setMatrixAt(i, matrix);
  });

  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.frustumCulled = false; // instances span the map; culling as a unit is useless
  return mesh;
}

// --- Dead cottonwoods -------------------------------------------------------

/** A bare snag: tapered trunk plus a few forking limbs. */
function deadTree(x, y, z, rand) {
  const parts = [];
  const height = 5.5 + rand() * 4.5;
  const lean = (rand() - 0.5) * 0.22;

  const trunk = new THREE.CylinderGeometry(0.13, 0.34, height, 7);
  trunk.rotateZ(lean);
  trunk.translate(x, y + height / 2, z);
  parts.push(trunk);

  const limbs = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < limbs; i++) {
    const t = 0.45 + rand() * 0.5;
    const len = (height * 0.5) * (1 - t * 0.6) * (0.6 + rand() * 0.7);
    const limb = new THREE.CylinderGeometry(0.045, 0.12, len, 5);
    // Swing the limb out and up from the trunk.
    limb.translate(0, len / 2, 0);
    limb.rotateZ((rand() - 0.5) * 1.9);
    limb.rotateY(rand() * Math.PI * 2);
    limb.translate(x + lean * height * t, y + height * t, z);
    parts.push(limb);
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

// --- Assembly ---------------------------------------------------------------

export function createScatter(settings, colliders) {
  const rand = makeRandom(778899);
  const group = new THREE.Group();
  group.name = 'scatter';

  // --- Dry grass ---
  const grassMat = new THREE.MeshStandardMaterial({
    map: grassTuftTexture(),
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.94,
    metalness: 0,
    color: 0xc6b489,
  });
  applyWind(grassMat, 0.14);

  const grassSpots = samplePlacements(settings.grassCount, colliders, rand, {
    maxSlope: 0.62, minRoadDistance: 5.2, townDensity: 0.45,
  });
  group.add(buildInstanced(crossedQuads(0.62, 0.52, 2), grassMat, grassSpots, rand, {
    minScale: 0.7, maxScale: 1.5, tiltToSlope: 0.7,
  }));

  // --- Sagebrush ---
  const sageMat = new THREE.MeshStandardMaterial({
    map: sagebrushTexture(),
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
    color: 0xa8ad94,
  });
  applyWind(sageMat, 0.055);

  const sageSpots = samplePlacements(settings.sageCount, colliders, rand, {
    maxSlope: 0.5, minRoadDistance: 6.4, townDensity: 0.22,
  });
  group.add(buildInstanced(crossedQuads(1.55, 1.25, 3), sageMat, sageSpots, rand, {
    minScale: 0.65, maxScale: 1.35, tiltToSlope: 0.35, castShadow: false,
  }));

  // --- Basalt rubble ---
  const rockMaps = dirtMaps();
  const rockMat = new THREE.MeshStandardMaterial({
    map: rockMaps.map,
    normalMap: rockMaps.normalMap,
    roughnessMap: rockMaps.roughnessMap,
    color: 0x5b5750,
    roughness: 1.0,
    metalness: 0,
  });

  // A chunky low-poly boulder, jittered per instance by the scale below.
  const rockGeo = new THREE.IcosahedronGeometry(0.5, 0);
  const rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    rp.setXYZ(i,
      rp.getX(i) * (0.7 + rand() * 0.6),
      rp.getY(i) * (0.55 + rand() * 0.5),
      rp.getZ(i) * (0.7 + rand() * 0.6));
  }
  rockGeo.computeVertexNormals();

  const rockSpots = samplePlacements(settings.rockCount, colliders, rand, {
    maxSlope: 0.95, minRoadDistance: 6.0, townDensity: 0.3, minHeightAboveWater: -1.5,
  });
  group.add(buildInstanced(rockGeo, rockMat, rockSpots, rand, {
    minScale: 0.45, maxScale: 2.4, tiltToSlope: 0.2, castShadow: true,
  }));

  // --- Dead cottonwoods, clustered where water once reached ---
  const treeSpots = samplePlacements(Math.round(settings.rockCount * 0.09), colliders, rand, {
    maxSlope: 0.32, minRoadDistance: 9.0, townDensity: 0.15, minHeightAboveWater: 0.4,
  }).filter((p) => p.y < 9.5);   // low ground only -- the old floodplain

  if (treeSpots.length) {
    const treeGeos = treeSpots.map((p) => deadTree(p.x, p.y - 0.2, p.z, rand));
    const treeMerged = mergeGeometries(treeGeos, false);
    for (const g of treeGeos) g.dispose();

    const woodTex = woodMaps();
    const treeMat = new THREE.MeshStandardMaterial({
      map: woodTex.map,
      normalMap: woodTex.normalMap,
      roughnessMap: woodTex.roughnessMap,
      color: 0x8a8073,
      roughness: 1.0,
      metalness: 0,
    });

    const trees = new THREE.Mesh(treeMerged, treeMat);
    trees.castShadow = true;
    trees.receiveShadow = true;
    trees.name = 'dead-cottonwoods';
    trees.matrixAutoUpdate = false;
    group.add(trees);
  }

  return group;
}
