import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import { languages, type User } from "@/lib/types"
import * as Linking from "expo-linking"
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"

type Block = { _id: string; name: string }

export default function Onboarding() {
  const { saveUser } = useSession()
  const router = useRouter()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [language, setLanguage] = useState("en")
  const [blocks, setBlocks] = useState<Block[]>([])
  const [blockId, setBlockId] = useState("morningside")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<Block[]>("/blocks")
      .then((rows) => {
        setBlocks(rows)
        if (rows.some((block) => block._id === "morningside")) setBlockId("morningside")
        else if (rows[0]) setBlockId(rows[0]._id)
      })
      .catch(() => setError("Can't reach the API yet."))
  }, [])

  async function submit() {
    if (!name.trim() || !phone.trim()) {
      setError("Name and phone, then you can meet the tree.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const user = await api<User>("/users", {
        method: "POST",
        body: JSON.stringify({ phone: phone.trim(), name: name.trim(), blockId, language }),
      })
      await saveUser(user)
      const agent = process.env.EXPO_PUBLIC_AGENT_PHONE
      if (agent) {
        const body = encodeURIComponent(`Hi 🌳 join ${user.userCode}`)
        await Linking.openURL(`sms:${agent}&body=${body}`)
      }
      router.replace("/map")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.lead}>Young street trees die of thirst. Pick a block, and one of them can text you.</Text>
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Andrew" />
      <Text style={styles.label}>Phone</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="+1 212 555 0123"
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Text style={styles.label}>Home block</Text>
      <View style={styles.row}>
        {blocks.map((block) => (
          <Pressable key={block._id} style={[styles.chip, blockId === block._id && styles.chipOn]} onPress={() => setBlockId(block._id)}>
            <Text style={[styles.chipText, blockId === block._id && styles.chipTextOn]}>{block.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Language the tree should use</Text>
      <View style={styles.row}>
        {languages.map((item) => (
          <Pressable key={item.code} style={[styles.chip, language === item.code && styles.chipOn]} onPress={() => setLanguage(item.code)}>
            <Text style={[styles.chipText, language === item.code && styles.chipTextOn]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={submit} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "Saving…" : "Say hi to your tree"}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 8, paddingBottom: 48 },
  lead: { fontSize: 22, lineHeight: 28, color: "#1B4332", fontWeight: "700", marginBottom: 12 },
  label: { marginTop: 10, color: "#3D2B1F", fontWeight: "600" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E4D9C8",
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#E4D9C8" },
  chipOn: { backgroundColor: "#1B4332", borderColor: "#1B4332" },
  chipText: { color: "#1B4332" },
  chipTextOn: { color: "#F6F1E7" },
  button: { marginTop: 18, backgroundColor: "#1B4332", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  buttonText: { color: "#F6F1E7", fontWeight: "700", fontSize: 16 },
  error: { color: "#C44536", marginTop: 8 },
})
