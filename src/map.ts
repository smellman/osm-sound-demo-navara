import ThreeView, { Color } from '@navaramap/three'
import {
  DefaultPlugin,
  type DefaultDescriptions,
} from '@navaramap/three-default-plugin'
import { TileJsonPlugin } from '@navaramap/three-plugins'

/**
 * OpenStreetMap Japan's OpenMapTiles vector tileset — the same data the
 * maplibre-gl version of this demo renders, minus the MapLibre style: Navara
 * does not read the MapLibre Style Spec, so each source layer is styled here
 * with Navara's own vector materials.
 *
 * TileJSON, so the tile URL template, zoom range and attribution all come from
 * the document rather than being hardcoded.
 */
const OSM_JP_TILEJSON_URL = 'https://tile.openstreetmap.jp/data/planet.json'

/** Camera pose the demo opens on: a tilted view over Tokyo, as in the original. */
export const INITIAL_CAMERA = {
  lng: 139.767165,
  lat: 35.680655,
  height: 0,
  distance: 1600,
  heading: 20,
  pitch: -25,
  roll: 0,
} as const

/** Dark palette, in the spirit of the toner style the original demo uses. */
const PALETTE = {
  background: '#14141a',
  earth: '#1b1b21',
  landcover: '#20261f',
  landuse: '#1f1f26',
  park: '#1d2a20',
  water: '#0e1727',
  road: '#4a4a55',
  building: '#7c7c8a',
} as const

/** Fallback block height for buildings the data has no height for. */
const MIN_BUILDING_HEIGHT = 3

const color = (hex: string) => new Color().setStyle(hex)

export type MapView = ThreeView<DefaultDescriptions>

/**
 * Builds the vector basemap: one vector-tile source, one layer per
 * OpenMapTiles source layer.
 */
export const createMapView = async (
  container: HTMLElement,
): Promise<MapView> => {
  const view = new ThreeView<DefaultDescriptions>({
    container,
    backgroundColor: color(PALETTE.background),
  })

  // Every plugin has to be registered before init() — addPlugin() throws after.
  const defaultPlugin = new DefaultPlugin()
  const tilejson = new TileJsonPlugin()
  view.addPlugin(defaultPlugin)
  view.addPlugin(tilejson)

  // Initializes the WASM engine and its workers. Sources and layers can only
  // be added once this resolves.
  await view.init()

  // The extruded buildings are lit geometry, so without a light they render
  // black. The draped (clampToGround) layers bake into tile textures and
  // ignore lighting entirely. The sun gives the building faces different tones
  // so the blocks read as 3D; the ambient fill keeps the shaded sides visible.
  view.addLight({ ambient: { intensity: 0.6 } })
  view.addLight({ sun: { intensity: 1.5 } })
  // Pin a global instant so the sun lands in the same place on every machine.
  view.atmosphere.date = new Date('2026-06-21T02:00:00Z')

  // The bare globe surface shows through wherever the tiles have no ground
  // cover, so paint it the basemap's base tone instead of the default white.
  view.globe.color = color(PALETTE.earth)

  view.setCamera(INITIAL_CAMERA)

  // A plain ellipsoid surface for the draped layers to bake onto: this scene
  // has no terrain or raster base of its own.
  view.addLayer({ type: 'terrain', ellipsoid: {} })

  const tiles = await tilejson.addSource({
    type: 'vector-tile',
    url: OSM_JP_TILEJSON_URL,
  })

  // Layer render order follows add order, so the ground cover goes first and
  // roads and buildings stack on top of it.
  view.addLayer({
    type: 'vector',
    source: tiles,
    sourceLayers: ['landcover'],
    polygon: { color: color(PALETTE.landcover), clampToGround: true },
  })
  view.addLayer({
    type: 'vector',
    source: tiles,
    sourceLayers: ['landuse'],
    polygon: { color: color(PALETTE.landuse), clampToGround: true },
  })
  view.addLayer({
    type: 'vector',
    source: tiles,
    sourceLayers: ['park'],
    polygon: { color: color(PALETTE.park), clampToGround: true },
  })
  view.addLayer({
    type: 'vector',
    source: tiles,
    sourceLayers: ['water'],
    polygon: { color: color(PALETTE.water), clampToGround: true },
  })
  view.addLayer({
    type: 'vector',
    source: tiles,
    sourceLayers: ['transportation'],
    polyline: {
      color: color(PALETTE.road),
      width: 2,
      clampToGround: true,
    },
  })

  // Extruded, not draped. The heights come per feature from OpenMapTiles'
  // `render_height` / `render_min_height`, the same properties the maplibre
  // version feeds into `fill-extrusion-height`.
  const buildings = view.addLayer({
    type: 'vector',
    source: tiles,
    sourceLayers: ['building'],
    polygon: {
      color: color(PALETTE.building),
      clampToGround: false,
      height: 0,
      extrudedHeight: 0,
    },
  })
  buildings.on('featureUpdated', ({ evaluator }) => {
    evaluator.evaluate(
      ({ properties }) => {
        const top = (properties?.['render_height'] as number | undefined) ?? 0
        const base =
          (properties?.['render_min_height'] as number | undefined) ?? 0
        return {
          height: base,
          // Buildings with no height tag still deserve a footprint block.
          extrudedHeight: Math.max(top, base + MIN_BUILDING_HEIGHT),
        }
      },
      { filters: ['render_height', 'render_min_height'] },
    )
  })

  return view
}
