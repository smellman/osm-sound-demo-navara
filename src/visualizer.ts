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

/** Milliseconds for the hue sweep to advance one degree: about a minute a lap. */
const HUE_MS_PER_DEGREE = 165

/**
 * How quickly the baseline the glow is measured against follows the music.
 *
 * The band envelopes sit near their ceiling most of the time — measured over
 * playback, the loudest band's median is 0.82 against a maximum of 0.93 — so
 * driving the glow from one directly gives a city that glows flat out.
 * Subtracting a slow follower leaves only what a beat adds over the last
 * second or so, which is what reads as a pulse.
 */
const GLOW_BASELINE_MS = 1200

/**
 * Scales that difference into the 0-1 range the glow is expressed in. Measured
 * over playback the difference peaks at 0.65, so this puts the hardest beat at
 * the top of the range and leaves the median near zero.
 */
const GLOW_PUNCH_GAIN = 1.6

/**
 * Emissive the buildings reach on the strongest beats. Against this scene,
 * clipping starts around 0.4.
 */
const GLOW_AT_FULL_PUNCH = 0.26

/**
 * How the glow itself rises and falls, in milliseconds. The punch signal is
 * spiky by construction, and following it directly strobes; a quick rise into
 * a slow fall turns each beat into a swell instead.
 */
const GLOW_ATTACK_MS = 60
const GLOW_DECAY_MS = 450

/**
 * Saturation and lightness of the glow, as percentages. Saturated and kept off
 * full lightness so a bright beat reads as colour instead of washing to white.
 */
const GLOW_SATURATION = 95
const GLOW_LIGHTNESS = 55

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
  const glowColor = new Color()
  /** Slow follower of the loudest band; the glow is whatever rises above it. */
  let glowBaseline = 0
  /** The glow actually in force, easing towards each beat's punch. */
  let glow = 0
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

    let peak = 0
    for (let band = 0; band < BINS; band += 1) {
      const target = (spectrum[band] ?? 0) / 255
      const level = levels[band] ?? 0
      const rate = approach(
        elapsed,
        target > level ? ATTACK_MS : RELEASE_MS,
      )
      const next = level + (target - level) * rate
      levels[band] = next
      if (next > peak) peak = next
    }
    smoothedAverage += (average - smoothedAverage) * approach(elapsed, RELEASE_MS)
    glowBaseline += (peak - glowBaseline) * approach(elapsed, GLOW_BASELINE_MS)

    orbitStartedAt ??= now

    // Only what a beat adds over the running baseline, so the city is dark
    // between beats instead of glowing flat out.
    const punch = Math.min(1, Math.max(0, peak - glowBaseline) * GLOW_PUNCH_GAIN)
    glow +=
      (punch - glow) *
      approach(elapsed, punch > glow ? GLOW_ATTACK_MS : GLOW_DECAY_MS)
    const hue = (now / HUE_MS_PER_DEGREE) % 360

    scene.setBuildingHeights(liftedHeights(levels))
    // The whole layer glows together: bloom reads one emissive buffer, so the
    // per-band difference stays in the heights rather than the light.
    scene.setBuildingGlow({
      color: glowColor.setStyle(
        `hsl(${hue}, ${GLOW_SATURATION}%, ${GLOW_LIGHTNESS}%)`,
      ),
      intensity: glow * GLOW_AT_FULL_PUNCH,
    })
    scene.orbitTo(
      (orbitFrom + (now - orbitStartedAt) * ORBIT_DEGREES_PER_MS) % 360,
    )
    // The same hue sweep and loudness-driven brightness the original demo
    // feeds into `map.setLight`, at a pace that suits a slow orbit.
    scene.setFillLight({
      color: lightColor.setStyle(
        `hsl(${hue}, ${50 + smoothedAverage * 50}%, 50%)`,
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
      glowBaseline = 0
      glow = 0
      scene.setContinuousRendering(false)
      // Back to the city as it really is.
      scene.setBuildingHeights(realBuildingHeights)
      scene.setBuildingGlow({ color: glowColor, intensity: 0 })
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
