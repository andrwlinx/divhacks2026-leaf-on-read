import { BlockMap } from "@/components/block-map"
import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { TreePin } from "@/lib/types"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

type Region = {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

const initialRegion: Region = {
  latitude: 40.8075,
  longitude: -73.9626,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
}

function bbox(region: Region) {
  const minLng = region.longitude - region.longitudeDelta / 2
  const minLat = region.latitude - region.latitudeDelta / 2
  const maxLng = region.longitude + region.longitudeDelta / 2
  const maxLat = region.latitude + region.latitudeDelta / 2
  return `${minLng},${minLat},${maxLng},${maxLat}`
}

export default function MapScreen() {
  const router = useRouter()
  const { pinOverrides, reconcilePins } = useSession()
  const [region, setRegion] = useState(initialRegion)
  const [trees, setTrees] = useState<TreePin[]>([])
  const [error, setError] = useState("")

  const load = useCallback(async (next: Region) => {
    try {
      const rows = await api<TreePin[]>(`/trees?bbox=${bbox(next)}`)
      setTrees(rows)
      reconcilePins(rows)
      setError("")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Map unavailable")
    }
  }, [reconcilePins])

  useFocusEffect(
    useCallback(() => {
      void load(region)
      const timer = setInterval(() => void load(region), 15_000)
      return () => clearInterval(timer)
    }, [load, region, reconcilePins]),
  )

  return (
    <View style={styles.page}>
      <BlockMap
        region={initialRegion}
        trees={trees}
        pinOverrides={pinOverrides}
        onRegion={(next) => {
          setRegion(next)
          void load(next)
        }}
        onOpen={(id) => router.push({ pathname: "/tree/[id]", params: { id } })}
      />
      <Pressable style={styles.board} onPress={() => router.push("/leaderboard")}>
        <Text style={styles.boardText}>Block leaderboard</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  board: {
    position: "absolute",
    bottom: 28,
    alignSelf: "center",
    backgroundColor: "#1B4332",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  boardText: { color: "#F6F1E7", fontWeight: "700" },
  error: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: "#fff",
    color: "#C44536",
    padding: 10,
    borderRadius: 10,
    overflow: "hidden",
  },
})
