import { Icon } from "@/components/icon"
import { Card, SectionTitle } from "@/components/kit"
import { colors, radius, rounded } from "@/constants/design"
import { api } from "@/lib/api"
import type { Sticker, StickerSlot, TreeSticker, Wallet } from "@/lib/types"
import { Image } from "expo-image"
import * as Haptics from "expo-haptics"
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

const slots: { slot: StickerSlot; label: string }[] = [
  { slot: "head", label: "Head" },
  { slot: "face", label: "Face" },
  { slot: "side", label: "Side" },
  { slot: "ground", label: "Roots" },
]

/** Caretakers put stickers they own on a tree, one per slot. Everyone on the block sees them. */
export function DecorateCard({
  treeId,
  treeName,
  userId,
  placed,
  onChanged,
}: {
  treeId: string
  treeName: string
  userId: string
  placed: TreeSticker[]
  onChanged: () => void
}) {
  const router = useRouter()
  const [catalog, setCatalog] = useState<Sticker[]>([])
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [open, setOpen] = useState<StickerSlot | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    api<Sticker[]>("/stickers").then(setCatalog, () => null)
    api<Wallet>(`/users/${userId}/wallet`).then(setWallet, () => null)
  }, [userId])

  async function place(slot: StickerSlot, stickerId: string | null) {
    try {
      await api(`/trees/${treeId}/stickers`, {
        method: "PUT",
        body: JSON.stringify({ userId, slot, stickerId }),
      })
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      setOpen(null)
      setError("")
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't place that sticker.")
    }
  }

  const bySlot = new Map(placed.map((item) => [item.slot, item]))
  const owned = catalog.filter((sticker) => wallet?.owned.includes(sticker.id) && sticker.slot === open)

  return (
    <Card>
      <View style={styles.header}>
        <SectionTitle icon="sparkles" title={`Decorate ${treeName}`} color={colors.leafDeep} />
        <Pressable hitSlop={8} onPress={() => router.push("/shop")}>
          <Text style={styles.coins}>{wallet ? `${wallet.coins} 🪙` : ""}</Text>
        </Pressable>
      </View>
      <View style={styles.slots}>
        {slots.map(({ slot, label }) => {
          const current = bySlot.get(slot)
          return (
            <Pressable
              key={slot}
              onPress={() => setOpen((value) => (value === slot ? null : slot))}
              style={[styles.slot, open === slot && styles.slotOpen]}
            >
              {current ? (
                <Image source={{ uri: current.imageUrl }} style={styles.slotArt} contentFit="cover" />
              ) : (
                <Icon name="plus" color={colors.muted} size={18} />
              )}
              <Text style={styles.slotLabel}>{label}</Text>
            </Pressable>
          )
        })}
      </View>

      {open ? (
        <View style={styles.picker}>
          {owned.length ? (
            <View style={styles.options}>
              {owned.map((sticker) => (
                <Pressable key={sticker.id} style={styles.option} onPress={() => void place(open, sticker.id)}>
                  <Image source={{ uri: sticker.imageUrl }} style={styles.optionArt} contentFit="cover" />
                  <Text style={styles.optionName} numberOfLines={1}>{sticker.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>You don&apos;t have a sticker for this spot yet.</Text>
          )}
          <View style={styles.pickerActions}>
            {bySlot.get(open) ? (
              <Pressable onPress={() => void place(open, null)}>
                <Text style={styles.remove}>Remove sticker</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable onPress={() => router.push("/shop")}>
              <Text style={styles.shop}>Get more in the shop →</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={styles.hint}>Stickers you place show up for the whole block, on the map and the web board.</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  coins: { fontFamily: rounded, fontWeight: "800", color: colors.ink },
  slots: { flexDirection: "row", gap: 8 },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  slotOpen: { borderColor: colors.leaf, borderStyle: "solid", backgroundColor: colors.mint },
  slotArt: { width: 40, height: 40, borderRadius: 20 },
  slotLabel: { fontSize: 11, fontWeight: "700", color: colors.inkSoft },
  picker: { gap: 10 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  option: { alignItems: "center", gap: 4, width: 72 },
  optionArt: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: "#fff" },
  optionName: { fontSize: 11, color: colors.inkSoft },
  empty: { color: colors.inkSoft },
  pickerActions: { flexDirection: "row", justifyContent: "space-between" },
  remove: { color: colors.thirsty, fontWeight: "700" },
  shop: { color: colors.leafDeep, fontWeight: "800" },
  hint: { color: colors.inkSoft, fontSize: 13, lineHeight: 18 },
  error: { color: colors.thirsty, fontWeight: "600" },
})
