import { TreeBuddy } from "@/components/tree-buddy"
import { colors } from "@/constants/design"
import { useSession } from "@/lib/session"
import { Redirect } from "expo-router"
import { ActivityIndicator, View } from "react-native"

export default function Index() {
  const { ready, user } = useSession()
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: colors.bg }}>
        <TreeBuddy mood="sleepy" size={110} />
        <ActivityIndicator color={colors.leafDeep} />
      </View>
    )
  }
  return <Redirect href={user ? "/map" : "/onboarding"} />
}
