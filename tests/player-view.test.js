// The two camera views: first person (through the character's eyes) and third
// person (over the shoulder). Both must respond to the mouse the same way.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Player } from '../src/player/player.js';
import { groundHeight } from '../src/world/terrain.js';

const KEYS_UP = { forward: false, back: false, left: false, right: false, sprint: false, jump: false };
const still = { ...KEYS_UP, consumeMouse: () => ({ dx: 0, dy: 0 }) };

function makePlayer(viewMode) {
  const camera = new THREE.PerspectiveCamera();
  const x = 0, z = 120; // open steppe, clear of buildings
  const player = new Player(new THREE.Scene(), camera, { x, y: groundHeight(x, z), z });
  if (viewMode && player.setViewMode) player.setViewMode(viewMode);
  player.update(1 / 60, still);
  return { player, camera };
}

/** Which way the camera is pointing, after moving the mouse once. */
function lookAfterMouse(viewMode, dx, dy) {
  const { player, camera } = makePlayer(viewMode);
  let pending = { dx, dy };
  const input = { ...KEYS_UP, consumeMouse: () => { const m = pending; pending = { dx: 0, dy: 0 }; return m; } };
  for (let i = 0; i < 30; i++) player.update(1 / 60, input); // let any camera smoothing settle
  camera.updateMatrixWorld();
  return {
    forward: camera.getWorldDirection(new THREE.Vector3()),
    right: new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0),
  };
}

for (const mode of ['first', 'third']) {
  describe(`${mode}-person view`, () => {
    // The browser reports upward mouse movement as a negative dy.
    it('looks up when the mouse moves up', () => {
      const before = lookAfterMouse(mode, 0, 0).forward.y;
      expect(lookAfterMouse(mode, 0, -0.3).forward.y).toBeGreaterThan(before + 0.1);
    });

    it('looks down when the mouse moves down', () => {
      const before = lookAfterMouse(mode, 0, 0).forward.y;
      expect(lookAfterMouse(mode, 0, 0.3).forward.y).toBeLessThan(before - 0.1);
    });

    it('turns right when the mouse moves right', () => {
      const before = lookAfterMouse(mode, 0, 0);
      const after = lookAfterMouse(mode, 0.3, 0);
      expect(after.forward.dot(before.right)).toBeGreaterThan(0.1);
    });
  });
}

describe('first-person view', () => {
  it('puts the camera at eye height, inside the character', () => {
    const { player, camera } = makePlayer('first');
    expect(camera.position.x).toBeCloseTo(player.position.x, 3);
    expect(camera.position.z).toBeCloseTo(player.position.z, 3);
    expect(camera.position.y - player.position.y).toBeGreaterThan(1.5);
    expect(camera.position.y - player.position.y).toBeLessThan(1.8);
  });

  it('hides the body from the camera but keeps it casting a shadow', () => {
    const { player } = makePlayer('first');
    player.character.root.traverse((o) => {
      if (!o.isMesh) return;
      expect(o.visible).toBe(true);            // still drawn into the shadow maps
      expect(o.castShadow).toBe(true);
      expect(o.material.colorWrite).toBe(false); // but paints nothing on screen
    });
  });
});

describe('third-person view', () => {
  it('puts the camera behind the character and shows the body', () => {
    const { player, camera } = makePlayer('third');
    expect(camera.position.distanceTo(player.position)).toBeGreaterThan(2);
    player.character.root.traverse((o) => {
      if (o.isMesh) expect(o.material.colorWrite).toBe(true);
    });
  });
});

describe('switching views', () => {
  it('keeps the player looking the same way', () => {
    const { player, camera } = makePlayer('third');
    player.yaw = 0.7;
    for (let i = 0; i < 60; i++) player.update(1 / 60, still); // let the boom swing round
    camera.updateMatrixWorld();
    const before = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();

    player.setViewMode('first');
    player.update(1 / 60, still);
    camera.updateMatrixWorld();
    const after = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    // Not exactly equal: the third-person camera sits off to one shoulder.
    expect(after.dot(before)).toBeGreaterThan(0.97);
  });
});
