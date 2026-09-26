import { Icon } from "@/components/icon"
import { ActionBar, Button, Card, Chip, LinkButton, SectionTitle } from "@/components/kit"
import { TreeBuddy } from "@/components/tree-buddy"
import { colors, radius, rounded } from "@/constants/design"
import { api } from "@/lib/api"
import { useSession } from "@/lib/session"
import { languages, type NearBlock, type User } from "@/lib/types"
import * as Linking from "expo-linking"
import * as Location from "expo-location"
import { useRouter } from "expo-router"
import type { SymbolViewProps } from "expo-symbols"
import { useRef, useState } from "react"
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

// Leaf on Read is piloting in one neighborhood; everyone joins it until more blocks launch.
const PILOT_BLOCK = "morningside"

const steps: { icon: SymbolViewProps["name"]; text: string }[] = [
  { icon: "leaf.fill", text: "Adopt the young trees on your block. Each one gets its own personality." },
  { icon: "message.fill", text: "When one gets thirsty, it texts everyone who looks after it." },
  { icon: "hand.raised.fill", text: "Someone says “I'm on it,” grabs a bucket, and the whole block sees it." },
]

type Place = { label: string; near: NearBlock | null }

export default function Onboarding() {
  const { saveUser } = useSession()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [language, setLanguage] = useState("en")
  const [place, setPlace] = useState<Place | null>(null)
  const [typedBlock, setTypedBlock] = useState("")
  const [locating, setLocating] = useState(false)
  const [locationNote, setLocationNote] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  // Three short steps so the button is always in reach: why → where → who.
  const [step, setStep] = useState(0)
  const phoneRef = useRef<TextInput>(null)

  async function findMyBlock() {
    setLocating(true)
    setLocationNote("")
    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (!permission.granted) {
        setLocationNote("No problem. Type your home block below instead.")
        return
      }
      const position =
        (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
      const { latitude, longitude } = position.coords
      const [address] = await Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => [])
      const near = await api<NearBlock>(`/blocks/near?lat=${latitude}&lng=${longitude}`).catch(() => null)
      const street = address?.street ?? address?.name ?? "Your street"
      const area = address?.district ?? address?.subregion ?? address?.city ?? near?.name
      setPlace({ label: area ? `${street} · ${area}` : street, near })
      setTypedBlock("")
    } catch {
      setLocationNote("Couldn't find you right now. Type your home block below instead.")
    } finally {
      setLocating(false)
    }
  }

  async function submit() {
    const homeBlock = place?.label ?? typedBlock.trim()
    if (!name.trim() || !phone.trim()) {
      setError("Add your name and phone so your trees can reach you.")
      return
    }
    if (!homeBlock) {
      setStep(1)
      setError("Share your location or type your home block so we can find your neighbors.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const user = await api<User>("/users", {
        method: "POST",
        body: JSON.stringify({
          phone: phone.trim(),
          name: name.trim(),
          blockId: place?.near?.blockId ?? PILOT_BLOCK,
          homeBlock,
          language,
        }),
      })
      await saveUser(user)
      const agent = process.env.EXPO_PUBLIC_AGENT_PHONE
      if (agent) {
        const body = encodeURIComponent(`Hi 🌳 join ${user.userCode}`)
        await Linking.openURL(`sms:${agent}&body=${body}`)
      }
      router.replace("/map")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  const near = place?.near

  function next() {
    setError("")
    if (step === 1 && !place && !typedBlock.trim()) {
      setError("Share your location or type your home block so we can find your neighbors.")
      return
    }
    setStep((value) => value + 1)
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        {step > 0 ? (
          <LinkButton label="Back" icon="chevron.left" onPress={() => setStep((value) => value - 1)} />
        ) : (
          <View style={{ height: 44 }} />
        )}
        <View style={styles.dots} accessible accessibilityLabel={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((dot) => (
            <View key={dot} style={[styles.dot, dot === step && styles.dotOn]} />
          ))}
        </View>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <>
            <View style={styles.hero}>
              <View style={styles.heroBubble}>
                <Text style={styles.heroBubbleText}>psst… we grow better together 🌱</Text>
              </View>
              <TreeBuddy mood="happy" size={140} />
              <Text accessibilityRole="header" style={styles.title}>
                Leaf on Read
              </Text>
              <Text style={styles.lead}>
                The young trees on your block can&apos;t water themselves, and one neighbor can&apos;t do it alone.
                Take turns with the people on your street.
              </Text>
            </View>
            <Card style={styles.steps}>
              {steps.map((item) => (
                <View key={item.text} style={styles.step}>
                  <View style={styles.stepIcon}>
                    <Icon name={item.icon} color={colors.leafDeep} size={16} />
                  </View>
                  <Text style={styles.stepText}>{item.text}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text accessibilityRole="header" style={styles.stepTitle}>
              Where&apos;s home?
            </Text>
            <Text style={styles.lead}>We&apos;ll find the trees and neighbors on your block.</Text>
            <Card>
              {place ? (
                <View style={styles.placeBox}>
                  <View style={styles.placeRow}>
                    <Icon name="location.fill" color={colors.waterDeep} size={16} />
                    <Text style={styles.placeLabel} numberOfLines={2}>
                      {place.label}
                    </Text>
                  </View>
                  {near?.inArea ? (
                    <Text style={styles.community}>
                      {near.needCaretakers > 0
                        ? `${near.needCaretakers} trees within a few blocks of you still need a caretaker`
                        : `${near.nearbyTrees} trees within a few blocks of you`}
                      {near.neighbors > 0 ? `, and ${near.neighbors} neighbors are already looking after the block.` : "."}
                    </Text>
                  ) : near ? (
                    <Text style={styles.community}>
                      Leaf on Read is piloting in {near.name} first. You&apos;ll join that block for now, and we&apos;ll
                      bring yours on next.
                    </Text>
                  ) : null}
                  <LinkButton label="Change" icon="pencil" onPress={() => setPlace(null)} />
                </View>
              ) : (
                <>
                  <Button
                    label={locating ? "Finding your block…" : "Use my location"}
                    icon="location.fill"
                    color={colors.water}
                    busy={locating}
                    onPress={() => void findMyBlock()}
                  />
                  {locationNote ? <Text style={styles.hint}>{locationNote}</Text> : null}
                  <Text style={styles.or}>or type it in</Text>
                  <Field
                    label="Home block"
                    icon="map.fill"
                    value={typedBlock}
                    onChangeText={setTypedBlock}
                    placeholder="e.g. W 116th St & Amsterdam Ave"
                    textContentType="fullStreetAddress"
                    returnKeyType="next"
                    onSubmitEditing={next}
                  />
                </>
              )}
            </Card>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text accessibilityRole="header" style={styles.stepTitle}>
              Who&apos;s joining?
            </Text>
            <Card>
              <Field
                label="First name"
                icon="person.fill"
                value={name}
                onChangeText={setName}
                placeholder="Your first name"
                textContentType="givenName"
                autoComplete="given-name"
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
              />
              <Field
                ref={phoneRef}
                label="Phone number"
                icon="phone.fill"
                value={phone}
                onChangeText={setPhone}
                placeholder="+1 212 555 0123"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
              />
              <Text style={styles.hint}>Your trees text this number when they need water. Neighbors never see it.</Text>
            </Card>
            <Card>
              <SectionTitle icon="character.bubble.fill" title="Your trees speak…" color={colors.leafDeep} />
              <View style={styles.row}>
                {languages.map((item) => (
                  <Chip key={item.code} label={item.label} on={language === item.code} onPress={() => setLanguage(item.code)} />
                ))}
              </View>
            </Card>
          </>
        ) : null}
      </ScrollView>

      <ActionBar>
        {error ? (
          <View style={styles.error} accessibilityRole="alert">
            <Icon name="exclamationmark.circle.fill" color={colors.thirstyText} size={16} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {step < 2 ? (
          <Button label={step === 0 ? "Get started" : "Continue"} icon="arrow.right" onPress={next} />
        ) : (
          <Button label="Join your block" icon="person.3.fill" onPress={() => void submit()} busy={busy} />
        )}
      </ActionBar>
    </KeyboardAvoidingView>
  )
}

function Field({
  icon,
  label,
  ref,
  ...input
}: TextInputProps & {
  icon: SymbolViewProps["name"]
  label: string
  ref?: React.Ref<TextInput>
}) {
  return (
    <View style={styles.field}>
      <Icon name={icon} color={colors.inkSoft} size={16} />
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        style={styles.input}
        placeholderTextColor={colors.inkSoft}
        {...input}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 14, paddingBottom: 160 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { width: 22, backgroundColor: colors.leafDeep },
  stepTitle: { fontFamily: rounded, fontSize: 28, fontWeight: "800", color: colors.ink },
  hero: { alignItems: "center", gap: 6, marginBottom: 2 },
  heroBubble: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: -6,
  },
  heroBubbleText: { fontFamily: rounded, fontWeight: "700", color: colors.leafDeep },
  title: { fontFamily: rounded, fontSize: 34, fontWeight: "800", color: colors.ink },
  lead: { fontSize: 16, lineHeight: 22, color: colors.inkSoft, textAlign: "center", paddingHorizontal: 8 },
  steps: { gap: 12 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 21 },
  placeBox: { gap: 10 },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  placeLabel: { flex: 1, fontFamily: rounded, fontSize: 17, fontWeight: "800", color: colors.ink },
  community: { color: colors.leafDeep, fontWeight: "600", lineHeight: 20 },
  or: { color: colors.inkSoft, textAlign: "center", fontWeight: "600" },
  hint: { color: colors.inkSoft, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
  },
  input: { flex: 1, minHeight: 50, fontSize: 16, color: colors.ink },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.thirstySoft,
    borderRadius: radius.sm,
    padding: 12,
  },
  errorText: { color: colors.thirstyText, fontWeight: "600", flex: 1 },
})
