// Sky, sky lighting, atmospheric fog and the river surface.
//
// The time of day is fixed at late afternoon. A lowish sun gives long shadows
// and rakes across every surface, which is what makes the ruins read as three
// dimensional. It is also simply the prettiest hour in that country.
//
// The sun itself (the light and its shadows) lives in render/shadows.js. This
// file owns what the sky looks like and the soft light the sky gives off.

import * as THREE from 'three';
import { WORLD_SIZE, WATER_LEVEL } from './terrain.js';

// Colours the whole scene is built around.
export const PALETTE = {
  sunLight: new THREE.Color('#ffd9a8'),
  groundBounce: new THREE.Color('#8a7551'),
  fog: new THREE.Color('#d3c8b0'),
  zenith: new THREE.Color('#4a7cb0'),
  horizon: new THREE.Color('#e3cfa6'),
  water: new THREE.Color('#3f5a63'),
};

/** How strong the direct sunlight is, relative to the sky's own light. */
export const SUN_INTENSITY = 5.0;

// Where the sun sits: 27 degrees up, a little south of due west. The main
// street runs east-west, so from here the light rakes along it and the
// buildings' shadows fall mostly along the street instead of across it.
const SUN_ELEVATION = THREE.MathUtils.degToRad(27);
const SUN_AZIMUTH = THREE.MathUtils.degToRad(66); // degrees west of south
export const SUN_DIRECTION = new THREE.Vector3(
  -Math.cos(SUN_ELEVATION) * Math.sin(SUN_AZIMUTH),
  Math.sin(SUN_ELEVATION),
  Math.cos(SUN_ELEVATION) * Math.cos(SUN_AZIMUTH)
).normalize();

// The sky's colour for any direction. Shared by the sky you see and the sky
// that lights the scene, so the two can never disagree.
const SKY_GLSL = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform vec3 groundColor;
  uniform float time;

  float skyHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float skyNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), f.x),
               mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float skyFbm(vec2 p) {
    float sum = 0.0, amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += skyNoise(p) * amp;
      p = p * 2.03 + 17.0;
      amp *= 0.5;
    }
    return sum;
  }

  // High thin cloud, combed into streaks by the wind. Returns 0..1 coverage.
  float cirrus(vec3 dir) {
    if (dir.y < 0.015) return 0.0;
    // Project the view direction onto a flat layer far overhead.
    vec2 p = dir.xz / (dir.y + 0.14);
    p += vec2(time * 0.004, time * 0.0015);
    float streaks = skyFbm(vec2(p.x * 0.5 + p.y * 0.35, p.y * 1.5 - p.x * 0.2));
    float detail = skyFbm(p * 3.3 + 9.0);
    float cover = smoothstep(0.56, 0.84, streaks) * (0.35 + 0.65 * detail);
    // Dissolve into the haze near the horizon.
    return cover * smoothstep(0.015, 0.22, dir.y);
  }

  vec3 skyColor(vec3 dir) {
    float h = clamp(dir.y, -1.0, 1.0);
    float d = max(dot(dir, normalize(sunDir)), 0.0);

    // Vertical gradient, biased so the haze band sits low and thick.
    vec3 color = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.42));

    // Dust haze piled up right at the horizon line.
    color = mix(color, horizon * 1.06, pow(1.0 - abs(h), 9.0) * 0.75);

    // The sky brightens and warms toward the sun.
    color += sunColor * (pow(d, 6.0) * 0.16 + pow(d, 40.0) * 0.5);

    // Clouds catch the sun: warm cream toward it, cooler grey away from it.
    float cloud = cirrus(dir);
    vec3 cloudColor = mix(vec3(0.80, 0.80, 0.82), sunColor * 1.25, 0.35 + 0.65 * pow(d, 3.0));
    color = mix(color, cloudColor, cloud * 0.6);

    #ifdef SKY_FOR_LIGHTING
      // What the ground sends back up: a dim warm bounce, not more sky.
      color = mix(color, groundColor, smoothstep(0.03, -0.12, h));
    #else
      // The sun's disc, far brighter than anything else so it blooms.
      color += sunColor * smoothstep(0.99965, 0.99985, d) * 60.0;
      // Below the horizon just fade to haze so the seam never shows.
      color = mix(color, horizon * 0.82, smoothstep(0.0, -0.22, h));
    #endif

    return color;
  }
