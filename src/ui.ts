import { LOCATIONS } from './locations'
import type { MapScene } from './map'
import type { Visualizer } from './visualizer'

/**
 * Flies to a destination with the visualizer held off, so its per-frame camera
 * orbit does not fight the flight.
 */
const flyTo = (
  scene: MapScene,
  visualizer: Visualizer,
  lng: number,
  lat: number,
) => visualizer.suspendWhile(scene.flyTo({ lng, lat }))

/** Fills the Fly To dropdown from the shared location list. */
const setupFlyTo = (scene: MapScene, visualizer: Visualizer) => {
  const menu = document.getElementById('flyTo-menu')
  if (!menu) return

  for (const location of LOCATIONS) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.className = 'dropdown-item'
    link.href = '#'
    link.id = location.id
    link.textContent = location.label
    link.addEventListener('click', (event) => {
      event.preventDefault()
      void flyTo(scene, visualizer, location.lng, location.lat)
    })
    item.appendChild(link)
    menu.appendChild(item)
  }
}

const setupLocate = (
  scene: MapScene,
  visualizer: Visualizer,
  setStatus: (text: string) => void,
) => {
  const button = document.getElementById('locate-button')
  if (!(button instanceof HTMLButtonElement)) return

  if (!navigator.geolocation) {
    button.style.display = 'none'
    return
  }

  button.addEventListener('click', () => {
    button.disabled = true
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        button.disabled = false
        void flyTo(scene, visualizer, coords.longitude, coords.latitude)
      },
      (error) => {
        button.disabled = false
        console.error('Error getting location:', error)
        setStatus(`could not get your location: ${error.message}`)
      },
    )
  })
}

/** How often the HUD re-reads the camera while the scene is animating. */
const READOUT_INTERVAL_MS = 100

/** Mirrors the camera pose into the HUD, so the scene stays readable while panning. */
const setupCameraReadout = (
  scene: MapScene,
  setStatus: (text: string) => void,
) => {
  let lastRenderAt = 0

  const render = () => {
    // The engine camera is not readable on the very first frame after init():
    // `positionGeographic` asserts internally until it exists.
    let pose
    try {
      pose = {
        ...scene.view.camera.positionGeographic,
        ...scene.view.camera.orientation,
        zoom: scene.view.camera.zoom,
      }
    } catch {
      return
    }

    const { lng, lat, height, heading = 0, pitch = 0, zoom } = pose
    setStatus(
      `${lat.toFixed(5)}, ${lng.toFixed(5)} · ${Math.round(height)} m · ` +
        `heading ${Math.round(heading)}° · pitch ${Math.round(pitch)}°` +
        (zoom === undefined ? '' : ` · z${zoom.toFixed(1)}`),
    )
  }

  // `move` only fires for interactive camera changes, so the programmatic
  // orbit the visualizer drives is picked up off the render loop instead.
  scene.view.camera.on('move', render)
  scene.view.on('postRender', () => {
    const now = performance.now()
    if (now - lastRenderAt < READOUT_INTERVAL_MS) return
    lastRenderAt = now
    render()
  })
  render()
}

/**
 * Keeps the map out from under the fixed-bottom player navbar, whose height
 * changes when the controls wrap on narrow screens.
 *
 * @returns The fit function, to re-run when something else changes the navbar
 * — VJ mode hides it entirely.
 */
export const fitMapToNavbar = (scene: MapScene, container: HTMLElement) => {
  const fit = () => {
    const navbar = document.querySelector('.navbar')
    const navbarHeight = navbar instanceof HTMLElement ? navbar.offsetHeight : 0
    container.style.height = `${window.innerHeight - navbarHeight}px`
    // Navara's attribution UI is fixed to the viewport rather than to the map,
    // so it needs the navbar height as well — see `style.scss`.
    document.documentElement.style.setProperty(
      '--player-navbar-height',
      `${navbarHeight}px`,
    )
    scene.view.resize()
  }

  fit()
  window.addEventListener('resize', fit)
  window.addEventListener('orientationchange', fit)
  // The navbar reflows as the release list and the marquee fill in.
  new ResizeObserver(fit).observe(
    document.querySelector('.navbar') ?? document.body,
  )

  return fit
}

export const setupUI = (
  scene: MapScene,
  visualizer: Visualizer,
  setStatus: (text: string) => void,
) => {
  setupFlyTo(scene, visualizer)
  setupLocate(scene, visualizer, setStatus)
  setupCameraReadout(scene, setStatus)
}
