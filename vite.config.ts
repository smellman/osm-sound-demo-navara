import { defineConfig } from 'vite'

export default defineConfig({
  base: '/osm-sound-demo-navara/',
  resolve: {
    // Navara's packages, postprocessing and the takram effect packages all
    // peer-depend on three; keep them on the one copy the app installs.
    // (@navaramap/three 0.1.1 also inlines three's core into its own bundle,
    // which is what the "Multiple instances of Three.js" console warning is
    // about — that part is upstream and harmless here.)
    dedupe: ['three'],
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Bootstrap 5.3 still uses the legacy Sass APIs.
        silenceDeprecations: [
          'import',
          'color-functions',
          'global-builtin',
          'if-function',
        ],
      },
    },
  },
  server: {
    host: true,
  },
})
