import { Icon } from "@/components/icon"
import { Button, Card, Chip, SectionTitle } from "@/components/kit"
import { TreeBuddy } from "@/components/tree-buddy"
import { colors, radius, rounded } from "@/constants/design"
import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import { languages, type User } from "@/lib/types"
import * as Linking from "expo-linking"
import { useRouter } from "expo-router"
import type { SymbolViewProps } from "expo-symbols"
import { useEffect, useState } from "react"
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type Block = { _id: string; name: string }

export default function Onboarding() {
  const { saveUser } = useSession()
  const router = useRouter()
  const insets = useSafeAreaInsets()
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: insets.top + 12 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.heroBubble}>
            <Text style={styles.heroBubbleText}>psst… I get thirsty 💧</Text>
          </View>
          <TreeBuddy mood="happy" size={150} />
          <Text style={styles.title}>Leaf on Read</Text>
          <Text style={styles.lead}>Young street trees die of thirst. Adopt one on your block and it’ll text you when it needs water.</Text>
        </View>

        <Card>
          <SectionTitle icon="person.crop.circle.fill" title="About you" color={colors.leafDeep} />
          <Field icon="person.fill" value={name} onChangeText={setName} placeholder="Your first name" />
          <Field
            icon="phone.fill"
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 212 555 0123"
            keyboardType="phone-pad"
          />
        </Card>

        <Card>
          <SectionTitle icon="house.fill" title="Home block" color={colors.leafDeep} />
          <View style={styles.row}>
            {blocks.map((block) => (
              <Chip key={block._id} label={block.name} on={blockId === block._id} onPress={() => setBlockId(block._id)} />
            ))}
          </View>
        </Card>

        <Card>
          <SectionTitle icon="character.bubble.fill" title="Your tree speaks…" color={colors.leafDeep} />
          <View style={styles.row}>
            {languages.map((item) => (
              <Chip key={item.code} label={item.label} on={language === item.code} onPress={() => setLanguage(item.code)} />
            ))}
          </View>
        </Card>

        {error ? (
          <View style={styles.error}>
            <Icon name="exclamationmark.circle.fill" color={colors.thirsty} size={16} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Button label="Say hi to your tree" icon="hand.wave.fill" onPress={() => void submit()} busy={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Field({
  icon,
  ...input
}: {
  icon: SymbolViewProps["name"]
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  keyboardType?: "phone-pad"
}) {
  return (
    <View style={styles.field}>
      <Icon name={icon} color={colors.muted} size={16} />
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.muted}
        autoComplete={input.keyboardType ? "tel" : "given-name"}
        {...input}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 14, paddingBottom: 48 },
  hero: { alignItems: "center", gap: 6, marginBottom: 6 },
  heroBubble: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: -6,
  },
  heroBubbleText: { fontFamily: rounded, fontWeight: "700", color: colors.leafDeep },
  title: { fontFamily: rounded, fontSize: 34, fontWeight: "800", color: colors.ink },
  lead: { fontSize: 16, lineHeight: 22, color: colors.inkSoft, textAlign: "center", paddingHorizontal: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: colors.ink },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.thirstySoft,
    borderRadius: radius.sm,
    padding: 12,
  },
  errorText: { color: colors.thirsty, fontWeight: "600", flex: 1 },
})
