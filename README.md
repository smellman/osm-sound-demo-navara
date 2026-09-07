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
- Bootstrap UI from the original: About modal, Fly To dropdown, Locate Me, and
  the player navbar (release picker, transport, volume, Go To Release)
- Audio playback of the [Otherman Records](https://www.otherman-records.com/)
  catalogue, streamed through the same CORS proxy the original uses
- The audio-reactive "dancing buildings": each building keeps its real height
  and is lifted from the ground by its frequency band, while the camera slowly
  orbits and the fill light sweeps through the hue circle

Not ported yet:

- VJ mode (driving the visualizer from a live audio input device)

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
- Where the maplibre version splits buildings into 16 `fill-extrusion` layers
  so each can carry one uniform height, Navara evaluates heights per feature
  (`FeatureEvaluator`), so one layer covers all 16 frequency bands. That is
  also why the buildings keep their real heights while they dance: a band
  scales each building from its own height rather than flattening every
  building in the band to one value, so the skyline stays recognisable.
- The band levels run through a fast-attack / slow-release envelope, so a beat
  throws the buildings up and they sink back down instead of jittering.
- The lift has a flat part in metres on top of the part proportional to a
  building's own height, so low buildings — and the handful the data gives no
  `render_height` at all, which stand at a fallback 3 m — visibly move too
  rather than only the towers swinging.
- With nothing playing, the buildings stand at their real heights and the
  engine only redraws on change; playback switches on continuous rendering.
- The basemap credits come from the TileJSON's `attribution` field, which
  `TileJsonPlugin` hands to Navara's built-in attribution UI — nothing is
  declared by hand. That UI docks itself to the bottom of the *viewport*, where
  the fixed-bottom player navbar would cover it, so `style.scss` lifts it by
  the navbar height that `fitMapToNavbar` publishes as a CSS variable.
- `.claude/skills/navara-usage/` is a copy of the
  [navara-usage skill](https://github.com/maplibre/navara/tree/main/skills/navara-usage)
  from the Navara repository, for AI coding agents working on this project.

## License of the code

BSD 3-Clause License — see [LICENSE](LICENSE).

## Attribution

Vector tiles by [OpenStreetMap Japan](https://openstreetmap.jp/), data ©
[OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
The original sound example was developed by
[Mapbox](https://docs.mapbox.com/mapbox-gl-js/example/dancing-buildings/), and
the music in the original demo is by
[Otherman Records](https://www.otherman-records.com/) (CC BY-NC 2.1 JP).
