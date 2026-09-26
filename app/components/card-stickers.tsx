import type { StickerSlot, TreeSticker } from "@/lib/types"
import { Image } from "expo-image"
import { StyleSheet, View, type ViewStyle } from "react-native"

// Each slot is a corner of the tree's card; stickers hang a little off the edge at a slap-on angle.
const corners: Record<StickerSlot, (size: number) => ViewStyle> = {
  head: (size) => ({ top: -size * 0.28, left: -size * 0.18, transform: [{ rotate: "-12deg" }] }),
  face: (size) => ({ top: -size * 0.28, right: -size * 0.18, transform: [{ rotate: "10deg" }] }),
  side: (size) => ({ bottom: -size * 0.24, right: -size * 0.16, transform: [{ rotate: "-8deg" }] }),
  ground: (size) => ({ bottom: -size * 0.24, left: -size * 0.16, transform: [{ rotate: "9deg" }] }),
}

export const cornerLabels: Record<StickerSlot, string> = {
  head: "Top left",
  face: "Top right",
  side: "Bottom right",
  ground: "Bottom left",
}

/** Die-cut stickers slapped on the corners of a tree's card. The card must not clip its overflow. */
export function CardStickers({ stickers, size }: { stickers?: TreeSticker[] | null; size: number }) {
  return (
    <>
      {(stickers ?? []).map((sticker) => (
        <View key={sticker.slot} pointerEvents="none" style={[styles.sticker, { width: size, height: size }, corners[sticker.slot](size)]}>
          <Image source={{ uri: sticker.imageUrl }} style={styles.art} contentFit="contain" cachePolicy="memory-disk" />
        </View>
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  sticker: {
    position: "absolute",
    zIndex: 5,
    shadowColor: "#1F3A2B",
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  art: { width: "100%", height: "100%" },
})
