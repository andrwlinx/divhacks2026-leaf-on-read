import { useSession } from "@/lib/session"
import { Redirect } from "expo-router"
import { ActivityIndicator, View } from "react-native"

export default function Index() {
  const { ready, user } = useSession()
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F6F1E7" }}>
        <ActivityIndicator color="#1B4332" />
      </View>
    )
  }
  return <Redirect href={user ? "/map" : "/onboarding"} />
}
