import { Icon } from "@/components/icon"
import { Pill } from "@/components/kit"
import { TreeBuddy } from "@/components/tree-buddy"
import { colors, radius, rounded, statusMeta, type Mood } from "@/constants/design"
import { api, apiBase, upload } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { TalkTurn, TreeDetail, TreeState } from "@/lib/types"
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from "expo-audio"
import * as Haptics from "expo-haptics"
import { Stack, useLocalSearchParams } from "expo-router"
import * as Speech from "expo-speech"
import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type Phase = "thinking" | "idle" | "listening"

// On-device voice for when ElevenLabs isn't configured. Haitian Creole has no iOS voice.
const deviceVoice: Record<string, string | undefined> = {
  en: "en-US",
  es: "es-US",
  zh: "zh-CN",
  bn: "bn-IN",
  ru: "ru-RU",
  ko: "ko-KR",
  ar: "ar-SA",
}

function moodFor(state: TreeState | null, fallback: Mood): Mood {
  if (!state) return fallback
  if (state.feeling === "thirsty") return "thirsty"
  if (state.feeling === "unknown") return "sleepy"
  return "happy"
}

function feelingLine(state: TreeState) {
  const soil = state.moisture === null ? "no sensor reading" : `${state.moisture}% soil moisture`
  if (state.feeling === "thirsty") return `Thirsty · ${soil}`
  if (state.feeling === "refreshed") return `Refreshed · ${soil}`
  if (state.feeling === "unknown") return "Can't feel its soil yet"
  return `Doing fine · ${soil}`
}

