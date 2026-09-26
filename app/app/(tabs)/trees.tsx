import { Icon } from "@/components/icon"
import { Button, Card, LinkButton, MoistureMeter, Pill, ScreenState } from "@/components/kit"
import { TreeBuddy } from "@/components/tree-buddy"
import { CardStickers } from "@/components/card-stickers"
import { TreePortrait } from "@/components/tree-portrait"
import { ago, colors, radius, rounded, statusMeta } from "@/constants/design"
import { api } from "@/lib/api"
import { cancelClaim } from "@/lib/messaging"
import { useSession } from "@/lib/session"
import type { MyTree } from "@/lib/types"
import * as Haptics from "expo-haptics"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useState } from "react"
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native"

/** "Which of my trees needs me?" Thirsty ones first, each with the one thing to do about it. */
export default function MyTrees() {
  const router = useRouter()
  const { user, setPin, flashCoins, toast } = useSession()
  const [trees, setTrees] = useState<MyTree[] | null>(null)
  const [error, setError] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    try {
      setTrees(await api<MyTree[]>(`/users/${user._id}/trees`))
      setError("")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load your trees")
    }
  }, [user])

  useFocusEffect(
    useCallback(() => {
      void load()
      const timer = setInterval(() => void load(), 5_000)
      return () => clearInterval(timer)
    }, [load]),
  )

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function cancel(tree: MyTree) {
    if (!user) return
    try {
      await cancelClaim(tree.id, user._id)
      toast(`No worries. ${tree.name ?? "Your tree"}'s crew knows it still needs someone.`)
      await load()
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Couldn't cancel that.")
    }
  }

  async function act(tree: MyTree, kind: "water" | "claim") {
    if (!user) return
    setBusy(tree.id)
    try {
      if (kind === "water") {
        const watered = await api<{ coinsEarned?: number }>(`/trees/${tree.id}/waterings`, {
          method: "POST",
          body: JSON.stringify({ userId: user._id, gallons: 5, source: "app" }),
        })
        setPin(tree.id, "ok")
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        const thanks = `5 gallons for ${tree.name ?? "your tree"} 💧`
        if (watered.coinsEarned) flashCoins(watered.coinsEarned, thanks)
        else toast(thanks)
      } else {
        await api(`/trees/${tree.id}/claim`, { method: "POST", body: JSON.stringify({ userId: user._id }) })
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        toast("You're on it. The crew knows 🙌")
      }
      await load()
    } catch (caught) {
      const claimed = caught as Error & { body?: { claim?: { name: string } } }
      toast(claimed.body?.claim ? `${claimed.body.claim.name} already has this one.` : claimed.message)
    } finally {
      setBusy(null)
    }
  }

  const needsWater = (tree: MyTree) =>
    tree.status === "thirsty" ||
    (tree.moistureSource === "estimate" && tree.moisture !== null && tree.moisture < tree.threshold)
  const needy = (trees ?? []).filter(needsWater)
  const fine = (trees ?? []).filter((tree) => !needsWater(tree))

  if (!trees) {
    return error ? (
      <ScreenState kind="error" title="Couldn't load your trees" text={error} action="Try again" onAction={() => void load()} />
    ) : (
      <ScreenState kind="loading" />
    )
  }

  if (trees.length === 0) {
    return (
      <View style={styles.empty}>
        <TreeBuddy mood="sleepy" size={120} />
        <Text style={styles.emptyTitle}>No trees yet</Text>
        <Text style={styles.emptyText}>Find a tree on your block, adopt it, and it&apos;ll text you when it&apos;s thirsty.</Text>
        <Button label="Find a tree on the map" icon="map.fill" style={{ alignSelf: "stretch" }} onPress={() => router.navigate("/map")} />
      </View>
    )
  }

  const renderTree = (tree: MyTree) => {
    const estimated = tree.moistureSource === "estimate"
    const dry = needsWater(tree)
    // Sensorless trees show an estimate, so their pill and face say "likely" instead of "no sensor".
    const meta = estimated
      ? { ...statusMeta(dry ? "thirsty" : "ok"), label: dry ? "Likely thirsty" : "Likely fine" }
      : statusMeta(tree.status)
    const mine = tree.claim?.userId === user?._id
    const name = tree.name ?? tree.species
    const open = () => router.push({ pathname: "/tree/[id]", params: { id: tree.id } })
    return (
      <Card key={tree.id} style={dry ? styles.cardThirsty : undefined}>
        <CardStickers stickers={tree.stickers} size={44} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${meta.label}`}
          accessibilityHint="Opens the tree"
          style={styles.header}
          onPress={open}
        >
          <View style={[styles.face, { backgroundColor: meta.soft }]}>
            <TreePortrait url={tree.portraitUrl} mood={meta.mood} size={tree.portraitUrl ? 60 : 54} badge={false} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Pill label={meta.label} icon={meta.icon} color={meta.color} soft={meta.soft} />
          </View>
          <Icon name="chevron.right" color={colors.inkSoft} size={14} />
        </Pressable>

        <MoistureMeter moisture={tree.moisture} threshold={tree.threshold} estimated={estimated} compact />
        <Text style={styles.facts}>
          Watered {ago(tree.lastWateredAt)} · {tree.adopters} caretaker{tree.adopters === 1 ? "" : "s"}
        </Text>

        {tree.claim ? (
          <View style={styles.claim}>
            <Icon name="hand.raised.fill" color={colors.soilDeep} size={14} />
            <Text style={styles.claimText}>{mine ? "You're" : `${tree.claim.name} is`} on it</Text>
            {mine ? <LinkButton label="Can't make it" color={colors.thirsty} onPress={() => void cancel(tree)} /> : null}
          </View>
        ) : null}

        {dry || mine ? (
          tree.status === "thirsty" && !tree.claim ? (
            <Button
              label="I'm on it"
              icon="hand.raised.fill"
              color={colors.soil}
              busy={busy === tree.id}
              hint="Tells the crew you'll bring water"
              onPress={() => void act(tree, "claim")}
            />
          ) : (
            <Button
              label="I watered it · 5 gal"
              icon="drop.fill"
              color={colors.water}
              busy={busy === tree.id}
              onPress={() => void act(tree, "water")}
            />
          )
        ) : null}
      </Card>
    )
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.leafDeep} />}
    >
      {error ? <Text style={styles.error}>Showing the last update. {error}</Text> : null}
      {needy.length ? (
        <Text accessibilityRole="header" style={[styles.section, { color: colors.thirstyText }]}>
          Needs you · {needy.length}
        </Text>
      ) : null}
      {needy.map(renderTree)}
      {fine.length ? (
        <Text accessibilityRole="header" style={styles.section}>
          {needy.length ? "Doing fine" : "All your trees are doing fine 🌿"}
        </Text>
      ) : null}
      {fine.map(renderTree)}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 32 },
  error: { color: colors.thirstyText, fontSize: 13, textAlign: "center" },
  section: { fontFamily: rounded, fontSize: 17, fontWeight: "800", color: colors.ink, marginTop: 4 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 24 },
  emptyTitle: { fontFamily: rounded, fontSize: 22, fontWeight: "800", color: colors.ink },
  emptyText: { color: colors.inkSoft, fontSize: 16, textAlign: "center", lineHeight: 22, marginBottom: 8 },
  cardThirsty: { borderWidth: 2, borderColor: colors.thirsty },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  face: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  headerText: { flex: 1, gap: 4 },
  name: { fontFamily: rounded, fontSize: 20, fontWeight: "800", color: colors.ink },
  facts: { color: colors.inkSoft, fontSize: 13 },
  claim: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.sunSoft,
    borderRadius: radius.md,
    paddingLeft: 12,
    paddingRight: 4,
    minHeight: 44,
  },
  claimText: { flex: 1, fontFamily: rounded, fontWeight: "700", color: colors.soilDeep, fontSize: 15 },
})
