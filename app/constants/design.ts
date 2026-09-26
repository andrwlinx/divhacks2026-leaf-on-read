import type { TreeStatus } from "@/lib/types"
import type { SymbolViewProps } from "expo-symbols"

export const colors = {
  bg: "#F7F3E8",
  card: "#FFFFFF",
  ink: "#1F3A2B",
  inkSoft: "#5B6B5F",
  muted: "#A3AEA6",
  line: "#EDE6D6",
  leaf: "#3FA66B",
  leafDeep: "#1F6B45",
  mint: "#DDF3E4",
  water: "#3B9EEA",
  waterSoft: "#DCEFFD",
  thirsty: "#F2735B",
  thirstySoft: "#FDE3DC",
  sun: "#F6C453",
  sunSoft: "#FFF3D1",
  soil: "#8A6A4F",
  sleepy: "#8FA89A",
  sleepySoft: "#ECF0EC",
  blush: "#FF9AA2",
}

// iOS system rounded face; reads friendlier than the default for headings.
export const rounded = "ui-rounded"

export const radius = { sm: 12, md: 18, lg: 26, pill: 999 }

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
  soft: string
  icon: SymbolName
  mood: Mood
} {
  if (status === "thirsty") {
    return { label: "Thirsty", color: colors.thirsty, soft: colors.thirstySoft, icon: "drop.fill", mood: "thirsty" }
  }
  if (status === "ok") {
    return { label: "Happy", color: colors.leaf, soft: colors.mint, icon: "leaf.fill", mood: "happy" }
  }
  return { label: "No sensor", color: colors.sleepy, soft: colors.sleepySoft, icon: "moon.zzz.fill", mood: "sleepy" }
}

const avatarTints = ["#FFD6A5", "#CDEAC0", "#BDE0FE", "#FFC8DD", "#E2CFEA", "#FDFFB6"]

export function avatarTint(seed: string) {
  let sum = 0
  for (const char of seed) sum += char.charCodeAt(0)
  return avatarTints[sum % avatarTints.length]
}
