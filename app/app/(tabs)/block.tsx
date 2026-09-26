import { Icon } from "@/components/icon"
import { Avatar, Card, SectionTitle } from "@/components/kit"
import { TreeBuddy } from "@/components/tree-buddy"
import { colors, radius, rounded } from "@/constants/design"
import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { BlockActivity } from "@/lib/types"
import * as Linking from "expo-linking"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useState } from "react"
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native"

type Row = { userId: string; name: string; gallons: number; streak: number }

const medals = ["🥇", "🥈", "🥉"]
const BOARD_URL = "https://leafonread.app.space/home"

function ago(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`
  return `${Math.round(minutes / 1440)}d ago`
}

export default function Block() {
  const router = useRouter()
  const { user } = useSession()
  const [rows, setRows] = useState<Row[]>([])
  const [activity, setActivity] = useState<BlockActivity | null>(null)
  const [error, setError] = useState("")

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

  const total = rows.reduce((sum, row) => sum + row.gallons, 0)
  const openTree = (id: string) => router.push({ pathname: "/tree/[id]", params: { id } })

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} tintColor={colors.leafDeep} />}
    >
      <View style={styles.hero}>
        <TreeBuddy mood="happy" size={86} />
        <View style={{ flex: 1 }}>
          <Text style={styles.total}>{total}</Text>
          <Text style={styles.totalLabel}>gallons poured by your block</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {activity?.thirsty.length ? (
        <Card style={styles.thirstyCard}>
          <SectionTitle icon="drop.fill" title="Thirsty right now" color={colors.thirsty} />
          {activity.thirsty.map((tree) => (
            <Pressable key={tree.id} style={styles.thirstyRow} onPress={() => openTree(tree.id)}>
              <TreeBuddy mood="thirsty" size={34} />
              <Text style={styles.thirstyName}>{tree.name}</Text>
              <Text style={styles.meta}>{tree.claimedBy ? `${tree.claimedBy} is on it` : "needs someone"}</Text>
              <Icon name="chevron.right" color={colors.muted} size={12} />
            </Pressable>
          ))}
        </Card>
      ) : null}

      <SectionTitle icon="trophy.fill" title="Leaderboard" color={colors.leafDeep} />
      {rows.length === 0 && !error ? <Text style={styles.empty}>No waterings yet. The first bucket gets the crown 👑</Text> : null}
      {rows.map((row, index) => {
        const me = user?._id === row.userId
        return (
          <Card key={row.userId} style={[styles.row, me && styles.rowMe]}>
            <Text style={styles.rank}>{medals[index] ?? index + 1}</Text>
            <Avatar name={row.name} size={40} />
            <View style={styles.copy}>
              <Text style={styles.name}>
                {row.name}
                {me ? " (you)" : ""}
              </Text>
              <View style={styles.streak}>
                <Icon name="flame.fill" color={row.streak > 0 ? "#F28C38" : colors.muted} size={13} />
                <Text style={styles.meta}>{row.streak} day streak</Text>
              </View>
            </View>
            <View style={styles.gallons}>
              <Icon name="drop.fill" color={colors.water} size={13} />
              <Text style={styles.gallonsText}>{row.gallons}</Text>
            </View>
          </Card>
        )
      })}

      <SectionTitle icon="clock.fill" title="Recent on the block" color={colors.leafDeep} />
      <Card style={styles.feed}>
        {activity?.waterings.length ? (
          activity.waterings.slice(0, 12).map((entry) => (
            <Pressable key={entry.id} style={styles.feedRow} onPress={() => openTree(entry.treeId)}>
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

      <Pressable style={styles.web} onPress={() => void Linking.openURL(BOARD_URL)}>
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
  total: { fontFamily: rounded, fontSize: 44, fontWeight: "800", color: colors.water },
  totalLabel: { color: colors.ink, fontWeight: "600" },
  thirstyCard: { borderWidth: 2, borderColor: colors.thirsty, gap: 8, marginBottom: 6 },
  thirstyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  thirstyName: { flex: 1, fontFamily: rounded, fontWeight: "800", color: colors.ink, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  rowMe: { borderWidth: 2, borderColor: colors.leaf },
  rank: { fontFamily: rounded, fontSize: 20, fontWeight: "800", color: colors.muted, width: 28, textAlign: "center" },
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
  gallonsText: { fontFamily: rounded, fontWeight: "800", color: colors.water },
  feed: { gap: 10, marginBottom: 6 },
  feedRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  feedText: { flex: 1, color: colors.ink, lineHeight: 19 },
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
  error: { color: colors.thirsty },
  empty: { color: colors.inkSoft, textAlign: "center" },
})
