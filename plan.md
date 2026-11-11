# Plan v2 — Hanford Reach Settlement Builder

Written 2026-11-11. Replaces the 2026-11-10 plan (still in git history). **Status: reviewed by Chaz, all decisions made. Milestone 0 is done and waiting for his playtest. Milestone 1 is next.**

## How this review was done

1. Read the brief (now `CLAUDE.md`), the previous plan, and every file under `src/` (about 3,400 lines).
2. Built the game and rendered it in headless Chromium from 12 fixed viewpoints on the High and Medium presets. Seven of those frames are in `docs/review/`.

Two limits on what that tells us:

- **This cloud session has no graphics card.** Chromium reported the SwiftShader software renderer. The frames show correctly what the code draws, but they say nothing about frame rate. Real frame rates have to be measured on your hardware (Milestone 0 adds a one-key report for that).
- I posed still frames; I did not play it with a mouse. Notes on how the camera and movement *feel* come from reading the code.

## Where things really stand

The previous plan called Phase 1 "done, and done well." The code is clean and well organised, and the world is walkable. But that plan was written without rendering the game, and the picture has serious problems. Phase 1 is structurally done and visually unfinished.

### What the renders show

| # | Problem | Cause in the code | Frame |
|---|---|---|---|
| 1 | The first thing the player sees is a black wall. | Spawn yaw is π, which faces **south** into a shadowed storefront 8 m away. The comment says "facing the river"; the river is north. | [01](docs/review/01-spawn.jpg) |
| 2 | Shadows, roads and shaded walls are near-black. | Sun is only 22° high, there is almost no fill light in shadow, and the grade then adds contrast 1.14, a heavy vignette and a cool shadow tint. Asphalt is also authored very dark. | [02](docs/review/02-main-street.jpg) |
| 3 | Cars, the water tower, roofs and sign frames are black silhouettes. | The `rust` material is 65% metallic, and the scene has no environment map. A metal with nothing to reflect renders black. | [02](docs/review/02-main-street.jpg) |
| 4 | Storefront display windows and doors are bricked up with cracked concrete. | `storefront()` builds a solid concrete front wall first, then lays the painted wall with openings over it, so the openings show concrete. | [03](docs/review/03-storefront.jpg) |
| 5 | Shadow edges are saw-toothed. | `PCFSoftShadowMap` is deprecated in three r185 and silently falls back to hard shadows. One shadow map covers 260 m, so a texel is 6 cm on High and 14 cm on Low. | [03](docs/review/03-storefront.jpg) |
| 6 | A huge black slab hangs in the air on the way to the river. | `roadStrip()` lays flat boxes at one height each. That works on the flat terrace and fails on the slope down to the water. | [04](docs/review/04-river-track.jpg) |
| 7 | On High, every bush and grass tuft sits in a dark rectangle. | The ambient-occlusion pass ignores texture cut-outs, so it shades the whole invisible quad. Medium has no AO and no rectangles. | [05](docs/review/05-steppe-high-ao.jpg) vs [06](docs/review/06-steppe-medium-no-ao.jpg) |
| 8 | Half of each sagebrush is black. | Double-sided cut-out quads light their back faces with a flipped normal. | [06](docs/review/06-steppe-medium-no-ao.jpg) |
| 9 | Peeling paint reads as leopard spots, and the tiling is obvious. | One noise blob pattern, repeated every 2.2 m on every wall. | [03](docs/review/03-storefront.jpg) |
| 10 | The "distant industrial silhouettes" are plain grey boxes standing in the river. | `horizonStructures()` places them at z = −104 to −134, which is the river channel. | [07](docs/review/07-aerial.jpg) |
| 11 | The world visibly ends. | The terrain is a 420 m square with cut edges; the far bluff is a slab. | [07](docs/review/07-aerial.jpg) |
| 12 | The river is a flat white-grey sheet. | No shoreline blend, no depth colour, and the sparkle term is too strong. | [04](docs/review/04-river-track.jpg) |
| 13 | The character is a stack of plain boxes. | Intentional in Phase 1, but it clashes with the "big-budget 2010 game" look the grade is aiming for. | all |

### Problems found by reading the code

