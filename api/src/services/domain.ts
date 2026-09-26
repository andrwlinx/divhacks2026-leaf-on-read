import { randomBytes, randomUUID } from "node:crypto"
import { alertText } from "../copy.ts"
import { collection } from "../db/mongo.ts"
import { insertReading, latestReading, readingsSince } from "../db/tiger.ts"
import { demoState } from "../demoState.ts"
import { claimMs, demoMode, GUS_ID, publicApiUrl, wateringGraceMs } from "../env.ts"
import { postEvents, sendPush } from "../lib/delivery.ts"
import { verifyWateringPhoto } from "../lib/gemini.ts"
import { grokRespond, grokText, grokConfigured } from "../lib/grok.ts"
import { synthesizeVoice } from "../lib/voice.ts"
import type { AlertDoc, MessageDoc, TreeDoc, UserDoc, WateringDoc } from "../types.ts"

const trees = () => collection<TreeDoc>("trees")
const users = () => collection<UserDoc>("users")
const waterings = () => collection<WateringDoc>("waterings")
const alerts = () => collection<AlertDoc>("alerts")
const messages = () => collection<MessageDoc>("messages")

export function userCode() {
  return randomBytes(4).toString("hex").slice(0, 6).toUpperCase()
}

export async function treeById(id: string) {
  return trees().findOne({ _id: id })
}

export async function treeBySensor(sensorId: string) {
  return trees().findOne({ sensorId })
}

export function statusFor(tree: TreeDoc, moisture: number, now = Date.now()) {
  if (!tree.sensorId) return "no_sensor" as const
  if (moisture >= tree.thirstThreshold) return "ok" as const
  if (tree.lastWateredAt && now - Date.parse(tree.lastWateredAt) < wateringGraceMs) {
    return "ok" as const
  }
  return "thirsty" as const
}

export async function recordReading(input: {
  sensorId: string
  moisture: number
  temp: number | null
  light: number | null
  time: Date
}) {
  const tree = await treeBySensor(input.sensorId)
  await insertReading({
    time: input.time,
    sensorId: input.sensorId,
    treeId: tree?._id ?? null,
    moisture: input.moisture,
    temp: input.temp,
    light: input.light,
  })
  if (!tree) return null
  const status = statusFor(tree, input.moisture, input.time.getTime())
  await trees().updateOne({ _id: tree._id }, { $set: { status } })
  return { ...tree, status }
}

export async function moistureNow(treeId: string) {
  const latest = await latestReading(treeId)
  return latest?.moisture ?? null
}

async function adopterUsers(tree: TreeDoc, exceptUserId?: string) {
  const ids = tree.adopterIds.filter((id) => id !== exceptUserId)
  if (ids.length === 0) return []
  return users().find({ _id: { $in: ids } }).toArray()
}

function voiceUrlFor(treeId: string, type: string, language: string) {
  if (!publicApiUrl) return undefined
  return `${publicApiUrl}/trees/${treeId}/voice?type=${type}&lang=${language}`
}

export async function emitAlert(options: {
  type: "thirsty" | "thanks" | "rain_skip" | "claimed" | "claim_expired"
  tree: TreeDoc
  moisturePct: number
  who?: string
  exceptUserId?: string
}) {
  const recipients = await adopterUsers(options.tree, options.exceptUserId)
  const treeName = options.tree.name || "This tree"
  const built = recipients.map((user) => {
    const text = alertText(options.type, user.language, treeName, Math.round(options.moisturePct), options.who)
    const voiceUrl =
      options.type === "thirsty" || options.type === "thanks"
        ? voiceUrlFor(options.tree._id, options.type, user.language)
        : undefined
    return { user, text, voiceUrl }
  })

  if (built.length > 0) {
    await alerts().insertMany(
      built.map((item) => ({
        _id: randomUUID(),
        userId: item.user._id,
        treeId: options.tree._id,
        treeName,
        type: options.type,
        text: item.text,
        ...(item.voiceUrl ? { voiceUrl: item.voiceUrl } : {}),
        at: new Date().toISOString(),
      })),
    )
  }

  const payload = {
    type: options.type,
    treeId: options.tree._id,
    treeName,
    moisturePct: Math.round(options.moisturePct),
    messages: built.map((item) => ({
      phone: item.user.phone,
      language: item.user.language,
      text: item.text,
      ...(item.voiceUrl ? { voiceUrl: item.voiceUrl } : {}),
    })),
  }
  const delivered = await postEvents(payload)
  if (!delivered) {
    await sendPush(
      built.map((item) => ({
        to: item.user.pushToken,
        title: treeName,
        body: item.text,
      })),
    )
  }

  if (options.type === "thirsty" || options.type === "thanks") {
    for (const item of built) {
      void synthesizeVoice(options.tree._id, options.type, item.user.language, item.text).catch(() => null)
    }
  }
}

