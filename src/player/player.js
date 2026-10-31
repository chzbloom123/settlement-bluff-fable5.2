// The player: a character you can see, a movement controller, and the
// third-person camera that follows them.
//
// Movement is deliberately plain -- velocity, gravity, and axis-aligned box
// collision with a step-up allowance. Nothing here needs a physics engine, and
// keeping it simple means it will still behave predictably once Phase 3 starts
// dropping player-built structures into the same collider list.

import * as THREE from 'three';
import { groundHeight } from '../world/terrain.js';

const WALK_SPEED = 3.4;
const SPRINT_SPEED = 6.6;
const ACCELERATION = 26;
const GROUND_FRICTION = 12;
const GRAVITY = 22;
const JUMP_SPEED = 6.4;
const PLAYER_RADIUS = 0.42;
const STEP_HEIGHT = 0.62;   // how tall a ledge the player can walk straight up

const EYE_TARGET_HEIGHT = 1.62;
const CAMERA_DISTANCE = 4.6;
const CAMERA_SHOULDER = 0.75;
const MIN_PITCH = -0.9;
const MAX_PITCH = 1.05;

// --- Character model --------------------------------------------------------

/**
 * A low-poly figure in a long coat and boots. At a four-metre camera distance
 * the silhouette is doing all the work, so the shapes are blocky on purpose --
 * detail here would cost geometry and never be seen.
 */
function createCharacter() {
  const root = new THREE.Group();
  root.name = 'player-character';

  const mat = (color, roughness = 0.85) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.0 });

  const coat = mat(0x6b6047);      // faded canvas duck
  const trouser = mat(0x494741);
  const boot = mat(0x2e2823, 0.7);
  const skin = mat(0xb08d6f);
  const pack = mat(0x54483a);

  // Torso, tapering into the coat skirt.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.30), coat);
  torso.position.y = 1.30;
  root.add(torso);

  const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.46, 0.34), coat);
  skirt.position.y = 0.82;
  root.add(skirt);

  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.12, 0.28), coat);
  collar.position.y = 1.63;
  root.add(collar);

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.10, 0.15), skin);
  neck.position.y = 1.70;
  root.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.25), skin);
  head.position.y = 1.89;
  root.add(head);

  // A short bill on the cap gives the silhouette a readable front.
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.11, 0.28), pack);
  cap.position.y = 2.05;
  root.add(cap);
  const bill = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, 0.11), pack);
  bill.position.set(0, 2.01, 0.19);
  root.add(bill);

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.46, 0.22), pack);
  backpack.position.set(0, 1.32, -0.25);
  root.add(backpack);

  // Limbs hang from pivots at the shoulder and hip so they swing correctly.
  const makeLimb = (w, h, d, material, pivotY, side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (w === 0.16 ? 0.30 : 0.14), pivotY, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    root.add(pivot);
    return { pivot, mesh };
  };

  const armL = makeLimb(0.16, 0.62, 0.17, coat, 1.55, -1);
  const armR = makeLimb(0.16, 0.62, 0.17, coat, 1.55, 1);
  const legL = makeLimb(0.18, 0.78, 0.19, trouser, 0.82, -1);
  const legR = makeLimb(0.18, 0.78, 0.19, trouser, 0.82, 1);

  // Boots ride at the bottom of each leg.
  for (const leg of [legL, legR]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.16, 0.26), boot);
    b.position.set(0, -0.72, 0.03);
    leg.pivot.add(b);
  }

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { root, armL, armR, legL, legR, torso };
}

// --- Player -----------------------------------------------------------------

export class Player {
  constructor(scene, camera, spawn) {
    this.camera = camera;

    this.position = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
    this.velocity = new THREE.Vector3();
    this.onGround = true;

    this.yaw = Math.PI;      // facing the river
    this.pitch = -0.12;
    this.facing = this.yaw;  // the body turns to follow movement, not the camera

    this.walkPhase = 0;
    this.speed = 0;

    this.character = createCharacter();
    this.character.root.position.copy(this.position);
    scene.add(this.character.root);

    this.colliders = [];

    // Camera boom smoothing state.
    this._cameraPos = new THREE.Vector3();
    this._cameraTarget = new THREE.Vector3();
    this._initialisedCamera = false;

    // Reused scratch objects, so the update loop allocates nothing.
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    this._rayDir = new THREE.Vector3();
  }

  setColliders(colliders) {
    this.colliders = colliders;
  }

  /** Meshes the camera should not clip through. */
  setCameraObstacles(objects) {
    this._obstacles = objects;
  }

  update(dt, input) {
    this._look(input);
    this._move(dt, input);
    this._animate(dt);
    this._updateCamera(dt);
  }

