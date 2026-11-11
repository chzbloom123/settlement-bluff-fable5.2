// The movement keys must match what the player sees: D goes toward the right
// edge of the screen, W goes into it. Phase 1 shipped with A and D swapped,
// so this checks the result against the camera rather than against the maths.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Player } from '../src/player/player.js';
import { groundHeight } from '../src/world/terrain.js';

const NO_KEYS = { forward: false, back: false, left: false, right: false, sprint: false, jump: false };

/** Walk for one second with the given keys held and return how far we got. */
function walk(yaw, keys) {
  const camera = new THREE.PerspectiveCamera();
  const x = 0, z = 120; // open steppe, well clear of any building
  const player = new Player(new THREE.Scene(), camera, { x, y: groundHeight(x, z), z });
  player.yaw = yaw;

  const input = { ...NO_KEYS, ...keys, consumeMouse: () => ({ dx: 0, dy: 0 }) };
  const start = player.position.clone();
  for (let i = 0; i < 60; i++) player.update(1 / 60, input);

  camera.updateMatrixWorld();
  const screenRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const intoScreen = camera.getWorldDirection(new THREE.Vector3());
  const moved = player.position.clone().sub(start);
  return { right: moved.dot(screenRight), ahead: moved.dot(intoScreen) };
}

describe('player movement matches the camera', () => {
  for (const yaw of [0, 1, Math.PI, -2.2]) {
    it(`D moves screen-right, A screen-left (yaw ${yaw.toFixed(2)})`, () => {
      expect(walk(yaw, { right: true }).right).toBeGreaterThan(1);
      expect(walk(yaw, { left: true }).right).toBeLessThan(-1);
    });

    it(`W moves into the screen, S out of it (yaw ${yaw.toFixed(2)})`, () => {
      expect(walk(yaw, { forward: true }).ahead).toBeGreaterThan(1);
      expect(walk(yaw, { back: true }).ahead).toBeLessThan(-1);
    });
  }
});
