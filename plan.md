# Improvement Plan — Hanford Reach Settlement Builder

Review date: 2026-11-10. Reviewed the design brief (`settlement_builder_1.md`) and all source under `src/`.

## Where things stand

**Phase 1 (walk around the ruins) is done, and done well.** There's a third-person character, terrain made from deterministic noise, a merged-geometry town, instanced vegetation with wind sway, a custom sky and water, a post-processing grade, quality presets and a loading screen. The code is clean and well commented.

**Phases 2–5 haven't started.** Gathering, building, saving and the touch made for Brie don't exist yet. Two files the brief requires are also missing: `BUILDLOG.md` and `README.md`.

The items below are in priority order. Section 1 is housekeeping to do before any feature work. Section 2 is architecture changes that are cheap now and expensive later. Sections 3–5 are smaller fixes and polish.

---

## 1. Housekeeping (do first)

- [ ] **Rename `settlement_builder_1.md` to `CLAUDE.md`.** Its own heading says it's meant to be `CLAUDE.md`. Claude Code only loads it automatically under that name, so on the other PC the brief would otherwise be ignored.
- [ ] **Create `BUILDLOG.md`.** The brief says Phase 1 should create it. Seed it with what Phase 1 built: the stack (Three.js r185 + Vite 8), the camera choice (third-person, over the shoulder), the fixed late-afternoon sun, the quality presets, and anything deferred.
- [ ] **Create `README.md`** for a beginner, giving the exact commands:
  - `npm install`, `npm run dev`, `npm run build`
  - how to deploy
  - a one-line description of each folder (`core/`, `render/`, `world/`, `player/`, `ui/`)
