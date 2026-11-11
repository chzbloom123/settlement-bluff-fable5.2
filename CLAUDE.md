# CLAUDE.md — Hanford Reach Settlement Builder

## What this is

A settlement-building game, made as a gift for one specific player: Brie. She rebuilds the ruins of an old town in the Hanford Reach — a fictional post-apocalyptic world set along the Columbia River in southeastern Washington State. She explores the map, gathers resources from the ruins and the landscape, and uses them to rebuild the town into her own settlement fortress, piece by piece, her way.

This is a cozy, personal project. Success looks like one person losing an afternoon happily rebuilding a home-fort  — not like a completed commercial game.

## The vision

Fallout-settlement-mode energy without Fallout's violence: the satisfaction of standing in a ruin, seeing what it could become, and making it so. The world should feel weathered and quiet — wind, dust, rust, river light — but hopeful. Every structure she raises should make the place feel a little more alive.

The Hanford Reach flavor matters. Think: decayed mid-century small-town America, sagebrush steppe, basalt cliffs, the Columbia River, distant decommissioned industrial silhouettes. Signage, ruins, and salvage should feel native to that world. Invent freely within it.

## Your creative authority

You (the implementing model) choose:

- **Engine and stack.** Whatever you build best. Only hard requirements: runs in a normal browser, deploys as a static site to Vercel, playable with mouse/keyboard, no install for the player.  
- **Camera and dimensionality.** 3D, isometric, top-down — your call. Pick what lets you show off the world and keep building feel good.  
- **Art direction.** Generate/produce the visuals however suits your strengths. Aim for atmosphere over asset count. Palette, lighting, and mood are yours to own within the Hanford Reach flavor above.  
- **The specific content.** Which ruins exist, what resources are called, what buildable structures there are, how the town is laid out. Surprise us. A dozen buildable things done with character beats fifty done generically.

Do not ask permission for creative choices inside the fence. Make them, and note them in the build log.

## The scope fence (hard limits — do not cross, do not suggest crossing)

- **No combat.** No shooting, no weapons, no enemies, no monsters, no raiders, no tower defense. Ever. Do not propose it.  
- **No NPCs or dialogue systems.** The world is quiet. (Ambient wildlife/flavor is fine.)  
- **One settlement, one map.** No overworld, no procedural worlds, no multiple saves-as-towns.  
- **Single player, local only.** No accounts, no multiplayer, no backend. Save state lives in the browser (localStorage or similar) and must survive closing the tab.  
- **Gift-sized.** If a feature doesn't serve "Brie happily rebuilds a town," it's out of scope.

## Core loop (must exist, in this order of priority)

1. **Move** — Brie controls a character/viewpoint and explores the map.  
2. **Gather** — resources are found/salvaged around the map and tracked in an inventory.  
3. **Build** — she spends resources to construct/restore structures, placed deliberately (on ruin footprints, cleared lots, or free placement — your design call), and can also remove/undo.  
4. **Persist** — her settlement is exactly as she left it next visit.

Everything else — day/night, ambient audio, weather, decorations, little discoveries hidden in ruins — is welcome polish *after* the loop works.

## Build phases and checkpoints

Work in phases. Stop at each checkpoint for a human playtest before continuing. "Playable beats pretty" at every checkpoint — but if you can make it pretty at the same time, do.

- **Phase 1:** World is visible and traversable. Checkpoint: Chaz walks around the ruins.  
- **Phase 2:** Gathering \+ inventory works. Checkpoint: Chaz fills his pockets.  
- **Phase 3:** Building works, with costs and removal. Checkpoint: Chaz raises and demolishes something.  
- **Phase 4:** Save/load is solid. Checkpoint: close tab, reopen, nothing lost.  
- **Phase 5:** Polish and Brie-personalization (a touch that's hers — your invention, tasteful). Checkpoint: hand-off.

At the start of each session, read `BUILDLOG.md` (create it in Phase 1\) for current state; at the end of each session, append what you built, what you decided, and anything broken or deferred.

## Working notes

- Keep the codebase navigable by a beginner: clear file names, a short `README.md` explaining how to run it locally and how it's organized, comments where logic is non-obvious. The project owner is new to modern dev tooling — when you tell him to do something in the terminal, give the exact command.  
- Prefer boring, reliable persistence and input handling; spend the ambition budget on the world and the building feel.  
- Performance target: smooth on a mid-range mini PC and a laptop browser. If a visual ambition threatens that, scale the ambition.  
- Deploy target: Vercel static hosting (it builds every push; pull requests get their own preview link). Keep the build output self-contained.

## The one-sentence test

Before adding anything, ask: *does this help Brie enjoy rebuilding her town?* If not, leave it out.  
