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

**Known broken, scheduled**
- Everything in the findings table in `plan.md`. Lighting is Milestone 1.
- Holding Space repeats the jump. Scheduled for Milestone 2.
