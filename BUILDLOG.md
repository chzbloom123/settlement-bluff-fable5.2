# Build log

Read this at the start of each session. Append to it at the end: what was built, what was decided, and anything broken or deferred. Newest entry last.

---

## Phase 1 — the world is walkable (before 2026-11-10)

Built on a small PC with integrated graphics, then pushed to GitHub and hosted on Vercel. Reconstructed from the code; no log was kept at the time.

**Built**
- Stack: Three.js r185 and Vite 8. No other runtime dependencies. Nothing is downloaded at run time; every texture is drawn in code at load.
- Terrain from deterministic noise: river channel, gravel bank, town terrace, steppe, a basalt rim and bluffs across the water.
- A town on a highway strip: gas station, diner, motel, five storefronts, church, six houses, water tower, silos, poles and wires, car hulks, fences, rubble.
- Instanced grass, sagebrush and rocks with wind sway; dead cottonwoods.
- Custom sky and water shaders, a post-processing chain (ambient occlusion, bloom, colour grade, antialiasing), and Low / Medium / High quality presets.
- A third-person character with a walk cycle, box collision and a step-up allowance.

**Decided**
- Camera: third-person, over the shoulder.
- Time of day: fixed late afternoon.
- Signage is shapes only, never words.

## 2026-11-11 — review, plan v2, Milestone 0

**Reviewed**
- Read all the code and rendered the game from fixed viewpoints. The findings, with screenshots, are in `plan.md`. In short: the structure is sound, and the picture has serious problems (too dark, black metal, bricked-up storefronts, hard shadows, a spawn that faces a wall).
- The session had no graphics card, so nothing about frame rate was measured.

**Built (Milestone 0)**
- Fixed A and D being swapped. A test now checks movement against the camera.
- F3 shows average frame rate, the 1% low, the worst frame, resolution and true draw-call counts. F4 copies a full report, including the graphics chip, to the clipboard.
- `npm run shots` renders 12 fixed viewpoints for before/after comparison.
- `npm test` (Vitest), with tests for frame statistics and movement direction.
- `?q=` forces a quality preset for one visit. `?debug` exposes the debug hooks on a built site; they are otherwise only on the dev server.
- Cleared two deprecation warnings: `THREE.Clock` became `THREE.Timer`, and the deprecated soft shadow type was replaced with the one it already fell back to.
- F3 no longer opens the browser's find bar.
- Renamed the brief to `CLAUDE.md`, wrote `README.md` and this log, pinned Node to 20.19 or newer, removed `netlify.toml`.

**Decided**
- Hosting is Vercel only.
- Brie plays on an older gaming PC with roughly a GTX 1070. That is the machine the look is tuned for. Chaz's integrated-graphics PC must stay playable on Low for testing, but does not limit the art.
- One draft pull request per milestone; Chaz plays the preview and merges.
- Camera: first person, with the third-person view kept on a toggle key. First person fixes today's problems (weak character model, awkward building and interiors); the toggle leaves room for a better character later. The switch itself is Milestone 2 work.

**Open**
- No performance report from real hardware yet.

## 2026-11-11 — Milestone 1: light and exposure

Milestone 0 was merged after Chaz's playtest. He reported that A and D were fixed, that the mouse felt touchy, and that the picture flickered in places.

**Built**
- **Sun:** cascaded shadow maps (three's CSM helper) replace the single shadow map. Two cascades on Low, three on Medium and High. Edges are soft and snap to whole texels, so they no longer crawl. Every lit material must now be created through `lit()` in `src/render/shadows.js`; a material that skips it is lit once per cascade and comes out far too bright.
- **Sky light:** the sky is rendered once into a small cube map and used as the scene's environment. Shadows are filled with sky colour and metal has something to reflect. The old hemisphere and fill lights are gone.
- **Sun position:** 27 degrees up and further west, so shadows fall along main street instead of across it.
- **Exposure and grade:** tone mapping and the grade are one pass (`FinalPass` in `src/render/grade.js`). The curve is Khronos Neutral, which keeps colours true. Contrast, vignette and grain are much lighter, and chromatic aberration is removed.
- **Material brightness:** material tints were multiplying already-dark textures. Tints are now near white, asphalt is a weathered mid grey, and rust is mostly non-metallic.
- **Ambient occlusion:** runs at half resolution, leaves cut-out plants out of its geometry pass (no more dark rectangles), and no longer re-renders the shadow maps. Medium now has it too.
- **Sky:** thin drifting cirrus, a sun disc that blooms, warmer haze toward the sun.
- **Plants:** lit evenly from both sides instead of half black.
- **Roads:** one draped ribbon per road with soft shoulders (`ROADS` in `src/world/town.js`). The river track no longer hangs in the air, and plants keep off every road.
- **Storefronts:** the display windows and doors are open. A second, solid front wall had been built in the same place.
- **Arrival:** the player starts at the west end of main street looking east, sun behind.
- **Mouse:** oversized single jumps are ignored; `[` and `]` change the speed and it is remembered. A small on-screen notice shows the new value.
- **Tools:** `npm run shots` gained view `00-arrival`, rendered with the game's own spawn point and camera.

**Decided**
- Tone curve: Neutral over AgX (too flat without heavy grading) and ACES (crushed shadows, shifted hues).
- Bloom only above the brightness of a sunlit white wall.
- Low keeps shadows on two small cascades instead of dropping them.

**Checked**
- 13 tests pass; all three presets render with a clean console; all 13 viewpoints rendered and reviewed.
- Not checked: frame rate, and whether the flicker is gone in motion. This session has no graphics card and renders still frames only.

**Known, scheduled**
- Leopard-spot paint, blobby rust and asphalt textures, black tyres, the car parked through a porch, grey boxes on the horizon, the visible world edge, the flat river: Milestone 3.
- Holding Space repeats the jump; the camera pops under power lines: Milestone 2.
