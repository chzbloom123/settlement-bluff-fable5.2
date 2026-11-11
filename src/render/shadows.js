// Sunlight and its shadows.
//
// One shadow map stretched over the whole view is either blurry up close or
// expensive. Cascaded shadow maps split the view into a few distance bands and
// give each band its own map: a small sharp one around the player, larger and
// coarser ones further out. Three.js ships a helper for this (CSM), which also
// snaps each map to whole texels so shadow edges don't crawl as you walk.
//
// The catch: CSM puts one light per band into the scene and patches each
// material so it only uses the light for its own band. A material that is NOT
// patched is lit by all of them and comes out several times too bright. So
// every lit material in the game must pass through `lit()` below.

import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';

let csm = null;

/**
 * Create the sun. Call once, before any world geometry is built.
 * `direction` points from the ground toward the sun.
 */
export function createSun(scene, camera, settings, { direction, color, intensity }) {
  csm = new CSM({
    camera,
    parent: scene,
    cascades: settings.shadowCascades,
    maxFar: settings.shadowDistance,
    mode: 'practical',
    shadowMapSize: settings.shadowMapSize,
    lightDirection: direction.clone().negate(), // CSM wants the way the light travels
    lightIntensity: intensity,
    lightNear: 1,
    lightFar: 520,
    lightMargin: 160, // how far behind the view to look for things that cast into it
  });
  csm.fade = true; // blend between bands instead of showing a seam

  for (const light of csm.lights) light.color.copy(color);
  tuneShadowFilter(settings);
  return csm;
}

/**
 * Each band covers a different amount of ground per texel, so the same filter
 * settings would give razor edges nearby and mush far away. Scale them so the
 * softness is roughly constant in metres.
 */
function tuneShadowFilter(settings) {
  const softness = 0.05; // metres of blur at a shadow's edge
  for (const light of csm.lights) {
    const cam = light.shadow.camera;
    const texel = (cam.right - cam.left) / settings.shadowMapSize;
    light.shadow.radius = Math.max(1.0, softness / texel);
    light.shadow.bias = -0.00012;
    // Nudge the lookup off the surface by about two texels to stop a surface
    // from shadowing itself in stripes ("shadow acne").
    light.shadow.normalBias = texel * 2.0;
  }
}

/** Call every frame after the camera has moved. */
export function updateSun(camera) {
  if (!csm) return;
  camera.updateMatrixWorld();
  csm.update();
}

/** Call when the window is resized or the camera's field of view changes. */
export function resizeSun(settings) {
  if (!csm) return;
  csm.updateFrustums();
  tuneShadowFilter(settings);
}

/**
 * Register a material that is lit by the sun. Returns the same material.
 *
 * `extra` optionally adds a further shader patch (the wind sway on plants, for
 * instance): { key: 'unique-name', patch(shader) { ... } }. Three.js allows
 * only one patch function per material, so the two are chained here.
 */
export function lit(material, extra = null) {
  if (csm) csm.setupMaterial(material);
  const sunPatch = csm ? material.onBeforeCompile : null;

  if (sunPatch || extra) {
    material.onBeforeCompile = (shader, renderer) => {
      if (sunPatch) sunPatch.call(material, shader, renderer);
      if (extra) extra.patch(shader);
    };
    // Materials with different patches must not share a compiled program.
    material.customProgramCacheKey = () => `${csm ? 'sun' : 'plain'}:${extra ? extra.key : ''}`;
  }
  return material;
}
