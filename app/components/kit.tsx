import { Icon } from "@/components/icon"
import { avatarTint, colors, radius, rounded, shadow, touch } from "@/constants/design"
import * as Haptics from "expo-haptics"
import type { SymbolViewProps } from "expo-symbols"
import type { ReactNode } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type SymbolName = SymbolViewProps["name"]

// Bright accents fail contrast behind white labels or as text; swap in their deep shade.
const deep: Record<string, string> = {
  [colors.water]: colors.waterDeep,
  [colors.leaf]: colors.leafDeep,
  [colors.thirsty]: colors.thirstyText,
  [colors.soil]: colors.soilDeep,
  [colors.muted]: colors.inkSoft,
}
export const textSafe = (color: string) => deep[color] ?? color

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
  hint,
}: {
  label: string
  icon?: SymbolName
  onPress: () => void
  variant?: "primary" | "soft" | "outline" | "ghost"
  color?: string
  busy?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  hint?: string
}) {
  const filled = variant === "primary"
  const safe = textSafe(color)
  const tint = filled ? "#fff" : safe
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress()
      }}
      style={({ pressed }) => [
        styles.button,
        filled && { backgroundColor: safe },
        variant === "soft" && { backgroundColor: `${safe}1A` },
        variant === "outline" && { borderWidth: 1.5, borderColor: `${safe}55`, backgroundColor: colors.card },
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
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
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
      <Text style={[styles.pillText, { color: textSafe(color) }]}>{label}</Text>
    </View>
  )
}

export function SectionTitle({ icon, title, color = colors.ink }: { icon?: SymbolName; title: string; color?: string }) {
  return (
    <View style={styles.sectionRow}>
      {icon ? <Icon name={icon} color={color} size={16} /> : null}
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: textSafe(color) }]}>
        {title}
      </Text>
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

/** Icon-only control with a 44pt target. `label` is what VoiceOver reads. */
export function IconButton({
  icon,
  label,
  onPress,
  color = colors.leafDeep,
  background = colors.mint,
  size = touch,
  disabled = false,
  style,
}: {
  icon: SymbolName
  label: string
  onPress: () => void
  color?: string
  background?: string
  size?: number
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={Math.max(0, (touch - size) / 2)}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
    >
      <Icon name={icon} color={color} size={Math.round(size * 0.42)} />
    </Pressable>
  )
}

/** Text link with a full 44pt hit area. */
export function LinkButton({
  label,
  onPress,
  color = colors.leafDeep,
  icon,
}: {
  label: string
  onPress: () => void
  color?: string
  icon?: SymbolName
}) {
  const tint = textSafe(color)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}
    >
      {icon ? <Icon name={icon} color={tint} size={14} /> : null}
      <Text style={[styles.linkText, { color: tint }]}>{label}</Text>
    </Pressable>
  )
}

/**
 * Soil moisture bar with the thirst line marked. Says whether it's a live reading or an estimate,
 * and reads as one sentence to VoiceOver.
 */
export function MoistureMeter({
  moisture,
  threshold,
  estimated = false,
  live = false,
  compact = false,
}: {
  moisture: number | null
  threshold: number
  estimated?: boolean
  live?: boolean
  compact?: boolean
}) {
  const pct = moisture === null ? null : Math.max(0, Math.min(100, Math.round(moisture)))
  const dry = pct !== null && pct < threshold
  const fill = dry ? colors.thirsty : colors.water
  const source = estimated ? "Estimated soil moisture" : live ? "Live soil moisture" : "Soil moisture"
  const spoken =
    pct === null
      ? `${source}: no reading yet`
      : `${source}: ${estimated ? "about " : ""}${pct} percent, ${dry ? "below" : "above"} the ${threshold} percent thirst line`
  return (
    <View accessible accessibilityLabel={spoken} style={{ gap: 6 }}>
      <View style={styles.meterRow}>
        <View style={styles.meterSource}>
          <Icon
            name={estimated ? "cloud.sun.fill" : live ? "dot.radiowaves.left.and.right" : "sensor.fill"}
            color={estimated ? colors.inkSoft : colors.waterDeep}
            size={13}
          />
          <Text style={styles.meterLabel}>{source}</Text>
        </View>
        <Text style={[compact ? styles.meterPctSmall : styles.meterPct, dry && { color: colors.thirstyText }]}>
          {pct === null ? "—" : `${estimated ? "~" : ""}${pct}%`}
        </Text>
      </View>
      <View style={[styles.track, compact && { height: 8 }]}>
        <View style={[styles.fill, { width: `${pct ?? 0}%`, backgroundColor: fill }, estimated && { opacity: 0.55 }]} />
        <View style={[styles.threshold, { left: `${threshold}%` }]} />
      </View>
    </View>
  )
}

/** Loading, empty and error states share one look: a face, one line, and at most one action. */
export function ScreenState({
  kind,
  title,
  text,
  action,
  onAction,
}: {
  kind: "loading" | "empty" | "error"
  title?: string
  text?: string
  action?: string
  onAction?: () => void
}) {
  if (kind === "loading") {
    return (
      <View style={styles.state} accessibilityLabel="Loading">
        <ActivityIndicator color={colors.leafDeep} size="large" />
      </View>
    )
  }
  return (
    <View style={styles.state}>
      <Icon
        name={kind === "error" ? "wifi.exclamationmark" : "leaf.fill"}
        color={kind === "error" ? colors.thirstyText : colors.leaf}
        size={40}
      />
      {title ? <Text style={styles.stateTitle}>{title}</Text> : null}
      {text ? <Text style={styles.stateText}>{text}</Text> : null}
      {action && onAction ? (
        <Button
          label={action}
          icon={kind === "error" ? "arrow.clockwise" : undefined}
          variant={kind === "error" ? "outline" : "primary"}
          onPress={onAction}
          style={{ alignSelf: "stretch", marginTop: 6 }}
        />
      ) : null}
    </View>
  )
}

/** Sticky bottom bar for a screen's one primary action, in thumb reach above the home indicator. */
export function ActionBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  return <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>{children}</View>
}

const styles = StyleSheet.create({
  iconButton: { alignItems: "center", justifyContent: "center" },
  link: { minHeight: touch, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 4 },
  linkText: { fontFamily: rounded, fontWeight: "800", fontSize: 15 },
  meterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  meterSource: { flexDirection: "row", alignItems: "center", gap: 5 },
  meterLabel: { color: colors.inkSoft, fontSize: 13, fontWeight: "600" },
  meterPct: { fontFamily: rounded, fontSize: 28, fontWeight: "800", color: colors.ink },
  meterPctSmall: { fontFamily: rounded, fontSize: 20, fontWeight: "800", color: colors.ink },
  track: { height: 12, backgroundColor: colors.bg, borderRadius: 99, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 99 },
  threshold: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: colors.ink, opacity: 0.45 },
  state: { alignItems: "center", gap: 10, paddingVertical: 48, paddingHorizontal: 24 },
  stateTitle: { fontFamily: rounded, fontSize: 20, fontWeight: "800", color: colors.ink, textAlign: "center" },
  stateText: { color: colors.inkSoft, fontSize: 16, lineHeight: 22, textAlign: "center" },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
    backgroundColor: "rgba(247,243,232,0.97)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 12, ...shadow },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.md,
    minHeight: 50,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  buttonText: { fontFamily: rounded, fontWeight: "700", fontSize: 16 },
  chip: {
    minHeight: touch,
    justifyContent: "center",
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