`;

function skyUniforms() {
  return {
    zenith: { value: PALETTE.zenith.clone() },
    horizon: { value: PALETTE.horizon.clone() },
    sunDir: { value: SUN_DIRECTION.clone() },
    sunColor: { value: new THREE.Color('#ffe2b4') },
    groundColor: { value: PALETTE.groundBounce.clone().multiplyScalar(0.3) },
    time: { value: 0 },
  };
}

export function createSky() {
  // A large inward-facing sphere painted in the fragment shader. Cheaper and
  // more controllable than a real atmospheric model.
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms(),
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        // Strip translation from the view matrix so the sky never moves
        // relative to the camera -- it should feel infinitely far away.
        vec4 pos = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0);
        gl_Position = pos.xyww; // force to the far plane
      }
    `,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      varying vec3 vDir;
      void main() {
        gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
      }
    `,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), material);
  sky.scale.setScalar(WORLD_SIZE * 2.2);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.name = 'sky';
  return sky;
}

/**
 * Light the scene with the sky.
 *
 * The sky is photographed once into a small blurred cube map, and every
 * material then uses it twice over: as soft light arriving from all
 * directions (blue from above, warm from the haze and the ground), and as
 * something for shiny surfaces to reflect. Without it, shadows have nothing in
 * them and metal has nothing to reflect, so both turn black.
 */
export function createSkyLight(renderer, scene) {
  const skyScene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    defines: { SKY_FOR_LIGHTING: '' },
    uniforms: skyUniforms(),
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${SKY_GLSL}
      varying vec3 vDir;
      void main() {
        gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), material);
  skyScene.add(dome);

  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(skyScene, 0, 0.1, 100);
  scene.environment = target.texture;
  scene.environmentIntensity = 0.9;

  generator.dispose();
  material.dispose();
  dome.geometry.dispose();
  return target;
}

export function createFog(scene, settings) {
  // Exponential-squared fog. The density is tuned so the far bluffs read as
  // genuinely distant while the town stays crisp.
  scene.fog = new THREE.FogExp2(PALETTE.fog, 0.0030);
  scene.background = PALETTE.fog.clone();
  return scene.fog;
}

export function createWater() {
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE * 1.6, 260, 1, 1);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      waterColor: { value: PALETTE.water.clone() },
      skyColor: { value: PALETTE.horizon.clone() },
      sunDir: { value: SUN_DIRECTION.clone() },
      fogColor: { value: PALETTE.fog.clone() },
      fogDensity: { value: 0.0030 },
    },
    vertexShader: /* glsl */ `
      uniform float time;
      varying vec3 vWorld;

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        // Two crossing swells so the surface is never perfectly flat.
        world.y += sin(world.x * 0.09 + time * 0.55) * 0.055;
        world.y += sin(world.z * 0.14 - time * 0.42) * 0.04;
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 waterColor;
      uniform vec3 skyColor;
      uniform vec3 sunDir;
      uniform vec3 fogColor;
      uniform float fogDensity;
      varying vec3 vWorld;

      // Small value-noise pair, used for the ripple normals.
      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);

        // Build a rippled normal from a couple of scrolling noise layers.
        vec2 p = vWorld.xz;
        float n1 = vnoise(p * 0.55 + vec2(time * 0.20, time * 0.06));
        float n2 = vnoise(p * 1.7 - vec2(time * 0.11, time * 0.27));
        float n3 = vnoise(p * 3.9 + vec2(time * 0.36, -time * 0.18));
        vec2 slope = vec2(n1 - n2, n2 - n3) * 0.55;
        vec3 normal = normalize(vec3(slope.x, 1.0, slope.y));

        // Fresnel: glancing angles reflect the sky, steep angles show depth.
        float fres = pow(1.0 - clamp(dot(viewDir, normal), 0.0, 1.0), 3.2);
        vec3 color = mix(waterColor, skyColor, clamp(fres * 1.15, 0.0, 0.92));

        // Specular glitter off the low sun.
        vec3 halfVec = normalize(normalize(sunDir) + viewDir);
        float spec = pow(max(dot(normal, halfVec), 0.0), 220.0);
        color += vec3(1.0, 0.92, 0.76) * spec * 2.4;

        // Fine sparkle so the river reads as moving even when standing still.
        float sparkle = pow(vnoise(p * 9.0 + vec2(time * 1.1, time * 0.7)), 14.0);
        color += vec3(1.0, 0.95, 0.84) * sparkle * 1.5;

        // Match the scene fog by hand, since this is a custom shader.
        float dist = length(cameraPosition - vWorld);
        float fogAmount = 1.0 - exp(-pow(dist * fogDensity, 2.0));
        color = mix(color, fogColor, clamp(fogAmount, 0.0, 1.0));

        gl_FragColor = vec4(color, 0.90);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, WATER_LEVEL, -168);
  mesh.renderOrder = 5;
  mesh.name = 'river';
  return { mesh, material };
}
