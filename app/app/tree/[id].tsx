import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import { pinColor, type Reading, type TreeDetail } from "@/lib/types"
import * as ImagePicker from "expo-image-picker"
import * as Linking from "expo-linking"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { LineChart } from "react-native-gifted-charts"

export default function TreeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user, demoMode, setPin } = useSession()
  const [tree, setTree] = useState<TreeDetail | null>(null)
  const [readings, setReadings] = useState<Reading[]>([])
  const [gallons, setGallons] = useState("5")
  const [photo, setPhoto] = useState<string | null>(null)
  const [demoOpen, setDemoOpen] = useState(true)
  const [note, setNote] = useState("")

  const load = useCallback(async () => {
    if (!id) return
    const [detail, series] = await Promise.all([
      api<TreeDetail>(`/trees/${id}`),
      api<Reading[]>(`/trees/${id}/readings?range=${demoMode ? "live" : "7d"}`),
    ])
    setTree(detail)
    setReadings(series)
  }, [id, demoMode])

  useEffect(() => {
    void load().catch((error: Error) => setNote(error.message))
    const timer = setInterval(() => void load().catch(() => null), 2000)
    return () => clearInterval(timer)
  }, [load])

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      setNote("Camera permission is off. You can still log the gallons.")
      return
    }
    const shot = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.3 })
    if (!shot.canceled && shot.assets[0]?.base64) {
      setPhoto(shot.assets[0].base64)
      setNote("Photo attached. Log the watering when you're ready.")
    }
  }

  async function water() {
    if (!user || !id) return
    await api(`/trees/${id}/waterings`, {
      method: "POST",
      body: JSON.stringify({
        userId: user._id,
        gallons: Number(gallons) || 5,
        source: "app",
        ...(photo ? { photoBase64: photo } : {}),
      }),
    })
    setPhoto(null)
    setPin(id, "ok")
    setNote("Logged. Gus should thank you once.")
    await load()
  }

  async function claim() {
    if (!user || !id) return
    try {
      await api(`/trees/${id}/claim`, {
        method: "POST",
        body: JSON.stringify({ userId: user._id }),
      })
      setNote("You're on it for the next few minutes.")
      await load()
    } catch (error) {
      const claimed = error as Error & { body?: { claim?: { name: string } } }
      setNote(claimed.body?.claim ? `${claimed.body.claim.name} already has this.` : claimed.message)
    }
  }

  async function demo(moisture: number, status: "thirsty" | "ok") {
    if (!id) return
    setPin(id, status)
    await api("/demo/sensor", { method: "POST", body: JSON.stringify({ moisture }) })
  }

  if (!tree) {
    return (
      <View style={styles.page}>
        <Text>{note || "Loading the tree…"}</Text>
      </View>
    )
  }

  const moisture = tree.latest?.moisture
  const chart = readings.map((point) => ({ value: point.moisture }))
  if (chart.length === 1) chart.push(chart[0])
  const agent = process.env.EXPO_PUBLIC_AGENT_PHONE

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.name}>{tree.name || tree.species}</Text>
      <Text style={styles.meta}>{tree.species} · {tree.address}</Text>
      {tree.persona ? <Text style={styles.persona}>{tree.persona}</Text> : null}
      <View style={styles.gaugeTrack}>
        <View style={[styles.gaugeFill, { width: `${Math.max(0, Math.min(100, moisture ?? 0))}%`, backgroundColor: pinColor(tree.status) }]} />
      </View>
      <Text style={styles.moisture}>{moisture === undefined || moisture === null ? "No reading yet" : `${Math.round(moisture)}% moisture`}</Text>
      {chart.length > 0 ? (
        <LineChart
          data={chart}
          width={Dimensions.get("window").width - 72}
          height={160}
          color="#1B4332"
          thickness={3}
          hideDataPoints
          curved
          maxValue={100}
          noOfSections={4}
          yAxisColor="#E4D9C8"
          xAxisColor="#E4D9C8"
          rulesColor="#EFE6D8"
          yAxisTextStyle={{ color: "#6B6258" }}
          initialSpacing={8}
        />
      ) : (
        <Text style={styles.meta}>The live line shows up as soon as the sensor writes.</Text>
      )}
      <Text style={styles.section}>Caretakers</Text>
      <Text style={styles.meta}>{tree.caretakers.map((person) => person.name).join(", ") || "Nobody yet"}</Text>
      {tree.claim ? <Text style={styles.meta}>{tree.claim.name} is on it.</Text> : null}
      <Text style={styles.section}>Log watering</Text>
      <TextInput style={styles.input} value={gallons} onChangeText={setGallons} keyboardType="number-pad" />
      <Pressable style={styles.secondary} onPress={() => void takePhoto()}>
        <Text style={styles.secondaryText}>{photo ? "Photo attached" : "Add a photo"}</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={() => void water()}>
        <Text style={styles.buttonText}>I watered it</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={() => void claim()}>
        <Text style={styles.secondaryText}>I'm on it</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={() => router.push({ pathname: "/tree/[id]/chat", params: { id: tree.id } })}>
        <Text style={styles.secondaryText}>Talk to {tree.name || "this tree"}</Text>
      </Pressable>
      {agent ? (
        <Pressable
          style={styles.secondary}
          onPress={() => Linking.openURL(`sms:${agent}&body=${encodeURIComponent(`Hey ${tree.name || "tree"}`)}`)}
        >
          <Text style={styles.secondaryText}>Text this tree</Text>
        </Pressable>
      ) : null}
      {demoMode && tree.sensorId ? (
        <View style={styles.demo}>
          <Pressable onPress={() => setDemoOpen((open) => !open)}>
            <Text style={styles.section}>Demo controls {demoOpen ? "▾" : "▸"}</Text>
          </Pressable>
          {demoOpen ? (
            <View style={styles.demoRow}>
              <Pressable style={styles.demoButton} onPress={() => void demo(15, "thirsty")}>
                <Text style={styles.buttonText}>Pull from soil</Text>
              </Pressable>
              <Pressable style={styles.demoButton} onPress={() => void demo(80, "ok")}>
                <Text style={styles.buttonText}>Back in the pot</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => void api("/demo/rain", { method: "POST" })}>
                <Text style={styles.secondaryText}>Rain's coming</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 8, paddingBottom: 48 },
  name: { fontSize: 32, fontWeight: "700", color: "#1B4332" },
  meta: { color: "#3D2B1F" },
  persona: { color: "#243027", lineHeight: 22 },
  gaugeTrack: { height: 14, backgroundColor: "#E4D9C8", borderRadius: 99, overflow: "hidden", marginTop: 8 },
  gaugeFill: { height: 14 },
  moisture: { fontWeight: "700", color: "#1B4332" },
  section: { marginTop: 12, fontWeight: "700", color: "#1B4332", fontSize: 16 },
  input: { backgroundColor: "#fff", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E4D9C8" },
  button: { backgroundColor: "#1B4332", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#F6F1E7", fontWeight: "700" },
  secondary: { borderRadius: 14, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#1B4332" },
  secondaryText: { color: "#1B4332", fontWeight: "700" },
  demo: { marginTop: 8 },
  demoRow: { gap: 8 },
  demoButton: { backgroundColor: "#3D2B1F", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  note: { color: "#1B4332" },
})
