import { Icon } from "@/components/icon"
import { Avatar, Button, Card, Chip, SectionTitle, textSafe } from "@/components/kit"
import { colors, radius, rounded } from "@/constants/design"
import { api } from "@/lib/api"
import { clearChatReads } from "@/lib/chat-read"
import { useSession } from "@/lib/session"
import { languages, type MyStats, type User, type Wallet } from "@/lib/types"
import * as Haptics from "expo-haptics"
import * as Linking from "expo-linking"
import { useFocusEffect, useRouter } from "expo-router"
import { useCallback, useState } from "react"
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"

const earnedFor: Record<Wallet["recent"][number]["reason"], string> = {
  checkin: "Daily check-in",
  watering: "Watered a tree",
  photo: "Verified watering photo",
  sticker: "Bought a sticker",
}

export default function Me() {
  const router = useRouter()
  const { user, saveUser, clearUser, toast } = useSession()
  const [stats, setStats] = useState<MyStats | null>(null)
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [name, setName] = useState(user?.name ?? "")

  useFocusEffect(
    useCallback(() => {
      if (!user) return
      api<MyStats>(`/users/${user._id}/stats`).then(setStats, () => null)
      api<Wallet>(`/users/${user._id}/wallet`).then(setWallet, () => null)
    }, [user]),
  )

  async function update(patch: Partial<Pick<User, "name" | "language">>) {
    if (!user) return
    try {
      const next = await api<User>(`/users/${user._id}`, { method: "PATCH", body: JSON.stringify(patch) })
      await saveUser(next)
      void Haptics.selectionAsync()
      toast(patch.language ? "Your trees will talk to you in this language now." : "Saved.")
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't save that.")
    }
  }

  if (!user) return null
  const agent = process.env.EXPO_PUBLIC_AGENT_PHONE

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Avatar name={user.name} size={72} />
        <Text style={styles.heroName}>{user.name}</Text>
        {user.homeBlock ? (
          <View style={styles.home}>
            <Icon name="house.fill" color={colors.leafDeep} size={13} />
            <Text style={styles.homeText}>{user.homeBlock}</Text>
          </View>
        ) : null}
        {stats?.rank ? (
          <Text style={styles.heroMeta}>
            #{stats.rank} of {stats.neighbors} neighbors on your block
          </Text>
        ) : null}
      </View>

      <View style={styles.stats}>
        <Stat value={stats?.gallons} label="gallons" icon="drop.fill" color={colors.water} />
        <Stat value={stats?.waterings} label="waterings" icon="checkmark.circle.fill" color={colors.leaf} />
        <Stat value={stats?.streak} label="day streak" icon="flame.fill" color={colors.streak} />
        <Stat value={stats?.trees} label="trees" icon="leaf.fill" color={colors.leafDeep} />
      </View>

      <Card style={styles.coinsCard}>
        <View style={styles.coinsRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.coins}>{wallet?.coins ?? "—"} 🪙</Text>
            <Text style={styles.meta}>
              {wallet?.streak ? `🔥 ${wallet.streak}-day check-in streak` : "Check in daily and water trees to earn coins"}
            </Text>
          </View>
          <Button label="Shop" icon="bag.fill" color={colors.leafDeep} onPress={() => router.push("/shop")} />
        </View>
        {wallet?.recent.slice(0, 4).map((entry) => (
          <View key={`${entry.at}-${entry.reason}`} style={styles.ledgerRow}>
            <Text style={styles.ledgerText}>{earnedFor[entry.reason]}</Text>
            <Text style={[styles.ledgerAmount, { color: entry.amount > 0 ? colors.leafDeep : colors.thirstyText }]}>
              {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
            </Text>
          </View>
        ))}
      </Card>

      <Card>
        <SectionTitle icon="person.fill" title="Your name" color={colors.leafDeep} />
        <View style={styles.nameRow}>
          <TextInput
            accessibilityLabel="Your name"
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={() => name.trim() && name.trim() !== user.name && void update({ name: name.trim() })}
          />
          <Button
            label="Save"
            variant="soft"
            disabled={!name.trim() || name.trim() === user.name}
            onPress={() => void update({ name: name.trim() })}
          />
        </View>
      </Card>

      <Card>
        <SectionTitle icon="character.bubble.fill" title="Your trees speak…" color={colors.leafDeep} />
        <View style={styles.chips}>
          {languages.map((item) => (
            <Chip
              key={item.code}
              label={item.label}
              on={user.language === item.code}
              onPress={() => item.code !== user.language && void update({ language: item.code })}
            />
          ))}
        </View>
      </Card>

      <Card>
        <SectionTitle icon="message.fill" title="Texts from your trees" color={colors.leafDeep} />
        <Text style={styles.body}>
          Your trees text you on iMessage when they&apos;re thirsty. If you haven&apos;t yet, say hi so they know it&apos;s you.
        </Text>
        <View style={styles.codeRow}>
          <Text style={styles.meta}>Your join code</Text>
          <Text style={styles.code}>{user.userCode}</Text>
        </View>
        {agent ? (
          <Button
            label="Text Gus on iMessage"
            icon="message.fill"
            onPress={() => void Linking.openURL(`sms:${agent}&body=${encodeURIComponent(`Hi 🌳 join ${user.userCode}`)}`)}
          />
        ) : null}
      </Card>

      <Text accessibilityRole="header" style={styles.demoTitle}>
        Demo
      </Text>
      <Button
        label="Reset this phone"
        icon="arrow.counterclockwise"
        variant="ghost"
        color={colors.thirsty}
        hint="Goes back to onboarding. Trees and waterings stay saved"
        onPress={() =>
          Alert.alert("Reset this phone?", "You'll go back to onboarding. Your trees and waterings stay saved.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Reset",
              style: "destructive",
              onPress: async () => {
                await clearChatReads()
                await clearUser()
                router.replace("/onboarding")
              },
            },
          ])
        }
      />
    </ScrollView>
  )
}