export async function logWatering(input: {
  treeId: string
  userId: string
  gallons: number
  photoBase64?: string
  source: "app" | "imessage"
}) {
  const tree = await treeById(input.treeId)
  if (!tree) return null
  const verified = input.photoBase64 ? await verifyWateringPhoto(input.photoBase64) : null
  const at = new Date().toISOString()
  const watering: WateringDoc = {
    _id: randomUUID(),
    treeId: input.treeId,
    userId: input.userId,
    gallons: input.gallons,
    photoUrl: null,
    verified,
    source: input.source,
    at,
  }
  await waterings().insertOne(watering)
  await trees().updateOne(
    { _id: input.treeId },
    { $set: { status: "ok", lastWateredAt: at, claim: null } },
  )
  if (demoMode && tree._id === GUS_ID) demoState.moisture = 80
  await thankIfOpen(input.treeId)
  return watering
}

export async function thankIfOpen(treeId: string) {
  const tree = await treeById(treeId)
  if (!tree?.thirstEpisodeId || tree.thirstEpisodeId === tree.thankedEpisodeId) return false
  const updated = await trees().findOneAndUpdate(
    {
      _id: treeId,
      thirstEpisodeId: tree.thirstEpisodeId,
      thankedEpisodeId: { $ne: tree.thirstEpisodeId },
    },
    { $set: { thankedEpisodeId: tree.thirstEpisodeId, status: "ok", claim: null } },
  )
  if (!updated) return false
  const moisture = (await moistureNow(treeId)) ?? tree.thirstThreshold
  await emitAlert({ type: "thanks", tree, moisturePct: moisture })
  return true
}

export async function claimTree(treeId: string, userId: string) {
  const tree = await treeById(treeId)
  const user = await users().findOne({ _id: userId })
  if (!tree || !user) return { error: "not_found" as const }
  if (tree.claim && Date.parse(tree.claim.until) > Date.now() && tree.claim.userId !== userId) {
    return { error: "claimed" as const, claim: tree.claim }
  }
  const claim = {
    userId,
    name: user.name,
    until: new Date(Date.now() + claimMs).toISOString(),
  }
  await trees().updateOne({ _id: treeId }, { $set: { claim } })
  const moisture = (await moistureNow(treeId)) ?? tree.thirstThreshold
  await emitAlert({
    type: "claimed",
    tree,
    moisturePct: moisture,
    who: user.name,
    exceptUserId: userId,
  })
  return { claim }
}

export async function releaseClaim(treeId: string, userId: string) {
  const tree = await treeById(treeId)
  if (!tree?.claim) return true
  if (tree.claim.userId !== userId) return false
  await trees().updateOne({ _id: treeId }, { $set: { claim: null } })
  return true
}

const chatTools = [
  {
    type: "function",
    name: "log_watering",
    description: "Log that this person just watered the tree.",
    parameters: {
      type: "object",
      properties: { gallons: { type: "number", description: "Gallons poured, usually 5 to 20." } },
      required: ["gallons"],
    },
  },
  {
    type: "function",
    name: "get_status",
    description: "Read this tree's live moisture, temperature, and hours since it was watered.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "rename",
    description: "Rename this tree. Only an adopter can do this.",
    parameters: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    type: "function",
    name: "claim",
    description: "This person is on their way to water the tree.",
    parameters: { type: "object", properties: {} },
  },
]

export async function chatWithTree(input: {
  treeId: string
  userId: string
  message: string
  channel: "app" | "imessage"
  mode?: "text" | "voice"
}) {
  const tree = await treeById(input.treeId)
  const user = await users().findOne({ _id: input.userId })
  if (!tree || !user) return null
  const facts = await treeFacts(tree)
  const history = await messages()
    .find({ treeId: tree._id, userId: user._id })
    .sort({ at: -1 })
    .limit(20)
    .toArray()
  history.reverse()

  await messages().insertOne({
    _id: randomUUID(),
    treeId: tree._id,
    userId: user._id,
    role: "user",
    text: input.message,
    channel: input.channel,
    actions: [],
    at: new Date().toISOString(),
  })

  const actions: unknown[] = []
  let reply = ""
  if (!grokConfigured()) {
    const local = await localReply(tree, user, input.message, facts.moisture, input.channel)
    reply = local.reply
    actions.push(...local.actions)
  } else {
    try {
      const generated = await grokChat(tree, user, facts, history, input.message, input.channel, actions, input.mode)
      reply = generated || fallbackLine(tree, facts.moisture)
    } catch (error) {
      console.error("grok chat failed", error)
      const local = await localReply(tree, user, input.message, facts.moisture, input.channel)
      reply = local.reply
      actions.push(...local.actions)
    }
  }

  await messages().insertOne({
    _id: randomUUID(),
    treeId: tree._id,
    userId: user._id,
    role: "tree",
    text: reply,
    channel: input.channel,
    actions,
    at: new Date().toISOString(),
  })
  return { reply, actions }
}

