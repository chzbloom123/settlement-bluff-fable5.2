import { defineConfig } from 'vite';

// Vite needs almost no configuration here. The defaults already produce a
// self-contained folder in dist/ that Vercel can host as a static site.
export default defineConfig({
  base: './',              // relative asset paths, so the build works from any subfolder
  server: {
    open: !process.env.VITEST, // pop the browser automatically on `npm run dev`
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,  // keep assets as real files -- easier to inspect
    chunkSizeWarningLimit: 1500, // three.js is legitimately large; don't nag
  },
});