function Stat({
  value,
  label,
  icon,
  color,
}: {
  value: number | undefined
  label: string
  icon: "drop.fill" | "checkmark.circle.fill" | "flame.fill" | "leaf.fill"
  color: string
}) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value ?? "no"} ${label}`}>
      <Icon name={icon} color={color} size={18} />
      <Text style={[styles.statValue, { color: color === colors.streak ? colors.soilDeep : textSafe(color) }]}>{value ?? "—"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  hero: { alignItems: "center", gap: 6, paddingVertical: 6 },
  heroName: { fontFamily: rounded, fontSize: 28, fontWeight: "800", color: colors.ink },
  heroMeta: { color: colors.inkSoft, fontSize: 15, fontWeight: "600" },
  home: { flexDirection: "row", alignItems: "center", gap: 5 },
  homeText: { color: colors.leafDeep, fontSize: 15, fontWeight: "700" },
  stats: { flexDirection: "row", gap: 8 },
  coinsCard: { gap: 8, backgroundColor: colors.sunSoft },
  coinsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  coins: { fontFamily: rounded, fontSize: 30, fontWeight: "800", color: colors.ink },
  ledgerRow: { flexDirection: "row", justifyContent: "space-between" },
  ledgerText: { color: colors.inkSoft, fontSize: 15 },
  ledgerAmount: { fontFamily: rounded, fontWeight: "800" },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  statValue: { fontFamily: rounded, fontSize: 22, fontWeight: "800" },
  statLabel: { color: colors.inkSoft, fontSize: 13, fontWeight: "600", textAlign: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 16,
    color: colors.ink,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  demoTitle: { color: colors.inkSoft, fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1, marginTop: 8 },
  body: { color: colors.inkSoft, lineHeight: 21 },
  codeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  meta: { color: colors.inkSoft },
  code: { fontFamily: rounded, fontSize: 20, fontWeight: "800", letterSpacing: 2, color: colors.ink },
})
