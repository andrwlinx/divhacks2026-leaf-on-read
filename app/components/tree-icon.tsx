import { TreePortrait } from "@/components/tree-portrait"
import type { Mood } from "@/constants/design"
import type { StickerSlot, TreeSticker } from "@/lib/types"
import { Image } from "expo-image"
import { StyleSheet, View } from "react-native"

// Where each slot's sticker sits on the icon, as fractions of its size (they may hang off the edge).
const anchors: Record<StickerSlot, { top: number; left: number }> = {
  head: { top: -0.14, left: 0.33 },
  face: { top: 0.36, left: 0.33 },
  side: { top: 0.12, left: 0.74 },
  ground: { top: 0.7, left: -0.06 },
}

/** A tree's icon (portrait or mascot face) with the stickers its caretakers placed, as round die-cut badges. */
export function TreeIcon({
  url,
  mood,
  size,
  stickers,
  badge = true,
}: {
  url?: string | null
  mood: Mood
  size: number
  stickers?: TreeSticker[]
  badge?: boolean
}) {
  // Tiny icons (map pins) stay clean; stickers would just be specks.
  const shown = size >= 34 ? (stickers ?? []) : []
  const sticker = Math.round(size * 0.34)
  return (
    <View style={{ width: size, height: size * (url ? 1 : 1.1) }}>
      <TreePortrait url={url} mood={mood} size={size} badge={badge && shown.length === 0} />
      {shown.map((item) => (
        <View
          key={item.slot}
          pointerEvents="none"
          style={[
            styles.badge,
            {
              width: sticker,
              height: sticker,
              borderRadius: sticker / 2,
              top: anchors[item.slot].top * size,
              left: anchors[item.slot].left * size,
              borderWidth: Math.max(1.5, sticker * 0.06),
            },
          ]}
        >
          <Image source={{ uri: item.imageUrl }} style={styles.art} contentFit="cover" cachePolicy="memory-disk" />
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    backgroundColor: "#fff",
    borderColor: "#fff",
    overflow: "hidden",
    shadowColor: "#1F3A2B",
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  art: { width: "100%", height: "100%" },
})