async function grokChat(
  tree: TreeDoc,
  user: UserDoc,
  facts: Awaited<ReturnType<typeof treeFacts>>,
  history: MessageDoc[],
  message: string,
  channel: "app" | "imessage",
  actions: unknown[],
  mode: "text" | "voice" = "text",
) {
  let input: unknown[] = [
    {
      role: "system",
      content: [
        mode === "voice"
          ? `You are ${tree.name || "a street tree"}, a real NYC street tree talking out loud with ${user.name}, a neighbor standing next to you.`
          : `You are ${tree.name || "a street tree"}, a real NYC street tree texting a neighbor.`,
        tree.persona || "You are dry, friendly, and brief.",
        `Species: ${tree.species}. Address: ${tree.address}.`,
        `Speak ${user.language}. Keep replies to 1-3 short sentences.`,
        ...(mode === "voice" ? voiceRules : []),
        "Only state moisture, temperature, and watering facts that appear below. Never invent a reading.",
        "If the person asks something unrelated or unsafe, deflect in character and talk about the block or yourself.",
        `Live facts: ${JSON.stringify(facts)}`,
      ].join("\n"),
    },
    ...history.map((item) => ({
      role: item.role === "tree" ? "assistant" : "user",
      content: item.text,
    })),
    { role: "user", content: message },
  ]

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const turn = await grokRespond(input, chatTools)
    if (turn.calls.length === 0) return turn.text
    const outputs = []
    for (const call of turn.calls) {
      const result = await runTool(tree._id, user._id, call.name, call.arguments, channel)
      actions.push({ name: call.name, result })
      outputs.push({
        type: "function_call_output",
        call_id: call.callId,
        output: JSON.stringify(result),
      })
    }
    input = [...input, ...turn.output, ...outputs]
  }
  return ""
}

async function runTool(
  treeId: string,
  userId: string,
  name: string,
  raw: string,
  source: "app" | "imessage",
) {
  const args = JSON.parse(raw || "{}") as { gallons?: number; name?: string }
  if (name === "log_watering") {
    const watering = await logWatering({
      treeId,
      userId,
      gallons: Number(args.gallons) || 5,
      source,
    })
    return { logged: Boolean(watering), gallons: watering?.gallons ?? 0 }
  }
  if (name === "get_status") {
    const tree = await treeById(treeId)
    return tree ? treeFacts(tree) : { error: "missing" }
  }
  if (name === "rename") {
    const tree = await treeById(treeId)
    if (!tree?.adopterIds.includes(userId)) return { renamed: false }
    await trees().updateOne({ _id: treeId }, { $set: { name: args.name || tree.name } })
    return { renamed: true, name: args.name }
  }
  if (name === "claim") {
    const result = await claimTree(treeId, userId)
    return result
  }
  return { error: "unknown_tool" }
}

async function localReply(
  tree: TreeDoc,
  user: UserDoc,
  message: string,
  moisture: number | null,
  source: "app" | "imessage",
) {
  const name = tree.name || "the tree"
  const pct = moisture === null ? "unknown" : `${Math.round(moisture)}%`
  if (/water|bucket|gallon/i.test(message)) {
    await logWatering({ treeId: tree._id, userId: user._id, gallons: 5, source })
    return { reply: `${name} here. I felt that. Thank you.`, actions: [{ name: "log_watering", gallons: 5 }] }
  }
  if (/\bon it\b/i.test(message)) {
    await claimTree(tree._id, user._id)
    return { reply: `${name} here. I'll hold off the others.`, actions: [{ name: "claim" }] }
  }
  return {
    reply: `I'm ${name}. Soil moisture is ${pct}.`,
    actions: [],
  }
}

const voiceRules = [
  "Your reply is read aloud by a text-to-speech voice: no emoji, no markdown, no lists, and write numbers the way you'd say them.",
  "Sound like your personality, and let how you physically feel right now (from the live facts) color what you say.",
  "If they ask how you are, or you haven't mentioned it yet, tell them your state plainly: thirsty or fine, and your soil moisture.",
]

