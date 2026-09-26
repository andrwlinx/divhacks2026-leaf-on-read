import { Avatar } from "@/components/kit"
import { TreeBuddy } from "@/components/tree-buddy"
import { colors, rounded, statusMeta } from "@/constants/design"
import { api } from "@/lib/api"
import { unreadThreadIds, unreadTreeIds } from "@/lib/chat-read"
import { useSession } from "@/lib/session"
import type { ChatSummary, ThreadSummary } from "@/lib/types"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useState } from "react"
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native"

type Row =
  | { type: "thread"; key: string; thread: ThreadSummary }
  | { type: "tree"; key: string; chat: ChatSummary }

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
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [unread, setUnread] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!user) return
    const [threadRows, chatRows] = await Promise.all([
      api<ThreadSummary[]>(`/users/${user._id}/threads`),
      api<ChatSummary[]>(`/users/${user._id}/chats`),
    ])
    const [threadUnread, treeUnread] = await Promise.all([unreadThreadIds(threadRows, user._id), unreadTreeIds(chatRows)])
    setThreads(threadRows)
    setChats(chatRows)
    setUnread(new Set([...threadUnread, ...treeUnread]))
  }, [user])

  useFocusEffect(
    useCallback(() => {
      void load().catch(() => null)
      const timer = setInterval(() => void load().catch(() => null), 5_000)
      return () => clearInterval(timer)
    }, [load]),
  )

  const sections = [
    {
      title: "Neighbors",
      data: (threads ?? []).map((thread): Row => ({ type: "thread", key: thread.id, thread })),
    },
    {
      title: "Trees",
      data: (chats ?? []).map((chat): Row => ({ type: "tree", key: `tree-${chat.treeId}`, chat })),
    },
  ].filter((section) => section.data.length > 0)

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.key}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        threads && chats ? (
          <View style={styles.empty}>
            <TreeBuddy mood="happy" size={110} />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyText}>
              Adopt a tree to join its crew chat, tap a neighbor on the Block tab to message them, or say hi to one of
              your trees.
            </Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => {
        if (item.type === "thread") {
          const { thread } = item
          const isUnread = unread.has(thread.id)
          const meta = thread.status ? statusMeta(thread.status) : null
          const preview = thread.last
            ? `${thread.last.senderId === user?._id ? "You" : thread.last.senderName}: ${thread.last.text}`
            : `${thread.memberCount} caretaker${thread.memberCount === 1 ? "" : "s"} · say hi to the crew`
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]}
              onPress={() => router.push({ pathname: "/thread/[id]", params: { id: thread.id } })}
            >
              {thread.kind === "crew" && meta ? (
                <View style={[styles.avatar, { backgroundColor: meta.soft }]}>
                  <TreeBuddy mood={meta.mood} size={36} />
                  <View style={styles.crewBadge}>
                    <Text style={styles.crewBadgeText}>{thread.memberCount}</Text>
                  </View>
                </View>
              ) : (
                <Avatar name={thread.title} size={54} />
              )}
              <View style={styles.body}>
                <View style={styles.top}>
                  <Text style={[styles.name, isUnread && styles.bold]} numberOfLines={1}>{thread.title}</Text>
                  {thread.last ? <Text style={styles.time}>{when(thread.last.at)}</Text> : null}
                </View>
                <Text style={[styles.preview, isUnread && styles.previewUnread]} numberOfLines={2}>{preview}</Text>
              </View>
              {isUnread ? <View style={styles.dot} /> : null}
            </Pressable>
          )
        }
        const { chat } = item
        const meta = statusMeta(chat.status)
        const isUnread = unread.has(chat.treeId)
        return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]}
            onPress={() => router.push({ pathname: "/tree/[id]/chat", params: { id: chat.treeId } })}
          >
            <View style={[styles.avatar, { backgroundColor: meta.soft }]}>
              <TreeBuddy mood={meta.mood} size={40} />
            </View>
            <View style={styles.body}>
              <View style={styles.top}>
                <Text style={[styles.name, isUnread && styles.bold]} numberOfLines={1}>{chat.treeName}</Text>
                <Text style={styles.time}>{when(chat.last.at)}</Text>
              </View>
              <Text style={[styles.preview, isUnread && styles.previewUnread]} numberOfLines={2}>
                {chat.last.role === "user" ? "You: " : ""}
                {chat.last.text}
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
  list: { paddingBottom: 16, flexGrow: 1 },
  section: {
    fontFamily: rounded,
    fontWeight: "800",
    fontSize: 13,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  separator: { height: 1, backgroundColor: colors.line, marginLeft: 82 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", overflow: "visible" },
  crewBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.leafDeep,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  crewBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
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