export default function TalkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useSession()
  const insets = useSafeAreaInsets()
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const player = useAudioPlayer(null)
  const playback = useAudioPlayerStatus(player)
  const starting = useRef<Promise<boolean> | null>(null)
  const listening = useRef(false)
  const [pulse] = useState(() => new Animated.Value(0))

  const [tree, setTree] = useState<TreeDetail | null>(null)
  const [state, setState] = useState<TreeState | null>(null)
  const [phase, setPhase] = useState<Phase>("thinking")
  const [deviceSpeaking, setDeviceSpeaking] = useState(false)
  const [heard, setHeard] = useState("")
  const [reply, setReply] = useState("")
  const [hint, setHint] = useState("")
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState("")

  const speaking = playback.playing || deviceSpeaking
  const name = tree?.name || tree?.species || "your tree"
  const mood = moodFor(state, tree ? statusMeta(tree.status).mood : "happy")
  const meta = state ? statusMeta(state.status) : null

  function say(turn: TalkTurn) {
    setReply(turn.reply)
    if (turn.state) setState(turn.state)
    Speech.stop()
    if (turn.audioUrl) {
      player.replace({ uri: `${apiBase()}${turn.audioUrl}` })
      player.play()
      return
    }
    Speech.speak(turn.reply, {
      language: deviceVoice[user?.language ?? "en"],
      onStart: () => setDeviceSpeaking(true),
      onDone: () => setDeviceSpeaking(false),
      onStopped: () => setDeviceSpeaking(false),
      onError: () => setDeviceSpeaking(false),
    })
  }

  // The tree speaks first: hello, and how it's doing right now.
  useEffect(() => {
    if (!id || !user) return
    api<TreeDetail>(`/trees/${id}`).then(setTree, () => null)
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })
      .then(() =>
        api<TalkTurn>(`/trees/${id}/talk/greet`, {
          method: "POST",
          body: JSON.stringify({ userId: user._id }),
        }),
      )
      .then(
        (turn) => {
          setPhase("idle")
          say(turn)
        },
        (error: Error) => {
          setPhase("idle")
          setHint(error.message)
        },
      )
    return () => {
      Speech.stop()
    }
    // say() only touches the player and setters; greeting once per open is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user])

  useEffect(() => {
    if (!speaking && phase !== "listening") {
      pulse.stopAnimation()
      pulse.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [speaking, phase, pulse])

  async function startListening() {
    if (phase !== "idle") return
    player.pause()
    Speech.stop()
    setHint("")
    listening.current = true
    setPhase("listening")
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    starting.current = (async () => {
      const permission = await requestRecordingPermissionsAsync()
      if (!permission.granted) return false
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true })
      await recorder.prepareToRecordAsync()
      recorder.record()
      return true
    })()
  }

  async function stopListening() {
    // A ref, not phase: a quick tap can release before the "listening" render lands.
    if (!listening.current || !starting.current) return
    listening.current = false
    const ready = await starting.current.catch(() => false)
    starting.current = null
    if (!ready) {
      setPhase("idle")
      setTyping(true)
      setHint("Microphone is off. You can type (or use the keyboard mic) instead.")
      return
    }
    const heldMs = recorder.getStatus().durationMillis
    await recorder.stop()
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })
    if (heldMs < 500 || !recorder.uri) {
      setPhase("idle")
      setHint("Hold the button the whole time you're talking.")
      return
    }
    const form = new FormData()
    form.append("userId", user?._id ?? "")
    form.append("audio", { uri: recorder.uri, name: "talk.m4a", type: "audio/m4a" } as unknown as Blob)
    await send(form)
  }

  async function sendText() {
    const text = draft.trim()
    if (!text || phase !== "idle") return
    setDraft("")
    const form = new FormData()
    form.append("userId", user?._id ?? "")
    form.append("text", text)
    await send(form)
  }

  async function send(form: FormData) {
    if (!id) return
    setPhase("thinking")
    try {
      const turn = await upload<TalkTurn>(`/trees/${id}/talk`, form)
      setHeard(turn.transcript ?? "")
      say(turn)
    } catch (error) {
      const failed = error as Error & { status?: number }
      if (failed.status === 503) setTyping(true)
      setHint(failed.status === 503 ? "Voice isn't set up on the server yet, so type instead." : failed.message)
    } finally {
      setPhase("idle")
    }
  }

  const ring = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.45] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
  }
  const status =
    phase === "listening"
      ? "Listening…"
      : phase === "thinking"
        ? `${name} is thinking…`
        : speaking
          ? `${name} is talking`
          : "Hold to talk"

  return (
    <KeyboardAvoidingView style={styles.page} behavior="padding" keyboardVerticalOffset={insets.top + 44}>
      <Stack.Screen options={{ title: `Talk to ${name}` }} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.stage}>
          <Animated.View
            style={[styles.ring, { backgroundColor: phase === "listening" ? colors.thirsty : colors.leaf }, ring]}
          />
          <View style={[styles.face, { backgroundColor: meta?.soft ?? colors.mint }]}>
            <TreeBuddy mood={mood} size={150} />
          </View>
        </View>

        {state && meta ? (
          <View style={styles.stateRow}>
            <Pill label={meta.label} icon={meta.icon} color={meta.color} soft={meta.soft} />
            <Text style={styles.feeling}>{feelingLine(state)}</Text>
          </View>
        ) : null}

        {heard ? (
          <View style={[styles.bubble, styles.mine]}>
            <Text style={styles.mineText}>{heard}</Text>
          </View>
        ) : null}
        {reply ? (
          <View style={[styles.bubble, styles.theirs]}>
            <Text style={styles.replyText}>{reply}</Text>
          </View>
        ) : phase === "thinking" ? (
          <ActivityIndicator color={colors.leafDeep} style={{ marginTop: 12 }} />
        ) : null}
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </ScrollView>

      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Text style={styles.status}>{status}</Text>
        {typing ? (
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={`Say something to ${name}…`}
              placeholderTextColor={colors.muted}
              onSubmitEditing={() => void sendText()}
              returnKeyType="send"
              autoFocus
            />
            <Pressable
              style={[styles.send, (!draft.trim() || phase !== "idle") && { opacity: 0.4 }]}
              onPress={() => void sendText()}
            >
              <Icon name="arrow.up" color="#fff" size={16} weight="bold" />
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPressIn={() => void startListening()}
            onPressOut={() => void stopListening()}
            disabled={phase === "thinking"}
            style={[
              styles.mic,
              phase === "listening" && styles.micOn,
              phase === "thinking" && { opacity: 0.5 },
            ]}
          >
            <Icon name={phase === "listening" ? "waveform" : "mic.fill"} color="#fff" size={34} />
          </Pressable>
        )}
        <View style={styles.links}>
          <Pressable onPress={() => setTyping((open) => !open)} hitSlop={10}>
            <Text style={styles.link}>{typing ? "Use my voice" : "Type instead"}</Text>
          </Pressable>
          {speaking ? (
            <Pressable
              onPress={() => {
                player.pause()
                Speech.stop()
              }}
              hitSlop={10}
            >
              <Text style={styles.link}>Stop talking</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  body: { padding: 20, gap: 12, alignItems: "center" },
  stage: { width: 220, height: 220, alignItems: "center", justifyContent: "center", marginTop: 8 },
  ring: { position: "absolute", width: 210, height: 210, borderRadius: 105 },
  face: {
    width: 190,
    height: 190,
    borderRadius: 95,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  stateRow: { alignItems: "center", gap: 6 },
  feeling: { fontFamily: rounded, fontWeight: "700", color: colors.inkSoft },
  bubble: { maxWidth: "88%", borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.leaf, borderBottomRightRadius: 6 },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.card, borderBottomLeftRadius: 6 },
  mineText: { color: "#fff", fontSize: 16, lineHeight: 21 },
  replyText: { color: colors.ink, fontSize: 18, lineHeight: 25 },
  hint: { color: colors.thirsty, fontWeight: "600", textAlign: "center" },
  controls: {
    alignItems: "center",
    gap: 12,
    paddingTop: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  status: { fontFamily: rounded, fontWeight: "800", color: colors.ink, fontSize: 16 },
  mic: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.leafDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  micOn: { backgroundColor: colors.thirsty, transform: [{ scale: 1.08 }] },
  composer: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "stretch" },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.leaf,
    alignItems: "center",
    justifyContent: "center",
  },
  links: { flexDirection: "row", gap: 24 },
  link: { color: colors.leafDeep, fontWeight: "700" },
})
