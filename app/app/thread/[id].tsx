import { Icon } from "@/components/icon"
import { Avatar, Button } from "@/components/kit"
import { TreeBuddy } from "@/components/tree-buddy"
import { colors, radius, rounded, statusMeta } from "@/constants/design"
import { api } from "@/lib/api"
import { markChatRead } from "@/lib/chat-read"
import { useSession } from "@/lib/session"
import type { NeighborMessage, ThreadDetail } from "@/lib/types"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const crewStarters = ["I can water tonight 💧", "Who's around this weekend?", "Took care of it this morning ✅"]

/** A conversation between neighbors: a tree's caretaker crew, or a 1:1 DM. */
export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useSession()
  const insets = useSafeAreaInsets()
  const list = useRef<FlatList<NeighborMessage>>(null)
  const pending = useRef(0)
  const [thread, setThread] = useState<ThreadDetail | null>(null)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [acting, setActing] = useState<"claim" | "water" | null>(null)

  const fetchThread = useCallback(
    () => api<ThreadDetail>(`/threads/${encodeURIComponent(id ?? "")}/messages?userId=${user?._id}`),
    [id, user],
  )

  useEffect(() => {
    if (!id || !user) return
    const apply = (next: ThreadDetail) => setThread(next)
    fetchThread().then(apply, (caught: Error) => setError(caught.message))
    const timer = setInterval(() => fetchThread().then(apply, () => null), 3_000)
    return () => clearInterval(timer)
  }, [id, user, fetchThread])

  // Reading the conversation (and each new message while it's open) clears its unread dot.
  useEffect(() => {
    if (id) void markChatRead(id)
  }, [id, thread?.messages.length])

  async function send(text = draft) {
    if (!id || !user || !text.trim() || sending) return
    const body = text.trim()
    setDraft("")
    setSending(true)
    pending.current += 1
    const optimistic: NeighborMessage = {
      _id: `pending-${pending.current}`,
      threadId: id,
      senderId: user._id,
      senderName: user.name,
      text: body,
      at: new Date().toISOString(),
    }
    setThread((current) => (current ? { ...current, messages: [...current.messages, optimistic] } : current))
    try {
      await api(`/threads/${encodeURIComponent(id)}/messages`, {
        method: "POST",
        body: JSON.stringify({ userId: user._id, text: body }),
      })
      setThread(await fetchThread())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't send that.")
    } finally {
      setSending(false)
    }
  }

  // Answer the tree's "who's got me?" right from the crew chat.
  async function actOnTree(kind: "claim" | "water") {
    if (!user || !thread?.tree) return
    setActing(kind)
    try {
      await api(
        kind === "claim" ? `/trees/${thread.tree.id}/claim` : `/trees/${thread.tree.id}/waterings`,
        {
          method: "POST",
          body: JSON.stringify(kind === "claim" ? { userId: user._id } : { userId: user._id, gallons: 5, source: "app" }),
        },
      )
      setThread(await fetchThread())
    } catch (caught) {
      const claimed = caught as Error & { body?: { claim?: { name: string } } }
      setError(claimed.body?.claim ? `${claimed.body.claim.name} already has this one.` : claimed.message)
    } finally {
      setActing(null)
    }
  }

  const crew = thread?.kind === "crew"
  const treeMood = thread?.tree ? statusMeta(thread.tree.status).mood : "happy"
  const lastTreePostId = [...(thread?.messages ?? [])].reverse().find((message) => message.kind === "tree")?._id
  const title = thread?.title ?? "Messages"
  const others = thread?.members.filter((member) => member.id !== user?._id) ?? []

  return (
    <KeyboardAvoidingView style={styles.page} behavior="padding" keyboardVerticalOffset={insets.top + 44}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={styles.headerTitle}>
              {crew ? (
                <View style={styles.headerFace}>
                  <TreeBuddy mood="happy" size={24} />
                </View>
              ) : (
                <Avatar name={title} size={30} />
              )}
              <View>
                <Text style={styles.headerName} numberOfLines={1}>{title}</Text>
                {crew ? <Text style={styles.headerMeta}>{thread?.members.length ?? 0} caretakers</Text> : null}
              </View>
            </View>
          ),
          headerRight: () =>
            crew && thread?.treeId ? (
              <Pressable hitSlop={10} onPress={() => router.push({ pathname: "/tree/[id]", params: { id: thread.treeId! } })}>
                <Icon name="leaf.fill" color={colors.leafDeep} size={20} />
              </Pressable>
            ) : null,
        }}
      />

      <FlatList
        ref={list}
        data={thread?.messages ?? []}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListHeaderComponent={
          crew && others.length ? (
            <Text style={styles.members}>With {others.map((member) => member.name).join(", ")}</Text>
          ) : null
        }
        ListEmptyComponent={
          thread ? (
            <View style={styles.empty}>
              {crew ? <TreeBuddy mood="happy" size={100} /> : <Avatar name={title} size={72} />}
              <Text style={styles.emptyTitle}>{crew ? `Say hi to the ${title}` : `Say hi to ${title}`}</Text>
              <Text style={styles.emptyText}>
                {crew
                  ? "Everyone here looks after the same tree. Figure out who's watering when."
                  : "Only the two of you can see this conversation."}
              </Text>
            </View>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : null
        }
        renderItem={({ item, index }) => {
          const mine = item.senderId === user?._id
          const previous = thread?.messages[index - 1]
          const showName = crew && !mine && previous?.senderId !== item.senderId
          if (item.kind === "tree") {
            const tree = thread?.tree
            const askable = item.action === "claim" && item._id === lastTreePostId && tree?.status === "thirsty"
            return (
              <View style={styles.row}>
                <View style={styles.treeAvatar}>
                  <TreeBuddy mood={treeMood} size={22} />
                </View>
                <View style={styles.theirsWrap}>
                  {showName ? <Text style={styles.sender}>{item.senderName}</Text> : null}
                  <View style={[styles.bubble, styles.treeBubble]}>
                    <Text style={styles.body}>{item.text}</Text>
                  </View>
                  {askable && tree?.claim ? (
                    <Text style={styles.claimed}>
                      🙋 {tree.claim.userId === user?._id ? "You're" : `${tree.claim.name} is`} on it
                    </Text>
                  ) : null}
                  {askable ? (
                    <View style={styles.treeActions}>
                      {!tree?.claim ? (
                        <Button
                          label="I'm on it"
                          icon="hand.raised.fill"
                          color={colors.soil}
                          style={styles.treeAction}
                          busy={acting === "claim"}
                          onPress={() => void actOnTree("claim")}
                        />
                      ) : null}
                      <Button
                        label="Watered"
                        icon="drop.fill"
                        color={colors.water}
                        style={styles.treeAction}
                        busy={acting === "water"}
                        onPress={() => void actOnTree("water")}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            )
          }
          return mine ? (
            <View style={[styles.bubble, styles.mine]}>
              <Text style={styles.mineText}>{item.text}</Text>
            </View>
          ) : (
            <View style={styles.row}>
              <Avatar name={item.senderName} size={26} />
              <View style={styles.theirsWrap}>
                {showName ? <Text style={styles.sender}>{item.senderName}</Text> : null}
                <View style={[styles.bubble, styles.theirs]}>
                  <Text style={styles.body}>{item.text}</Text>
                </View>
              </View>
            </View>
          )
        }}
      />

      {crew && thread && thread.messages.length === 0 ? (
        <View style={styles.starters}>
          {crewStarters.map((text) => (
            <Pressable key={text} style={styles.starter} onPress={() => void send(text)}>
              <Text style={styles.starterText}>{text}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={crew ? "Message the crew…" : `Message ${title}…`}
          placeholderTextColor={colors.muted}
          onSubmitEditing={() => void send()}
          returnKeyType="send"
          maxLength={1000}
        />
        <Pressable
          style={[styles.send, (!draft.trim() || sending) && { opacity: 0.4 }]}
          onPress={() => void send()}
          disabled={!draft.trim() || sending}
        >
          <Icon name="arrow.up" color="#fff" size={16} weight="bold" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  headerTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerFace: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerName: { fontFamily: rounded, fontWeight: "800", fontSize: 16, color: colors.ink, maxWidth: 220 },
  headerMeta: { color: colors.muted, fontSize: 11 },
  list: { padding: 16, gap: 6, flexGrow: 1 },
  members: { color: colors.muted, textAlign: "center", fontSize: 12, marginBottom: 8 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 40, paddingHorizontal: 20 },
  emptyTitle: { fontFamily: rounded, fontWeight: "800", fontSize: 20, color: colors.ink, textAlign: "center" },
  emptyText: { color: colors.inkSoft, textAlign: "center", lineHeight: 20 },
  error: { color: colors.thirsty, textAlign: "center", marginTop: 40 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  theirsWrap: { maxWidth: "78%", gap: 2 },
  sender: { color: colors.muted, fontSize: 12, fontWeight: "700", marginLeft: 4 },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { alignSelf: "flex-end", maxWidth: "78%", backgroundColor: colors.water, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.card, borderBottomLeftRadius: 6 },
  treeAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  treeBubble: { backgroundColor: colors.mint, borderBottomLeftRadius: 6 },
  treeActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  treeAction: { paddingVertical: 10, paddingHorizontal: 14 },
  claimed: { color: colors.soil, fontWeight: "700", fontSize: 13, marginTop: 2, marginLeft: 4 },
  body: { color: colors.ink, fontSize: 16, lineHeight: 21 },
  mineText: { color: "#fff", fontSize: 16, lineHeight: 21 },
  starters: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  starter: { backgroundColor: colors.waterSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  starterText: { color: colors.water, fontWeight: "700" },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontSize: 16,
    color: colors.ink,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.water,
    alignItems: "center",
    justifyContent: "center",
  },
})
