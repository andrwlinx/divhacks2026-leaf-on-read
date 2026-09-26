import { Icon } from "@/components/icon"
import { avatarTint, colors, radius, rounded, shadow } from "@/constants/design"
import * as Haptics from "expo-haptics"
import type { SymbolViewProps } from "expo-symbols"
import type { ReactNode } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"

type SymbolName = SymbolViewProps["name"]

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Button({
  label,
  icon,
  onPress,
  variant = "primary",
  color = colors.leafDeep,
  busy = false,
  disabled = false,
  style,
}: {
  label: string
  icon?: SymbolName
  onPress: () => void
  variant?: "primary" | "soft" | "outline"
  color?: string
  busy?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const filled = variant === "primary"
  const tint = filled ? "#fff" : color
  return (
    <Pressable
      disabled={disabled || busy}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress()
      }}
      style={({ pressed }) => [
        styles.button,
        filled && { backgroundColor: color },
        variant === "soft" && { backgroundColor: `${color}1A` },
        variant === "outline" && { borderWidth: 1.5, borderColor: `${color}55`, backgroundColor: colors.card },
        (pressed || disabled) && { opacity: 0.7, transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={tint} /> : icon ? <Icon name={icon} color={tint} size={18} /> : null}
      <Text style={[styles.buttonText, { color: tint }]}>{label}</Text>
    </Pressable>
  )
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  )
}

export function Pill({ label, icon, color, soft }: { label: string; icon?: SymbolName; color: string; soft: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: soft }]}>
      {icon ? <Icon name={icon} color={color} size={13} /> : null}
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  )
}

export function SectionTitle({ icon, title, color = colors.ink }: { icon?: SymbolName; title: string; color?: string }) {
  return (
    <View style={styles.sectionRow}>
      {icon ? <Icon name={icon} color={color} size={16} /> : null}
      <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
    </View>
  )
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarTint(name) },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{name.trim().slice(0, 1).toUpperCase() || "?"}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, gap: 12, ...shadow },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  buttonText: { fontFamily: rounded, fontWeight: "700", fontSize: 16 },
  chip: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.leafDeep, borderColor: colors.leafDeep },
  chipText: { color: colors.ink, fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { fontFamily: rounded, fontWeight: "700", fontSize: 13 },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: { fontFamily: rounded, fontWeight: "700", fontSize: 17 },
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: rounded, fontWeight: "800", color: colors.ink },
})
