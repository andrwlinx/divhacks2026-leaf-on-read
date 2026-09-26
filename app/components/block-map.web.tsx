import type { TreePin } from "@/lib/types"
import { Pressable, StyleSheet, Text, View } from "react-native"

type Region = {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

export function BlockMap({
  trees,
  onOpen,
}: {
  region: Region
  trees: TreePin[]
  pinOverrides: Record<string, TreePin["status"]>
  onRegion: (region: Region) => void
  onOpen: (id: string) => void
}) {
  return (
    <View style={styles.page}>
      <Text style={styles.lead}>The map is on the iPhone. These are the trees in view.</Text>
      {trees.map((tree) => (
        <Pressable key={tree.id} onPress={() => onOpen(tree.id)} style={styles.row}>
          <Text style={styles.name}>{tree.name || tree.species}</Text>
          <Text>{tree.status}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16, gap: 8 },
  lead: { color: "#1B4332", fontWeight: "700" },
  row: { backgroundColor: "#fff", borderRadius: 12, padding: 12 },
  name: { fontWeight: "700" },
})
