import { Icon } from "@/components/icon"
import { Avatar, Button, Card, Pill, SectionTitle } from "@/components/kit"
import { TreeBuddy } from "@/components/tree-buddy"
import { DecorateCard } from "@/components/decorate-card"
import { CardStickers } from "@/components/card-stickers"
import { TreePortrait } from "@/components/tree-portrait"
import { colors, radius, rounded, statusMeta } from "@/constants/design"
import { api } from "@/lib/api"
import { messageNeighbor, openCrew } from "@/lib/messaging"
import { useSession } from "@/lib/session"
import type { Reading, TreeDetail } from "@/lib/types"
import * as Haptics from "expo-haptics"
import * as ImagePicker from "expo-image-picker"
import * as Linking from "expo-linking"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { LineChart } from "react-native-gifted-charts"

export default function TreeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user, demoMode, setPin, flashCoins } = useSession()
  const [tree, setTree] = useState<TreeDetail | null>(null)
  const [readings, setReadings] = useState<Reading[]>([])
  const [gallons, setGallons] = useState(5)
  const [photo, setPhoto] = useState<string | null>(null)
  const [demoOpen, setDemoOpen] = useState(false)
  const [note, setNote] = useState("")
  const [adoptName, setAdoptName] = useState("")
  const [adopting, setAdopting] = useState(false)
  const [busy, setBusy] = useState(false)

  const fetchTree = useCallback(
    () =>
      Promise.all([
        api<TreeDetail>(`/trees/${id}`),
        api<Reading[]>(`/trees/${id}/readings?range=${demoMode ? "live" : "7d"}`),
      ]),
    [id, demoMode],
  )

  const load = useCallback(async () => {
    const [detail, series] = await fetchTree()
    setTree(detail)
    setReadings(series)
  }, [fetchTree])

  useEffect(() => {
    if (!id) return
    const apply = ([detail, series]: [TreeDetail, Reading[]]) => {
      setTree(detail)
      setReadings(series)
    }
    fetchTree().then(apply, (error: Error) => setNote(error.message))
    const timer = setInterval(() => fetchTree().then(apply, () => null), 2000)
    return () => clearInterval(timer)
  }, [id, fetchTree])

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
    setBusy(true)
    try {
      const watered = await api<{ coinsEarned?: number }>(`/trees/${id}/waterings`, {
        method: "POST",
        body: JSON.stringify({
          userId: user._id,
          gallons,
          source: "app",
          ...(photo ? { photoBase64: photo } : {}),
        }),
      })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setPhoto(null)
      setPin(id, "ok")
      setNote(`Logged ${gallons} gallons. ${tree?.name || "Your tree"} says thank you 💚`)
      flashCoins(watered.coinsEarned ?? 0, `Watered ${tree?.name || "your tree"}`)
      await load()
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Couldn't log that.")
    } finally {
      setBusy(false)
    }
  }

  async function adopt() {
    if (!user || !id || !tree) return
    setAdopting(true)
    try {
      await api(`/trees/${id}/adopt`, {
        method: "POST",
        body: JSON.stringify({ userId: user._id, name: tree.name ?? (adoptName.trim() || tree.species) }),
      })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      await load()
      setNote(`Meet ${tree.name ?? (adoptName.trim() || "your tree")}! It'll text you when it's thirsty. 🌱`)
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Couldn't adopt right now.")
    } finally {
      setAdopting(false)
    }
  }

  async function claim() {
    if (!user || !id) return
    try {
      await api(`/trees/${id}/claim`, {
        method: "POST",
        body: JSON.stringify({ userId: user._id }),
      })
      setNote("You're on it! Neighbors will know.")
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
      <View style={styles.loading}>
        <TreeBuddy mood="sleepy" size={100} />
        <Text style={styles.meta}>{note || "Waking the tree up…"}</Text>
      </View>
    )
  }

  const meta = statusMeta(tree.status)
  const moisture = tree.latest?.moisture
  const pct = Math.max(0, Math.min(100, moisture ?? 0))
  const chart = readings.map((point) => ({ value: point.moisture }))
  if (chart.length === 1) chart.push(chart[0])
  const agent = process.env.EXPO_PUBLIC_AGENT_PHONE
  const name = tree.name || tree.species
  const mine = tree.claim && user && tree.claim.userId === user._id
  const adopted = Boolean(user && tree.caretakers.some((person) => person.id === user._id))

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={[styles.hero, { backgroundColor: meta.soft }]}>
        <CardStickers stickers={tree.stickers} size={64} />
        <TreePortrait url={tree.portraitUrl} mood={meta.mood} size={tree.portraitUrl ? 160 : 130} />
        {tree.drawingPortrait && !tree.portraitUrl ? (
          <Text style={styles.drawing}>🎨 Grok is drawing {tree.name ?? "this tree"}&apos;s portrait…</Text>
        ) : null}
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.meta}>
          {tree.species} · {tree.address}
        </Text>
        <Pill label={meta.label} icon={meta.icon} color={meta.color} soft={colors.card} />
        <Button
          label={`Talk to ${name}`}
          icon="mic.fill"
          color={colors.leafDeep}
          style={styles.talk}
          onPress={() => router.push({ pathname: "/tree/[id]/talk", params: { id: tree.id } })}
        />
      </View>

      {adopted && user ? (
        <DecorateCard
          treeId={tree.id}
          treeName={name}
          userId={user._id}
          placed={tree.stickers ?? []}
          onChanged={() => void load()}
        />
      ) : null}

      {!adopted ? (
        <Card style={styles.adopt}>
          <SectionTitle icon="heart.fill" title={tree.name ? `Help take care of ${tree.name}` : "Adopt this tree"} color={colors.leafDeep} />
          <Text style={styles.adoptText}>
            {tree.name
              ? `Join ${tree.caretakers.length} neighbor${tree.caretakers.length === 1 ? "" : "s"} who get a text when ${tree.name} is thirsty.`
              : "Give it a name and it gets a personality of its own. It'll text you when it needs water."}
          </Text>
          {!tree.name ? (
            <TextInput
              style={styles.adoptInput}
              value={adoptName}
              onChangeText={setAdoptName}
              placeholder={`Name your ${tree.species}`}
              placeholderTextColor={colors.muted}
              maxLength={24}
              returnKeyType="done"
              onSubmitEditing={() => void adopt()}
            />
          ) : null}
          <Button
            label={tree.name ? `Adopt ${tree.name} too` : "Adopt & name it"}
            icon="leaf.fill"
            color={colors.leafDeep}
            busy={adopting}
            onPress={() => void adopt()}
          />
          {adopting && !tree.name ? <Text style={styles.adoptText}>Grok is getting to know your tree…</Text> : null}
        </Card>
      ) : null}

      {tree.persona ? (
        <Card style={styles.quote}>
          <Icon name="quote.opening" color={colors.leaf} size={18} />
          <Text style={styles.persona}>{tree.persona}</Text>
        </Card>
      ) : null}

      {tree.claim ? (
        <View style={styles.claim}>
          <Icon name="hand.raised.fill" color={colors.soil} size={18} />
          <Text style={styles.claimText}>
            {mine ? "You're" : `${tree.claim.name} is`} on it until{" "}
            {new Date(tree.claim.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </Text>
        </View>
      ) : null}

      <Card>
        <View style={styles.moistureRow}>
          <View style={styles.dropBadge}>
            <Icon name="drop.fill" color={colors.water} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.big}>{moisture === undefined || moisture === null ? "—" : `${Math.round(moisture)}%`}</Text>
            <Text style={styles.meta}>soil moisture · thirsty below {tree.threshold}%</Text>
            {tree.sensorLive ? (
              <View style={styles.liveSensor}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live from the sensor in Gus&apos;s soil</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: meta.color }]} />
          <View style={[styles.threshold, { left: `${tree.threshold}%` }]} />
        </View>
        {chart.length > 0 ? (
          <LineChart
            data={chart}
            areaChart
            width={Dimensions.get("window").width - 100}
            height={140}
            adjustToWidth
            color={colors.water}
            startFillColor={colors.water}
            endFillColor={colors.water}
            startOpacity={0.3}
            endOpacity={0.02}
            thickness={3}
            hideDataPoints
            curved
            maxValue={100}
            noOfSections={4}
            yAxisThickness={0}
            xAxisThickness={0}
            rulesType="dashed"
            rulesColor={colors.line}
            yAxisTextStyle={{ color: colors.muted, fontSize: 11 }}
            initialSpacing={4}
          />
        ) : (
          <Text style={styles.meta}>The live line shows up as soon as the sensor writes.</Text>
        )}
      </Card>

      <Card>
        <SectionTitle icon="heart.fill" title={`Help ${name}`} color={colors.thirsty} />
        <View style={styles.stepper}>
          <StepButton icon="minus" onPress={() => setGallons((value) => Math.max(1, value - 1))} />
          <View style={styles.stepValue}>
            <Text style={styles.big}>{gallons}</Text>
            <Text style={styles.meta}>gallons</Text>
          </View>
          <StepButton icon="plus" onPress={() => setGallons((value) => Math.min(40, value + 1))} />
        </View>
        <Button
          label={photo ? "Photo attached" : "Add a photo"}
          icon={photo ? "checkmark.circle.fill" : "camera.fill"}
          variant="soft"
          color={colors.leafDeep}
          onPress={() => void takePhoto()}
        />
        <Button label="I watered it" icon="drop.fill" color={colors.water} busy={busy} onPress={() => void water()} />
        <View style={styles.actions}>
          <Button
            label="I'm on it"
            icon="hand.raised.fill"
            variant="outline"
            color={colors.soil}
            style={styles.action}
            onPress={() => void claim()}
          />
          <Button
            label="Chat"
            icon="bubble.left.and.bubble.right.fill"
            variant="outline"
            color={colors.leafDeep}
            style={styles.action}
            onPress={() => router.push({ pathname: "/tree/[id]/chat", params: { id: tree.id } })}
          />
        </View>
        {agent ? (
          <Button
            label="Text this tree"
            icon="message.fill"
            variant="soft"
            color={colors.leaf}
            onPress={() => void Linking.openURL(`sms:${agent}&body=${encodeURIComponent(`Hey ${tree.name || "tree"}`)}`)}
          />
        ) : null}
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </Card>

      <Card>
        <SectionTitle icon="person.2.fill" title="Caretakers" color={colors.leafDeep} />
        {tree.caretakers.length ? (
          <>
            <View style={styles.people}>
              {tree.caretakers.map((person) => {
                const me = person.id === user?._id
                return (
                  <Pressable
                    key={person.id}
                    style={styles.person}
                    disabled={me || !user}
                    onPress={() => user && void messageNeighbor(router, user._id, person.id).catch(() => null)}
                  >
                    <Avatar name={person.name} size={40} />
                    <Text style={styles.personName} numberOfLines={1}>
                      {me ? "You" : person.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            {adopted ? (
              <Button
                label={`Crew chat (${tree.caretakers.length})`}
                icon="person.3.fill"
                variant="soft"
                color={colors.water}
                onPress={() => openCrew(router, tree.id)}
              />
            ) : (
              <Text style={styles.meta}>Tap a caretaker to message them.</Text>
            )}
          </>
        ) : (
          <Text style={styles.meta}>Nobody yet. Be the first! 🌱</Text>
        )}
      </Card>

      {demoMode && tree.sensorId ? (
        <View style={styles.demo}>
          <Pressable style={styles.demoHeader} onPress={() => setDemoOpen((open) => !open)}>
            <Icon name="wrench.and.screwdriver.fill" color={colors.muted} size={14} />
            <Text style={styles.demoTitle}>Demo controls</Text>
            <Icon name={demoOpen ? "chevron.up" : "chevron.down"} color={colors.muted} size={12} />
          </Pressable>
          {demoOpen ? (
            <View style={styles.demoRow}>
              {tree.sensorLive ? (
                // The real Arduino is feeding readings; the simulated buttons would be ignored.
                <Text style={styles.demoNote}>🔌 Real sensor connected. Pull it out of the soil to make Gus thirsty.</Text>
              ) : (
                <>
                  <Button label="Pull from soil" icon="arrow.up.circle.fill" color={colors.thirsty} onPress={() => void demo(15, "thirsty")} />
                  <Button label="Back in the pot" icon="arrow.down.circle.fill" color={colors.leaf} onPress={() => void demo(80, "ok")} />
                </>
              )}
              <Button
                label="Rain's coming"
                icon="cloud.rain.fill"
                variant="soft"
                color={colors.water}
                onPress={() => void api("/demo/rain", { method: "POST" })}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  )
}

function StepButton({ icon, onPress }: { icon: "minus" | "plus"; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.step, pressed && { opacity: 0.6 }]}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
    >
      <Icon name={icon} color={colors.water} size={18} weight="bold" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 56 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  hero: { alignItems: "center", borderRadius: radius.lg, paddingVertical: 22, paddingHorizontal: 16, gap: 6 },
  name: { fontFamily: rounded, fontSize: 32, fontWeight: "800", color: colors.ink },
  meta: { color: colors.inkSoft, textAlign: "center" },
  talk: { alignSelf: "stretch", marginTop: 8 },
  adopt: { borderWidth: 2, borderColor: colors.leaf },
  drawing: { color: colors.leafDeep, fontWeight: "700", fontSize: 13 },
  adoptText: { color: colors.inkSoft, lineHeight: 20 },
  adoptInput: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  quote: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  persona: { flex: 1, color: colors.ink, lineHeight: 22, fontStyle: "italic" },
  claim: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.sunSoft,
    borderRadius: radius.md,
    padding: 14,
  },
  claimText: { fontFamily: rounded, fontWeight: "700", color: colors.soil, flex: 1 },
  moistureRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dropBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.waterSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  big: { fontFamily: rounded, fontSize: 30, fontWeight: "800", color: colors.ink },
  track: { height: 14, backgroundColor: colors.bg, borderRadius: 99, overflow: "hidden" },
  fill: { height: 14, borderRadius: 99 },
  threshold: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: colors.ink, opacity: 0.35 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  step: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.waterSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: { alignItems: "center" },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
  note: { color: colors.leafDeep, fontWeight: "600", textAlign: "center" },
  people: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  person: { alignItems: "center", gap: 4, width: 60 },
  personName: { fontSize: 12, color: colors.inkSoft },
  demo: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 14,
    gap: 10,
  },
  demoHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  demoTitle: { flex: 1, color: colors.muted, fontWeight: "700" },
  demoRow: { gap: 8 },
  demoNote: { color: colors.leafDeep, fontWeight: "700", lineHeight: 20 },
  liveSensor: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.leaf },
  liveText: { color: colors.leafDeep, fontWeight: "700", fontSize: 12 },
})
