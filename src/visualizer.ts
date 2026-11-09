import { Color } from '@navaramap/three'
import type { Vector3 } from 'three'
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
 * How loud the music has to get before the water is at its roughest. The
 * smoothed average measures 0.39 at its median and 0.54 at its loudest, so
 * this puts a busy passage near the top of the range without pinning there.
 */
const CHOP_AT_FULL_LEVEL = 0.5

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

/**
 * Wave mode: the beat travels outward from the centre of the view as a ring,
 * as in the maplibre version's wave mode. That one sorts the buildings into 24
 * concentric layers 80 m apart and lets the wave cross a ring every 3 frames;
 * these are the same reach and pace, but continuous — each building reads the
 * beat as it was when the wave left the centre, delayed by its own distance.
 */
const WAVE_REACH_METRES = 24 * 80
/** Roughly 80 m every three 60 fps frames. */
const WAVE_SPEED_METRES_PER_MS = 1.6
/** How many of the lowest bands make up the beat that travels. */
const WAVE_BANDS = 4
/**
 * The ripple riding on the wave: its wavelength along the ground, how fast it
 * runs, and how much of the lift it accounts for at full energy.
 */
const RIPPLE_WAVELENGTH_METRES = 1000
const RIPPLE_MS_PER_RADIAN = 200
const RIPPLE_SHARE = 0.35
/** How the wave lifts a building, on the same terms as a band does. */
const WAVE_LIFT_METRES = 60
const WAVE_LIFT_RATIO = 1

/**
 * Recent beat energy, sampled once a frame, so a building at any distance can
 * read what the beat was when the wave passing it now left the centre.
 */
const createEnergyHistory = () => {
  // The wave takes 1.2 s to cross its reach; this many frames covers that
  // with room to spare even at 240 fps.
  const size = 1024
  const times = new Float64Array(size)
  const energies = new Float32Array(size)
  let newest = -1
  let length = 0

  return {
    push: (time: number, energy: number) => {
      newest = (newest + 1) % size
      times[newest] = time
      energies[newest] = energy
      length = Math.min(size, length + 1)
    },
    /** The energy as of `time`, or the oldest sample if it reaches back further. */
    at: (time: number) => {
      for (let step = 0; step < length; step += 1) {
        const index = (newest - step + size) % size
        if ((times[index] ?? 0) <= time) return energies[index] ?? 0
      }
      return length === 0 ? 0 : (energies[(newest - length + 1 + size) % size] ?? 0)
    },
    clear: () => {
      newest = -1
      length = 0
    },
  }
}

/**
 * The beat energy reaching each ring of `WAVE_RING_METRES` out from the
 * centre, rebuilt once a frame so every building in a ring shares one lookup.
 */
const WAVE_RING_METRES = 10
const WAVE_RINGS = Math.ceil(WAVE_REACH_METRES / WAVE_RING_METRES) + 1

/**
 * Turns the travelling beat into a building-height function. As in band mode,
 * every building keeps its real height at rest and grows up from the ground.
 * Buildings past the reach, or with no known position, ride the outermost
 * ring, as everything past the last layer does in the maplibre version.
 */
const waveHeights =
  (
    rings: Readonly<Float32Array>,
    center: Readonly<Vector3>,
    now: number,
  ): BuildingHeights =>
  (renderHeight, minHeight, position) => {
    const distance = position
      ? Math.hypot(
          position.x - center.x,
          position.y - center.y,
          position.z - center.z,
        )
      : WAVE_REACH_METRES
    const ring = Math.min(WAVE_RINGS - 1, Math.floor(distance / WAVE_RING_METRES))
    const energy = rings[ring] ?? 0
    const ripple =
      Math.sin(
        now / RIPPLE_MS_PER_RADIAN -
          (distance / RIPPLE_WAVELENGTH_METRES) * 2 * Math.PI,
      ) * RIPPLE_SHARE
    const resting = Math.max(renderHeight, minHeight + MIN_BUILDING_HEIGHT)
    const lift = WAVE_LIFT_METRES + resting * WAVE_LIFT_RATIO
    return {
      height: minHeight,
      extrudedHeight: resting + lift * Math.max(0, energy * (1 + ripple)),
    }
  }

export type Visualizer = {
  start: () => void
  stop: () => void
  /** Pauses the animation until `work` settles, so camera moves are not fought. */
  suspendWhile: <T>(work: Promise<T>) => Promise<T>
  /** Whether the buildings ripple out from the centre instead of dancing by band. */
  readonly waveMode: boolean
  setWaveMode: (enabled: boolean) => void
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
  let waveMode = false
  const energyHistory = createEnergyHistory()
  const waveRings = new Float32Array(WAVE_RINGS)

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

    if (waveMode) {
      let energy = 0
      for (let band = 0; band < WAVE_BANDS; band += 1) energy += levels[band] ?? 0
      energyHistory.push(now, energy / WAVE_BANDS)
      for (let ring = 0; ring < WAVE_RINGS; ring += 1) {
        waveRings[ring] = energyHistory.at(
          now - (ring * WAVE_RING_METRES) / WAVE_SPEED_METRES_PER_MS,
        )
      }
      scene.setBuildingHeights(waveHeights(waveRings, scene.orbitCenter(), now))
    } else {
      scene.setBuildingHeights(liftedHeights(levels))
    }
    // The water takes the smoothed average rather than the beat: a river
    // builds and settles over a passage, it does not flinch on every kick.
    scene.setWaterChop(Math.min(1, smoothedAverage / CHOP_AT_FULL_LEVEL))
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
      energyHistory.clear()
      smoothedAverage = 0
      glowBaseline = 0
      glow = 0
      scene.setContinuousRendering(false)
      // Back to the city as it really is.
      scene.setBuildingHeights(realBuildingHeights)
      scene.setBuildingGlow({ color: glowColor, intensity: 0 })
      scene.setWaterChop(0)
      scene.resetFillLight()
    },

    get waveMode() {
      return waveMode
    },

    setWaveMode: (enabled) => {
      waveMode = enabled
      // Start the wave from a still centre rather than replaying the beat
      // from the last time wave mode was on.
      energyHistory.clear()
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
