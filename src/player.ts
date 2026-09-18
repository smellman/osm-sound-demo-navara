import type { AudioEngine } from './audio'
import {
  fetchAllReleases,
  fetchReleaseById,
  type Release,
  type Track,
} from './otherman-records'
import type { Visualizer } from './visualizer'

const RELEASE_LINK_BASE = 'https://www.otherman-records.com/releases/'

const NO_TRACK_MESSAGE = 'No track selected, please select a release.'

const el = <T extends HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null

/**
 * The release/track player from the original demo: a release picker, transport
 * buttons and a volume popup. Starting playback also starts the visualizer,
 * which is what makes the buildings dance.
 *
 * @returns A handle for stopping the transport from outside, for VJ mode.
 */
export const setupPlayer = (audio: AudioEngine, visualizer: Visualizer) => {
  const select = el<HTMLSelectElement>('release-select')
  const playButton = el<HTMLButtonElement>('play-button')
  const previousButton = el<HTMLButtonElement>('prev-button')
  const nextButton = el<HTMLButtonElement>('next-button')
  const volumeButton = el<HTMLButtonElement>('volume-button')
  const title = el<HTMLSpanElement>('current-track')
  const link = el<HTMLAnchorElement>('current-link')

  let release: Release | null = null
  let trackIndex = 0

  const currentTrack = (): Track | undefined => release?.tracklist[trackIndex]

  const renderTrack = () => {
    const track = currentTrack()
    if (!track || !release) {
      if (title) title.textContent = NO_TRACK_MESSAGE
      if (link) {
        link.href = '#'
        link.target = ''
      }
      return
    }

    const artists = [release.artist1, release.artist2].filter(Boolean).join(' ')
    if (title) title.textContent = `${track.title} / ${artists}`
    if (link) {
      link.href = RELEASE_LINK_BASE + release.id
      link.target = '_blank'
    }
  }

  const renderPlayButton = () => {
    if (!playButton) return
    playButton.innerHTML = audio.playing
      ? '<i class="bi bi-stop-fill"></i>'
      : '<i class="bi bi-play-fill"></i>'
  }

  const stop = () => {
    audio.stop()
    visualizer.stop()
    renderPlayButton()
  }

  const play = async () => {
    const track = currentTrack()
    if (!track) return

    try {
      await audio.play(track.url)
      visualizer.start()
    } catch (error) {
      console.error('Error playing audio:', error)
      stop()
      return
    }
    renderPlayButton()
  }

  const skip = (offset: number) => {
    if (!release) return
    const { length } = release.tracklist
    trackIndex = (trackIndex + offset + length) % length
    renderTrack()
    if (audio.playing) {
      stop()
      void play()
    }
  }

  audio.onEnded = () => {
    // The transport rolls on to the next track, as in the original.
    if (!release) return
    trackIndex = (trackIndex + 1) % release.tracklist.length
    renderTrack()
    void play()
  }

  playButton?.addEventListener('click', () => {
    if (audio.playing) stop()
    else void play()
  })
  previousButton?.addEventListener('click', () => skip(-1))
  nextButton?.addEventListener('click', () => skip(1))

  select?.addEventListener('change', async (event) => {
    const id = (event.target as HTMLSelectElement).value
    if (!id || release?.id === id) return

    const fetched = await fetchReleaseById(id)
    if (!fetched) {
      console.error('Release not found:', id)
      return
    }
    stop()
    release = fetched
    trackIndex = 0
    renderTrack()
  })

  volumeButton?.addEventListener('click', () => {
    const existing = document.getElementById('volume-control')
    if (existing) {
      existing.remove()
      return
    }

    const popup = document.createElement('div')
    popup.id = 'volume-control'
    popup.className = 'volume-control-popup'

    const range = document.createElement('input')
    range.type = 'range'
    range.min = '0'
    range.max = '1'
    range.step = '0.01'
    range.value = audio.volume.toString()
    range.addEventListener('input', () => {
      audio.volume = Number.parseFloat(range.value)
    })

    popup.appendChild(range)
    document.body.appendChild(popup)

    const bounds = volumeButton.getBoundingClientRect()
    popup.style.left = `${bounds.right}px`
    popup.style.top = `${bounds.top - 130}px`
  })

  renderTrack()
  renderPlayButton()


  // The release list is long enough that it is worth not blocking the map on it.
  void fetchAllReleases().then((releases) => {
    if (!select) return
    for (const item of releases) {
      const option = document.createElement('option')
      option.value = item.id
      const artists = [item.artist1, item.artist2].filter(Boolean).join(' ')
      option.textContent = `[${item.id}] ${item.title} / ${artists}`
      select.appendChild(option)
    }
  })

  // VJ mode takes the analyser over, so it needs to stop the transport the same
  // way the stop button does — otherwise the button keeps its playing state.
  return { stop }
}