export function treeState(tree: TreeDoc, facts: Awaited<ReturnType<typeof treeFacts>>) {
  const moisture = facts.moisture === null ? null : Math.round(facts.moisture)
  const feeling =
    tree.status === "thirsty"
      ? "thirsty"
      : tree.status === "no_sensor"
        ? "unknown"
        : moisture !== null && moisture >= 70
          ? "refreshed"
          : "fine"
  return {
    status: tree.status,
    feeling,
    moisture,
    threshold: tree.thirstThreshold,
    hoursSinceWater: facts.hoursSinceWater,
    claimedBy: tree.claim ? tree.claim.userId : null,
  }
}

function greetingFallback(tree: TreeDoc, user: UserDoc, state: ReturnType<typeof treeState>) {
  const name = tree.name || "your tree"
  if (state.feeling === "thirsty") {
    return `Hey ${user.name}, it's ${name}. I'm down to ${state.moisture} percent soil moisture and honestly pretty parched. A bucket or two would mean a lot.`
  }
  if (state.feeling === "unknown") {
    return `Hey ${user.name}, it's ${name}. I don't have a sensor yet, so I can't tell you how my soil is doing. Want to adopt me?`
  }
  return `Hey ${user.name}, it's ${name}. I'm feeling ${state.feeling}, soil's at ${state.moisture} percent. What's on your mind?`
}

// The tree speaks first when a voice conversation opens: who it is and how it's doing.
export async function greetTree(input: { treeId: string; userId: string }) {
  const tree = await treeById(input.treeId)
  const user = await users().findOne({ _id: input.userId })
  if (!tree || !user) return null
  const facts = await treeFacts(tree)
  const state = treeState(tree, facts)
  let reply = ""
  if (grokConfigured()) {
    try {
      reply = await grokText([
        {
          role: "system",
          content: [
            `You are ${tree.name || "a street tree"}, a real NYC street tree. ${tree.persona || "You are dry, friendly, and brief."}`,
            `Species: ${tree.species}. Address: ${tree.address}. Speak ${user.language}.`,
            ...voiceRules,
            "Only state facts that appear below. Never invent a reading.",
            `Live facts: ${JSON.stringify({ ...facts, ...state })}`,
          ].join("\n"),
        },
        {
          role: "user",
          content: `${user.name} just walked up to you. Greet them by name in two short sentences and tell them how you're doing right now.`,
        },
      ])
    } catch (error) {
      console.error("greeting failed", error)
    }
  }
  reply ||= greetingFallback(tree, user, state)
  await messages().insertOne({
    _id: randomUUID(),
    treeId: tree._id,
    userId: user._id,
    role: "tree",
    text: reply,
    channel: "app",
    actions: [],
    at: new Date().toISOString(),
  })
  return { reply, state, language: user.language }
}

export async function stateFor(treeId: string) {
  const tree = await treeById(treeId)
  if (!tree) return null
  return treeState(tree, await treeFacts(tree))
}

function fallbackLine(tree: TreeDoc, moisture: number | null) {
  const pct = moisture === null ? "unknown" : `${Math.round(moisture)}%`
  return `I'm ${tree.name || "the tree"}. Soil moisture is ${pct}.`
}

export async function treeFacts(tree: TreeDoc) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const rows = await readingsSince(tree._id, since)
  const latest = rows.at(-1)
  const first = rows[0]
  const recent = await waterings().find({ treeId: tree._id }).sort({ at: -1 }).limit(5).toArray()
  const hoursSinceWater = tree.lastWateredAt
    ? Math.round(((Date.now() - Date.parse(tree.lastWateredAt)) / 36e5) * 10) / 10
    : null
  return {
    moisture: latest?.moisture ?? null,
    temp: latest?.temp ?? null,
    trend24h:
      latest && first ? Math.round((latest.moisture - first.moisture) * 10) / 10 : null,
    hoursSinceWater,
    status: tree.status,
    recentWaterings: recent.map((item) => ({ gallons: item.gallons, at: item.at, userId: item.userId })),
  }
}

export async function suggestPersona(tree: TreeDoc, name: string) {
  const prompt = [
    {
      role: "system",
      content:
        "Write a two-sentence personality for an NYC street tree that texts its neighbors. Concrete, warm, a little dry. No hashtags.",
    },
    {
      role: "user",
      content: `Name: ${name}. Species: ${tree.species}. Address: ${tree.address}.`,
    },
  ]
  if (!grokConfigured()) {
    return `${name} is a ${tree.species} on ${tree.address} who texts like a neighbor you actually like. Short sentences, and dramatic only about water.`
  }
  try {
    const text = await grokText(prompt)
    return text || `${name} keeps an eye on ${tree.address} and says so in few words.`
  } catch (error) {
    console.error("persona failed", error)
    return `${name} is a ${tree.species} on ${tree.address} who texts like a neighbor. Short sentences, dramatic only about water.`
  }
}

export { alerts, messages, trees, users, waterings }
