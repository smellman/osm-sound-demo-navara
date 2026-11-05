import ThreeView, {
  Color,
  geodeticToVector3,
  vector3ToGeodetic,
  type FeatureEvaluator,
} from '@navaramap/three'
import { Vector3, type BufferAttribute, type Object3D } from 'three'
import type {
  AmbientLightDesc,
  SelectiveBloomEffectDesc,
} from '@navaramap/three-default-descs'
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
const INITIAL_CAMERA = {
  lng: 139.767165,
  lat: 35.680655,
  height: 0,
  distance: 1600,
  heading: 20,
  pitch: -25,
  roll: 0,
} as const

/** How the fly-to and locate controls frame their destination. */
const ARRIVAL_FRAMING = {
  height: INITIAL_CAMERA.height,
  distance: INITIAL_CAMERA.distance,
  pitch: INITIAL_CAMERA.pitch,
  roll: INITIAL_CAMERA.roll,
} as const

/**
 * A point on the ground plus how far the camera sits from it. Passing one to
 * `setCamera` with a heading aims the camera at the point from that side.
 */
type CameraTarget = {
  lng: number
  lat: number
  height: number
  distance: number
  pitch: number
  roll: number
}

/**
 * Derives an orbit target from where the camera is actually looking: the ground
 * point at the centre of the view, and the camera's distance to it. Returns
 * `null` before the depth buffer has anything in it to pick against.
 */
const readOrbitTarget = (
  view: MapView,
  container: HTMLElement,
): CameraTarget | null => {
  const bounds = container.getBoundingClientRect()
  const picked = view.pickTerrainPosition(
    bounds.left + bounds.width / 2,
    bounds.top + bounds.height / 2,
  )
  if (!picked) return null

  const { lng, lat, height } = vector3ToGeodetic(picked)
  const camera = view.camera.positionECEF
  const { pitch = INITIAL_CAMERA.pitch, roll = 0 } = view.camera.orientation

  return {
    lng,
    lat,
    height,
    distance: Math.hypot(
      camera.x - picked.x,
      camera.y - picked.y,
      camera.z - picked.z,
    ),
    pitch,
    roll,
  }
}

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

/** Contact shadows where the buildings meet the ground and each other. */
const SSAO = {
  intensity: 3,
  radius: 20,
} as const

/** Bloom around the glowing buildings; nothing else is in its mask. */
const BLOOM = {
  strength: 1.2,
  radius: 0.6,
  threshold: 0,
} as const

/**
 * Colours for Navara's built-in attribution UI, so its popover matches the
 * demo's dark Bootstrap theme instead of its own light default. The credits
 * themselves come from the TileJSON, via `TileJsonPlugin`.
 */
const ATTRIBUTION_STYLE = {
  backgroundColor: 'rgba(33, 37, 41, 0.9)',
  titleColor: '#dee2e6',
  textColor: '#adb5bd',
  nestedTextColor: '#8c949c',
  linkColor: '#6ea8fe',
  listStyleColor: '#6c757d',
  borderColor: 'rgba(255, 255, 255, 0.15)',
} as const

/** Fallback block height for buildings the data has no height for. */
export const MIN_BUILDING_HEIGHT = 3

/** Baseline fill-light intensity; the visualizer drives it away from this. */
const FILL_LIGHT_INTENSITY = 0.6

const color = (hex: string) => new Color().setStyle(hex)

type MapView = ThreeView<DefaultDescriptions>

/**
 * Decides how tall a building renders. The idle implementation just returns the
 * feature's own height; the audio visualizer swaps in one driven by the
 * spectrum.
 *
 * @param renderHeight - The feature's `render_height`, in metres.
 * @param minHeight - The feature's `render_min_height`, in metres.
 * @param position - Where the building stands, as the centroid of its mesh in
 * world (ECEF) coordinates, or `undefined` when it could not be read.
 */
export type BuildingHeights = (
  renderHeight: number,
  minHeight: number,
  position: Readonly<Vector3> | undefined,
) => { height: number; extrudedHeight: number }

/**
 * Per-building centroids of one tile's building mesh, keyed by batch id as
 * `centroidKey` rounds it.
 *
 * Navara hands the evaluator a feature's properties but not its geometry, and
 * OpenMapTiles' building layer carries no coordinates of its own, so the only
 * place a building's position can be read is the mesh's vertex buffers. Those
 * are dropped from the JS heap on their first GPU upload, so this has to run
 * from `featureCreated`, which Navara emits right after building the mesh and
 * before it is rendered. That reaches into the evaluator's private mesh: if a
 * Navara release changes the layout, this returns `undefined` and the
 * buildings simply have no position, rather than breaking the map.
 */
