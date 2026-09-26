import { TreeBuddy } from "@/components/tree-buddy"
import { colors, type Mood } from "@/constants/design"
import { Image } from "expo-image"
import { StyleSheet, View } from "react-native"

/**
 * A tree's Grok Imagine portrait, with its live mood face as a badge. Falls back to the mascot face
 * until a portrait exists (or while one is being drawn).
 */
export function TreePortrait({
  url,
  mood,
  size,
  badge = true,
}: {
  url?: string | null
  mood: Mood
  size: number
  badge?: boolean
}) {
  if (!url) return <TreeBuddy mood={mood} size={size} />
  const badgeSize = Math.max(22, Math.round(size * 0.32))
  return (
    <View style={{ width: size, height: size }}>
      <Image source={{ uri: url }} style={styles.image} contentFit="cover" transition={250} cachePolicy="memory-disk" />
      {badge ? (
        <View
          style={[
            styles.badge,
            { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2, right: -2, bottom: -2 },
          ]}
        >
          <TreeBuddy mood={mood} size={badgeSize * 0.8} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  image: { width: "100%", height: "100%", borderRadius: 999 },
  badge: {
    position: "absolute",
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.bg,
  },
})
