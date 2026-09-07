import './style.scss'
// Bootstrap's own JS drives the About modal and the Fly To dropdown.
import 'bootstrap'
import { AudioEngine } from './audio'
import { createMapScene } from './map'
import { setupPlayer } from './player'
import { fitMapToNavbar, setupUI } from './ui'
import { createVisualizer } from './visualizer'

const container = document.getElementById('map')
const statusElement = document.getElementById('hud-status')

if (!container) {
  throw new Error('#map container is missing from index.html')
}

const setStatus = (text: string) => {
  if (statusElement) statusElement.textContent = text
}

try {
  const scene = await createMapScene(container)
  const audio = new AudioEngine()
  const visualizer = createVisualizer(scene, audio)

  setupUI(scene, visualizer, setStatus)
  setupPlayer(audio, visualizer)
  fitMapToNavbar(scene, container)
} catch (error) {
  console.error('Failed to initialize the map:', error)
  setStatus('failed to initialize the map — see the console')
}
