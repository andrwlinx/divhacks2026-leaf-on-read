import type { TreeStatus } from "@/lib/types"
import type { SymbolViewProps } from "expo-symbols"

export const colors = {
  bg: "#F7F3E8",
  card: "#FFFFFF",
  ink: "#1F3A2B",
  inkSoft: "#5B6B5F",
  // Decorative strokes and dividers only; text uses inkSoft (5:1 on bg) so it stays readable outdoors.
  muted: "#A3AEA6",
  line: "#EDE6D6",
  leaf: "#3FA66B",
  leafDeep: "#1F6B45",
  mint: "#DDF3E4",
  water: "#3B9EEA",
  // Text-safe shades of the accent colors (≥4.5:1 on white, bg and their soft tints).
  waterDeep: "#1A66A3",
  waterSoft: "#DCEFFD",
  thirsty: "#F2735B",
  thirstySoft: "#FDE3DC",
  thirstyText: "#B5432C",
  sun: "#F6C453",
  sunSoft: "#FFF3D1",
  soil: "#8A6A4F",
  soilDeep: "#7A5A3F",
  streak: "#F28C38",
  sleepy: "#8FA89A",
  sleepySoft: "#ECF0EC",
  blush: "#FF9AA2",
}

// iOS system rounded face; reads friendlier than the default for headings.
export const rounded = "ui-rounded"

export const radius = { sm: 12, md: 18, lg: 22, pill: 999 }

// Nothing smaller than 13pt; headings in the rounded face.
export const type = {
  title: { fontFamily: rounded, fontSize: 28, fontWeight: "800" },
  heading: { fontFamily: rounded, fontSize: 20, fontWeight: "800" },
  body: { fontSize: 16, lineHeight: 22 },
  label: { fontFamily: rounded, fontSize: 15, fontWeight: "700" },
  caption: { fontSize: 13, lineHeight: 18 },
} as const

/** Apple's minimum touch target. */
export const touch = 44

export const shadow = {
  shadowColor: "#1F3A2B",
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
}

export type Mood = "happy" | "thirsty" | "sleepy"

type SymbolName = SymbolViewProps["name"]

export function statusMeta(status: TreeStatus): {
  label: string
  color: string
  /** Same hue, dark enough for text on white or the soft tint. */
  text: string
  soft: string
  icon: SymbolName
  mood: Mood
} {
  if (status === "thirsty") {
    return { label: "Thirsty", color: colors.thirsty, text: colors.thirstyText, soft: colors.thirstySoft, icon: "drop.fill", mood: "thirsty" }
  }
  if (status === "ok") {
    return { label: "Happy", color: colors.leaf, text: colors.leafDeep, soft: colors.mint, icon: "leaf.fill", mood: "happy" }
  }
  return { label: "No sensor", color: colors.sleepy, text: colors.inkSoft, soft: colors.sleepySoft, icon: "moon.zzz.fill", mood: "sleepy" }
}

const avatarTints = ["#FFD6A5", "#CDEAC0", "#BDE0FE", "#FFC8DD", "#E2CFEA", "#FDFFB6"]

export function avatarTint(seed: string) {
  let sum = 0
  for (const char of seed) sum += char.charCodeAt(0)
  return avatarTints[sum % avatarTints.length]
}

/** "5m ago" style relative time. */
export function ago(iso: string | null | undefined) {
  if (!iso) return "never"
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`
  return `${Math.round(minutes / 1440)}d ago`
}
