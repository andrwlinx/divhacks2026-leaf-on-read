import { Icon } from "@/components/icon"
import { colors, radius, rounded, shadow } from "@/constants/design"
import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { Sticker, StickerSlot, Wallet } from "@/lib/types"
import { Image } from "expo-image"
import * as Haptics from "expo-haptics"
import { Stack, useFocusEffect } from "expo-router"
import { useCallback, useState } from "react"
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"

const slotNames: Record<StickerSlot, string> = {
  head: "On its head",
  face: "On its face",
  side: "By its side",
  ground: "At its roots",
}

/** Spend coins on Grok Imagine stickers, then place them on a tree from its page. */
export default function Shop() {
  const { user } = useSession()
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [buying, setBuying] = useState<string | null>(null)
  const [note, setNote] = useState("")

  useFocusEffect(
    useCallback(() => {
      if (!user) return
      api<Sticker[]>("/stickers").then(setStickers, () => null)
      api<Wallet>(`/users/${user._id}/wallet`).then(setWallet, () => null)
    }, [user]),
  )

  async function buy(sticker: Sticker) {
    if (!user) return
    setBuying(sticker.id)
    try {
      setWallet(await api<Wallet>(`/users/${user._id}/stickers/${sticker.id}/buy`, { method: "POST" }))
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setNote(`Got the ${sticker.name.toLowerCase()}! Put it on one of your trees from its page.`)
    } catch (error) {
      setNote(error instanceof Error && error.message === "short" ? "Not enough coins yet. Water a tree!" : "Couldn't buy that.")
    } finally {
      setBuying(null)
    }
  }

  const coins = wallet?.coins ?? 0
  const slots: StickerSlot[] = ["head", "face", "side", "ground"]

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Stack.Screen
        options={{
          title: "Sticker shop",
          headerRight: () => (
            <View style={styles.balance}>
              <Text style={styles.balanceText}>{coins} 🪙</Text>
            </View>
          ),
        }}
      />
      <View style={styles.intro}>
        <Text style={styles.introText}>
          Earn coins by checking in every day and watering trees. Stickers go on the trees you look after, and the whole
          block sees them.
        </Text>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {stickers.length === 0 ? <ActivityIndicator color={colors.leafDeep} style={{ marginTop: 40 }} /> : null}

      {slots.map((slot) => {
        const items = stickers.filter((sticker) => sticker.slot === slot)
        if (items.length === 0) return null
        return (
          <View key={slot} style={styles.section}>
            <Text style={styles.sectionTitle}>{slotNames[slot]}</Text>
            <View style={styles.grid}>
              {items.map((sticker) => {
                const owned = wallet?.owned.includes(sticker.id)
                const short = sticker.price - coins
                return (
                  <View key={sticker.id} style={styles.card}>
                    <View style={styles.art}>
                      <Image source={{ uri: sticker.imageUrl }} style={styles.image} contentFit="contain" transition={150} />
                    </View>
                    <Text style={styles.name} numberOfLines={1}>{sticker.name}</Text>
                    {owned ? (
                      <View style={[styles.button, styles.owned]}>
                        <Icon name="checkmark" color={colors.leafDeep} size={12} weight="bold" />
                        <Text style={styles.ownedText}>Owned</Text>
                      </View>
                    ) : (
                      <Pressable
                        disabled={short > 0 || buying !== null}
                        onPress={() => void buy(sticker)}
                        style={({ pressed }) => [
                          styles.button,
                          short > 0 ? styles.locked : styles.buy,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        {buying === sticker.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={short > 0 ? styles.lockedText : styles.buyText}>{sticker.price} 🪙</Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                )
              })}
            </View>
          </View>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  balance: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  balanceText: { fontFamily: rounded, fontWeight: "800", color: colors.sun },
  intro: { backgroundColor: colors.sunSoft, borderRadius: radius.md, padding: 14 },
  introText: { color: colors.ink, lineHeight: 20 },
  note: { color: colors.leafDeep, fontWeight: "700", textAlign: "center" },
  section: { gap: 10 },
  sectionTitle: { fontFamily: rounded, fontWeight: "800", fontSize: 17, color: colors.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: {
    width: "48%",
    flexGrow: 1,
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 14,
    ...shadow,
  },
  art: {
    width: 88,
    height: 88,
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  image: { width: "100%", height: "100%" },
  name: { fontFamily: rounded, fontWeight: "700", color: colors.ink },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    alignSelf: "stretch",
    borderRadius: radius.pill,
    paddingVertical: 8,
    minHeight: 34,
  },
  buy: { backgroundColor: colors.leafDeep },
  buyText: { fontFamily: rounded, fontWeight: "800", color: "#fff" },
  locked: { backgroundColor: colors.bg },
  lockedText: { fontFamily: rounded, fontWeight: "800", color: colors.muted },
  owned: { backgroundColor: colors.mint },
  ownedText: { fontFamily: rounded, fontWeight: "800", color: colors.leafDeep },
})