  _look(input) {
    const { dx, dy } = input.consumeMouse();
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, MIN_PITCH, MAX_PITCH);
  }

  _move(dt, input) {
    // Build a movement direction in the camera's horizontal frame.
    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(this._forward.z, 0, -this._forward.x);

    this._wish.set(0, 0, 0);
    if (input.forward) this._wish.add(this._forward);
    if (input.back) this._wish.sub(this._forward);
    if (input.right) this._wish.add(this._right);
    if (input.left) this._wish.sub(this._right);

    const moving = this._wish.lengthSq() > 0.0001;
    if (moving) this._wish.normalize();

    const targetSpeed = input.sprint ? SPRINT_SPEED : WALK_SPEED;

    // Accelerate toward the wish direction, decelerate when there isn't one.
    if (moving) {
      this.velocity.x += this._wish.x * ACCELERATION * dt;
      this.velocity.z += this._wish.z * ACCELERATION * dt;

      const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
      if (horizontal > targetSpeed) {
        const scale = targetSpeed / horizontal;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }
    } else if (this.onGround) {
      const damping = Math.max(0, 1 - GROUND_FRICTION * dt);
      this.velocity.x *= damping;
      this.velocity.z *= damping;
    }

    if (input.jump && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }

    this.velocity.y -= GRAVITY * dt;

    // Integrate, then resolve collisions against the world.
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this._resolveHorizontal();

    this.position.y += this.velocity.y * dt;
    this._resolveVertical();

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);

    // Turn the body toward where it is actually going, not where the camera
    // looks. Turning is eased so the character doesn't snap around.
    if (this.speed > 0.4) {
      const target = Math.atan2(this.velocity.x, this.velocity.z);
      let delta = target - this.facing;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.facing += delta * Math.min(1, dt * 11);
    }
  }

  /** Push the player out of any structure they've walked into. */
  _resolveHorizontal() {
    const feetY = this.position.y;

    for (const c of this.colliders) {
      // A low collider (a stoop, a kerb, a pump island) is something to stand
      // on, not something to be blocked by.
      if (c.top <= feetY + STEP_HEIGHT) continue;

      const closestX = THREE.MathUtils.clamp(this.position.x, c.minX, c.maxX);
      const closestZ = THREE.MathUtils.clamp(this.position.z, c.minZ, c.maxZ);
      const dx = this.position.x - closestX;
      const dz = this.position.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq >= PLAYER_RADIUS * PLAYER_RADIUS) continue;

      if (distSq > 0.000001) {
        // Outside the box but overlapping: push straight out along the normal.
        const dist = Math.sqrt(distSq);
        const push = (PLAYER_RADIUS - dist) / dist;
        this.position.x += dx * push;
        this.position.z += dz * push;
      } else {
        // Dead centre inside the box: eject through the nearest face.
        const toLeft = this.position.x - c.minX;
        const toRight = c.maxX - this.position.x;
        const toBack = this.position.z - c.minZ;
        const toFront = c.maxZ - this.position.z;
        const min = Math.min(toLeft, toRight, toBack, toFront);
        if (min === toLeft) this.position.x = c.minX - PLAYER_RADIUS;
        else if (min === toRight) this.position.x = c.maxX + PLAYER_RADIUS;
        else if (min === toBack) this.position.z = c.minZ - PLAYER_RADIUS;
        else this.position.z = c.maxZ + PLAYER_RADIUS;
      }

      // Kill the velocity component heading into the surface so the player
      // slides along the wall instead of juddering against it.
      const nx = dx, nz = dz;
      const len = Math.hypot(nx, nz);
      if (len > 0.0001) {
        const into = (this.velocity.x * nx + this.velocity.z * nz) / len;
        if (into < 0) {
          this.velocity.x -= (nx / len) * into;
          this.velocity.z -= (nz / len) * into;
        }
      }
    }
  }

  /** Settle the player onto whatever surface is under them. */
  _resolveVertical() {
    let support = groundHeight(this.position.x, this.position.z);

    // Anything low enough to step onto raises the floor here.
    for (const c of this.colliders) {
      if (!Number.isFinite(c.top)) continue;
      if (this.position.x < c.minX - PLAYER_RADIUS || this.position.x > c.maxX + PLAYER_RADIUS) continue;
      if (this.position.z < c.minZ - PLAYER_RADIUS || this.position.z > c.maxZ + PLAYER_RADIUS) continue;
      // Only counts if we're at or above it -- you can't be lifted by a ledge
      // you are standing underneath.
      if (c.top > support && c.top <= this.position.y + STEP_HEIGHT) support = c.top;
    }

    if (this.position.y <= support) {
      this.position.y = support;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }

  /** Procedural walk cycle. Phase is driven by distance, not by time. */
  _animate(dt) {
    const c = this.character;
    c.root.position.copy(this.position);
    c.root.rotation.y = this.facing;

    // Stride length scales with speed so the feet don't skate.
    this.walkPhase += this.speed * dt * 2.6;

    const stride = THREE.MathUtils.clamp(this.speed / SPRINT_SPEED, 0, 1);
    const swing = Math.sin(this.walkPhase) * (0.42 + stride * 0.5);
    const armSwing = Math.sin(this.walkPhase) * (0.30 + stride * 0.40);

    if (this.onGround) {
      c.legL.pivot.rotation.x = swing;
      c.legR.pivot.rotation.x = -swing;
      c.armL.pivot.rotation.x = -armSwing;
      c.armR.pivot.rotation.x = armSwing;
      // A small vertical bob at twice the stride frequency.
      c.root.position.y += Math.abs(Math.sin(this.walkPhase)) * 0.045 * stride;
      // Lean into a sprint.
      c.torso.rotation.x = stride * 0.12;
    } else {
      // Airborne: tuck the legs and raise the arms slightly.
      c.legL.pivot.rotation.x = THREE.MathUtils.lerp(c.legL.pivot.rotation.x, 0.35, dt * 8);
      c.legR.pivot.rotation.x = THREE.MathUtils.lerp(c.legR.pivot.rotation.x, -0.15, dt * 8);
      c.armL.pivot.rotation.x = THREE.MathUtils.lerp(c.armL.pivot.rotation.x, -0.5, dt * 8);
      c.armR.pivot.rotation.x = THREE.MathUtils.lerp(c.armR.pivot.rotation.x, -0.5, dt * 8);
    }

    // Arms and legs settle to rest when standing still.
    if (this.speed < 0.15 && this.onGround) {
      for (const limb of [c.legL, c.legR, c.armL, c.armR]) {
        limb.pivot.rotation.x = THREE.MathUtils.lerp(limb.pivot.rotation.x, 0, dt * 9);
      }
      c.torso.rotation.x = THREE.MathUtils.lerp(c.torso.rotation.x, 0, dt * 6);
    }
  }

  _updateCamera(dt) {
    // Where the camera is looking: roughly the character's head.
    this._cameraTarget.set(
      this.position.x,
      this.position.y + EYE_TARGET_HEIGHT,
      this.position.z
    );

    // Where it would like to sit: back along the view direction, offset to one
    // shoulder so the character doesn't block the centre of the screen.
    const cosPitch = Math.cos(this.pitch);
    const dirX = Math.sin(this.yaw) * cosPitch;
    const dirY = Math.sin(this.pitch);
    const dirZ = Math.cos(this.yaw) * cosPitch;

    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    let distance = CAMERA_DISTANCE;

    const desiredX = this._cameraTarget.x + dirX * distance + rightX * CAMERA_SHOULDER;
    const desiredY = this._cameraTarget.y + dirY * distance + 0.35;
    const desiredZ = this._cameraTarget.z + dirZ * distance + rightZ * CAMERA_SHOULDER;

    // Pull the camera in if a wall is in the way.
    if (this._obstacles && this._obstacles.length) {
      this._rayDir.set(
        desiredX - this._cameraTarget.x,
        desiredY - this._cameraTarget.y,
        desiredZ - this._cameraTarget.z
      );
      const fullLength = this._rayDir.length();
      this._rayDir.divideScalar(fullLength);

      this._raycaster.set(this._cameraTarget, this._rayDir);
      this._raycaster.far = fullLength;
      const hits = this._raycaster.intersectObjects(this._obstacles, true);
      if (hits.length) {
        // Stop just short of the surface so the near plane doesn't clip it.
        distance = Math.max(0.8, hits[0].distance - 0.35);
      } else {
        distance = fullLength;
      }
    }

    // Scale the shoulder offset down as the boom shortens, so the camera
    // tucks in behind the character rather than swinging sideways into a wall.
    const t = distance / CAMERA_DISTANCE;
    const px = this._cameraTarget.x + dirX * distance + rightX * CAMERA_SHOULDER * t;
    const py = this._cameraTarget.y + dirY * distance + 0.35 * t;
    const pz = this._cameraTarget.z + dirZ * distance + rightZ * CAMERA_SHOULDER * t;

    if (!this._initialisedCamera) {
      this._cameraPos.set(px, py, pz);
      this._initialisedCamera = true;
    } else {
      // Smooth the boom, but snap in fast when something is occluding it --
      // a lagging camera that drifts through a wall looks far worse.
      const lag = 1 - Math.exp(-dt * 14);
      this._cameraPos.x += (px - this._cameraPos.x) * lag;
      this._cameraPos.y += (py - this._cameraPos.y) * lag;
      this._cameraPos.z += (pz - this._cameraPos.z) * lag;
    }

    // Never let the camera end up underground.
    const floor = groundHeight(this._cameraPos.x, this._cameraPos.z) + 0.4;
    if (this._cameraPos.y < floor) this._cameraPos.y = floor;

    this.camera.position.copy(this._cameraPos);
    this.camera.lookAt(this._cameraTarget);
  }
}
