import './style.scss'
// Bootstrap's own JS drives the About modal and the Fly To dropdown.
import 'bootstrap'
import { createMapView } from './map'
import { setupUI } from './ui'

const container = document.getElementById('map')
const statusElement = document.getElementById('hud-status')

if (!container) {
  throw new Error('#map container is missing from index.html')
}

const setStatus = (text: string) => {
  if (statusElement) statusElement.textContent = text
}

try {
  const view = await createMapView(container)
  setupUI(view, setStatus)
} catch (error) {
  console.error('Failed to initialize the map:', error)
  setStatus('failed to initialize the map — see the console')
}