- **A and D were swapped.** Found by Chaz in play; the sideways vector in `player.js` had both signs flipped. Fixed in Milestone 0.
- **Nothing stops the player leaving the map or walking along the river bed.** There are no world bounds and no water handling.
- **No building can be entered.** Every building is one solid collision box with a black box inside. That matters for a game about making a home.
- **Building sizes depend on build order.** `ruins.js` uses one shared random stream. Rebuilding one ruin later (restore, remove) would change the size of others. Each ruin needs its own seed.
- **The camera boom is expensive and twitchy.** It raycasts every frame against the full terrain (103,000 vertices on High) and all town geometry, including power cables, so the camera pops inward when a cable crosses it.
- **The starting quality is guessed from CPU core count**, which says nothing about the graphics chip. Changing quality reloads the page.
- **All vegetation is drawn every frame**, wherever the camera points (17,000 grass + 5,200 sage instances on High, culling off).
- **High runs about ten full-screen passes** (AO, bloom, tone map, grade, SMAA). On integrated graphics, full-screen passes are the main cost.
- Console warnings on every load: `THREE.Clock` deprecated, `PCFSoftShadowMap` deprecated. Cleared in Milestone 0.
- The F3 panel reported 1 draw call and 0 triangles, because it read the counters after the last post-processing pass. Fixed in Milestone 0.

## Review of the previous plan

| Section | Verdict |
|---|---|
| §1 Housekeeping | Agree with all of it. Folded into Milestone 0. |
| §2 Architecture (per-ruin meshes, dynamic colliders, vegetation clearing, save format) | Agree. Three changes: give each ruin its own random seed; replace the camera raycast with a maths test against collider boxes and the height function (no new library); do the refactor *while* reworking the buildings, so `ruins.js` is rewritten once, not twice. |
| §3 Fixes (F3, jump repeat, shadow shimmer, SMAA order, Clock) | All correct. Shadow shimmer is solved by the cascaded shadows in Milestone 1. |
| §4 Feature roadmap | Keep as written. Moved after the visual, smoothness and interface work, as you asked. |
| §5 Performance | Correct but too light. It has no way to measure, and misses culling, pass count and resolution scaling. |
| Missing entirely | Any visual review, any interface design beyond a list of keys, walkable interiors, world bounds. |

## Decisions

| # | Decision | Status |
|---|---|---|
| 1 | **Art direction:** a stylised golden-hour diorama, fully procedural. Clean shapes, strong warm light, soft shadows, a dusty palette with a few saturated accents. | Agreed |
| 2 | **Interiors:** ruins stay closed with a dim visible interior; a building becomes walkable when Brie restores it. | Agreed |
| 3 | **Camera:** first person, with the third-person view kept on a toggle key. First person solves today's problems; the toggle leaves room for a better character later. | Agreed — reasoning below |
| 4 | **Hardware:** Brie plays on an older gaming PC, roughly a GTX 1070. The look is tuned for that machine: High preset, 60 fps at 1080p. Chaz's integrated-graphics PC must stay playable on Low for testing, but does not limit the art. | Agreed |
| 5 | **Hosting:** Vercel only. `netlify.toml` is deleted. | Done |
| 6 | **Merging:** one draft pull request per milestone; Chaz plays the Vercel preview and merges. | Agreed |

### Decision 3: first person or third person

**Decided: first person, keeping the current third-person view on a toggle key.**

Why first person suits this game:

- **The character is the weakest thing on screen, and it is in the centre of every frame.** A procedural rebuild would be better proportioned and better animated, but it would still read as a mannequin. A real improvement needs a rigged, animated model from outside, which is the heaviest single asset job in the project.
- **Building is more exact.** The piece goes where you look. Third-person placement has to guess between the character and the camera.
- **Interiors work.** A third-person camera in a 3 m room fights the walls constantly. Decision 2 makes Brie's restored buildings walkable, so this matters.
- **The town feels larger** at eye height, and gathering becomes "look at it, press E".
- **Less camera code.** The boom collision problems in Milestone 2 mostly disappear.

What it costs:

- **Some people get motion sick in first person.** Mitigations: a field-of-view setting, no head bob by default, a small centre dot.
- **Surfaces are seen from half a metre away**, so wall and ground textures need more close-up detail in Milestone 3.
- **Brie never sees herself in her town.** The toggle answers that: the existing body stays (it has to cast a shadow anyway), so stepping back to third person costs little. The body gets a tidy-up, not a rebuild.

The fixed viewpoints from `npm run shots` are already rendered at eye height, so they show what first person looks like today.

## Milestones

Each milestone is one pull request and ends at a playtest checkpoint. Sizes are relative: S, M, L.

### M0 — Housekeeping and measuring tools (S) — done

- Rename the brief to `CLAUDE.md`; write `README.md` and `BUILDLOG.md`; pin Node; settle on Vercel.
- `npm run shots`: renders the fixed viewpoints, so every visual change comes with before/after frames.
- A performance panel on **F3** (average frame rate, 1% low, worst frame, resolution, draw calls) and a full report copied to the clipboard on **F4**. You paste it to me from the real machine.
- Fix A and D being swapped.
- Unit tests (Vitest) for logic that must never break: save data, inventory, collision.
- Clear the two deprecation warnings.

**Done when:** the shots script runs in one command (done), and you have pasted me one F4 report from your PC and, when possible, one from Brie's (still to do).

### M1 — Light and exposure (M)

The largest improvement per line of code. No geometry changes.

