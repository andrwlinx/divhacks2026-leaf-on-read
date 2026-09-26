import { Icon } from "@/components/icon"
import { Avatar, Card } from "@/components/kit"
import { TreeBuddy } from "@/components/tree-buddy"
import { colors, radius, rounded } from "@/constants/design"
import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import { useEffect, useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"

type Row = { userId: string; name: string; gallons: number; streak: number }

const medals = ["🥇", "🥈", "🥉"]

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

  const total = rows.reduce((sum, row) => sum + row.gallons, 0)

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.hero}>
        <TreeBuddy mood="happy" size={90} />
        <View style={{ flex: 1 }}>
          <Text style={styles.total}>{total}</Text>
          <Text style={styles.totalLabel}>gallons poured by your block</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && rows.length === 0 ? (
        <Text style={styles.empty}>No waterings yet. The first bucket gets the crown 👑</Text>
      ) : null}

      {rows.map((row, index) => {
        const me = user?._id === row.userId
        return (
          <Card key={row.userId} style={[styles.row, me && styles.rowMe]}>
            <Text style={styles.rank}>{medals[index] ?? index + 1}</Text>
            <Avatar name={row.name} size={42} />
            <View style={styles.copy}>
              <Text style={styles.name}>
                {row.name}
                {me ? " (you)" : ""}
              </Text>
              <View style={styles.streak}>
                <Icon name="flame.fill" color={row.streak > 0 ? "#F28C38" : colors.muted} size={13} />
                <Text style={styles.meta}>{row.streak} day streak</Text>
              </View>
            </View>
            <View style={styles.gallons}>
              <Icon name="drop.fill" color={colors.water} size={13} />
              <Text style={styles.gallonsText}>{row.gallons}</Text>
            </View>
          </Card>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10, paddingBottom: 48 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.waterSoft,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 6,
  },
  total: { fontFamily: rounded, fontSize: 44, fontWeight: "800", color: colors.water },
  totalLabel: { color: colors.ink, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  rowMe: { borderWidth: 2, borderColor: colors.leaf },
  rank: { fontFamily: rounded, fontSize: 20, fontWeight: "800", color: colors.muted, width: 28, textAlign: "center" },
  copy: { flex: 1, gap: 2 },
  name: { fontFamily: rounded, fontWeight: "800", fontSize: 16, color: colors.ink },
  streak: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { color: colors.inkSoft, fontSize: 13 },
  gallons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.waterSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  gallonsText: { fontFamily: rounded, fontWeight: "800", color: colors.water },
  error: { color: colors.thirsty },
  empty: { color: colors.inkSoft, textAlign: "center", marginTop: 12 },
})
