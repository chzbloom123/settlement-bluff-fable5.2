// Renders the game from a fixed set of viewpoints and saves each as a PNG.
//
// Run it before and after a visual change and compare the two folders:
//
//   npm run shots -- before          -> shots/before/*.png
//   (make the change)
//   npm run shots -- after           -> shots/after/*.png
//
// Options:
//   --q=low|medium|high   quality preset to render with (default: high)
//   --only=01,07          render just these views
//   --no-build            reuse the existing dist/ folder
//
// It needs Playwright, which is not a dependency of the game itself:
//   npm install --no-save playwright && npx playwright install chromium
//
// The frames are rendered on whatever graphics the machine has. On a machine
// with no GPU they are still correct pictures, just slow to produce -- so
// this tool is for checking how the game LOOKS, never how fast it runs.

import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';

// `up` is metres above the ground at that spot. North (the river) is -z,
// west is -x, and the sun sits low in the west-southwest.
const VIEWS = [
  // What the player sees on arrival. Uses the game's own spawn point and camera.
  { name: '00-arrival', asPlayer: true },
  { name: '01-spawn-to-river',     eye: { x: 4, z: -29, up: 1.7 },     target: { x: 4, z: -60, up: 1.5 } },
  { name: '02-main-street-west',   eye: { x: 40, z: -30, up: 1.7 },    target: { x: -60, z: -30, up: 2 } },
  { name: '03-main-street-east',   eye: { x: -45, z: -30, up: 1.7 },   target: { x: 60, z: -30, up: 2 } },
  { name: '04-gas-station',        eye: { x: -42, z: -24, up: 1.7 },   target: { x: -52, z: -44, up: 2.5 } },
  { name: '05-diner',              eye: { x: -16, z: -29, up: 1.7 },   target: { x: -24, z: -42, up: 2 } },
  { name: '06-storefront-close',   eye: { x: -2, z: -34.5, up: 1.7 },  target: { x: -2, z: -39, up: 1.9 } },
  { name: '07-motel-water-tower',  eye: { x: 28, z: -31, up: 1.7 },    target: { x: 58, z: -52, up: 7 } },
  { name: '08-church',             eye: { x: 20, z: -34, up: 1.7 },    target: { x: 32, z: -18, up: 5 } },
  { name: '09-back-street-houses', eye: { x: -22, z: -4, up: 1.7 },    target: { x: 2, z: 9.5, up: 2 } },
  { name: '10-river-track',        eye: { x: 23, z: -54, up: 1.7 },    target: { x: 30, z: -95, up: 0 } },
  { name: '11-steppe-to-town',     eye: { x: 0, z: 60, up: 1.7 },      target: { x: 0, z: -30, up: 4 } },
  { name: '12-aerial',             eye: { x: -30, z: 110, up: 85 },    target: { x: 0, z: -40, up: 0 } },
];

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const label = args.find((a) => !a.startsWith('--')) ?? 'current';
const quality = flag('q') ?? 'high';
const only = flag('only')?.split(',');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'shots', label);

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('This tool needs Playwright. Install it with:\n' +
    '  npm install --no-save playwright && npx playwright install chromium');
  process.exit(1);
}

if (!args.includes('--no-build')) await build({ root, logLevel: 'warn' });
const server = await preview({ root, logLevel: 'warn', preview: { port: 4179, open: false } });
const url = `${server.resolvedUrls.local[0]}?debug&q=${quality}`;

const browser = await chromium.launch();
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => { failed = true; console.error('Page error:', err.message); });

  await page.goto(url);
  await page.waitForFunction(() => window.hanford, null, { timeout: 180_000 });
  // Hide the page chrome so only the rendered world is captured.
  await page.addStyleTag({ content: '#hud, #start, #loading { display: none !important; }' });
  await mkdir(outDir, { recursive: true });

  for (const view of VIEWS) {
    if (only && !only.includes(view.name.slice(0, 2))) continue;
    await page.evaluate((v) => (v.asPlayer ? window.hanford.stillAsPlayer() : window.hanford.still(v)), view);
    await page.locator('#game').screenshot({ path: path.join(outDir, `${view.name}.png`), timeout: 120_000 });
    console.log(`  ${view.name}`);
  }
  console.log(`Saved to ${path.relative(process.cwd(), outDir)} (${quality} preset)`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
process.exit(failed ? 1 : 0);