- Spawn facing the river, with a composed first view.
- Sky-based environment lighting, so metal reflects the sky and shadows get blue fill.
- Rebalance sun height, sun and sky strength, exposure and the grade. Tone down contrast, vignette and grain.
- Cascaded shadow maps with a soft filter, replacing the single deprecated one.
- Ambient occlusion that respects foliage cut-outs, at half resolution.
- Merge tone mapping and grading into one pass; antialias before grain.
- Sky: thin procedural cloud layers, a real sun disc, haze that matches the fog.

**Done when:** in all fixed viewpoints nothing important is unreadably dark, cars and metal read as rusted steel, shadows have clean soft edges, and the bush rectangles are gone.

### M2 — Structure and smoothness (M)

- Each ruin becomes its own record with a stable id, its own seed, its own meshes and colliders (previous plan §2).
- Collision: a spatial grid, add/remove by id, properly rotated boxes.
- Camera (per decision 3): a first-person view with field-of-view and head-bob settings; the third-person view kept on a toggle with maths-based collision that ignores thin objects.
- Movement: fixed 60 Hz simulation with interpolated rendering, jump once per press, a wading limit at the river, soft world bounds.
- Culling: vegetation split into chunks; buildings culled individually.
- Resolution that adapts to hold the frame rate; starting preset chosen by a two-second measurement; quality changes without a page reload.

**Done when:** walking feels better than before, the High preset is designed to hold 60 fps at 1080p on a GTX 1070 (confirmed by an F4 report from Brie's PC when one is available), Low is playable on Chaz's PC (we agree the number after his first report), and the camera no longer pops under power lines.

### M3 — World art pass (L)

- Buildings: real window and door openings with frames, broken glass, trim, fascia, corrugated roofing, brick chimneys, dim interiors, sign shapes.
- Surfaces: weathering that follows edges and ground level instead of uniform spots; large-scale variation to hide tiling.
- Roads: ribbons that follow the ground, soft edges, faded centre line, weeds in cracks; a real gravel track to the river.
- Terrain: rock on steep faces, strata on the bluffs, a wet band at the shore, and a ring of low distant hills so the map never ends.
- Water: depth colour, shoreline blend, sky reflection, calmer sparkle.
- Plants: correct lighting, per-plant colour variation, fuller sagebrush, rabbitbrush in yellow bloom, tumbleweeds.
- Horizon: reactor-block and stack silhouettes far off on the plateau, in haze.
- Close-up detail on walls and ground for eye-height viewing; a tidy-up of the character body (per decision 3).

**Done when:** you walk the whole town on the preview and nothing reads as a placeholder.

### M4 — Interface (M)

- Title and pause screen: resume, quality, mouse sensitivity, invert-Y, volume, key list.
- A HUD visual language (enamel-sign and typewriter flavour, bundled font, no network requests) for prompts, inventory, notices and the build bar.
- Interaction prompt and a small reticle.
- Comfort options: interface scale, reduced motion (no grain, no camera bob).
- Friendly messages when WebGL is missing or something fails.
- Plain HTML and CSS, no framework, so it stays readable for a beginner.

**Done when:** a new player can start, pause, change settings and resume without being told a key.

### M5 — Gather (Phase 2) · M6 — Build (Phase 3) · M7 — Persist (Phase 4) · M8 — Polish and Brie (Phase 5)

As in the previous plan §4, with these changes:

- The save format and autosave go in at the start of M5, not in M7. M7 becomes hardening: versioned migration, export/import file, tab-close tests.
- M6 includes vegetation making way for structures, and walkable restored buildings (per decision 2).
- M8: ambient audio, a slow day-to-dusk cycle with lit windows in restored buildings, ambient wildlife, and the touch for Brie.

## How we work

- One draft pull request per milestone, with before/after frames from `npm run shots`.
- You check the Vercel preview on real hardware and send an F3 report.
- `BUILDLOG.md` is appended at the end of every session, as the brief requires.
- The scope fence in the brief stands: no combat, no NPCs, one map, local saves only.

## Software and connections

| Tool | Recommendation |
|---|---|
| Blender | **Not now.** The art direction is fully procedural, and first person removes the main reason to import a model. If that changes, I can install it headless here. A live link to Blender on your small PC would not help. |
| A GPU for this session | Would let me measure frame rate here. Not required: Brie's machine is the real target, and the F4 report covers it. |
| Vercel connector | Optional. It currently refuses access to your team scope. Authorising it lets me read preview build status and logs. |
| New npm packages | `vitest` (tests) only. No rendering libraries beyond three.js. |

## Not verified

- Frame rate on any real graphics chip.
- That your screen shows the same darkness as these software-rendered frames. The lighting maths is the same on any renderer, so I expect it to, but please confirm.
- How movement and the camera feel in the hand.
