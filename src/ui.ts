import { LOCATIONS } from './locations'
import { INITIAL_CAMERA, type MapView } from './map'

/** How the fly-to and locate controls frame their destination. */
const ARRIVAL = {
  height: INITIAL_CAMERA.height,
  distance: INITIAL_CAMERA.distance,
  heading: 0,
  pitch: INITIAL_CAMERA.pitch,
  roll: 0,
} as const

const flyTo = (view: MapView, lng: number, lat: number) => {
  // Keep the same local solar time at the destination, so the buildings are
  // lit the same way wherever the camera lands.
  view.atmosphere.setDateFromCameraAt({ lng })
  return view.flyTo({ lng, lat, ...ARRIVAL })
}

/** Fills the Fly To dropdown from the shared location list. */
const setupFlyTo = (view: MapView) => {
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
      void flyTo(view, location.lng, location.lat)
    })
    item.appendChild(link)
    menu.appendChild(item)
  }
}

const setupLocate = (view: MapView, setStatus: (text: string) => void) => {
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
        void flyTo(view, coords.longitude, coords.latitude)
      },
      (error) => {
        button.disabled = false
        console.error('Error getting location:', error)
        setStatus(`could not get your location: ${error.message}`)
      },
    )
  })
}

/** Mirrors the camera pose into the HUD, so the scene stays readable while panning. */
const setupCameraReadout = (view: MapView, setStatus: (text: string) => void) => {
  const render = () => {
    // The engine camera is not readable on the very first frame after init():
    // `positionGeographic` asserts internally until it exists.
    let pose
    try {
      pose = {
        ...view.camera.positionGeographic,
        ...view.camera.orientation,
        zoom: view.camera.zoom,
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

  view.camera.on('move', render)
  render()
}

export const setupUI = (view: MapView, setStatus: (text: string) => void) => {
  setupFlyTo(view)
  setupLocate(view, setStatus)
  setupCameraReadout(view, setStatus)
}
