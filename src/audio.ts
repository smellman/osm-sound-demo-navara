/**
 * Number of frequency bands the visualizer works with. The original demo bins
 * buildings into this many groups, one per band.
 */
export const BINS = 16

/** Otherman Records' audio is not CORS-enabled, so it goes through a proxy. */
const PROXY_URL = 'https://proxy.smellman.org/proxy/'

const proxied = (url: string) => {
  const [, rest] = url.split('//')
  return rest === undefined ? url : PROXY_URL + encodeURIComponent(rest)
}

/**
 * The Web Audio graph behind the demo: a streaming `<audio>` element feeding a
 * gain stage, which fans out to the speakers and to an analyser the visualizer
 * reads each frame.
 */
export class AudioEngine {
  private readonly context = new AudioContext()
  private readonly gain = this.context.createGain()
  private readonly analyser = this.context.createAnalyser()
  private readonly data = new Uint8Array(BINS)
  private element: HTMLAudioElement | null = null

  /** Called when the current track plays to its end. */
  onEnded: () => void = () => {}

  constructor() {
    this.analyser.minDecibels = -90
    this.analyser.maxDecibels = -10
    // The visualizer runs its own attack/release envelope on top, so this only
    // needs to take the edge off the raw FFT.
    this.analyser.smoothingTimeConstant = 0.15
    this.analyser.fftSize = BINS * 2

    this.gain.connect(this.analyser)
    this.gain.connect(this.context.destination)
  }

  get playing() {
    return this.element !== null && !this.element.paused
  }

  get volume() {
    return this.gain.gain.value
  }

  set volume(value: number) {
    this.gain.gain.value = value
  }

  /** The latest spectrum, in the range 0-255 per band. Refreshed by `sample()`. */
  get spectrum(): Readonly<Uint8Array> {
    return this.data
  }

  /** Reads the current spectrum into `spectrum` and returns its average. */
  sample(): number {
    this.analyser.getByteFrequencyData(this.data)
    let total = 0
    for (const value of this.data) total += value
    return total / BINS
  }

  /**
   * Starts streaming `url`. Call it from a user gesture: browsers only let an
   * AudioContext start from one.
   */
  async play(url: string): Promise<void> {
    this.stop()
    // Unlocks the context on browsers that keep it suspended until a gesture
    // produces sound.
    await this.context.resume()

    const element = new Audio(proxied(url))
    element.crossOrigin = 'anonymous'
    element.addEventListener('ended', () => this.onEnded(), false)
    this.context.createMediaElementSource(element).connect(this.gain)
    this.element = element

    await element.play()
  }

  stop(): void {
    if (!this.element) return
    this.element.pause()
    this.element.currentTime = 0
    this.element = null
    this.data.fill(0)
  }
}
