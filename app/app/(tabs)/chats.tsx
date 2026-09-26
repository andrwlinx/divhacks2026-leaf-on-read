import { TreeBuddy } from "@/components/tree-buddy"
import { colors, rounded, statusMeta } from "@/constants/design"
import { api } from "@/lib/api"
import { unreadTreeIds } from "@/lib/chat-read"
import { useSession } from "@/lib/session"
import type { ChatSummary } from "@/lib/types"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useState } from "react"
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native"

function when(iso: string) {
  const date = new Date(iso)
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  if (minutes < 60 * 24) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  return date.toLocaleDateString([], { month: "short", day: "numeric" })
}

export default function Chats() {
  const router = useRouter()
  const { user } = useSession()
  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [unread, setUnread] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!user) return
    const rows = await api<ChatSummary[]>(`/users/${user._id}/chats`)
    setChats(rows)
    setUnread(await unreadTreeIds(rows))
  }, [user])

  useFocusEffect(
    useCallback(() => {
      void load().catch(() => null)
      const timer = setInterval(() => void load().catch(() => null), 5_000)
      return () => clearInterval(timer)
    }, [load]),
  )

  return (
    <FlatList
      data={chats ?? []}
      keyExtractor={(item) => item.treeId}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        chats ? (
          <View style={styles.empty}>
            <TreeBuddy mood="happy" size={110} />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyText}>Open one of your trees and say hi. Texts from iMessage show up here too.</Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => {
        const meta = statusMeta(item.status)
        const isUnread = unread.has(item.treeId)
        return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]}
            onPress={() => router.push({ pathname: "/tree/[id]/chat", params: { id: item.treeId } })}
          >
            <View style={[styles.avatar, { backgroundColor: meta.soft }]}>
              <TreeBuddy mood={meta.mood} size={40} />
            </View>
            <View style={styles.body}>
              <View style={styles.top}>
                <Text style={[styles.name, isUnread && styles.bold]} numberOfLines={1}>{item.treeName}</Text>
                <Text style={styles.time}>{when(item.last.at)}</Text>
              </View>
              <Text style={[styles.preview, isUnread && styles.previewUnread]} numberOfLines={2}>
                {item.last.role === "user" ? "You: " : ""}
                {item.last.text}
              </Text>
            </View>
            {isUnread ? <View style={styles.dot} /> : null}
          </Pressable>
        )
      }}
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingVertical: 8, flexGrow: 1 },
  separator: { height: 1, backgroundColor: colors.line, marginLeft: 82 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  body: { flex: 1, gap: 2 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  name: { flex: 1, fontFamily: rounded, fontSize: 17, fontWeight: "700", color: colors.ink },
  bold: { fontWeight: "800" },
  time: { color: colors.muted, fontSize: 13 },
  preview: { color: colors.inkSoft, lineHeight: 19 },
  previewUnread: { color: colors.ink, fontWeight: "600" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.water },
  empty: { alignItems: "center", gap: 8, paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontFamily: rounded, fontSize: 22, fontWeight: "800", color: colors.ink },
  emptyText: { color: colors.inkSoft, textAlign: "center", lineHeight: 21 },
})