/**
 * The mesh stores each vertex's batch id as a 32-bit float, which rounds ids
 * past 2^24 — and OpenMapTiles' ids get there. Rounding the evaluator's id the
 * same way makes the two meet.
 */
const centroidKey = (batchId: number) => Math.fround(batchId)

const readBuildingCentroids = (
  evaluator: FeatureEvaluator,
): Map<number, Vector3> | undefined => {
  const mesh = (evaluator as unknown as { obj?: Object3D }).obj as
    | (Object3D & {
        geometry?: { getAttribute: (name: string) => BufferAttribute | undefined }
      })
    | undefined
  const geometry = mesh?.geometry
  if (!mesh || !geometry) return undefined

  const batchIds = geometry.getAttribute('attrBatchId')
  // Tile-local positions, placed by the mesh's transform...
  const local = geometry.getAttribute('position')
  // ...or, for relative-to-eye rendering, absolute positions split into a
  // high and a low part for precision.
  const high = geometry.getAttribute('position_3d_high')
  const low = geometry.getAttribute('position_3d_low')
  if (!batchIds?.array) return undefined
  const isLocal = Boolean(local?.array)
  const read: ((i: number, axis: 0 | 1 | 2) => number) | undefined = isLocal
    ? (i, axis) => local!.getComponent(i, axis)
    : high?.array && low?.array
      ? (i, axis) => high.getComponent(i, axis) + low.getComponent(i, axis)
      : undefined
  if (!read) return undefined

  const sums = new Map<number, [number, number, number, number]>()
  for (let i = 0; i < batchIds.count; i += 1) {
    const id = batchIds.getX(i)
    const x = read(i, 0)
    const y = read(i, 1)
    const z = read(i, 2)
    const sum = sums.get(id)
    if (sum) {
      sum[0] += x
      sum[1] += y
      sum[2] += z
      sum[3] += 1
    } else {
      sums.set(id, [x, y, z, 1])
    }
  }

  if (isLocal) mesh.updateMatrixWorld(true)
  const centroids = new Map<number, Vector3>()
  for (const [id, [x, y, z, count]] of sums) {
    const centroid = new Vector3(x / count, y / count, z / count)
    if (isLocal) centroid.applyMatrix4(mesh.matrixWorld)
    centroids.set(id, centroid)
  }
  return centroids
}

/** Buildings at their real heights — how the map looks with no music playing. */
export const realBuildingHeights: BuildingHeights = (renderHeight, minHeight) => ({
  height: minHeight,
  // Buildings with no height tag still deserve a footprint block.
  extrudedHeight: Math.max(renderHeight, minHeight + MIN_BUILDING_HEIGHT),
})

export type MapScene = {
  view: MapView
  /**
   * The ground point the camera orbits, in world (ECEF) coordinates — the
   * centre of the view as of the last `beginOrbit` or `flyTo`.
   */
  orbitCenter: () => Readonly<Vector3>
  /** Swaps the function that decides building heights, and re-renders with it. */
  setBuildingHeights: (heights: BuildingHeights) => void
  /** How the buildings glow into the bloom. Intensity 0 is off. */
  setBuildingGlow: (glow: { color: Color; intensity: number }) => void
  /** Tints the scene's fill light, as the original demo does with `map.setLight`. */
  setFillLight: (light: { color: Color; intensity: number }) => void
  /** Restores the fill light the map opens with. */
  resetFillLight: () => void
  /**
   * Re-reads the ground point at the centre of the view, so the following
   * `orbitTo` calls turn around whatever the camera is looking at now.
   *
   * @returns The heading the camera is on, to orbit onward from.
   */
  beginOrbit: () => number
  /** Points the camera at the orbit target from the given compass heading. */
  orbitTo: (heading: number) => void
  /** Flies to a location and frames it the way the map opens on Tokyo. */
  flyTo: (to: { lng: number; lat: number }) => Promise<boolean>
  /** Whether the engine redraws every frame or only on change. */
  setContinuousRendering: (enabled: boolean) => void
}

/**
 * Builds the vector basemap: one vector-tile source, one layer per
 * OpenMapTiles source layer.
 */
