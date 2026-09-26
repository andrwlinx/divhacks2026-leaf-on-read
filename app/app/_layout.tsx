import { Icon } from "@/components/icon"
import { TreeBuddy } from "@/components/tree-buddy"
import { colors, radius, rounded } from "@/constants/design"
import { SessionProvider, useSession } from "@/lib/session"
import { useAudioPlayer } from "expo-audio"
import * as Haptics from "expo-haptics"
import { Stack, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export default function RootLayout() {
  return (
    <SessionProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTintColor: colors.leafDeep,
          headerTitleStyle: { fontFamily: rounded, fontWeight: "700", color: colors.ink },
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="tree/[id]" options={{ title: "" }} />
        <Stack.Screen name="tree/[id]/chat" options={{ title: "Chat" }} />
        <Stack.Screen name="tree/[id]/talk" options={{ title: "Talk" }} />
        <Stack.Screen name="thread/[id]" options={{ title: "" }} />
        <Stack.Screen name="shop" options={{ title: "Sticker shop" }} />
      </Stack>
      <AlertBanner />
      <CoinToastView />
    </SessionProvider>
  )
}

function AlertBanner() {
  const { banner, dismissBanner } = useSession()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  useEffect(() => {
    if (!banner) return
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
  }, [banner])

  if (!banner) return null
  const mood = banner.type === "thirsty" || banner.type === "claim_expired" ? "thirsty" : "happy"
  return (
    <Pressable
      style={[styles.banner, { top: insets.top + 6 }]}
      onPress={() => {
        dismissBanner()
        router.push({ pathname: "/tree/[id]", params: { id: banner.treeId } })
      }}
    >
      <View style={styles.avatar}>
        <TreeBuddy mood={mood} size={38} />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{banner.treeName}</Text>
          <Text style={styles.now}>now</Text>
        </View>
        <Text style={styles.text} numberOfLines={3}>
          {banner.text}
        </Text>
      </View>
      {banner.voiceUrl ? <PlayClip url={banner.voiceUrl} /> : null}
    </Pressable>
  )
}

/** "+10 🪙 Watered Gus" pill that pops up above the tab bar after a check-in or watering. */
function CoinToastView() {
  const { coinToast } = useSession()
  const insets = useSafeAreaInsets()
  const [visible, setVisible] = useState<number | null>(null)

  useEffect(() => {
    if (!coinToast) return
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    const show = setTimeout(() => setVisible(coinToast.id), 0)
    const hide = setTimeout(() => setVisible(null), 2600)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [coinToast])

  if (!coinToast || visible !== coinToast.id) return null
  return (
    <View pointerEvents="none" style={[styles.coinToast, { bottom: insets.bottom + 70 }]}>
      <Text style={styles.coinAmount}>+{coinToast.amount} 🪙</Text>
      <Text style={styles.coinText}>{coinToast.text}</Text>
    </View>
  )
}

function PlayClip({ url }: { url: string }) {
  const player = useAudioPlayer(url)
  return (
    <Pressable
      style={styles.play}
      onPress={(event) => {
        event.stopPropagation()
        player.seekTo(0)
        player.play()
      }}
    >
      <Icon name="play.fill" color="#fff" size={14} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 10,
    right: 10,
    zIndex: 20,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: radius.lg,
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    shadowColor: colors.ink,
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  copy: { flex: 1 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontFamily: rounded, fontWeight: "800", color: colors.ink, fontSize: 15 },
  now: { color: colors.muted, fontSize: 12 },
  text: { color: colors.ink, marginTop: 2, lineHeight: 19 },
  coinToast: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    shadowColor: colors.ink,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  coinAmount: { fontFamily: rounded, fontWeight: "800", color: colors.sun, fontSize: 17 },
  coinText: { fontFamily: rounded, fontWeight: "700", color: "#fff", fontSize: 15 },
  play: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.leafDeep,
    alignItems: "center",
    justifyContent: "center",
  },
})
