import { BlockMap } from "@/components/block-map"
import { Icon } from "@/components/icon"
import { Button, IconButton, MoistureMeter, Pill, textSafe } from "@/components/kit"
import { TreeBuddy } from "@/components/tree-buddy"
import { TreePortrait } from "@/components/tree-portrait"
import { colors, radius, rounded, shadow, statusMeta, touch } from "@/constants/design"
import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { TreeDetail, TreePin, TreeStatus } from "@/lib/types"
import * as Haptics from "expo-haptics"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
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

/**
 * Home. "Here's your block; these trees need someone now." The map is context; the sheet at the
 * bottom (in thumb reach) lists who needs water and turns a tapped pin into a preview with one action.
 */
export default function MapScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { user, pinOverrides, reconcilePins, toast } = useSession()
  const [region, setRegion] = useState(initialRegion)
  const [trees, setTrees] = useState<TreePin[]>([])
  const [error, setError] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focus, setFocus] = useState<(Region & { key: number }) | null>(null)

  const load = useCallback(
    async (next: Region) => {
      try {
        const rows = await api<TreePin[]>(`/trees?bbox=${bbox(next)}`)
        setTrees(rows)
        reconcilePins(rows)
        setError("")
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Map unavailable")
      }
    },
    [reconcilePins],
  )

  useFocusEffect(
    useCallback(() => {
      void load(region)
      const timer = setInterval(() => void load(region), 15_000)
      return () => clearInterval(timer)
    }, [load, region]),
  )

  const statusOf = (tree: TreePin) => pinOverrides[tree.id] ?? tree.status
  const counts = { thirsty: 0, ok: 0, no_sensor: 0 }
  for (const tree of trees) counts[statusOf(tree)] += 1
  const needy = counts.thirsty > 0
  // Nearest to the middle of the map first.
  const distance = (tree: TreePin) => (tree.lat - region.latitude) ** 2 + (tree.lng - region.longitude) ** 2
  const thirsty = trees.filter((tree) => statusOf(tree) === "thirsty").sort((a, b) => distance(a) - distance(b))

  const flyTo = (latitude: number, longitude: number, delta = 0.006) =>
    setFocus((current) => ({ latitude, longitude, latitudeDelta: delta, longitudeDelta: delta, key: (current?.key ?? 0) + 1 }))

  const select = (tree: TreePin) => {
    void Haptics.selectionAsync()
    setSelectedId(tree.id)
    flyTo(tree.lat - 0.0012, tree.lng)
  }

  return (
    <View style={styles.page}>
      <BlockMap
        region={initialRegion}
        trees={trees}
        pinOverrides={pinOverrides}
        focus={focus}
        selectedId={selectedId}
        onRegion={(next) => {
          setRegion(next)
          void load(next)
        }}
        onOpen={(id) => {
          const tree = trees.find((row) => row.id === id)
          if (tree) select(tree)
        }}
      />

      <View style={[styles.top, { top: insets.top + 8 }]}>
        <View style={styles.header}>
          <View style={[styles.buddy, { backgroundColor: needy ? colors.thirstySoft : colors.mint }]}>
            <TreeBuddy mood={needy ? "thirsty" : "happy"} size={34} />
          </View>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={styles.title}>
              {user ? `Hi ${user.name} 👋` : "Leaf on Read"}
            </Text>
            <Text style={styles.subtitle}>
              {needy
                ? `${counts.thirsty} tree${counts.thirsty === 1 ? "" : "s"} nearby need${counts.thirsty === 1 ? "s" : ""} water`
                : "Every tree nearby is happy"}
            </Text>
          </View>
        </View>
        <View style={styles.legend} accessible accessibilityLabel={legend.map((status) => `${counts[status]} ${statusMeta(status).label}`).join(", ")}>
          {legend.map((status) => {
            const meta = statusMeta(status)
            return (
              <View key={status} style={[styles.legendItem, { backgroundColor: meta.soft }]}>
                <Icon name={meta.icon} color={meta.color} size={12} />
                <Text style={[styles.legendText, { color: meta.text }]}>
                  {counts[status]} {meta.label.toLowerCase()}
                </Text>
              </View>
            )
          })}
        </View>
        {error ? (
          <View style={styles.error}>
            <Icon name="wifi.exclamationmark" color={colors.thirstyText} size={16} />
            <Text style={styles.errorText}>Can&apos;t reach the trees right now.</Text>
            <Pressable accessibilityRole="button" style={styles.retry} onPress={() => void load(region)}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* The tab bar sits below this screen, so no bottom safe-area inset is needed here. */}
      <View pointerEvents="box-none" style={styles.bottom}>
        <View pointerEvents="box-none" style={styles.tools}>
          <Text style={styles.credit}>© Esri</Text>
          <IconButton
            icon="location.fill"
            label="Back to my block"
            background={colors.card}
            style={shadow}
            onPress={() => {
              setSelectedId(null)
              flyTo(initialRegion.latitude, initialRegion.longitude, initialRegion.latitudeDelta)
            }}
          />
        </View>

        <View style={styles.sheet}>
          {selectedId ? (
            <Preview
              id={selectedId}
              userId={user?._id}
              onClose={() => setSelectedId(null)}
              onOpen={() => router.push({ pathname: "/tree/[id]", params: { id: selectedId } })}
              onClaimed={(name) => toast(`You're on it. ${name}'s crew knows 🙌`)}
              onError={toast}
            />
          ) : thirsty.length ? (
            <>
              <Text accessibilityRole="header" style={styles.sheetTitle}>
                Needs water now
              </Text>
              {thirsty.slice(0, 3).map((tree) => (
                <Pressable
                  key={tree.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${tree.name || tree.species}, thirsty, ${tree.address}`}
                  accessibilityHint="Shows the tree"
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                  onPress={() => select(tree)}
                >
                  <View style={[styles.rowFace, { backgroundColor: colors.thirstySoft }]}>
                    <TreePortrait url={tree.portraitUrl} mood="thirsty" size={40} badge={false} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {tree.name || tree.species}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {tree.address}
                    </Text>
                  </View>
                  <Icon name="chevron.right" color={colors.inkSoft} size={13} />
                </Pressable>
              ))}
              {thirsty.length > 3 ? <Text style={styles.rowMeta}>+{thirsty.length - 3} more on the map</Text> : null}
            </>
          ) : (
            <View style={styles.calm}>
              <Icon name="leaf.fill" color={colors.leaf} size={18} />
              <Text style={styles.calmText}>All good here. Tap any tree to meet it.</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

/** The tapped tree: face, status, moisture, and the one thing to do about it. */
function Preview({
  id,
  userId,
  onClose,
  onOpen,
  onClaimed,
  onError,
}: {
  id: string
  userId?: string
  onClose: () => void
  onOpen: () => void
  onClaimed: (name: string) => void
  onError: (text: string) => void
}) {
  const [tree, setTree] = useState<TreeDetail | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    const fetchTree = () =>
      api<TreeDetail>(`/trees/${id}`).then(
        (detail) => live && setTree(detail),
        () => null,
      )
    void fetchTree()
    const timer = setInterval(fetchTree, 4000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [id])

  if (!tree || tree.id !== id) {
    return (
      <View style={styles.previewLoading}>
        <TreeBuddy mood="sleepy" size={40} />
        <Text style={styles.rowMeta}>Waking the tree up…</Text>
      </View>
    )
  }

  const meta = statusMeta(tree.status)
  const name = tree.name || tree.species
  const canClaim = tree.status === "thirsty" && !tree.claim && Boolean(userId)

  async function claim() {
    if (!userId) return
    setBusy(true)
    try {
      await api(`/trees/${id}/claim`, { method: "POST", body: JSON.stringify({ userId }) })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      onClaimed(name)
      setTree(await api<TreeDetail>(`/trees/${id}`))
    } catch (error) {
      const claimed = error as Error & { body?: { claim?: { name: string } } }
      onError(claimed.body?.claim ? `${claimed.body.claim.name} already has this one.` : claimed.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.previewHead}>
        <View style={[styles.previewFace, { backgroundColor: meta.soft }]}>
          <TreePortrait url={tree.portraitUrl} mood={meta.mood} size={56} badge={false} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.previewName} numberOfLines={1}>
            {name}
          </Text>
          <Pill label={meta.label} icon={meta.icon} color={meta.color} soft={meta.soft} />
        </View>
        <IconButton icon="xmark" label="Close" color={colors.inkSoft} background={colors.bg} size={36} onPress={onClose} />
      </View>
      {tree.sensorId || tree.latest ? (
        <MoistureMeter moisture={tree.latest?.moisture ?? null} threshold={tree.threshold} live={tree.sensorLive} compact />
      ) : null}
      {tree.claim ? (
        <Text style={styles.claim}>
          🙋 {tree.claim.userId === userId ? "You're" : `${tree.claim.name} is`} on it
        </Text>
      ) : null}
      <View style={styles.previewActions}>
        {canClaim ? (
          <>
            <Button label="Open" variant="outline" onPress={onOpen} />
            <Button label="I'm on it" icon="hand.raised.fill" color={colors.soil} busy={busy} style={{ flex: 1 }} onPress={() => void claim()} />
          </>
        ) : (
          <Button label={`Open ${name}`} icon="arrow.right" style={{ flex: 1 }} onPress={onOpen} />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFFFFF" },
  top: {
    position: "absolute",
    left: 12,
    right: 12,
    backgroundColor: "rgba(255,255,255,0.97)",
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
  subtitle: { color: colors.inkSoft, fontSize: 15, marginTop: 1 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  legendText: { fontFamily: rounded, fontWeight: "700", fontSize: 13 },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.thirstySoft,
    paddingLeft: 12,
    borderRadius: radius.sm,
  },
  errorText: { color: colors.thirstyText, fontWeight: "600", flex: 1 },
  retry: { minHeight: touch, justifyContent: "center", paddingHorizontal: 14 },
  retryText: { color: colors.thirstyText, fontWeight: "800", fontSize: 15 },
  bottom: { position: "absolute", left: 12, right: 12, bottom: 12, gap: 10 },
  tools: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  credit: { color: colors.inkSoft, fontSize: 11, marginLeft: 2 },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    gap: 8,
    ...shadow,
    shadowOpacity: 0.16,
  },
  sheetTitle: { fontFamily: rounded, fontSize: 17, fontWeight: "800", color: colors.thirstyText },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  rowFace: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  rowName: { fontFamily: rounded, fontSize: 17, fontWeight: "800", color: colors.ink },
  rowMeta: { color: colors.inkSoft, fontSize: 13 },
  calm: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 28 },
  calmText: { color: colors.ink, fontSize: 15, fontWeight: "600", flex: 1 },
  previewLoading: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 60 },
  previewHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  previewFace: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  previewName: { fontFamily: rounded, fontSize: 22, fontWeight: "800", color: colors.ink },
  claim: { fontFamily: rounded, fontWeight: "700", color: textSafe(colors.soil), fontSize: 15 },
  previewActions: { flexDirection: "row", gap: 10 },
})
