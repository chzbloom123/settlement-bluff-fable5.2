// The last step before the picture reaches the screen: tone mapping, then the
// colour grade, in a single full-screen pass.
//
// Tone mapping squeezes the renderer's wide brightness range into what a
// monitor can show. The grade then sets the mood: a gentle split tone (cool
// shadows, warm highlights), a soft vignette and a trace of film grain. The
// look aimed for is a stylised golden-hour diorama, so everything here is kept
// light -- it should flatter the scene, not sit on top of it.
//
// Doing both in one pass matters for speed: every full-screen pass costs the
// same again on a weak graphics chip.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const TONE_MAPPING_DEFINES = {
  [THREE.LinearToneMapping]: 'LINEAR_TONE_MAPPING',
  [THREE.ReinhardToneMapping]: 'REINHARD_TONE_MAPPING',
  [THREE.CineonToneMapping]: 'CINEON_TONE_MAPPING',
  [THREE.ACESFilmicToneMapping]: 'ACES_FILMIC_TONE_MAPPING',
  [THREE.AgXToneMapping]: 'AGX_TONE_MAPPING',
  [THREE.NeutralToneMapping]: 'NEUTRAL_TONE_MAPPING',
};

const vertexShader = /* glsl */ `
  precision highp float;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D tDiffuse;
  uniform float time;
  uniform float vignette;
  uniform float grainAmount;
  uniform float saturation;
  uniform float contrast;
  uniform float lift;
  uniform vec3 shadowTint;
  uniform vec3 highlightTint;

  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>

  varying vec2 vUv;

  // Cheap hash for the grain. Good enough that the eye reads it as film.
  float hash(vec2 p) {
    p = fract(p * vec2(443.897, 441.423));
    p += dot(p, p + 19.19);
    return fract((p.x + p.y) * p.x);
  }

  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb;

    // --- Wide range in, display range out ---
    #if defined(ACES_FILMIC_TONE_MAPPING)
      color = ACESFilmicToneMapping(color);
    #elif defined(AGX_TONE_MAPPING)
      color = AgXToneMapping(color);
    #elif defined(NEUTRAL_TONE_MAPPING)
      color = NeutralToneMapping(color);
    #elif defined(REINHARD_TONE_MAPPING)
      color = ReinhardToneMapping(color);
    #elif defined(CINEON_TONE_MAPPING)
      color = CineonToneMapping(color);
    #else
      color = LinearToneMapping(color);
    #endif
    color = sRGBTransferOETF(vec4(color, 1.0)).rgb;

    // --- Grade, working in display colours from here on ---
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));

    // Split toning: lean the dark end cool and the bright end warm.
    float shadowMask = 1.0 - smoothstep(0.0, 0.5, luma);
    float highlightMask = smoothstep(0.45, 1.0, luma);
    color *= mix(vec3(1.0), shadowTint, shadowMask);
    color *= mix(vec3(1.0), highlightTint, highlightMask);

    color = mix(vec3(luma), color, saturation);

    // A mild S-curve around mid grey, then lift the blacks a touch so the
    // deepest shadow reads as hazy air rather than a hole in the picture.
    color = (color - 0.5) * contrast + 0.5;
    color = color * (1.0 - lift) + lift;

    // Vignette. Squared falloff keeps the centre clean.
    vec2 centred = vUv - 0.5;
    float r2 = dot(centred, centred);
    color *= clamp(1.0 - vignette * r2 * (0.62 + r2 * 0.75), 0.0, 1.0);

    // Grain. It also hides the banding that smooth sky gradients would
    // otherwise show on an 8-bit screen. Kept faint enough that the
    // antialiasing pass after this one doesn't mistake it for edges.
    float grain = hash(vUv * 900.0 + fract(time) * 137.0) - 0.5;
    color += grain * grainAmount;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

export class FinalPass extends Pass {
  /** @param {number} toneMapping one of THREE's tone mapping constants */
  constructor(toneMapping, exposure) {
    super();

    this.uniforms = {
      tDiffuse: { value: null },
      toneMappingExposure: { value: exposure },
      time: { value: 0 },
      vignette: { value: 0.5 },
      grainAmount: { value: 0.018 },
      saturation: { value: 0.96 },
      contrast: { value: 1.04 },
      lift: { value: 0.012 },
      shadowTint: { value: new THREE.Vector3(0.98, 0.99, 1.02) },
      highlightTint: { value: new THREE.Vector3(1.04, 1.01, 0.95) },
    };

    this.material = new THREE.RawShaderMaterial({
      name: 'HanfordFinal',
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      defines: { [TONE_MAPPING_DEFINES[toneMapping] ?? 'LINEAR_TONE_MAPPING']: '' },
      depthTest: false,
      depthWrite: false,
    });
    this._quad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this._quad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this._quad.dispose();
  }
}
