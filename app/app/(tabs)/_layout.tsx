import { Icon } from "@/components/icon"
import { colors, rounded } from "@/constants/design"
import { api } from "@/lib/api"
import { unreadThreadIds, unreadTreeIds } from "@/lib/chat-read"
import { useSession } from "@/lib/session"
import type { ChatSummary, MyTree, ThreadSummary } from "@/lib/types"
import * as Haptics from "expo-haptics"
import { Tabs } from "expo-router"
import type { SymbolViewProps } from "expo-symbols"
import { useEffect, useState } from "react"

type SymbolName = SymbolViewProps["name"]

function tabIcon(name: SymbolName) {
  function TabIcon({ color }: { color: unknown }) {
    // The navigator passes our own tint colors, which are plain strings.
    return <Icon name={name} color={color as string} size={24} />
  }
  return TabIcon
}

/** Thirsty-tree and unread-chat counts for the tab badges, refreshed every 10s. */
function useBadges() {
  const { user } = useSession()
  const [thirsty, setThirsty] = useState(0)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) return
    let stopped = false
    const refresh = async () => {
      try {
        const [trees, chats, threads] = await Promise.all([
          api<MyTree[]>(`/users/${user._id}/trees`),
          api<ChatSummary[]>(`/users/${user._id}/chats`),
          api<ThreadSummary[]>(`/users/${user._id}/threads`),
        ])
        const [treeUnread, threadUnread] = await Promise.all([unreadTreeIds(chats), unreadThreadIds(threads, user._id)])
        if (stopped) return
        setThirsty(trees.filter((tree) => tree.status === "thirsty").length)
        setUnread(treeUnread.size + threadUnread.size)
      } catch {
        // Badges are a nicety; the tabs still work if a poll misses.
      }
    }
    void refresh()
    const timer = setInterval(refresh, 10_000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [user])

  return { thirsty, unread }
}

export default function TabLayout() {
  const { thirsty, unread } = useBadges()
  return (
    <Tabs
      screenListeners={{ tabPress: () => void Haptics.selectionAsync() }}
      screenOptions={{
        tabBarActiveTintColor: colors.leafDeep,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: rounded, fontWeight: "700", fontSize: 11 },
        tabBarBadgeStyle: { backgroundColor: colors.thirsty, fontWeight: "800" },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTitleAlign: "left",
        headerTitleStyle: { fontFamily: rounded, fontWeight: "800", fontSize: 26, color: colors.ink },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="map" options={{ title: "Map", headerShown: false, tabBarIcon: tabIcon("map.fill") }} />
      <Tabs.Screen
        name="trees"
        options={{ title: "My trees", tabBarIcon: tabIcon("tree.fill"), tabBarBadge: thirsty || undefined }}
      />
      <Tabs.Screen
        name="chats"
        options={{ title: "Chats", tabBarIcon: tabIcon("bubble.left.and.bubble.right.fill"), tabBarBadge: unread || undefined }}
      />
      <Tabs.Screen name="block" options={{ title: "Block", tabBarIcon: tabIcon("trophy.fill") }} />
      <Tabs.Screen name="me" options={{ title: "Me", tabBarIcon: tabIcon("person.crop.circle.fill") }} />
    </Tabs>
  )
}
