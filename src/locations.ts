/** The fly-to destinations of the original demo, in the same order. */
export type Location = {
  id: string
  label: string
  lng: number
  lat: number
}

export const LOCATIONS: Location[] = [
  { id: 'tokyo', label: 'Tokyo / Japan', lng: 139.767165, lat: 35.680655 },
  { id: 'osaka', label: 'Osaka / Japan', lng: 135.4975879, lat: 34.7034131 },
  { id: 'sapporo', label: 'Sapporo / Japan', lng: 141.35079, lat: 43.06868 },
  { id: 'hiroshima', label: 'Hiroshima / Japan', lng: 132.455486, lat: 34.394377 },
  { id: 'fukuoka', label: 'Fukuoka / Japan', lng: 130.4017509, lat: 33.5898988 },
  { id: 'sendai', label: 'Sendai / Japan', lng: 140.883518, lat: 38.260128 },
  { id: 'kyoto', label: 'Kyoto / Japan', lng: 135.759535, lat: 34.985034 },
  { id: 'shimane', label: 'Shimane / Japan', lng: 133.064008, lat: 35.463968 },
  { id: 'firenze', label: 'Firenze / Italy', lng: 11.248662, lat: 43.777424 },
  { id: 'prishtina', label: 'Prishtina / Kosovo', lng: 21.163569, lat: 42.663895 },
  { id: 'nairobi', label: 'Nairobi / Kenya', lng: 36.816647, lat: -1.279803 },
  { id: 'manila', label: 'Manila / Philippines', lng: 121.067019, lat: 14.656875 },
]