export const createMapScene = async (
  container: HTMLElement,
): Promise<MapScene> => {
  const view = new ThreeView<DefaultDescriptions>({
    container,
    backgroundColor: color(PALETTE.background),
    defaultAttribution: { style: ATTRIBUTION_STYLE },
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
  const fillLight = view.addLight<AmbientLightDesc>({
    ambient: { intensity: FILL_LIGHT_INTENSITY },
  })
  view.addLight({ sun: { intensity: 1.5 } })
  // Pin a global instant so the sun lands in the same place on every machine.
  view.atmosphere.date = new Date('2026-06-21T02:00:00Z')

  // The bare globe surface shows through wherever the tiles have no ground
  // cover, so paint it the basemap's base tone instead of the default white.
  view.globe.color = color(PALETTE.earth)

  let orbitTarget: CameraTarget = INITIAL_CAMERA
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
      // The glow the music drives; the visualizer sets both the colour and the
      // intensity, and the bloom mask is attached with the effect.
      emissiveIntensity: 0,
    },
  })

  /**
   * Screen-space effects can only be added once the city exists: allocating
   * their G-buffers before the first tiles are built leaves the base render
   * white. The first batch of building features is the signal — `idle` never
   * arrives at this zoom, because tile processing does not stop.
   *
   * Only ambient occlusion lives here. Screen-space reflections were tried and
   * dropped: with the buildings given a reflectivity, the pass changed exactly
   * zero pixels at both the demo's camera and a street-level one.
   */
  let sceneEffectsAdded = false
  const addSceneEffects = () => {
    if (sceneEffectsAdded) return
    sceneEffectsAdded = true
    view.addEffect({ ssao: SSAO })
    // With `animation` off the engine only redraws on change, and nothing
    // else marks the scene dirty, so the new passes would go unseen.
    view.forceUpdate()
  }

  /**
   * Bloom reads the emissive buffer through an id mask, so only the layers
   * that name it in `effectIds` glow — here, the buildings and nothing else.
   */
  let bloom: ReturnType<typeof view.addEffect<SelectiveBloomEffectDesc>> | undefined
  const ensureBloom = () => {
    if (bloom) return
    bloom = view.addEffect<SelectiveBloomEffectDesc>({ selectiveBloom: BLOOM })
    buildings.update({ polygon: { effectIds: [bloom.id] } })
  }

  /** Keyed by evaluator, so a tile's centroids go when the tile does. */
  const centroidsByTile = new WeakMap<FeatureEvaluator, Map<number, Vector3>>()
  buildings.on('featureCreated', ({ evaluator }) => {
    const centroids = readBuildingCentroids(evaluator)
    if (centroids) centroidsByTile.set(evaluator, centroids)
  })

  let buildingHeights = realBuildingHeights
  buildings.on('featureUpdated', ({ evaluator }) => {
    addSceneEffects()
    const centroids = centroidsByTile.get(evaluator)
    evaluator.evaluate(
      ({ properties, batchId }) =>
        buildingHeights(
          (properties?.['render_height'] as number | undefined) ?? 0,
          (properties?.['render_min_height'] as number | undefined) ?? 0,
          centroids?.get(centroidKey(batchId)),
        ),
      { filters: ['render_height', 'render_min_height'] },
    )
  })

  const orbitCenterECEF = new Vector3()
  const orbitCenter = () =>
    orbitCenterECEF.copy(
      geodeticToVector3({
        lng: orbitTarget.lng,
        lat: orbitTarget.lat,
        height: orbitTarget.height,
      }),
    )

  return {
    view,
    orbitCenter,
    setBuildingHeights: (heights) => {
      buildingHeights = heights
      // Marks the layer for re-evaluation on the next frame, which is what
      // fires `featureUpdated` again for the features already loaded.
      buildings.forceUpdate()
    },
    setBuildingGlow: ({ color: glowColor, intensity }) => {
      if (intensity > 0) ensureBloom()
      buildings.update({
        polygon: { emissiveColor: glowColor, emissiveIntensity: intensity },
      })
    },

    setFillLight: ({ color: lightColor, intensity }) => {
      fillLight.update({ ambient: { color: lightColor, intensity } })
    },
    resetFillLight: () => {
      fillLight.update({
        ambient: { color: color('#ffffff'), intensity: FILL_LIGHT_INTENSITY },
      })
    },
    beginOrbit: () => {
      orbitTarget = readOrbitTarget(view, container) ?? orbitTarget
      return view.camera.orientation.heading ?? INITIAL_CAMERA.heading
    },

    orbitTo: (heading) => {
      // Re-aiming at a fixed target from a turning heading orbits the city,
      // which is what `map.setBearing` does in the maplibre version.
      view.setCamera({ ...orbitTarget, heading })
    },

    flyTo: async (to) => {
      const target = { ...ARRIVAL_FRAMING, ...to }
      // Keep the same local solar time at the destination, so the buildings
      // are lit the same way wherever the camera lands.
      view.atmosphere.setDateFromCameraAt({ lng: to.lng })
      orbitTarget = target
      return view.flyTo(target)
    },
    setContinuousRendering: (enabled) => {
      view.animation = enabled
    },
  }
}
