import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import { useEffect, useState } from "react"
import { StyleSheet, Text, View } from "react-native"

type Row = { userId: string; name: string; gallons: number; streak: number }

export default function Leaderboard() {
  const { user } = useSession()
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    if (!user) return
    api<Row[]>(`/blocks/${user.blockId}/leaderboard`)
      .then(setRows)
      .catch((caught: Error) => setError(caught.message))
  }, [user])

  return (
    <View style={styles.page}>
      <Text style={styles.lead}>Gallons this block has actually poured.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows.map((row, index) => (
        <View key={row.userId} style={styles.row}>
          <Text style={styles.rank}>{index + 1}</Text>
          <View style={styles.copy}>
            <Text style={styles.name}>{row.name}</Text>
            <Text style={styles.meta}>{row.streak} day streak</Text>
          </View>
          <Text style={styles.gallons}>{row.gallons} gal</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 20, gap: 10 },
  lead: { fontSize: 22, fontWeight: "700", color: "#1B4332", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 12 },
  rank: { fontWeight: "700", color: "#8D99AE", width: 20 },
  copy: { flex: 1 },
  name: { fontWeight: "700", color: "#1B4332" },
  meta: { color: "#3D2B1F" },
  gallons: { fontWeight: "700", color: "#1B4332" },
  error: { color: "#C44536" },
})
