import { SessionProvider, useSession } from "@/lib/session"
import { useAudioPlayer } from "expo-audio"
import * as Haptics from "expo-haptics"
import { Stack, useRouter } from "expo-router"
import { useEffect } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export default function RootLayout() {
  return (
    <SessionProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#F6F1E7" },
          headerTintColor: "#1B4332",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#F6F1E7" },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ title: "Meet your block", headerBackVisible: false }} />
        <Stack.Screen name="map" options={{ title: "Leaf on Read" }} />
        <Stack.Screen name="leaderboard" options={{ title: "The block" }} />
        <Stack.Screen name="tree/[id]" options={{ title: "Tree" }} />
        <Stack.Screen name="tree/[id]/chat" options={{ title: "Text" }} />
      </Stack>
      <AlertBanner />
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
  return (
    <Pressable
      style={[styles.banner, { top: insets.top + 8 }]}
      onPress={() => {
        dismissBanner()
        router.push({ pathname: "/tree/[id]", params: { id: banner.treeId } })
      }}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{banner.treeName.slice(0, 1)}</Text>
      </View>
      <View style={styles.copy}>
        <Text style={styles.name}>{banner.treeName}</Text>
        <Text style={styles.text}>{banner.text}</Text>
      </View>
      {banner.voiceUrl ? <PlayClip url={banner.voiceUrl} /> : null}
    </Pressable>
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
      <Text style={styles.playText}>Play</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 20,
    backgroundColor: "#F7F7F8",
    borderRadius: 18,
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    shadowColor: "#1B4332",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#1B4332",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#F6F1E7", fontWeight: "700", fontSize: 18 },
  copy: { flex: 1 },
  name: { fontWeight: "700", color: "#1B4332" },
  text: { color: "#243027", marginTop: 2 },
  play: { backgroundColor: "#1B4332", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8 },
  playText: { color: "#F6F1E7", fontWeight: "700", fontSize: 12 },
})
