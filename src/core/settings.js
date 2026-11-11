// Quality presets. The visual ambition is high, so anything expensive is
// grouped here and can be dialled down without touching the world code.
// The chosen preset is remembered in the browser.

const STORAGE_KEY = 'hanford.settings.v1';

export const PRESETS = {
  low: {
    label: 'Low',
    pixelRatio: 1,
    shadowMapSize: 1024,
    shadowDistance: 70,
    ambientOcclusion: false,
    bloom: true,
    antialias: false,
    grassCount: 3000,
    sageCount: 1400,
    rockCount: 260,
    terrainSegments: 192,
    viewDistance: 340,
  },
  medium: {
    label: 'Medium',
    pixelRatio: 1.25,
    shadowMapSize: 2048,
    shadowDistance: 95,
    ambientOcclusion: false,
    bloom: true,
    antialias: true,
    grassCount: 9000,
    sageCount: 3200,
    rockCount: 520,
    terrainSegments: 256,
    viewDistance: 420,
  },
  high: {
    label: 'High',
    pixelRatio: 1.5,
    shadowMapSize: 4096,
    shadowDistance: 130,
    ambientOcclusion: true,
    bloom: true,
    antialias: true,
    grassCount: 17000,
    sageCount: 5200,
    rockCount: 800,
    terrainSegments: 320,
    viewDistance: 520,
  },
};

/**
 * Guess a sensible starting preset. We can't read the GPU model reliably, so
 * this uses core count and screen size as a rough stand-in and errs low --
 * it is much nicer to be pleasantly surprised than to open a slideshow.
 */
function detectPreset() {
  const cores = navigator.hardwareConcurrency || 4;
  const bigScreen = window.screen.width * window.screen.height > 2_200_000;
  if (cores >= 12 && bigScreen) return 'high';
  if (cores >= 6) return 'medium';
  return 'low';
}

let current = null;

export function loadSettings() {
  let name = null;
  try {
    name = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private-browsing mode can throw on storage access. Not fatal.
  }
  // `?q=high` in the address bar forces a preset for this visit only, without
  // overwriting the remembered choice. Handy for testing and for screenshots.
  const forced = new URLSearchParams(window.location.search).get('q');
  if (forced && PRESETS[forced]) name = forced;

  if (!name || !PRESETS[name]) name = detectPreset();
  current = { name, ...PRESETS[name] };
  return current;
}

export function getSettings() {
  return current || loadSettings();
}

export function saveSettingsName(name) {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Ignore -- the game still runs, it just won't remember the choice.
  }
}

/** Cycle low -> medium -> high -> low. Returns the new preset name. */
export function nextPresetName(name) {
  const order = ['low', 'medium', 'high'];
  return order[(order.indexOf(name) + 1) % order.length];
}