- [ ] **Settle the deploy target.** The brief and `netlify.toml` say Netlify, but you're now using Vercel.
  - On Vercel, import the repo. It detects Vite on its own (build `npm run build`, output `dist`), so no config file is needed.
  - Keep `netlify.toml` (it's harmless) or delete it, and update the "Deploy target" line in the brief to match.
- [ ] **Pin the Node version.** Vite 8 needs Node ≥ 20.19. Add `"engines": { "node": ">=20.19" }` to `package.json` so Vercel, Netlify and both PCs all use a compatible version.
- [ ] **Add the Q (cycle quality) key to the controls list in `index.html`.** It works but isn't listed.

## 2. Architecture changes to make before Phase 3 (building)

These are the main findings. The current structure is fine for walking around a fixed scene, but it gets in the way of "restore this ruin" and "remove what I built."

- [ ] **Give every ruin its own merged mesh.** At the moment `createTown()` uses one `MeshBuilder`, so the whole town becomes one mesh per material. Restoring or removing a single building would mean rebuilding the whole town. Instead:
  - Have each ruin function (`gasStation`, `diner`, …) fill its own builder and return a `{ id, group, colliders, footprint }` record.
  - Keep those records in a registry keyed by a stable id, e.g. `"gas-station"` or `"house-3"`. Save data will reference these ids.
  - This also brings back frustum culling: right now the whole town is drawn even when it's behind the camera.
  - Draw calls rise from about 10 to about 10 × the number of buildings. That's still fine on the target hardware.
- [ ] **Make colliders dynamic.**
  - `player.colliders` is a flat array scanned every frame, and nothing can be added to or removed from it after load.
  - Add `addColliders(id, list)` and `removeColliders(id)`. A simple uniform grid (cells of about 8 m) would keep collision checks cheap as she builds.
- [ ] **Make camera collision cheap.** `_updateCamera` raycasts against the full terrain mesh (100k+ vertices) and the whole town on every frame. Options:
  - Raycast only against nearby per-building groups (this follows from the first item).
  - Or test the camera ray against the collider boxes plus the `groundHeight()` function instead of the triangles.
  - Or add `three-mesh-bvh`.
- [ ] **Let vegetation make way for structures.** Grass and sage are placed once at load and avoid only the original colliders. Anything she builds later will have bushes poking through the floor. Keep a placement index for each `InstancedMesh` so instances inside a new footprint can be hidden (scale them to 0) and shown again when the structure is removed.
- [ ] **Decide the save format now, before Phase 2 writes any state.**
  - Use one key, e.g. `hanford.save.v1`, holding `{ version, inventory, structures: [{ id, type, x, z, rotY }], ruinsState: { [ruinId]: 'ruined' | 'cleared' | 'restored' }, collected: [nodeIds] }`.
  - Gather points come from a seed, so a stable id per node is enough to remember what's already been collected.
  - Save on every change (it's tiny) and again on `visibilitychange`/`pagehide`.
  - Include a `version` field and a migration step so later updates don't wipe her town.
- [ ] **Save before the quality toggle reloads the page.** Pressing Q calls `window.location.reload()`. That's harmless today, but once progress exists it must save first.

## 3. Correctness and robustness fixes

- [ ] **Stop F3 opening the browser's find bar.** F3 is "find next" in Chrome and Edge. Call `e.preventDefault()` for F3 (and for any other function keys you bind) in `Input._onKeyDown`.
- [ ] **Stop shadows shimmering while walking.** The sun's shadow camera follows the player continuously, so shadow edges crawl. Round the shadow camera's position to whole shadow-map texels: texel size = `2 * shadowDistance / shadowMapSize`.
- [ ] **Show a friendly message when WebGL isn't available.** If `createRenderer` throws, the player only sees "something broke -- check the console." Catch that case and say "This browser/GPU can't run WebGL 2 — try Chrome or Edge with hardware acceleration on."
- [ ] **Stop holding Space from bouncing on repeat.** Make jump fire once per press, using `onPress` or a "jump released" check.
- [ ] **Move SMAA earlier in the chain.** It currently runs after the grade, so it softens the film grain and vignette. Order it as Output → SMAA → grade, or turn the grain down to match.
- [ ] **Replace `THREE.Clock`** with `THREE.Timer` if r185 marks `Clock` deprecated (check the console for warnings).
- [ ] **Reduce oversized colliders on rotated objects.** `collideBox` uses the bounding square for rotated boxes, so the car hulks at 0.9 and 2.4 rad block more ground than they look like they cover. Either accept it or split each car into two smaller boxes.
- [ ] **Clean up the loading-overlay timer.** `finishLoading` uses a hard-coded `setTimeout(950)` that must stay in sync with the CSS transition. Listen for `transitionend` instead.

## 4. Feature roadmap (from the brief)

### Phase 2 — Gather
- [ ] Salvage nodes with a stable id each: scrap piles at the debris piles, timber from the collapsed houses, glass at the storefronts, sage and cottonwood out on the steppe, river stone on the gravel bar.
- [ ] Interaction: aim at or stand near a node and press **E** to pick it up, with a short hold time and a soft pickup sound or visual pop.
- [ ] An inventory HUD showing 5–7 resources with names that fit the setting (e.g. *Scrap Tin*, *Weathered Board*, *Basalt*, *Sage Bundle*, *Copper Wire*, *Old Glass*).
- [ ] Respawn rule: landscape nodes regrow slowly, ruin salvage is used up for good.

### Phase 3 — Build
- [ ] A build mode toggle (**B**) and a radial or bottom-bar catalog of about a dozen pieces: walls, gate, water barrel, garden bed, lean-to, lookout, string lights, porch swing, windmill, and so on.
- [ ] A ghost preview tinted green or red for valid or invalid placement, with grid snapping and **R** to rotate.
- [ ] Restoring ruins: select a ruin footprint to clear it (which pays out salvage), then rebuild it. This depends on the per-ruin meshes from Section 2.
- [ ] Removal with a full refund, plus one level of undo (**Ctrl+Z**).

### Phase 4 — Persist
- [ ] Use the schema from Section 2. Test by closing the tab mid-build and reopening it, in both Chrome and Edge.
- [ ] Optional: export and import the save as a JSON file, as a backup if browser data gets cleared. This stays within the "local only" rule.

### Phase 5 — Polish and Brie
- [ ] Ambient audio (wind, distant river, a creaking sign), using WebAudio started on the first click.
- [ ] A slow day–dusk cycle. Windows of restored buildings light up at dusk, so "the place feels more alive" is something she can see.
- [ ] A personal touch for Brie, to be decided. Ideas: a hand-painted welcome sign that shows her name once the town gate is built, or a mailbox at the first restored house.

## 5. Performance notes

- The terrain is 320² segments on High, about 100k vertices. That's fine for drawing but expensive to raycast (see Section 2).
- The camera's far plane is 340–520 m and the sky sphere is about 924 m. The sky only renders because `gl_Position = pos.xyww` forces it to the far plane; keep it that way if the sky is ever changed.
- `GTAOPass` at 12 samples is the most expensive pass. Consider using 8 samples on High and checking on the mini PC.
- Hide the `window.hanford` debug global behind `import.meta.env.DEV` so it isn't in production builds.

---

## Suggested order of work

1. Do Section 1, then commit.
2. Do the Section 2 refactor (per-ruin meshes and dynamic colliders), then check that walking around still feels the same.
3. Phase 2, with the save format in place from day one.
4. Phase 3, then Phase 4 hardening, then Phase 5.
5. Pick off the Section 3 fixes along the way.
