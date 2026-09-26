import { Image } from "expo-image"
import { TreeBuddy } from "@/components/tree-buddy"
import { rounded, statusMeta } from "@/constants/design"
import type { TreePin } from "@/lib/types"
import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import MapView, { UrlTile } from "react-native-maps"

type Region = {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

const starBox = { width: 132, height: 86 }
const smallBox = { width: 36, height: 40 }

function mercatorY(latitude: number) {
  const radians = (latitude * Math.PI) / 180
  return Math.log(Math.tan(Math.PI / 4 + radians / 2))
}

// Screen point of a coordinate in the visible map. The center of the camera
// stays at the center of the view, and latitude is mapped with Mercator.
function project(latitude: number, longitude: number, region: Region, width: number, height: number) {
  const x = width / 2 + ((longitude - region.longitude) / region.longitudeDelta) * width
  const north = mercatorY(region.latitude + region.latitudeDelta / 2)
  const south = mercatorY(region.latitude - region.latitudeDelta / 2)
  const scale = height / (north - south)
  const y = height / 2 - (mercatorY(latitude) - mercatorY(region.latitude)) * scale
  return { x, y }
}

export function BlockMap({
  region,
  trees,
  pinOverrides,
  onRegion,
  onOpen,
}: {
  region: Region
  trees: TreePin[]
  pinOverrides: Record<string, TreePin["status"]>
  onRegion: (region: Region) => void
  onOpen: (id: string) => void
}) {
  const [camera, setCamera] = useState(region)
  const [size, setSize] = useState({ width: 0, height: 0 })

  return (
    <View style={styles.map} onLayout={(event) => setSize(event.nativeEvent.layout)}>
      <MapView
        style={styles.map}
        initialRegion={region}
        onRegionChange={setCamera}
        onRegionChangeComplete={(next) => {
          setCamera(next)
          onRegion(next)
        }}
        mapType="mutedStandard"
        userInterfaceStyle="light"
        loadingBackgroundColor="#FFFFFF"
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsTraffic={false}
        showsIndoors={false}
        showsCompass={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <UrlTile
          urlTemplate="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          shouldReplaceMapContent
          maximumZ={16}
        />
      </MapView>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {size.width > 0
          ? trees.map((tree) => {
              const point = project(tree.lat, tree.lng, camera, size.width, size.height)
              const status = pinOverrides[tree.id] ?? tree.status
              // Sensor trees and adopted (named) trees get the big pin with a name tag and stickers.
              const star = Boolean(tree.sensorId || tree.name)
              const box = star ? starBox : smallBox
              return (
                <TreePointer
                  key={tree.id}
                  name={tree.name || tree.species}
                  status={status}
                  star={star}
                  stickers={tree.stickers}
                  left={point.x - box.width / 2}
                  top={point.y - box.height}
                  onPress={() => onOpen(tree.id)}
                />
              )
            })
          : null}
      </View>
    </View>
  )
}

// Sticker badge spots around a 52px pin bubble (they sit outside its clipped circle).
const pinAnchors = { head: { top: -9, left: 17 }, face: { top: 18, left: 17 }, side: { top: 4, left: 40 }, ground: { top: 36, left: -6 } }

function TreePointer({
  name,
  status,
  star,
  stickers,
  left,
  top,
  onPress,
}: {
  name: string
  status: TreePin["status"]
  star: boolean
  stickers?: TreePin["stickers"]
  left: number
  top: number
  onPress: () => void
}) {
  const meta = statusMeta(status)
  const box = star ? starBox : smallBox
  return (
    <Pressable onPress={onPress} style={[styles.marker, box, { left, top }]}>
      {star ? (
        <View style={[styles.label, { backgroundColor: meta.color }]}>
          <Text style={styles.labelText} numberOfLines={1}>
            {name}
          </Text>
        </View>
      ) : null}
      <View>
        <View
          style={[
            styles.bubble,
            star ? styles.bubbleStar : styles.bubbleSmall,
            { borderColor: meta.color, backgroundColor: meta.soft },
          ]}
        >
          <TreeBuddy mood={meta.mood} size={star ? 38 : 22} />
        </View>
        {star
          ? (stickers ?? []).map((sticker) => (
              <View key={sticker.slot} style={[styles.sticker, pinAnchors[sticker.slot]]}>
                <Image source={{ uri: sticker.imageUrl }} style={styles.stickerArt} contentFit="cover" cachePolicy="memory-disk" />
              </View>
            ))
          : null}
      </View>
      <View style={[styles.tail, { borderTopColor: meta.color }]} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: "#FFFFFF" },
  marker: { position: "absolute", alignItems: "center", justifyContent: "flex-end" },
  label: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 3, maxWidth: 132 },
  labelText: { color: "#fff", fontFamily: rounded, fontWeight: "800", fontSize: 12 },
  bubble: { alignItems: "center", justifyContent: "center", borderWidth: 2.5, overflow: "hidden" },
  bubbleStar: { width: 52, height: 52, borderRadius: 26 },
  bubbleSmall: { width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  sticker: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#fff",
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  stickerArt: { width: "100%", height: "100%" },
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
})
