// Renderer setup and the post-processing chain.
//
// The order of passes matters. Scene -> ambient occlusion -> bloom -> tone map
// -> colour grade -> antialiasing. Occlusion and bloom want the raw high-range
// image; the grade and the antialiasing want the final display-range one.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { GradeShader } from './grade.js';

export function createRenderer(canvas, settings) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // handled by SMAA in the composer instead
    powerPreference: 'high-performance',
    stencil: false,
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Physically-based lighting needs a real tone mapping curve, otherwise
  // bright sky and lit concrete both clip to flat white.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  return renderer;
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
      gtao = new GTAOPass(scene, camera, size.x, size.y);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.updateGtaoMaterial({
        radius: 0.42,
        distanceExponent: 1.4,
        thickness: 1.0,
        scale: 1.0,
        samples: 12,
        screenSpaceRadius: false,
      });
      gtao.blendIntensity = 0.85;
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
    // Restrained values on purpose. Strong bloom reads as 2007, not 2010.
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.34, 0.72, 0.86);
    composer.addPass(bloom);
  }

  composer.addPass(new OutputPass());

  const grade = new ShaderPass(GradeShader);
  grade.uniforms.shadowTint.value = new THREE.Vector3(0.86, 0.95, 1.1);
  grade.uniforms.highlightTint.value = new THREE.Vector3(1.09, 1.02, 0.9);
  composer.addPass(grade);

  if (settings.antialias) {
    composer.addPass(new SMAAPass());
  }

  return { composer, grade, bloom, gtao };
}
