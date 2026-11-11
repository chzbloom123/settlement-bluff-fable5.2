# Hanford Reach — Settlement Builder

A cozy settlement-building game set in the ruins of a small town on the Columbia River. Made as a gift for Brie. It runs in a browser and needs no install to play.

- The design brief is in [`CLAUDE.md`](CLAUDE.md).
- The roadmap is in [`plan.md`](plan.md).
- What has been built so far, session by session, is in [`BUILDLOG.md`](BUILDLOG.md).

## Run it on your computer

You need [Node.js](https://nodejs.org) version 20.19 or newer. Then, in a terminal opened in this folder:

```bash
npm install
```

```bash
npm run dev
```

The game opens in your browser. Leave the terminal open while you play; press Ctrl+C in it to stop.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Shift | Run |
| Space | Jump |
| Mouse | Look (click the game first) |
| Esc | Release the mouse |
| H | Hide the key list |
| Q | Change quality: Low, Medium, High (reloads the page) |
| F3 | Show performance numbers |
| F4 | Copy a performance report to the clipboard |

Adding `?q=low`, `?q=medium` or `?q=high` to the address forces a quality level for that visit.

## Other commands

| Command | What it does |
|---|---|
| `npm run build` | Builds the finished site into `dist/` |
| `npm run preview` | Serves the built site locally, to check it before deploying |
| `npm test` | Runs the automated tests |
| `npm run shots -- name` | Renders the game from 12 fixed viewpoints into `shots/name/`, for before/after comparisons. Needs Playwright; the instructions are at the top of `tools/shots.mjs` |

## Deploying

The site is hosted on Vercel, which is connected to this GitHub repository. Every push to `main` is built and published automatically. Every pull request gets its own preview link, so a change can be played before it is merged. No configuration file is needed.

## How the code is organised

| Folder | What lives there |
|---|---|
| `src/main.js` | Start-up and the frame loop |
| `src/core/` | Input, quality settings, noise functions, frame-time statistics |
| `src/render/` | The renderer, post-processing, and the textures (all drawn in code at load time) |
| `src/world/` | Terrain, sky, water, the town's buildings, vegetation |
| `src/player/` | The character, movement and camera |
| `src/ui/` | The on-screen display and its styles |
| `tests/` | Automated tests |
| `tools/` | Development tools that are not part of the game |
| `docs/review/` | Screenshots referred to by `plan.md` |
