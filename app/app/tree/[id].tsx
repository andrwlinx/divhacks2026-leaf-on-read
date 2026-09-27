import { Icon } from "@/components/icon"
import { ActionBar, Avatar, Button, Card, MoistureMeter, Pill, ScreenState, SectionTitle } from "@/components/kit"
import { DecorateCard } from "@/components/decorate-card"
import { CardStickers } from "@/components/card-stickers"
import { TreePortrait } from "@/components/tree-portrait"
import { colors, radius, rounded, statusMeta, touch } from "@/constants/design"
import { api } from "@/lib/api"
import { cancelClaim, messageNeighbor, openCrew } from "@/lib/messaging"
import { useSession } from "@/lib/session"
import type { Reading, TreeDetail } from "@/lib/types"
import * as Haptics from "expo-haptics"
import * as ImagePicker from "expo-image-picker"
import { useLocalSearchParams, useRouter } from "expo-router"
import type { SymbolViewProps } from "expo-symbols"
import { useCallback, useEffect, useState } from "react"
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { LineChart } from "react-native-gifted-charts"

/**
 * One tree, one question: how is it, and what should I do right now? Status and moisture sit at the
 * top; the single most useful action for this moment lives in the sticky bar in thumb reach.
 */
export default function TreeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user, demoMode, setPin, flashCoins, toast } = useSession()
  const [tree, setTree] = useState<TreeDetail | null>(null)
  const [readings, setReadings] = useState<Reading[]>([])
  const [loadError, setLoadError] = useState("")
  const [gallons, setGallons] = useState(5)
  const [photo, setPhoto] = useState<string | null>(null)
  const [logging, setLogging] = useState(false)
  const [decorating, setDecorating] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const [adoptName, setAdoptName] = useState("")
  const [busy, setBusy] = useState<"water" | "adopt" | "claim" | null>(null)

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
    setLoadError("")
  }, [fetchTree])

  useEffect(() => {
    if (!id) return
    const apply = ([detail, series]: [TreeDetail, Reading[]]) => {
      setTree(detail)
      setReadings(series)
      setLoadError("")
    }
    fetchTree().then(apply, (error: Error) => setLoadError(error.message))
    const timer = setInterval(() => fetchTree().then(apply, () => null), 2000)
    return () => clearInterval(timer)
  }, [id, fetchTree])

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      toast("Camera is off. You can still log the gallons.")
      return
    }
    const shot = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.3 })
    if (!shot.canceled && shot.assets[0]?.base64) setPhoto(shot.assets[0].base64)
  }

  async function water() {
    if (!user || !id) return
    setBusy("water")
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
      setLogging(false)
      setPin(id, "ok")
      const thanks = `${gallons} gallons for ${tree?.name || "your tree"} 💧`
      if (watered.coinsEarned) flashCoins(watered.coinsEarned, thanks)
      else toast(thanks)
      await load()
    } catch (error) {
      toast(error instanceof Error ? `Couldn't log that: ${error.message}` : "Couldn't log that. Try again.")
    } finally {
      setBusy(null)
    }
  }

  async function adopt() {
    if (!user || !id || !tree) return
    setBusy("adopt")
    try {
      await api(`/trees/${id}/adopt`, {
        method: "POST",
        body: JSON.stringify({ userId: user._id, name: tree.name ?? (adoptName.trim() || tree.species) }),
      })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      await load()
      toast(`Meet ${tree.name ?? (adoptName.trim() || "your tree")}! It'll text you when it's thirsty 🌱`)
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't adopt right now.")
    } finally {
      setBusy(null)
    }
  }

  async function claim() {
    if (!user || !id) return
    setBusy("claim")
    try {
      await api(`/trees/${id}/claim`, { method: "POST", body: JSON.stringify({ userId: user._id }) })
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      toast("You're on it. The crew knows 🙌")
      await load()
    } catch (error) {
      const claimed = error as Error & { body?: { claim?: { name: string } } }
      toast(claimed.body?.claim ? `${claimed.body.claim.name} already has this one.` : claimed.message)
    } finally {
      setBusy(null)
    }
  }

  async function unclaim() {
    if (!user || !id) return
    try {
      await cancelClaim(id, user._id)
      void Haptics.selectionAsync()
      toast("No worries. We let the rest of the crew know.")
      await load()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't cancel that.")
    }
  }

  async function demo(moisture: number, status: "thirsty" | "ok") {
    if (!id) return
    setPin(id, status)
    try {
      await api("/demo/sensor", { method: "POST", body: JSON.stringify({ moisture }) })
    } catch {
      toast("Couldn't reach the server. Try again in a moment.")
    }
  }

  if (!tree) {
    return loadError ? (
      <ScreenState
        kind="error"
        title="Couldn't reach this tree"
        text={loadError}
        action="Try again"
        onAction={() => void load().catch((error: Error) => setLoadError(error.message))}
      />
    ) : (
      <ScreenState kind="loading" />
    )
  }

  const meta = statusMeta(tree.status)
  const chart = readings.map((point) => ({ value: point.moisture }))
  if (chart.length === 1) chart.push(chart[0])
  const name = tree.name || tree.species
  const mine = Boolean(tree.claim && user && tree.claim.userId === user._id)
  const adopted = Boolean(user && tree.caretakers.some((person) => person.id === user._id))
  const thirsty = tree.status === "thirsty"
  const until = tree.claim
    ? new Date(tree.claim.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : ""
  const talk = () => router.push({ pathname: "/tree/[id]/talk", params: { id: tree.id } })

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={[styles.hero, { backgroundColor: meta.soft }]}>
          <CardStickers stickers={tree.stickers} size={64} />
          <TreePortrait url={tree.portraitUrl} mood={meta.mood} size={tree.portraitUrl ? 140 : 120} />
          {tree.drawingPortrait && !tree.portraitUrl ? (
            <Text style={styles.drawing}>🎨 Grok is drawing {name}&apos;s portrait…</Text>
          ) : null}
          <Text accessibilityRole="header" style={styles.name}>
            {name}
          </Text>
          <Text style={styles.meta}>
            {tree.species} · {tree.address}
          </Text>
          <Pill label={meta.label} icon={meta.icon} color={meta.color} soft={colors.card} />
          <View style={styles.meter}>
            <MoistureMeter moisture={tree.latest?.moisture ?? null} threshold={tree.threshold} live={tree.sensorLive} />
          </View>
          {tree.claim ? (
            <View style={styles.claim}>
              <Icon name="hand.raised.fill" color={colors.soilDeep} size={16} />
              <Text style={styles.claimText}>
                {mine ? "You're" : `${tree.claim.name} is`} on it until {until}
              </Text>
            </View>
          ) : thirsty ? (
            <Text style={styles.needs}>Needs someone. Nobody has claimed it yet.</Text>
          ) : null}
        </View>

        <View style={styles.connect}>
          <Connect icon="mic.fill" label="Talk" onPress={talk} />
          <Connect
            icon="bubble.left.fill"
            label="Message"
            onPress={() => router.push({ pathname: "/tree/[id]/chat", params: { id: tree.id } })}
          />
          {adopted ? (
            <Connect icon="person.3.fill" label={`Crew · ${tree.caretakers.length}`} onPress={() => openCrew(router, tree.id)} />
          ) : null}
        </View>

        {!adopted ? (
          <Card style={styles.adopt}>
            <SectionTitle
              icon="heart.fill"
              title={tree.name ? `Help take care of ${tree.name}` : "Adopt this tree"}
              color={colors.leafDeep}
            />
            <Text style={styles.body}>
              {tree.name
                ? `Join ${tree.caretakers.length} neighbor${tree.caretakers.length === 1 ? "" : "s"} who get a text when ${tree.name} is thirsty.`
                : "Give it a name and it gets a personality of its own. It'll text you when it needs water."}
            </Text>
            {!tree.name ? (
              <TextInput
                accessibilityLabel="Tree name"
                style={styles.input}
                value={adoptName}
                onChangeText={setAdoptName}
                placeholder={`Name your ${tree.species}`}
                placeholderTextColor={colors.inkSoft}
                maxLength={24}
                returnKeyType="done"
                onSubmitEditing={() => void adopt()}
              />
            ) : null}
            {busy === "adopt" && !tree.name ? <Text style={styles.body}>Grok is getting to know your tree…</Text> : null}
          </Card>
        ) : null}

        <Card>
          <SectionTitle icon="chart.xyaxis.line" title={demoMode ? "Live moisture" : "Last 7 days"} color={colors.waterDeep} />
          {chart.length > 0 ? (
            <View accessible accessibilityLabel={`Moisture chart, ${chart.length} readings, latest ${Math.round(chart[chart.length - 1].value)} percent`}>
              <LineChart
                data={chart}
                areaChart
                width={Dimensions.get("window").width - 100}
                height={130}
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
                yAxisTextStyle={{ color: colors.inkSoft, fontSize: 12 }}
                initialSpacing={4}
              />
            </View>
          ) : (
            <Text style={styles.body}>The line shows up as soon as the sensor writes.</Text>
          )}
        </Card>

        {tree.persona ? (
          <Card style={styles.quote}>
            <Icon name="quote.opening" color={colors.leaf} size={18} />
            <Text style={styles.persona}>{tree.persona}</Text>
          </Card>
        ) : null}

        <Card>
          <SectionTitle icon="person.2.fill" title="Caretakers" color={colors.leafDeep} />
          {tree.caretakers.length ? (
            <View style={styles.people}>
              {tree.caretakers.map((person) => {
                const me = person.id === user?._id
                return (
                  <Pressable
                    key={person.id}
                    accessibilityRole="button"
                    accessibilityLabel={me ? "You" : `Message ${person.name}`}
                    style={styles.person}
                    disabled={me || !user}
                    onPress={() =>
                      user && void messageNeighbor(router, user._id, person.id).catch(() => toast("Couldn't open that chat."))
                    }
                  >
                    <Avatar name={person.name} size={44} />
                    <Text style={styles.personName} numberOfLines={1}>
                      {me ? "You" : person.name}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          ) : (
            <Text style={styles.body}>Nobody yet. Be the first! 🌱</Text>
          )}
          {tree.caretakers.some((person) => person.id !== user?._id) ? (
            <Text style={styles.hint}>Tap a neighbor to message them.</Text>
          ) : null}
        </Card>

        {adopted && user ? (
          decorating ? (
            <DecorateCard
              treeId={tree.id}
              treeName={name}
              userId={user._id}
              placed={tree.stickers ?? []}
              onChanged={() => void load().catch(() => null)}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Decorate ${name}'s card`}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              onPress={() => setDecorating(true)}
            >
              <Icon name="sparkles" color={colors.leafDeep} size={18} />
              <Text style={styles.rowText}>Decorate {name}&apos;s card</Text>
              <Text style={styles.rowMeta}>{tree.stickers?.length ?? 0} of 4 stickers</Text>
              <Icon name="chevron.right" color={colors.inkSoft} size={13} />
            </Pressable>
          )
        ) : null}

        {demoMode && tree.sensorId ? (
          <View style={styles.demo}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Demo controls"
              accessibilityState={{ expanded: demoOpen }}
              style={styles.demoHeader}
              onPress={() => setDemoOpen((open) => !open)}
            >
              <Icon name="wrench.and.screwdriver.fill" color={colors.inkSoft} size={14} />
              <Text style={styles.demoTitle}>Demo controls</Text>
              <Icon name={demoOpen ? "chevron.up" : "chevron.down"} color={colors.inkSoft} size={12} />
            </Pressable>
            {demoOpen ? (
              <View style={styles.demoRow}>
                {tree.sensorLive ? (
                  // The real Arduino is feeding readings; the simulated buttons would be ignored.
                  <Text style={styles.demoNote}>🔌 Real sensor connected. Pull it out of the soil to make {name} thirsty.</Text>
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
                  onPress={() => void api("/demo/rain", { method: "POST" }).catch(() => toast("Couldn't reach the server."))}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <ActionBar>
        {logging ? (
          <>
            <View style={styles.stepper}>
              <StepButton icon="minus" label="One gallon less" onPress={() => setGallons((value) => Math.max(1, value - 1))} />
              <View
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel="Gallons"
                accessibilityValue={{ text: `${gallons} gallons` }}
                accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
                onAccessibilityAction={(event) =>
                  setGallons((value) =>
                    event.nativeEvent.actionName === "increment" ? Math.min(40, value + 1) : Math.max(1, value - 1),
                  )
                }
                style={styles.stepValue}
              >
                <Text style={styles.gallons}>{gallons}</Text>
                <Text style={styles.hint}>gallons</Text>
              </View>
              <StepButton icon="plus" label="One gallon more" onPress={() => setGallons((value) => Math.min(40, value + 1))} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={photo ? "Photo attached. Retake" : "Add a photo"}
                style={[styles.photo, photo && { backgroundColor: colors.mint }]}
                onPress={() => void takePhoto()}
              >
                <Icon name={photo ? "checkmark.circle.fill" : "camera.fill"} color={colors.leafDeep} size={20} />
                <Text style={styles.photoText}>{photo ? "Added" : "Photo"}</Text>
              </Pressable>
            </View>
            <View style={styles.bar}>
              <Button label="Back" variant="ghost" color={colors.inkSoft} onPress={() => setLogging(false)} />
              <Button
                label={`Log ${gallons} gallons`}
                icon="drop.fill"
                color={colors.water}
                busy={busy === "water"}
                style={styles.grow}
                onPress={() => void water()}
              />
            </View>
          </>
        ) : !adopted ? (
          <Button
            label={tree.name ? `Adopt ${tree.name} too` : "Adopt & name it"}
            icon="leaf.fill"
            busy={busy === "adopt"}
            hint="You'll get a text when it's thirsty"
            onPress={() => void adopt()}
          />
        ) : mine ? (
          <View style={styles.bar}>
            <Button label="Can't make it" variant="outline" color={colors.thirsty} onPress={() => void unclaim()} />
            <Button label="I watered it" icon="drop.fill" color={colors.water} style={styles.grow} onPress={() => setLogging(true)} />
          </View>
        ) : thirsty && !tree.claim ? (
          <View style={styles.bar}>
            <Button label="I watered it" variant="outline" color={colors.water} onPress={() => setLogging(true)} />
            <Button
              label="I'm on it"
              icon="hand.raised.fill"
              color={colors.soil}
              busy={busy === "claim"}
              hint="Tells the crew you'll bring water"
              style={styles.grow}
              onPress={() => void claim()}
            />
          </View>
        ) : thirsty ? (
          <Button label="I watered it" icon="drop.fill" color={colors.water} onPress={() => setLogging(true)} />
        ) : (
          <View style={styles.bar}>
            <Button label="I watered it" variant="outline" color={colors.water} onPress={() => setLogging(true)} />
            <Button label={`Talk to ${name}`} icon="mic.fill" style={styles.grow} onPress={talk} />
          </View>
        )}
      </ActionBar>
    </View>
  )
}

function Connect({ icon, label, onPress }: { icon: SymbolViewProps["name"]; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.connectButton, pressed && { opacity: 0.7 }]}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
    >
      <Icon name={icon} color={colors.leafDeep} size={20} />
      <Text style={styles.connectLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function StepButton({ icon, label, onPress }: { icon: "minus" | "plus"; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.step, pressed && { opacity: 0.6 }]}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
    >
      <Icon name={icon} color={colors.waterDeep} size={18} weight="bold" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 190 },
  hero: { alignItems: "center", borderRadius: radius.lg, paddingVertical: 20, paddingHorizontal: 16, gap: 6 },
  name: { fontFamily: rounded, fontSize: 30, fontWeight: "800", color: colors.ink },
  meta: { color: colors.inkSoft, fontSize: 15, textAlign: "center" },
  drawing: { color: colors.leafDeep, fontWeight: "700", fontSize: 13 },
  meter: { alignSelf: "stretch", backgroundColor: colors.card, borderRadius: radius.md, padding: 14, marginTop: 8 },
  claim: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "stretch",
    backgroundColor: colors.sunSoft,
    borderRadius: radius.md,
    padding: 12,
  },
  claimText: { fontFamily: rounded, fontWeight: "700", color: colors.soilDeep, fontSize: 15, flex: 1 },
  needs: { fontFamily: rounded, fontWeight: "700", color: colors.thirstyText, fontSize: 15, marginTop: 4 },
  connect: { flexDirection: "row", gap: 10 },
  connectButton: {
    flex: 1,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  connectLabel: { fontFamily: rounded, fontWeight: "700", fontSize: 14, color: colors.leafDeep },
  adopt: { borderWidth: 2, borderColor: colors.leaf },
  body: { color: colors.inkSoft, fontSize: 15, lineHeight: 21 },
  hint: { color: colors.inkSoft, fontSize: 13 },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 16,
    color: colors.ink,
  },
  quote: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  persona: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 22, fontStyle: "italic" },
  people: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  person: { alignItems: "center", gap: 4, width: 64, minHeight: touch },
  personName: { fontSize: 13, color: colors.inkSoft },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
  },
  rowText: { flex: 1, fontFamily: rounded, fontWeight: "700", fontSize: 16, color: colors.ink },
  rowMeta: { color: colors.inkSoft, fontSize: 13 },
  demo: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 4,
    gap: 10,
  },
  demoHeader: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: touch },
  demoTitle: { flex: 1, color: colors.inkSoft, fontWeight: "700" },
  demoRow: { gap: 8, paddingBottom: 10 },
  demoNote: { color: colors.leafDeep, fontWeight: "700", lineHeight: 20 },
  bar: { flexDirection: "row", gap: 10 },
  grow: { flex: 1 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  step: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.waterSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: { alignItems: "center", minWidth: 60 },
  gallons: { fontFamily: rounded, fontSize: 28, fontWeight: "800", color: colors.ink },
  photo: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  photoText: { fontFamily: rounded, fontWeight: "700", color: colors.leafDeep, fontSize: 15 },
})
