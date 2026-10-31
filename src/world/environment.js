// Sky, sun, fill light, atmospheric fog and the river surface.
//
// The time of day is fixed at late afternoon. A low sun gives long shadows and
// rakes across every surface, which is what makes the ruins read as three
// dimensional. It is also simply the prettiest hour in that country.

import * as THREE from 'three';
import { WORLD_SIZE, WATER_LEVEL } from './terrain.js';

// Colours the whole scene is built around.
export const PALETTE = {
  sunLight: new THREE.Color('#ffdcae'),
  skyLight: new THREE.Color('#93b3d6'),
  groundBounce: new THREE.Color('#8a7551'),
  fog: new THREE.Color('#c2b394'),
  zenith: new THREE.Color('#4d7ba8'),
  horizon: new THREE.Color('#d9c39c'),
  water: new THREE.Color('#3f5a63'),
};

// Sun direction, aimed low in the west-southwest.
export const SUN_DIRECTION = new THREE.Vector3(-0.62, 0.30, 0.42).normalize();

export function createSky() {
  // A large inward-facing sphere with a gradient painted in the fragment
  // shader. Cheaper and more controllable than a real atmospheric model.
  const geometry = new THREE.SphereGeometry(1, 40, 24);

  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: PALETTE.zenith.clone() },
      horizon: { value: PALETTE.horizon.clone() },
      sunDir: { value: SUN_DIRECTION.clone() },
      sunColor: { value: new THREE.Color('#ffe6bd') },
    },
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
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      varying vec3 vDir;

      void main() {
        vec3 dir = normalize(vDir);

        // Vertical gradient, biased so the haze band sits low and thick.
        float h = clamp(dir.y, -1.0, 1.0);
        float t = pow(clamp(h, 0.0, 1.0), 0.42);
        vec3 color = mix(horizon, zenith, t);

        // Dust haze piled up right at the horizon line.
        float haze = pow(1.0 - abs(h), 9.0);
        color = mix(color, horizon * 1.06, haze * 0.75);

        // Broad warm glow around the sun, then a soft disc inside it.
        float d = max(dot(dir, normalize(sunDir)), 0.0);
        color += sunColor * pow(d, 26.0) * 0.5;
        color += sunColor * pow(d, 900.0) * 3.2;

        // Below the horizon just fade to haze so the seam never shows.
        color = mix(color, horizon * 0.82, smoothstep(0.0, -0.22, h));

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const sky = new THREE.Mesh(geometry, material);
  sky.scale.setScalar(WORLD_SIZE * 2.2);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.name = 'sky';
  return sky;
}

export function createLighting(settings) {
  const group = new THREE.Group();
  group.name = 'lighting';

  // The sun. Everything about the look hangs off this one light.
  const sun = new THREE.DirectionalLight(PALETTE.sunLight, 3.1);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(160);
  sun.castShadow = true;

  const d = settings.shadowDistance;
  sun.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
  sun.shadow.camera.left = -d;
  sun.shadow.camera.right = d;
  sun.shadow.camera.top = d;
  sun.shadow.camera.bottom = -d;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  // Bias values fight shadow acne on the large flat terrace. Normal bias does
  // most of the work; too much and shadows detach from their objects.
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  group.add(sun);
  group.add(sun.target);

  // Sky and bounce light. Without this the shadowed sides go dead black,
  // which is the fastest way to look cheap.
  const hemi = new THREE.HemisphereLight(PALETTE.skyLight, PALETTE.groundBounce, 1.15);
  group.add(hemi);

  // A very dim fill from the opposite side, standing in for light bouncing off
  // the dust and the water.
  const fill = new THREE.DirectionalLight(PALETTE.skyLight, 0.35);
  fill.position.set(SUN_DIRECTION.x * -100, 40, SUN_DIRECTION.z * -100);
  group.add(fill);

  return { group, sun, hemi, fill };
}

export function createFog(scene, settings) {
  // Exponential-squared fog. The density is tuned so the far bluffs read as
  // genuinely distant while the town stays crisp.
  scene.fog = new THREE.FogExp2(PALETTE.fog, 0.0034);
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
      fogDensity: { value: 0.0034 },
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
