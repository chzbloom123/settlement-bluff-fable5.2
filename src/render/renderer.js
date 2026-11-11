// Renderer setup and the post-processing chain.
//
// The order of passes matters:
//   scene -> ambient occlusion -> bloom -> tone map + grade -> antialiasing
// Occlusion and bloom want the raw wide-range image; antialiasing wants the
// finished display-range one.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { FinalPass } from './grade.js';

/**
 * Ambient occlusion, with three fixes over the stock pass:
 *
 *  - It redraws the scene with a plain material to learn the shape of things,
 *    and that material ignores texture cut-outs -- so every grass tuft was
 *    shaded as a solid rectangle. Objects marked `userData.skipAO` are now left
 *    out of that redraw.
 *  - That redraw also re-rendered every shadow map for nothing.
 *  - It can run at a fraction of the screen resolution. Occlusion is soft by
 *    nature, so half resolution costs a quarter as much and looks the same.
 */
class SceneAOPass extends GTAOPass {
  constructor(scene, camera, width, height, resolutionScale) {
    super(scene, camera, Math.ceil(width * resolutionScale), Math.ceil(height * resolutionScale));
    this.resolutionScale = resolutionScale;
  }

  setSize(width, height) {
    const scale = this.resolutionScale ?? 1;
    super.setSize(Math.ceil(width * scale), Math.ceil(height * scale));
  }

  _overrideVisibility() {
    super._overrideVisibility();
    const hidden = this._visibilityCache;
    this.scene.traverse((object) => {
      if (object.userData.skipAO && object.visible) {
        object.visible = false;
        hidden.push(object);
      }
    });
  }

  _renderOverride(renderer, ...rest) {
    const autoUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    super._renderOverride(renderer, ...rest);
    renderer.shadowMap.autoUpdate = autoUpdate;
  }
}

export function createRenderer(canvas, settings) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // handled by SMAA in the composer instead
    powerPreference: 'high-performance',
    stencil: false,
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // The scene is rendered in a wide brightness range and squeezed into what a
  // monitor can show by the final pass (see grade.js). AgX is the gentlest of
  // the built-in curves: bright warm surfaces roll off softly instead of
  // clipping to white or shifting hue.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  renderer.shadowMap.enabled = true;
  // Filtered shadows. How soft they are is set per cascade in shadows.js.
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // Count draw calls across the whole frame (shadows, scene, every post pass)
  // rather than only the last pass. main.js resets the counters each frame.
  renderer.info.autoReset = false;

  return renderer;
}

/** The graphics chip the browser is actually drawing with, for the F3 report. */
export function gpuName(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  // Firefox no longer exposes the extension but reports the name directly.
  return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || 'unknown');
}

export function createComposer(renderer, scene, camera, settings) {
  const size = renderer.getSize(new THREE.Vector2());

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
  composer.setSize(size.x, size.y);

  composer.addPass(new RenderPass(scene, camera));

  // Ambient occlusion darkens the creases where surfaces meet -- under the
  // gas station canopy, inside doorways, where a wall meets the ground.
  let gtao = null;
  if (settings.ambientOcclusion) {
    try {
      gtao = new SceneAOPass(scene, camera, size.x, size.y, settings.aoResolution);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.updateGtaoMaterial({
        radius: 0.5,
        distanceExponent: 1.4,
        thickness: 1.0,
        scale: 1.0,
        samples: 8,
        screenSpaceRadius: false,
      });
      gtao.blendIntensity = 0.8;
      composer.addPass(gtao);
    } catch (err) {
      // If the driver can't handle it we simply go without; better a slightly
      // flatter picture than a black screen.
      console.warn('Ambient occlusion unavailable, continuing without it.', err);
      gtao = null;
    }
  }

  let bloom = null;
  if (settings.bloom) {
    // Only things brighter than a sunlit white wall glow: the sun, its glitter
    // on the river, the brightest edge of the sky.
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.22, 0.6, 1.6);
    composer.addPass(bloom);
  }

  const grade = new FinalPass(renderer.toneMapping, renderer.toneMappingExposure);
  composer.addPass(grade);

  if (settings.antialias) {
    composer.addPass(new SMAAPass());
  }

  return { composer, grade, bloom, gtao };
}
