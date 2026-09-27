import { Icon } from "@/components/icon"
import { Avatar, Card, LinkButton, SectionTitle } from "@/components/kit"
import { TreeBuddy } from "@/components/tree-buddy"
import { ago, colors, radius, rounded } from "@/constants/design"
import { api } from "@/lib/api"
import { messageNeighbor } from "@/lib/messaging"
import { useSession } from "@/lib/session"
import type { BlockActivity } from "@/lib/types"
import * as Linking from "expo-linking"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useState } from "react"
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native"

type Row = { userId: string; name: string; gallons: number; streak: number }

const medals = ["🥇", "🥈", "🥉"]
const BOARD_URL = "https://leafonread.app.space/home"

/** "My block has my back." Who needs help now, then who's been showing up. */
export default function Block() {
  const router = useRouter()
  const { user } = useSession()
  const [rows, setRows] = useState<Row[]>([])
  const [activity, setActivity] = useState<BlockActivity | null>(null)
  const [error, setError] = useState("")
  const [showAll, setShowAll] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    try {
      const [board, feed] = await Promise.all([
        api<Row[]>(`/blocks/${user.blockId}/leaderboard`),
        api<BlockActivity>(`/blocks/${user.blockId}/activity`),
      ])
      setRows(board)
      setActivity(feed)
      setError("")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load the block")
    }
  }, [user])

  useFocusEffect(
    useCallback(() => {
      void load()
      const timer = setInterval(() => void load(), 10_000)
      return () => clearInterval(timer)
    }, [load]),
  )

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const total = rows.reduce((sum, row) => sum + row.gallons, 0)
  const openTree = (id: string) => router.push({ pathname: "/tree/[id]", params: { id } })

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.leafDeep} />}
    >
      <View style={styles.hero} accessible accessibilityLabel={`${total} gallons poured by your block`}>
        <TreeBuddy mood="happy" size={86} />
        <View style={{ flex: 1 }}>
          <Text style={styles.total}>{total}</Text>
          <Text style={styles.totalLabel}>gallons poured by your block</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>Couldn&apos;t refresh the block. Pull down to try again.</Text> : null}

      {activity?.thirsty.length ? (
        <Card style={styles.thirstyCard}>
          <SectionTitle icon="drop.fill" title="Needs help now" color={colors.thirsty} />
          {activity.thirsty.map((tree) => (
            <Pressable
              key={tree.id}
              accessibilityRole="button"
              accessibilityLabel={`${tree.name}, ${tree.claimedBy ? `${tree.claimedBy} is on it` : "needs someone"}`}
              style={styles.thirstyRow}
              onPress={() => openTree(tree.id)}
            >
              <TreeBuddy mood="thirsty" size={34} />
              <Text style={styles.thirstyName}>{tree.name}</Text>
              <Text style={[styles.meta, !tree.claimedBy && styles.needs]}>
                {tree.claimedBy ? `🙋 ${tree.claimedBy} is on it` : "Needs someone"}
              </Text>
              <Icon name="chevron.right" color={colors.inkSoft} size={12} />
            </Pressable>
          ))}
        </Card>
      ) : null}

      <SectionTitle icon="trophy.fill" title="Leaderboard" color={colors.leafDeep} />
      <Text style={styles.meta}>Tap a neighbor to send them a message.</Text>
      {rows.length === 0 && !error ? <Text style={styles.empty}>No waterings yet. The first bucket gets the crown 👑</Text> : null}
      {rows.slice(0, showAll ? rows.length : 5).map((row, index) => {
        const me = user?._id === row.userId
        return (
          <Pressable
            key={row.userId}
            accessibilityRole={me ? undefined : "button"}
            accessibilityLabel={`Number ${index + 1}, ${row.name}${me ? ", you" : ""}, ${row.gallons} gallons, ${row.streak} day streak`}
            accessibilityHint={me ? undefined : "Sends them a message"}
            disabled={me || !user}
            onPress={() => user && void messageNeighbor(router, user._id, row.userId).catch(() => null)}
          >
          <Card style={[styles.row, me && styles.rowMe]}>
            <Text style={styles.rank}>{medals[index] ?? index + 1}</Text>
            <Avatar name={row.name} size={40} />
            <View style={styles.copy}>
              <Text style={styles.name}>
                {row.name}
                {me ? " (you)" : ""}
              </Text>
              <View style={styles.streak}>
                <Icon name="flame.fill" color={row.streak > 0 ? colors.streak : colors.muted} size={13} />
                <Text style={styles.meta}>{row.streak} day streak</Text>
              </View>
            </View>
            <View style={styles.gallons}>
              <Icon name="drop.fill" color={colors.water} size={13} />
              <Text style={styles.gallonsText}>{row.gallons}</Text>
            </View>
            {!me ? <Icon name="bubble.left.fill" color={colors.inkSoft} size={16} /> : null}
          </Card>
          </Pressable>
        )
      })}
      {rows.length > 5 ? (
        <LinkButton label={showAll ? "Show top 5" : `See all ${rows.length} neighbors`} onPress={() => setShowAll((open) => !open)} />
      ) : null}

      <SectionTitle icon="clock.fill" title="Recent on the block" color={colors.leafDeep} />
      <Card style={styles.feed}>
        {activity?.waterings.length ? (
          activity.waterings.slice(0, 6).map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              accessibilityLabel={`${entry.name} poured ${entry.gallons} gallons on ${entry.treeName}, ${ago(entry.at)}`}
              style={styles.feedRow}
              onPress={() => openTree(entry.treeId)}
            >
              <Avatar name={entry.name} size={30} />
              <Text style={styles.feedText} numberOfLines={2}>
                <Text style={styles.bold}>{entry.name}</Text> poured {entry.gallons} gal on{" "}
                <Text style={styles.bold}>{entry.treeName}</Text>
              </Text>
              <Text style={styles.meta}>{ago(entry.at)}</Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.empty}>Nothing yet today.</Text>
        )}
      </Card>

      <Pressable accessibilityRole="link" style={styles.web} onPress={() => void Linking.openURL(BOARD_URL)}>
        <Icon name="safari.fill" color={colors.leafDeep} size={18} />
        <Text style={styles.webText}>Open the live web board</Text>
        <Icon name="arrow.up.right" color={colors.leafDeep} size={14} />
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10, paddingBottom: 32 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.waterSoft,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 6,
  },
  total: { fontFamily: rounded, fontSize: 44, fontWeight: "800", color: colors.waterDeep },
  totalLabel: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  thirstyCard: { borderWidth: 2, borderColor: colors.thirsty, gap: 8, marginBottom: 6 },
  thirstyRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  needs: { color: colors.thirstyText, fontWeight: "700" },
  thirstyName: { flex: 1, fontFamily: rounded, fontWeight: "800", color: colors.ink, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  rowMe: { borderWidth: 2, borderColor: colors.leaf },
  rank: { fontFamily: rounded, fontSize: 20, fontWeight: "800", color: colors.inkSoft, width: 28, textAlign: "center" },
  copy: { flex: 1, gap: 2 },
  name: { fontFamily: rounded, fontWeight: "800", fontSize: 16, color: colors.ink },
  streak: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { color: colors.inkSoft, fontSize: 13 },
  gallons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.waterSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  gallonsText: { fontFamily: rounded, fontWeight: "800", color: colors.waterDeep },
  feed: { gap: 10, marginBottom: 6 },
  feedRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  feedText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 20 },
  bold: { fontWeight: "800" },
  web: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: 14,
    backgroundColor: colors.mint,
  },
  webText: { fontFamily: rounded, fontWeight: "800", color: colors.leafDeep, fontSize: 16 },
  error: { color: colors.thirstyText, textAlign: "center" },
  empty: { color: colors.inkSoft, fontSize: 15, textAlign: "center" },
})
