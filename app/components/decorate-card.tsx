import { Icon } from "@/components/icon"
import { cornerLabels } from "@/components/card-stickers"
import { Card, LinkButton, SectionTitle } from "@/components/kit"
import { colors, radius } from "@/constants/design"
import { api } from "@/lib/api"
import type { Sticker, StickerSlot, TreeSticker, Wallet } from "@/lib/types"
import { Image } from "expo-image"
import * as Haptics from "expo-haptics"
import { useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

// The four corners of the tree's card (API slot ids stay head/face/side/ground).
const slots: { slot: StickerSlot; label: string }[] = [
  { slot: "head", label: cornerLabels.head },
  { slot: "face", label: cornerLabels.face },
  { slot: "ground", label: cornerLabels.ground },
  { slot: "side", label: cornerLabels.side },
]

/** Caretakers slap stickers they own on the corners of a tree's card. Everyone on the block sees them. */
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
    api<Sticker[]>("/stickers").then(setCatalog, () => setError("Couldn't load your stickers."))
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
        <LinkButton label={wallet ? `${wallet.coins} 🪙` : "Shop"} color={colors.ink} onPress={() => router.push("/shop")} />
      </View>
      <View style={styles.slots}>
        {slots.map(({ slot, label }) => {
          const current = bySlot.get(slot)
          return (
            <Pressable
              key={slot}
              accessibilityRole="button"
              accessibilityLabel={`${label} corner, ${current ? "has a sticker" : "empty"}`}
              accessibilityState={{ expanded: open === slot }}
              onPress={() => setOpen((value) => (value === slot ? null : slot))}
              style={[styles.slot, open === slot && styles.slotOpen]}
            >
              {current ? (
                <Image source={{ uri: current.imageUrl }} style={styles.slotArt} contentFit="contain" />
              ) : (
                <Icon name="plus" color={colors.inkSoft} size={18} />
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
                <Pressable
                  key={sticker.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Put ${sticker.name} here`}
                  style={styles.option}
                  onPress={() => void place(open, sticker.id)}
                >
                  <Image source={{ uri: sticker.imageUrl }} style={styles.optionArt} contentFit="contain" />
                  <Text style={styles.optionName} numberOfLines={1}>{sticker.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>You don&apos;t have a sticker for this corner yet.</Text>
          )}
          <View style={styles.pickerActions}>
            {bySlot.get(open) ? (
              <LinkButton label="Remove sticker" color={colors.thirsty} onPress={() => void place(open, null)} />
            ) : (
              <View />
            )}
            <LinkButton label="Get more in the shop" icon="bag.fill" onPress={() => router.push("/shop")} />
          </View>
        </View>
      ) : (
        <Text style={styles.hint}>Stickers go on {treeName}&apos;s card, here and on the web board, for the whole block to see.</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  slots: { flexDirection: "row", gap: 8 },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 72,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  slotOpen: { borderColor: colors.leaf, borderStyle: "solid", backgroundColor: colors.mint },
  slotArt: { width: 44, height: 44 },
  slotLabel: { fontSize: 13, fontWeight: "700", color: colors.inkSoft, textAlign: "center" },
  picker: { gap: 10 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  option: { alignItems: "center", gap: 4, width: 72 },
  optionArt: { width: 60, height: 60 },
  optionName: { fontSize: 13, color: colors.inkSoft },
  empty: { color: colors.inkSoft, fontSize: 15 },
  pickerActions: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  hint: { color: colors.inkSoft, fontSize: 13, lineHeight: 18 },
  error: { color: colors.thirstyText, fontWeight: "600" },
})
