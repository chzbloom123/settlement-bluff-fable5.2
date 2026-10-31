// The colour grade. This single shader is doing most of the work in making the
// picture read as a late-2000s / early-2010s big-budget game rather than a
// tech demo: cool shadows, warm highlights, crushed contrast, a heavy vignette,
// a whisper of lens fringing and a constant film grain over everything.
//
// It runs after tone mapping, so it is working in display colours.

export const GradeShader = {
  name: 'HanfordGrade',

  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 1.18 },
    grainAmount: { value: 0.055 },
    aberration: { value: 0.0016 },
    saturation: { value: 0.82 },
    contrast: { value: 1.14 },
    lift: { value: 0.014 },
    shadowTint: { value: null },     // set from JS to a THREE.Vector3
    highlightTint: { value: null },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignette;
    uniform float grainAmount;
    uniform float aberration;
    uniform float saturation;
    uniform float contrast;
    uniform float lift;
    uniform vec3 shadowTint;
    uniform vec3 highlightTint;

    varying vec2 vUv;

    // Cheap hash for the grain. Good enough that the eye reads it as film.
    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centred = uv - 0.5;
      float r2 = dot(centred, centred);

      // Chromatic aberration: sample red and blue slightly further from centre
      // than green, which is what a real lens does at the frame edges.
      vec2 offset = centred * aberration * (0.35 + r2 * 2.4);
      vec3 color;
      color.r = texture2D(tDiffuse, uv + offset).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv - offset).b;

      // Luminance drives the split tone below.
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));

      // Split toning -- push the dark end cool and the bright end warm. This
      // is the single most recognisable part of the era's look.
      float shadowMask = 1.0 - smoothstep(0.0, 0.55, luma);
      float highlightMask = smoothstep(0.42, 1.0, luma);
      color *= mix(vec3(1.0), shadowTint, shadowMask * 0.55);
      color *= mix(vec3(1.0), highlightTint, highlightMask * 0.42);

      // Desaturate towards that dusty, sun-hammered palette.
      color = mix(vec3(luma), color, saturation);

      // Filmic S-curve around mid grey, then lift the blacks a touch so the
      // shadows read as hazy air rather than pure void.
      color = (color - 0.5) * contrast + 0.5;
      color = color * (1.0 - lift) + lift;

      // Vignette. Squared falloff keeps the centre clean and the corners dark.
      float vig = 1.0 - vignette * r2 * (0.62 + r2 * 0.75);
      color *= clamp(vig, 0.0, 1.0);

      // Animated grain, slightly stronger in shadow where real film shows it.
      float grain = hash(uv * 900.0 + fract(time) * 137.0) - 0.5;
      color += grain * grainAmount * (1.35 - luma * 0.7);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};
