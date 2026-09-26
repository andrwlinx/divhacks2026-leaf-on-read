import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { ChatMessage } from "@/lib/types"
import { useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native"

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useSession()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    if (!id || !user) return
    const rows = await api<ChatMessage[]>(`/trees/${id}/chat?userId=${user._id}&limit=50`)
    setMessages(rows)
  }, [id, user])

  useEffect(() => {
    void load().catch(() => null)
  }, [load])

  async function send() {
    if (!id || !user || !draft.trim()) return
    const message = draft.trim()
    setDraft("")
    setSending(true)
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

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.mine : styles.theirs]}>
            <Text style={[styles.body, item.role === "user" && styles.mineText]}>{item.text}</Text>
          </View>
        )}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="How are you?"
          placeholderTextColor="#8D99AE"
        />
        <Pressable style={styles.send} onPress={() => void send()} disabled={sending}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  list: { padding: 16, gap: 8 },
  bubble: { maxWidth: "80%", borderRadius: 16, padding: 12 },
  mine: { alignSelf: "flex-end", backgroundColor: "#1B4332" },
  theirs: { alignSelf: "flex-start", backgroundColor: "#fff" },
  body: { color: "#243027" },
  mineText: { color: "#F6F1E7" },
  composer: { flexDirection: "row", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: "#E4D9C8" },
  input: { flex: 1, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  send: { backgroundColor: "#1B4332", borderRadius: 12, paddingHorizontal: 14, justifyContent: "center" },
  sendText: { color: "#F6F1E7", fontWeight: "700" },
})
