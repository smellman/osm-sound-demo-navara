# OSM Sound demo — Navara edition

A port of [osm-sound-demo](https://github.com/smellman/osm-sound-demo) from
MapLibre GL JS to [Navara](https://github.com/maplibre/navara), the 3D map
engine (Rust/WASM GIS core + Three.js rendering).

The basemap here is not a style document. Each
[OpenMapTiles](https://openmaptiles.org/) source layer is styled directly with
Navara's own vector materials, and the buildings are extruded per feature from
`render_height` / `render_min_height` — the properties the maplibre-gl version
feeds into `fill-extrusion-height`.

Navara 0.2 does ship an experimental `MapLibreStylePlugin` that reads a MapLibre
Style JSON, and the demo's original style renders through it. It is not used:
see the note at the end.

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
- A bloom glow on the buildings that pulses with the beat, in the colour the
  hue sweep is passing through
- Screen-space ambient occlusion, so the city reads as blocks rather than a
  field of flat panels
- VJ mode: the visualizer runs off a live audio input and the interface gets
  out of the way, so the map can be projected

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

## VJ mode

VJ mode drives the buildings from a live audio input rather than from the
built-in player, and hides the interface so the map fills the screen. The input
is meant to be a loopback of the system output, so route that first, then press
**Turn On VJ Mode** and grant the microphone permission. Press <kbd>Esc</kbd> to
leave.

The captured audio is deliberately not played back — it is only analysed —
because feeding a loopback of the output back into the output would echo.

Desktop browsers only; the button hides itself where `getUserMedia` is
unavailable.

### macOS

Install [Loopback.app](https://rogueamoeba.com/loopback/) and route the system
output into a virtual input device.

![Loopback screenshot](https://i.gyazo.com/051fe278806212ef0061b2d18acd7359.png)

### Linux

Tested on Ubuntu Studio 25.04 + PipeWire.

```bash
pactl load-module module-remap-source master=VirtualSink.monitor source_name=VirtualMic source_properties=device.description=VirtualMic
```

Use [Helvum](https://gitlab.freedesktop.org/pipewire/helvum) to check the
connection.

![Helvum screenshot](https://i.gyazo.com/3e7d026299a4966a1c306ce6a911385f.png)

## Notes

- `@navaramap/three` inlines three's core into its own bundle, so the console
  shows a `THREE.WARNING: Multiple instances of Three.js being imported` on
  startup. It is upstream, still present in 0.2.1, and does not affect
  rendering.
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
- **Screen-space effects have to be added after the first tiles are built.**
  Allocating their G-buffers during setup leaves the base render white — with
  the bloom threshold at 1.0, extracting nothing, the frame is still white, so
  it is the base render rather than the extraction. Both the bloom and the
  ambient occlusion therefore wait for the first batch of building features.
  `idle` is no use as a signal: at this zoom tile processing never stops.
- The glow follows what a beat adds over a 1.2s baseline, not the loudness
  itself. Every signal in the chain sits near its ceiling — the loudest band's
  median is 0.82 against a maximum of 0.93 — so driving the glow from one
  directly gives a city that glows flat out instead of pulsing.
- Screen-space reflections were tried and dropped. With the buildings given a
  reflectivity, the pass changed exactly zero pixels at both the demo's camera
  and a street-level one.
- `depthOfField` cannot be used: Navara's wrapper builds the underlying
  `DepthOfFieldEffect` without passing the camera, so every frame throws
  `Cannot read properties of null (reading 'elements')`. `addEffect` itself
  succeeds, which makes it look like a scene problem rather than a one-line
  upstream bug.
- The experimental `MapLibreStylePlugin` works — the demo's original
  `maptiler-toner-ja` style renders, labels and all — but is not used here. It
  needs `text-font` rewritten as `["literal", [...]]`, cannot read the legacy
  `{stops: ...}` form, does not read the style's `glyphs` endpoint so fonts
  must be supplied by hand, and keeps its sources private, which means a second
  copy of the same tileset. The hand-written dark palette is also the look this
  demo wants.
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
