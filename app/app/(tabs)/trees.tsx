import { Icon } from "@/components/icon"
import { Button, Card, Pill } from "@/components/kit"
import { TreeBuddy } from "@/components/tree-buddy"
import { CardStickers } from "@/components/card-stickers"
import { TreePortrait } from "@/components/tree-portrait"
import { colors, radius, rounded, statusMeta } from "@/constants/design"
import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { MyTree } from "@/lib/types"
import * as Haptics from "expo-haptics"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useState } from "react"
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native"

function ago(iso: string | null) {
  if (!iso) return "never"
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`
  return `${Math.round(minutes / 1440)}d ago`
}

export default function MyTrees() {
  const router = useRouter()
  const { user, setPin, flashCoins } = useSession()
  const [trees, setTrees] = useState<MyTree[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState("")

  const load = useCallback(async () => {
    if (!user) return
    setTrees(await api<MyTree[]>(`/users/${user._id}/trees`))
  }, [user])

  useFocusEffect(
    useCallback(() => {
      void load().catch(() => null)
      const timer = setInterval(() => void load().catch(() => null), 5_000)
      return () => clearInterval(timer)
    }, [load]),
  )

  async function act(tree: MyTree, kind: "water" | "claim") {
    if (!user) return
    setBusy(`${kind}-${tree.id}`)
    try {
      if (kind === "water") {
        const watered = await api<{ coinsEarned?: number }>(`/trees/${tree.id}/waterings`, {
          method: "POST",
          body: JSON.stringify({ userId: user._id, gallons: 5, source: "app" }),
        })
        setPin(tree.id, "ok")
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        setNote(`Logged 5 gallons for ${tree.name ?? "your tree"} 💧`)
        flashCoins(watered.coinsEarned ?? 0, `Watered ${tree.name ?? "your tree"}`)
      } else {
        await api(`/trees/${tree.id}/claim`, { method: "POST", body: JSON.stringify({ userId: user._id }) })
        setNote(`You're on it. Neighbors will know.`)
      }
      await load()
    } catch (error) {
      const claimed = error as Error & { body?: { claim?: { name: string } } }
      setNote(claimed.body?.claim ? `${claimed.body.claim.name} already has this one.` : claimed.message)
    } finally {
      setBusy(null)
    }
  }

  // Thirsty first, whether a sensor says so or the estimate does.
  const dryness = (tree: MyTree) =>
    tree.status === "thirsty" ||
    (tree.moistureSource === "estimate" && tree.moisture !== null && tree.moisture < tree.threshold)
      ? 0
      : 1
  const sorted = [...(trees ?? [])].sort((a, b) => dryness(a) - dryness(b))

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} tintColor={colors.leafDeep} />}
    >
      {note ? <Text style={styles.note}>{note}</Text> : null}

      {trees?.length === 0 ? (
        <View style={styles.empty}>
          <TreeBuddy mood="sleepy" size={120} />
          <Text style={styles.emptyTitle}>No trees yet</Text>
          <Text style={styles.emptyText}>Find a tree on your block, adopt it, and it&apos;ll text you when it&apos;s thirsty.</Text>
          <Button label="Find a tree on the map" icon="map.fill" onPress={() => router.navigate("/map")} />
        </View>
      ) : null}

      {sorted.map((tree) => {
        const estimated = tree.moistureSource === "estimate"
        const pct = tree.moisture === null ? null : Math.round(tree.moisture)
        // Sensorless trees show an estimate, so their pill and face say "likely" instead of "no sensor".
        const likelyThirsty = estimated && pct !== null && pct < tree.threshold
        const meta = estimated
          ? { ...statusMeta(likelyThirsty ? "thirsty" : "ok"), label: likelyThirsty ? "Likely thirsty" : "Likely fine" }
          : statusMeta(tree.status)
        const mine = tree.claim?.userId === user?._id
        return (
          <Card key={tree.id} style={tree.status === "thirsty" || likelyThirsty ? styles.cardThirsty : undefined}>
            <CardStickers stickers={tree.stickers} size={44} />
            <Pressable style={styles.header} onPress={() => router.push({ pathname: "/tree/[id]", params: { id: tree.id } })}>
              <View style={[styles.face, { backgroundColor: meta.soft }]}>
                <TreePortrait url={tree.portraitUrl} mood={meta.mood} size={tree.portraitUrl ? 64 : 58} badge={false} />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.name} numberOfLines={1}>{tree.name ?? tree.species}</Text>
                <Text style={styles.meta} numberOfLines={1}>{tree.species} · {tree.address}</Text>
                <Pill label={meta.label} icon={meta.icon} color={meta.color} soft={meta.soft} />
              </View>
              <Icon name="chevron.right" color={colors.muted} size={14} />
            </Pressable>

            <View>
              <View style={styles.moistureRow}>
                <View style={styles.sourceRow}>
                  <Icon name={estimated ? "cloud.sun.fill" : "sensor.fill"} color={estimated ? colors.muted : colors.water} size={13} />
                  <Text style={styles.meta}>{estimated ? "Estimated soil moisture" : "Live soil moisture"}</Text>
                </View>
                <Text style={[styles.pct, estimated && styles.pctEstimated]}>
                  {pct === null ? "—" : `${estimated ? "~" : ""}${pct}%`}
                </Text>
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    { width: `${pct ?? 0}%`, backgroundColor: meta.color },
                    estimated && styles.fillEstimated,
                  ]}
                />
                <View style={[styles.threshold, { left: `${tree.threshold}%` }]} />
              </View>
              {estimated ? (
                <Text style={styles.estimateNote}>From its last watering and the past 3 days of rain and heat.</Text>
              ) : null}
            </View>

            <View style={styles.facts}>
              <Text style={styles.fact}>💧 Watered {ago(tree.lastWateredAt)}</Text>
              <Text style={styles.fact}>👥 {tree.adopters} caretaker{tree.adopters === 1 ? "" : "s"}</Text>
            </View>
            {tree.claim ? (
              <View style={styles.claim}>
                <Icon name="hand.raised.fill" color={colors.soil} size={14} />
                <Text style={styles.claimText}>{mine ? "You're" : `${tree.claim.name} is`} on it</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Button
                label="Watered"
                icon="drop.fill"
                color={colors.water}
                style={styles.action}
                busy={busy === `water-${tree.id}`}
                onPress={() => void act(tree, "water")}
              />
              {tree.status === "thirsty" && !tree.claim ? (
                <Button
                  label="On it"
                  icon="hand.raised.fill"
                  variant="outline"
                  color={colors.soil}
                  style={styles.action}
                  busy={busy === `claim-${tree.id}`}
                  onPress={() => void act(tree, "claim")}
                />
              ) : null}
              <Button
                label="Talk"
                icon="mic.fill"
                variant="soft"
                color={colors.leafDeep}
                style={styles.action}
                onPress={() => router.push({ pathname: "/tree/[id]/talk", params: { id: tree.id } })}
              />
            </View>
          </Card>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 32 },
  note: { color: colors.leafDeep, fontWeight: "700", textAlign: "center" },
  empty: { alignItems: "center", gap: 10, paddingTop: 40, paddingHorizontal: 20 },
  emptyTitle: { fontFamily: rounded, fontSize: 22, fontWeight: "800", color: colors.ink },
  emptyText: { color: colors.inkSoft, textAlign: "center", lineHeight: 21, marginBottom: 8 },
  cardThirsty: { borderWidth: 2, borderColor: colors.thirsty },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  face: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, gap: 3 },
  name: { fontFamily: rounded, fontSize: 20, fontWeight: "800", color: colors.ink },
  meta: { color: colors.inkSoft, fontSize: 13 },
  moistureRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 },
  pct: { fontFamily: rounded, fontSize: 20, fontWeight: "800", color: colors.ink },
  pctEstimated: { color: colors.inkSoft },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  fillEstimated: { opacity: 0.55 },
  estimateNote: { color: colors.muted, fontSize: 11, marginTop: 4 },
  track: { height: 10, backgroundColor: colors.bg, borderRadius: 99, overflow: "hidden" },
  fill: { height: 10, borderRadius: 99 },
  threshold: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: colors.ink, opacity: 0.35 },
  facts: { flexDirection: "row", gap: 14 },
  fact: { color: colors.inkSoft, fontSize: 13, fontWeight: "600" },
  claim: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: colors.sunSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  claimText: { fontFamily: rounded, fontWeight: "700", color: colors.soil, fontSize: 13 },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1, paddingVertical: 12, paddingHorizontal: 8 },
})
