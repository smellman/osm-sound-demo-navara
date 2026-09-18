import type { AudioEngine } from './audio'
import type { Visualizer } from './visualizer'

/** Everything the demo hides so the map can be projected on its own. */
const CHROME_SELECTOR = '.navbar, .btn, #hud'

/**
 * VJ mode: the visualizer runs off a live audio input instead of the built-in
 * player, and the interface gets out of the way so the map fills the screen.
 *
 * The input is meant to be a loopback of the system output — Loopback.app on
 * macOS, a PipeWire remap source on Linux — so whatever is playing on stage
 * drives the buildings. The attribution credit deliberately stays visible.
 */
export const setupVJMode = (
  audio: AudioEngine,
  visualizer: Visualizer,
  player: { stop: () => void },
  refit: () => void,
) => {
  const button = document.getElementById('turn-on-vj-mode')
  if (!(button instanceof HTMLAnchorElement)) return

  // Without a capture API there is no way into this mode at all.
  if (!navigator.mediaDevices?.getUserMedia) {
    button.style.display = 'none'
    return
  }

  /** Elements hidden on the way in, to restore on the way out. */
  let hiddenChrome: HTMLElement[] = []

  const hideChrome = () => {
    hiddenChrome = [...document.querySelectorAll(CHROME_SELECTOR)].filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    )
    for (const element of hiddenChrome) element.style.display = 'none'
    // The navbar is gone, so the map — and the attribution docked above it —
    // take the whole viewport back.
    refit()
  }

  const showChrome = () => {
    for (const element of hiddenChrome) element.style.display = ''
    hiddenChrome = []
    refit()
  }

  const leave = () => {
    if (!audio.listening) return
    audio.stopListening()
    visualizer.stop()
    showChrome()
  }

  button.addEventListener('click', async (event) => {
    event.preventDefault()
    if (audio.listening) return

    // Hand the analyser over cleanly: this also resets the transport buttons.
    player.stop()

    try {
      await audio.listen()
    } catch (error) {
      console.error('Error turning on VJ Mode:', error)
      return
    }
    visualizer.start()
    hideChrome()
  })

  // The only way back, since VJ mode hides every control it could live on.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') leave()
  })
}
