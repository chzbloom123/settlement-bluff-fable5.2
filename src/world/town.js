// The town layout -- what stands where.
//
// The shape is a single highway strip running east to west along the river
// terrace, with a back street of houses behind it. Commercial buildings face
// each other across the main road; the agricultural and utility structures sit
// out at the edges where they'd really be. Keeping the plan this simple means
// the player always knows roughly where they are without a map.

import { MeshBuilder } from './geometry.js';
import { groundHeight } from './terrain.js';
import {
  gasStation, diner, motel, storefront, house, church, waterTower, silos,
  utilityPole, powerLine, carHulk, fenceRun, debrisPile, roadStrip,
  horizonStructures,
} from './ruins.js';

// Street centre lines. Everything else is positioned relative to these.
export const MAIN_STREET_Z = -30;
export const BACK_STREET_Z = -2;
export const CROSS_STREET_X = -6;

/** Where the player starts: the middle of main street, facing the river. */
export const SPAWN = { x: 4, z: MAIN_STREET_Z + 1 };

const NORTH = 0;          // building fronts face +Z, toward main street
const SOUTH = Math.PI;    // building fronts face -Z

export function createTown() {
  const b = new MeshBuilder('town');

  // --- Roads -------------------------------------------------------------
  roadStrip(b, -86, MAIN_STREET_Z, 86, MAIN_STREET_Z, 9.0);
  roadStrip(b, -62, BACK_STREET_Z, 62, BACK_STREET_Z, 7.0);
  roadStrip(b, CROSS_STREET_X, -46, CROSS_STREET_X, 14, 6.5);
  // A gravel track running down off the terrace toward the water.
  roadStrip(b, 22, -46, 30, -78, 5.0);

  // --- North side of main street -----------------------------------------
  gasStation(b, -52, -44, NORTH);
  diner(b, -24, -42, NORTH);
  storefront(b, -2, -44, NORTH, 0);
  storefront(b, 13, -45, NORTH, 1);
  motel(b, 46, -46, NORTH, 6);

  // --- South side of main street -----------------------------------------
  storefront(b, -34, -18, SOUTH, 1);
  storefront(b, -19, -18, SOUTH, 0);
  storefront(b, 2, -18, SOUTH, 0);
  church(b, 32, -16, SOUTH);

  // --- Residential back street -------------------------------------------
  const roofStates = ['intact', 'collapsed', 'intact', 'gone', 'collapsed', 'intact'];
  const houseXs = [-50, -32, -14, 8, 26, 44];
  houseXs.forEach((hx, i) => {
    house(b, hx, 9.5, SOUTH, roofStates[i]);
  });

  // --- Edge structures ----------------------------------------------------
  waterTower(b, 64, -59);
  silos(b, -73, -61, 3);

  // --- Utility poles and wires along the highway --------------------------
  const tops = [];
  for (let px = -66; px <= 66; px += 22) {
    // A slight lean on a couple of poles reads as decades of frost heave.
    const lean = px === -22 ? 0.06 : px === 44 ? -0.05 : 0;
    tops.push(utilityPole(b, px, MAIN_STREET_Z - 6.2, lean));
  }
  powerLine(b, tops);

  // --- Vehicles, abandoned where they stopped -----------------------------
  carHulk(b, -40, MAIN_STREET_Z - 1.6, 0.06);
  carHulk(b, 8, MAIN_STREET_Z + 2.2, Math.PI - 0.3);
  carHulk(b, 37, MAIN_STREET_Z - 2.4, 0.9);
  carHulk(b, -14, 1.5, 1.7);
  carHulk(b, 55, -50, 2.4);
  carHulk(b, -60, -36, 0.4);

  // --- A fenced yard behind the storefronts -------------------------------
  fenceRun(b, 56, -22, 78, -22);
  fenceRun(b, 78, -22, 78, -4);
  fenceRun(b, 78, -4, 56, -4);
  debrisPile(b, 68, -13, 4.2);
  debrisPile(b, 60, -8, 2.4);

  // --- Rubble where buildings have already gone ---------------------------
  debrisPile(b, 24, -44, 5.0);   // a gap in the north commercial row
  debrisPile(b, -66, -20, 3.6);
  debrisPile(b, -6, 9.5, 3.0);   // a house lot that burned
  debrisPile(b, 62, 6, 2.8);
  debrisPile(b, -40, -58, 3.2);

  // --- Horizon backdrop ---------------------------------------------------
  horizonStructures(b);

  const group = b.build();
  return { group, colliders: b.colliders };
}

/** The player's starting position, sitting on the ground. */
export function spawnPoint() {
  return { x: SPAWN.x, y: groundHeight(SPAWN.x, SPAWN.z), z: SPAWN.z };
}
