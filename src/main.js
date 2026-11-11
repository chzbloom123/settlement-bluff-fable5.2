// Entry point. Builds the world once, then runs the frame loop.
//
// World generation takes a second or two (all the textures are drawn from
// scratch and the terrain is a hundred thousand vertices), so it is broken into
// steps with the loading bar advanced between them. Yielding to the browser
// between steps is what keeps that bar actually animating instead of freezing.

import * as THREE from 'three';

import { loadSettings, getSettings, saveSettingsName, nextPresetName, PRESETS } from './core/settings.js';
import { Input } from './core/input.js';
import { FrameStats } from './core/framestats.js';
import { createRenderer, createComposer, gpuName } from './render/renderer.js';
import { createTerrain, groundHeight } from './world/terrain.js';
import { createSun, updateSun, resizeSun } from './render/shadows.js';
import {
  createSky, createSkyLight, createFog, createWater, SUN_DIRECTION, SUN_INTENSITY, PALETTE,
} from './world/environment.js';
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

  // The sun must exist before any world geometry is built: every material is
  // registered with it as it is created (see render/shadows.js).
  createSun(scene, camera, settings, {
    direction: SUN_DIRECTION,
    color: PALETTE.sunLight,
    intensity: SUN_INTENSITY,
  });
  createSkyLight(renderer, scene);

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
  input.onPress('BracketLeft', () => hud.showToast(`mouse speed ${input.adjustSensitivity(1 / 1.15)}%`));
  input.onPress('BracketRight', () => hud.showToast(`mouse speed ${input.adjustSensitivity(1.15)}%`));
  input.onPress('F3', () => hud.toggleStats());
  input.onPress('F4', () => copyReport());
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
    resizeSun(settings);
  });

  // --- Performance report ---
  // F3 shows these numbers live; F4 copies a fuller report to the clipboard so
  // it can be pasted into a chat. This is how real hardware gets measured.
  const frameStats = new FrameStats(600);
  const drawSize = new THREE.Vector2();
  let drawCalls = 0;
  let triangles = 0;

  function buildReport() {
    const s = frameStats.summary();
    renderer.getDrawingBufferSize(drawSize);
    return [
      'Hanford Reach performance report',
      `GPU: ${gpuName(renderer)}`,
      `Preset: ${PRESETS[settings.name].label}`,
      `Canvas: ${drawSize.x}x${drawSize.y} (window ${window.innerWidth}x${window.innerHeight}, ` +
        `pixel ratio ${renderer.getPixelRatio().toFixed(2)})`,
      s
        ? `Last ${s.frames} frames: avg ${s.avgFps.toFixed(1)} fps (${s.avgMs.toFixed(1)} ms), ` +
          `1% low ${s.low1Fps.toFixed(1)} fps, worst ${s.worstMs.toFixed(0)} ms`
        : 'No frames measured yet',
      `Scene: ${drawCalls} draw calls, ${(triangles / 1000).toFixed(0)}k triangles`,
      `Position: x ${player.position.x.toFixed(0)}, z ${player.position.z.toFixed(0)}`,
      `Browser: ${navigator.userAgent}`,
    ];
  }

  function copyReport() {
    const lines = buildReport();
    hud.toggleStats(true);
    const copied = navigator.clipboard?.writeText(lines.join('\n'));
    if (!copied) return showReportForManualCopy(lines);
    copied
      .then(() => hud.notify('report copied'))
      .catch(() => showReportForManualCopy(lines));
  }

  /** Fallback for browsers that refuse clipboard access. */
  function showReportForManualCopy(lines) {
    document.exitPointerLock?.();
    window.prompt('Copy this report (Ctrl+C), then paste it into the chat:', lines.join(' | '));
  }

  // --- Frame loop ---
  // THREE.Timer also pauses itself while the tab is hidden, so coming back to
  // the game never produces one enormous time step.
  const timer = new THREE.Timer();
  timer.connect(document);
  let elapsed = 0;

  function setTime(seconds) {
    updateWind(seconds);
    sky.material.uniforms.time.value = seconds;
    water.material.uniforms.time.value = seconds;
    grade.uniforms.time.value = seconds;
  }

  function render() {
    updateSun(camera); // fit the shadow cascades to wherever the camera now is
    renderer.info.reset();
    composer.render();
    drawCalls = renderer.info.render.calls;
    triangles = renderer.info.render.triangles;
  }

  function frame(timestamp) {
    timer.update(timestamp);
    const rawDt = timer.getDelta();

    // Anything over a second is a stall (a debugger, a sleeping laptop), not a
    // frame, so it stays out of the statistics.
    if (rawDt < 1) frameStats.push(rawDt * 1000);

    // Clamp the step so a long stall doesn't teleport the player through a
    // wall when the game resumes.
    const dt = Math.min(rawDt, 0.05);
    elapsed += dt;

    // While the cursor is free the world keeps running but the player holds
    // still, so releasing the mouse never sends them walking off a bank.
    player.update(dt, input.pointerLocked ? input : IDLE_INPUT);

    setTime(elapsed);
    render();

    hud.update(dt, () => ({
      stats: frameStats.summary(),
      quality: PRESETS[settings.name].label,
      width: renderer.getDrawingBufferSize(drawSize).x,
      height: drawSize.y,
      drawCalls,
      triangles,
      x: player.position.x,
      z: player.position.z,
    }));
  }

  renderer.setAnimationLoop(frame);

  // --- Debug hooks ---
  // Available on the dev server, or on any build with `?debug` in the address.
  // `npm run shots` uses these to render the same viewpoints every time.
  const debugRequested = new URLSearchParams(window.location.search).has('debug');
  if (import.meta.env.DEV || debugRequested) {
    const focus = new THREE.Vector3();
    const idle = { ...IDLE_INPUT };

    window.hanford = {
      scene, renderer, player, settings, camera, composer,

      /**
       * Stop the game and draw one frame from a fixed camera. `eye` and
       * `target` are { x, z, up } where `up` is metres above the ground there.
       * The character is hidden and time is frozen, so the same call always
       * produces the same picture.
       */
      still({ eye, target }) {
        renderer.setAnimationLoop(null);
        player.character.root.visible = false;

        camera.position.set(eye.x, groundHeight(eye.x, eye.z) + eye.up, eye.z);
        focus.set(target.x, groundHeight(target.x, target.z) + target.up, target.z);
        camera.lookAt(focus);

        setTime(10);
        render();
      },

      /**
       * Stop the game and draw one frame exactly as the player would see it,
       * character included. With no argument, that is the view on arrival at
       * the spawn point; pass { x, z, yaw } to stand somewhere else.
       */
      stillAsPlayer(pose = spawn) {
        renderer.setAnimationLoop(null);
        player.character.root.visible = true;
        player.position.set(pose.x, groundHeight(pose.x, pose.z), pose.z);
        player.velocity.set(0, 0, 0);
        player.yaw = pose.yaw ?? 0;
        player.pitch = -0.12;
        player._initialisedCamera = false;
        player.update(0.016, idle);
        setTime(10);
        render();
      },

      /** Go back to normal play after `still()`. */
      resume() {
        player.character.root.visible = true;
        renderer.setAnimationLoop(frame);
      },
    };
  }
}

boot().catch((err) => {
  console.error(err);
  hud.setProgress(1, 'something broke -- check the console');
});
