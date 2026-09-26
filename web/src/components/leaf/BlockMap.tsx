import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useMemo } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import { statusMeta, type TreeStatus } from './palette'
import type { TreeSticker } from './Stickers'
import { TreeFace } from './TreeFace'

export type MapTree = {
  recordId: string
  treeId: string
  name: string | null
  species: string
  lat: number
  lng: number
  status: TreeStatus
  hasSensor: boolean
  stickers?: TreeSticker[] | null
}

const center: [number, number] = [40.8075, -73.9626]

function icon(tree: MapTree, selected: boolean) {
  const meta = statusMeta(tree.status)
  // Sensor trees and adopted (named) trees get the big pin with a name tag.
  const big = tree.hasSensor || Boolean(tree.name)
  const size = big ? 54 : 30
  const face = renderToStaticMarkup(<TreeFace mood={meta.mood} size={big ? 40 : 22} />)
  const label = big
    ? `<div class="leaf-pin-label" style="background:${meta.color}">${tree.name ?? tree.species}</div>`
    : ''
  const html = `
    <div class="leaf-pin ${tree.status === 'thirsty' ? 'leaf-pin-thirsty' : ''} ${selected ? 'leaf-pin-selected' : ''}">
      ${label}
      <div class="leaf-pin-bubble" style="width:${size}px;height:${size}px;border-color:${meta.color};background:${meta.soft}">${face}</div>
      <div class="leaf-pin-tail" style="border-top-color:${meta.color}"></div>
    </div>`
  return L.divIcon({ html, className: 'leaf-pin-wrap', iconSize: [size, size + (big ? 30 : 8)], iconAnchor: [size / 2, size + (big ? 30 : 8)] })
}

/** Live block map: pins are redrawn whenever the synced `trees` records change. */
export function BlockMap({
  trees,
  selectedId,
  onSelect,
}: {
  trees: MapTree[]
  selectedId: string | null
  onSelect: (treeId: string) => void
}) {
  const markers = useMemo(
    () => trees.map((tree) => ({ tree, icon: icon(tree, tree.treeId === selectedId) })),
    [trees, selectedId],
  )
  return (
    <MapContainer center={center} zoom={16} scrollWheelZoom className="h-full w-full" zoomControl={false}>
      {/* Esri's light-gray canvas needs no API key (CARTO's basemaps now do). */}
      <TileLayer
        attribution="Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
        maxNativeZoom={16}
      />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
        maxNativeZoom={16}
      />
      {markers.map(({ tree, icon }) => (
        <Marker
          key={tree.treeId}
          position={[tree.lat, tree.lng]}
          icon={icon}
          zIndexOffset={tree.hasSensor ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(tree.treeId) }}
        />
      ))}
    </MapContainer>
  )
}
