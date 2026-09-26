import { Icon } from "@/components/icon"
import { TreeBuddy } from "@/components/tree-buddy"
import { colors, radius, rounded, statusMeta } from "@/constants/design"
import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { ChatMessage, TreeDetail } from "@/lib/types"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const suggestions = ["How are you feeling?", "I watered you 💧", "I'm on it!", "What's new on the block?"]

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useSession()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const list = useRef<FlatList<ChatMessage>>(null)
  const [tree, setTree] = useState<TreeDetail | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)

  const fetchMessages = useCallback(
    () => api<ChatMessage[]>(`/trees/${id}/chat?userId=${user?._id}&limit=50`),
    [id, user],
  )

  const load = useCallback(async () => {
    setMessages(await fetchMessages())
  }, [fetchMessages])

  useEffect(() => {
    if (!id || !user) return
    fetchMessages().then(setMessages, () => null)
    api<TreeDetail>(`/trees/${id}`).then(setTree, () => null)
  }, [id, user, fetchMessages])

  async function send(text = draft) {
    if (!id || !user || !text.trim() || sending) return
    const message = text.trim()
    setDraft("")
    setSending(true)
    setMessages((rows) => [
      ...rows,
      { _id: `pending-${Date.now()}`, role: "user", text: message, at: new Date().toISOString() },
    ])
    try {
      await api(`/trees/${id}/chat`, {
        method: "POST",
        body: JSON.stringify({ userId: user._id, message, channel: "app" }),
      })
      await load()
    } finally {
      setSending(false)
    }
  }

  const mood = tree ? statusMeta(tree.status).mood : "happy"
  const name = tree?.name || tree?.species || "Tree"

  return (
    <KeyboardAvoidingView style={styles.page} behavior="padding" keyboardVerticalOffset={insets.top + 44}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={styles.headerTitle}>
              <View style={styles.headerAvatar}>
                <TreeBuddy mood={mood} size={26} />
              </View>
              <Text style={styles.headerName}>{name}</Text>
            </View>
          ),
          headerRight: () => (
            <Pressable
              hitSlop={10}
              onPress={() => id && router.push({ pathname: "/tree/[id]/talk", params: { id } })}
            >
              <Icon name="mic.fill" color={colors.leafDeep} size={20} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <TreeBuddy mood={mood} size={110} />
            <Text style={styles.emptyTitle}>Say hi to {name}!</Text>
            <Text style={styles.emptyText}>It knows how thirsty it is and who watered it last.</Text>
          </View>
        }
        ListFooterComponent={
          sending ? (
            <View style={styles.row}>
              <View style={styles.bubbleAvatar}>
                <TreeBuddy mood={mood} size={20} />
              </View>
              <View style={[styles.bubble, styles.theirs]}>
                <Text style={styles.typing}>• • •</Text>
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) =>
          item.role === "user" ? (
            <View style={[styles.bubble, styles.mine]}>
              <Text style={styles.mineText}>{item.text}</Text>
            </View>
          ) : (
            <View style={styles.row}>
              <View style={styles.bubbleAvatar}>
                <TreeBuddy mood={mood} size={20} />
              </View>
              <View style={[styles.bubble, styles.theirs]}>
                <Text style={styles.body}>{item.text}</Text>
              </View>
            </View>
          )
        }
      />
      {messages.length === 0 ? (
        <View style={styles.suggestions}>
          {suggestions.map((text) => (
            <Pressable key={text} style={styles.suggestion} onPress={() => void send(text)}>
              <Text style={styles.suggestionText}>{text}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={`Text ${name}…`}
          placeholderTextColor={colors.muted}
          onSubmitEditing={() => void send()}
          returnKeyType="send"
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
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerName: { fontFamily: rounded, fontWeight: "800", fontSize: 17, color: colors.ink },
  list: { padding: 16, gap: 8, flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 40 },
  emptyTitle: { fontFamily: rounded, fontWeight: "800", fontSize: 22, color: colors.ink },
  emptyText: { color: colors.inkSoft, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  bubbleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  bubble: { maxWidth: "78%", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.leaf, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.card, borderBottomLeftRadius: 6 },
  body: { color: colors.ink, fontSize: 16, lineHeight: 21 },
  mineText: { color: "#fff", fontSize: 16, lineHeight: 21 },
  typing: { color: colors.muted, fontWeight: "800", letterSpacing: 2 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  suggestion: {
    backgroundColor: colors.mint,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  suggestionText: { color: colors.leafDeep, fontWeight: "700" },
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
    backgroundColor: colors.leaf,
    alignItems: "center",
    justifyContent: "center",
  },
})
