import { BlockMap } from "@/components/block-map"
import { Icon } from "@/components/icon"
import { TreeBuddy } from "@/components/tree-buddy"
import { colors, radius, rounded, shadow, statusMeta } from "@/constants/design"
import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { TreePin, TreeStatus } from "@/lib/types"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

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

const legend: TreeStatus[] = ["thirsty", "ok", "no_sensor"]

export default function MapScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, pinOverrides, reconcilePins } = useSession()
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
    }, [load, region]),
  )

  const counts = { thirsty: 0, ok: 0, no_sensor: 0 }
  for (const tree of trees) counts[pinOverrides[tree.id] ?? tree.status] += 1
  const needy = counts.thirsty > 0

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

      <View style={[styles.top, { top: insets.top + 8 }]}>
        <View style={styles.header}>
          <View style={[styles.buddy, { backgroundColor: needy ? colors.thirstySoft : colors.mint }]}>
            <TreeBuddy mood={needy ? "thirsty" : "happy"} size={34} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{user ? `Hi ${user.name} 👋` : "Leaf on Read"}</Text>
            <Text style={styles.subtitle}>
              {needy ? `${counts.thirsty} tree${counts.thirsty === 1 ? "" : "s"} on your block need water` : "Every tree on your block is happy"}
            </Text>
          </View>
        </View>
        <View style={styles.legend}>
          {legend.map((status) => {
            const meta = statusMeta(status)
            return (
              <View key={status} style={[styles.legendItem, { backgroundColor: meta.soft }]}>
                <Icon name={meta.icon} color={meta.color} size={12} />
                <Text style={[styles.legendText, { color: meta.color }]}>
                  {counts[status]} {meta.label.toLowerCase()}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      {error ? (
        <View style={[styles.error, { top: insets.top + 132 }]}>
          <Icon name="wifi.exclamationmark" color={colors.thirsty} size={16} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* The tab bar sits below this screen, so no bottom safe-area inset is needed here. */}
      <Text style={[styles.credit, { bottom: 8 }]}>© Esri</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFFFFF" },
  credit: {
    position: "absolute",
    left: 12,
    color: colors.muted,
    fontSize: 10,
  },
  top: {
    position: "absolute",
    left: 12,
    right: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: radius.lg,
    padding: 14,
    gap: 10,
    ...shadow,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  buddy: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  title: { fontFamily: rounded, fontSize: 20, fontWeight: "800", color: colors.ink },
  subtitle: { color: colors.inkSoft, marginTop: 1 },
  legend: { flexDirection: "row", gap: 6 },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  legendText: { fontFamily: rounded, fontWeight: "700", fontSize: 12 },
  error: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.thirstySoft,
    padding: 12,
    borderRadius: radius.sm,
  },
  errorText: { color: colors.thirsty, fontWeight: "600", flex: 1 },
})
