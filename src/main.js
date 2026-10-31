// Entry point. Builds the world once, then runs the frame loop.
//
// World generation takes a second or two (all the textures are drawn from
// scratch and the terrain is a hundred thousand vertices), so it is broken into
// steps with the loading bar advanced between them. Yielding to the browser
// between steps is what keeps that bar actually animating instead of freezing.

import * as THREE from 'three';

import { loadSettings, getSettings, saveSettingsName, nextPresetName, PRESETS } from './core/settings.js';
import { Input } from './core/input.js';
import { createRenderer, createComposer } from './render/renderer.js';
import { createTerrain } from './world/terrain.js';
import { createSky, createLighting, createFog, createWater, SUN_DIRECTION } from './world/environment.js';
import { createTown, spawnPoint } from './world/town.js';
import { createScatter, updateWind } from './world/scatter.js';
import { Player } from './player/player.js';
import { Hud } from './ui/hud.js';

const canvas = document.getElementById('game');
const hud = new Hud();

/** Stand-in for the real input while the mouse cursor is released. */
const IDLE_INPUT = {
  forward: false, back: false, left: false, right: false, sprint: false, jump: false,
  consumeMouse: () => ({ dx: 0, dy: 0 }),
};

/** Let the browser paint before continuing. Keeps the loading bar alive. */
const yieldToBrowser = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

async function boot() {
  const settings = loadSettings();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    58, window.innerWidth / window.innerHeight, 0.15, settings.viewDistance
  );

  const renderer = createRenderer(canvas, settings);

  hud.setProgress(0.08, 'mixing pigment');
  await yieldToBrowser();

  // --- Atmosphere ---
  createFog(scene, settings);
  const sky = createSky();
  scene.add(sky);

  const lighting = createLighting(settings);
  scene.add(lighting.group);

  hud.setProgress(0.22, 'cutting the channel');
  await yieldToBrowser();

  // --- Ground ---
  const terrain = createTerrain(settings);
  terrain.updateMatrix();
  scene.add(terrain);

  const water = createWater();
  scene.add(water.mesh);

  hud.setProgress(0.48, 'raising the town');
  await yieldToBrowser();

  // --- Structures ---
  const town = createTown();
  for (const child of town.group.children) child.updateMatrix();
  scene.add(town.group);

  hud.setProgress(0.74, 'seeding sage');
  await yieldToBrowser();

  // --- Vegetation ---
  const scatter = createScatter(settings, town.colliders);
  scene.add(scatter);

  hud.setProgress(0.9, 'setting the light');
  await yieldToBrowser();

  // --- Player ---
  const spawn = spawnPoint();
  const player = new Player(scene, camera, spawn);
  player.setColliders(town.colliders);
  player.setCameraObstacles([terrain, town.group]);

  // The shadow camera follows the player so the limited shadow map is always
  // spent on what is actually on screen.
  const sunOffset = SUN_DIRECTION.clone().multiplyScalar(150);

  const { composer, grade } = createComposer(renderer, scene, camera, settings);

  hud.setProgress(1.0, 'ready');
  await yieldToBrowser();
  hud.finishLoading();

  // --- Input wiring ---
  const input = new Input(canvas);
  input.onPointerLockChange = (locked) => hud.showStartPrompt(!locked);

  canvas.addEventListener('click', () => {
    if (!input.pointerLocked) input.requestPointerLock();
  });
  document.getElementById('start').addEventListener('click', () => input.requestPointerLock());

  input.onPress('KeyH', () => hud.toggleControls());
  input.onPress('F3', () => hud.toggleStats());
  input.onPress('KeyQ', () => {
    // Cycle quality. Some of the setup (shadow map size, instance counts) is
    // baked in at load, so this reloads the page to apply cleanly.
    const next = nextPresetName(getSettings().name);
    saveSettingsName(next);
    window.location.reload();
  });

  // --- Resize ---
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- Frame loop ---
  const clock = new THREE.Clock();
  let elapsed = 0;

  renderer.setAnimationLoop(() => {
    // Clamp the step so a background tab or a long stall doesn't teleport the
    // player through a wall when the window regains focus.
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    // While the cursor is free the world keeps running but the player holds
    // still, so releasing the mouse never sends them walking off a bank.
    player.update(dt, input.pointerLocked ? input : IDLE_INPUT);

    // Sun and shadow frustum ride along with the player.
    lighting.sun.position.copy(player.position).add(sunOffset);
    lighting.sun.target.position.copy(player.position);
    lighting.sun.target.updateMatrixWorld();

    updateWind(elapsed);
    water.material.uniforms.time.value = elapsed;
    grade.uniforms.time.value = elapsed;

    composer.render();

    hud.update(dt, {
      quality: PRESETS[settings.name].label,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      x: player.position.x,
      z: player.position.z,
    });
  });

  // Handy for poking at the world from the browser console while debugging.
  window.hanford = { scene, renderer, player, settings, camera, composer };
}

boot().catch((err) => {
  console.error(err);
  hud.setProgress(1, 'something broke -- check the console');
});
