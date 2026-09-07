import { Color } from '@navaramap/three'
import { BINS, type AudioEngine } from './audio'
import {
  MIN_BUILDING_HEIGHT,
  realBuildingHeights,
  type BuildingHeights,
  type MapScene,
} from './map'

/**
 * Height, in metres, of the tallest band. A building is assigned to a band by
 * its own height across this range, so the low city moves with the bass and
 * the towers with the highs.
 */
const BAND_RANGE = 200
const BAND_WIDTH = BAND_RANGE / BINS

/**
 * How far a band's peak lifts its buildings. The metres part is flat, so a
 * one-storey building — or one the data gives no height at all — still visibly
 * rises; the ratio part scales with the building's own height, so the skyline
 * keeps its shape while it dances.
 */
const BAND_LIFT_METRES = 45
const BAND_LIFT_RATIO = 1.2

/** Degrees of camera orbit per millisecond — a full turn takes about 4 minutes. */
const ORBIT_DEGREES_PER_MS = 1 / 700

/** Milliseconds for the fill light to sweep one degree of hue: a minute a lap. */
const HUE_MS_PER_DEGREE = 165

/**
 * Time constants of the per-band envelope, in milliseconds. The short attack
 * lets a beat throw the buildings up; the longer release lets them sink back
 * down, so the motion reads as growth from the ground rather than a jitter.
 * These two are the dials for how lively the city feels.
 */
const ATTACK_MS = 45
const RELEASE_MS = 300

/** Fraction of the way an envelope closes on its target over `elapsed` ms. */
const approach = (elapsed: number, timeConstant: number) =>
  1 - Math.exp(-elapsed / timeConstant)

/**
 * Turns the enveloped band levels into a building-height function. Every
 * building keeps its real height as its resting state and grows upward from
 * the ground with its band, so the city still reads as the city it is — which
 * is the part the maplibre version, with one uniform height per bin, cannot do.
 */
const liftedHeights =
  (levels: Readonly<Float32Array>): BuildingHeights =>
  (renderHeight, minHeight) => {
    // Buildings taller than the top of the range join the last band rather
    // than dropping out of the scene.
    const band = Math.min(BINS - 1, Math.floor(renderHeight / BAND_WIDTH))
    const resting = Math.max(renderHeight, minHeight + MIN_BUILDING_HEIGHT)
    const lift = BAND_LIFT_METRES + resting * BAND_LIFT_RATIO
    return {
      height: minHeight,
      extrudedHeight: resting + lift * (levels[band] ?? 0),
    }
  }

export type Visualizer = {
  start: () => void
  stop: () => void
  /** Pauses the animation until `work` settles, so camera moves are not fought. */
  suspendWhile: <T>(work: Promise<T>) => Promise<T>
}

/** Drives the scene from the audio spectrum, one update per animation frame. */
export const createVisualizer = (
  scene: MapScene,
  audio: AudioEngine,
): Visualizer => {
  const lightColor = new Color()
  /** Smoothed band levels, 0-1, one per frequency band. */
  const levels = new Float32Array(BINS)
  let smoothedAverage = 0
  let frame: number | null = null
  let suspensions = 0
  let lastFrameAt: number | null = null
  /** Heading the orbit started from, and when — so playback does not snap the camera. */
  let orbitFrom = 0
  let orbitStartedAt: number | null = null

  const draw = (now: DOMHighResTimeStamp) => {
    frame = requestAnimationFrame(draw)
    const elapsed = lastFrameAt === null ? 0 : now - lastFrameAt
    lastFrameAt = now
    if (suspensions > 0) return

    const average = audio.sample() / 255
    const spectrum = audio.spectrum

    for (let band = 0; band < BINS; band += 1) {
      const target = (spectrum[band] ?? 0) / 255
      const level = levels[band] ?? 0
      const rate = approach(
        elapsed,
        target > level ? ATTACK_MS : RELEASE_MS,
      )
      levels[band] = level + (target - level) * rate
    }
    smoothedAverage += (average - smoothedAverage) * approach(elapsed, RELEASE_MS)

    orbitStartedAt ??= now

    scene.setBuildingHeights(liftedHeights(levels))
    scene.orbitTo(
      (orbitFrom + (now - orbitStartedAt) * ORBIT_DEGREES_PER_MS) % 360,
    )
    // The same hue sweep and loudness-driven brightness the original demo
    // feeds into `map.setLight`, at a pace that suits a slow orbit.
    scene.setFillLight({
      color: lightColor.setStyle(
        `hsl(${(now / HUE_MS_PER_DEGREE) % 360}, ${50 + smoothedAverage * 50}%, 50%)`,
      ),
      intensity: 0.4 + smoothedAverage * 0.8,
    })
  }

  return {
    start: () => {
      if (frame !== null) return
      // Orbit whatever the camera is looking at right now, not the last
      // fly-to destination, and carry on from the heading it is already on.
      orbitFrom = scene.beginOrbit()
      orbitStartedAt = null
      scene.setContinuousRendering(true)
      frame = requestAnimationFrame(draw)
    },

    stop: () => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
      lastFrameAt = null
      orbitStartedAt = null
      levels.fill(0)
      smoothedAverage = 0
      scene.setContinuousRendering(false)
      // Back to the city as it really is.
      scene.setBuildingHeights(realBuildingHeights)
      scene.resetFillLight()
    },

    suspendWhile: async (work) => {
      suspensions += 1
      try {
        return await work
      } finally {
        suspensions -= 1
      }
    },
  }
}
