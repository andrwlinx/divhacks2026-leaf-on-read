import { pinColor, type TreePin } from "@/lib/types"
import MapView, { Marker } from "react-native-maps"
import { StyleSheet } from "react-native"

export function BlockMap({
  region,
  trees,
  pinOverrides,
  onRegion,
  onOpen,
}: {
  region: {
    latitude: number
    longitude: number
    latitudeDelta: number
    longitudeDelta: number
  }
  trees: TreePin[]
  pinOverrides: Record<string, TreePin["status"]>
  onRegion: (region: {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}) => void
  onOpen: (id: string) => void
}) {
  return (
    <MapView style={styles.map} initialRegion={region} onRegionChangeComplete={onRegion}>
      {trees.map((tree) => {
        const status = pinOverrides[tree.id] ?? tree.status
        return (
          <Marker
            key={tree.id}
            coordinate={{ latitude: tree.lat, longitude: tree.lng }}
            pinColor={pinColor(status)}
            title={tree.name || tree.species}
            description={status}
            onPress={() => onOpen(tree.id)}
          />
        )
      })}
    </MapView>
  )
}

const styles = StyleSheet.create({
  map: { flex: 1 },
})
