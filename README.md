# OSM Sound demo — Navara edition

A port of [osm-sound-demo](https://github.com/smellman/osm-sound-demo) from
MapLibre GL JS to [Navara](https://github.com/maplibre/navara), the 3D map
engine (Rust/WASM GIS core + Three.js rendering).

Navara does **not** read the MapLibre Style Spec, so the basemap is not a style
document. Each [OpenMapTiles](https://openmaptiles.org/) source layer is styled
directly with Navara's own vector materials, and the buildings are extruded per
feature from `render_height` / `render_min_height` — the properties the
maplibre-gl version feeds into `fill-extrusion-height`.

## Status

Implemented:

- 3D vector basemap on Navara: land cover, land use, parks, water, roads, and
  per-feature extruded buildings
- Vector tiles from [OpenStreetMap Japan](https://openstreetmap.jp/) (the same
  tileset the original uses), registered from its TileJSON
- Bootstrap UI shell from the original: About modal, Fly To dropdown, Locate Me
- Camera readout in the corner

Not ported yet:

- Audio playback (Otherman Records releases, the player navbar)
- The audio-reactive "dancing buildings" animation and VJ mode

## How to run

Requires [asdf](https://asdf-vm.com/) for the Node.js and pnpm versions pinned
in `.tool-versions`.

```bash
pnpm install
pnpm dev
```

```bash
pnpm build    # tsc && vite build
pnpm preview
```

## Notes

- `@navaramap/three` 0.1.1 inlines three's core into its own bundle, so the
  console shows a `THREE.WARNING: Multiple instances of Three.js being imported`
  on startup. It is upstream and does not affect rendering.
- The building layer takes a while to fully populate on first load: the vector
  tileset maxes out at zoom 14 and the building geometry is the heaviest part
  of each tile.
- `.claude/skills/navara-usage/` is a copy of the
  [navara-usage skill](https://github.com/maplibre/navara/tree/main/skills/navara-usage)
  from the Navara repository, for AI coding agents working on this project.

## License of the code

MIT License

## Attribution

Vector tiles by [OpenStreetMap Japan](https://openstreetmap.jp/), data ©
[OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
The original sound example was developed by
[Mapbox](https://docs.mapbox.com/mapbox-gl-js/example/dancing-buildings/), and
the music in the original demo is by
[Otherman Records](https://www.otherman-records.com/) (CC BY-NC 2.1 JP).
