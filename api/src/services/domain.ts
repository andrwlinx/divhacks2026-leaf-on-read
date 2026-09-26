import { randomBytes, randomUUID } from "node:crypto"
import { alertText } from "../copy.ts"
import { collection } from "../db/mongo.ts"
import { firstReadingSince, insertReading, latestReading } from "../db/tiger.ts"
import { demoState } from "../demoState.ts"
import { claimMs, demoMode, GUS_ID, publicApiUrl, wateringGraceMs } from "../env.ts"
import { postEvents, sendPush } from "../lib/delivery.ts"
import { verifyWateringPhoto } from "../lib/gemini.ts"
import { grokRespond, grokText, grokConfigured } from "../lib/grok.ts"
import { pushNeighbors, pushNote, pushTree } from "../lib/deepspace.ts"
import { recall, remember } from "../lib/memory.ts"
import { synthesizeVoice } from "../lib/voice.ts"
import { characterPrompt, greetingLine, smallTalk } from "./character.ts"
import { postTreeToCrew } from "./threads.ts"
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
  pushTree({ ...tree, status }, input.moisture)
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
  pushNote(options.tree._id, alertText(options.type, "en", treeName, Math.round(options.moisturePct), options.who), "tree")
  const crew = crewLine(options.type, Math.round(options.moisturePct), options.who)
  await postTreeToCrew(options.tree, crew.text, crew.action).catch((error) => console.error("crew post failed", error))
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
      phone: item.user.imessageId || item.user.phone,
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

// What the tree says in its crew chat (English: a crew can mix languages). Thirsty posts carry an "I'm on it" action.
function crewLine(type: Parameters<typeof alertText>[0], pct: number, who?: string): { text: string; action: "claim" | null } {
  if (type === "thirsty") return { text: `Soil's at ${pct}% and I'm parched. Who's got me? 💧`, action: "claim" }
  if (type === "claimed") return { text: `${who ?? "Someone"} is on it 💪 Hang tight, everyone.`, action: null }
  if (type === "claim_expired") return { text: "Still dry, and nobody made it yet. Anyone around? 💧", action: "claim" }
  if (type === "rain_skip") return { text: "Rain's coming tonight, so you're all off the hook 🌧️", action: null }
  return { text: "I can feel the water all the way down. Thank you, crew 💚", action: null }
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
  const at = new Date().toISOString()
  const watering: WateringDoc = {
    _id: randomUUID(),
    treeId: input.treeId,
    userId: input.userId,
    gallons: input.gallons,
    photoUrl: null,
    verified: null,
    source: input.source,
    at,
  }
  await waterings().insertOne(watering)
  // Gemini can take several seconds under load, so the watering counts now and the verdict lands after.
  if (input.photoBase64) {
    void verifyWateringPhoto(input.photoBase64)
      .then((verified) => waterings().updateOne({ _id: watering._id }, { $set: { verified } }))
      .catch((error) => console.error("photo check failed", error))
  }
  await trees().updateOne(
    { _id: input.treeId },
    { $set: { status: "ok", lastWateredAt: at, claim: null } },
  )
  if (demoMode && tree._id === GUS_ID) demoState.moisture = 80
  const [waterer, updated] = await Promise.all([users().findOne({ _id: input.userId }), treeById(input.treeId)])
  if (updated) pushTree(updated, undefined, true)
  if (waterer) {
    pushNote(input.treeId, `${waterer.name} poured ${input.gallons} gallons`, "watered", waterer.name)
    await postTreeToCrew(updated ?? tree, `${waterer.name} just poured ${input.gallons} gallons 💧`).catch((error) =>
      console.error("crew post failed", error),
    )
    pushNeighbors(await blockLeaderboard(waterer.blockId))
  }
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
  pushTree({ ...tree, claim }, undefined, true)
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
  pushTree({ ...tree, claim: null }, undefined, true)
  return true
}

const chatTools = [
  {
    type: "function",
    name: "log_watering",
    description: "Only when the person says they already watered you. Logs the watering.",
    parameters: {
      type: "object",
      properties: { gallons: { type: "number", description: "Gallons poured, usually 5 to 20." } },
      required: ["gallons"],
    },
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
    description: "Only when the person says they're on their way to water you.",
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
  const [tree, user] = await Promise.all([treeById(input.treeId), users().findOne({ _id: input.userId })])
  if (!tree || !user) return null
  const [facts, history, memories] = await Promise.all([
    treeFacts(tree),
    messages().find({ treeId: tree._id, userId: user._id }).sort({ at: -1 }).limit(20).toArray(),
    recall(tree, user, input.message),
  ])
  history.reverse()
  const state = treeState(tree, facts)
  const recent = history.filter((item) => item.role === "tree").map((item) => item.text).slice(-8)
  const local = () => localReply(tree, user, input.message, facts.moisture, input.channel, state.feeling, recent)

  // Saved while Grok thinks; awaited before the reply is stored so order is kept.
  const savedTurn = messages().insertOne({
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
    const fallback = await local()
    reply = fallback.reply
    actions.push(...fallback.actions)
  } else {
    try {
      const generated = await grokChat(tree, user, facts, history, input.message, input.channel, actions, input.mode, memories)
      reply = generated || fallbackLine(tree, facts.moisture)
    } catch (error) {
      console.error("grok chat failed", error)
      const fallback = await local()
      reply = fallback.reply
      actions.push(...fallback.actions)
    }
  }

  await savedTurn
  remember(tree, user, input.message)
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
  // Tools can change the tree (watered, claimed); otherwise the state we already read is current.
  const after = actions.length ? await treeById(tree._id) : tree
  return { reply, actions, state: after ? treeState(after, actions.length ? await treeFacts(after) : facts) : state }
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
  memories: string[] = [],
) {
  let input: unknown[] = [
    {
      role: "system",
      content: [
        mode === "voice"
          ? `You are ${tree.name || "a street tree"}, a real NYC street tree talking out loud with ${user.name}, a neighbor standing next to you.`
          : `You are ${tree.name || "a street tree"}, a real NYC street tree texting a neighbor.`,
        characterPrompt(tree),
        `Species: ${tree.species}. Address: ${tree.address}.`,
        `Speak ${user.language}. Keep replies to 1-3 short sentences.`,
        ...(mode === "voice" ? voiceRules : []),
        "Only state moisture, temperature, and watering facts that appear below. Never invent a reading.",
        "If the person asks something unrelated or unsafe, deflect in character and talk about the block or yourself.",
        `Live facts: ${JSON.stringify(facts)}`,
        memoryLine(user, memories),
      ].join("\n"),
    },
    ...history.map((item) => ({
      role: item.role === "tree" ? "assistant" : "user",
      content: item.text,
    })),
    // Earlier turns may quote old readings ("still at eighty"); restate the live state right before the reply.
    { role: "system", content: currentStateLine(tree, facts) },
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
  feeling: ReturnType<typeof treeState>["feeling"],
  recent: string[],
) {
  if (/\b(i )?(just )?(watered|gave you|poured)\b|\bbuckets?\b|\bgallons?\b/i.test(message)) {
    await logWatering({ treeId: tree._id, userId: user._id, gallons: 5, source })
    return {
      reply: `Oh, I can feel that all the way down to my roots. Thank you, ${user.name}. You're a real one.`,
      actions: [{ name: "log_watering", gallons: 5 }],
    }
  }
  if (/\bon it\b/i.test(message)) {
    await claimTree(tree._id, user._id)
    return {
      reply: `My hero. I'll tell the others you've got me, ${user.name}. Take your time, but also, hurry.`,
      actions: [{ name: "claim" }],
    }
  }
  return { reply: smallTalk({ tree, user, message, moisture, feeling, recent }), actions: [] }
}

function currentStateLine(tree: TreeDoc, facts: Awaited<ReturnType<typeof treeFacts>>) {
  const pct = facts.moisture === null ? "unknown" : `${Math.round(facts.moisture)}%`
  const feeling = tree.status === "thirsty" ? "THIRSTY and needs water" : tree.status === "no_sensor" ? "without a sensor" : "watered and fine"
  return `Right now, this moment: soil moisture ${pct}, you are ${feeling}. This overrides any number said earlier in the conversation.`
}

function memoryLine(user: UserDoc, memories: string[]) {
  if (memories.length === 0) return ""
  // Backboard phrases facts as "User has…"; name the neighbor so the model attributes them correctly.
  const facts = memories.map((memory) => memory.replace(/\bUser\b/g, user.name))
  return `What ${user.name} told you in earlier conversations (bring one up only when it fits, never list them): ${facts.join("; ")}`
}

const voiceRules = [
  "Your reply is read aloud by a text-to-speech voice: no emoji, no markdown, no lists, and write numbers the way you'd say them.",
  "Sound like your personality, and let how you physically feel right now (from the live facts) color what you say.",
  "Tell them your state (thirsty or fine, and your soil moisture) when they ask or when you're thirsty. If you already said it in this conversation, don't repeat the number.",
]

export function treeState(tree: TreeDoc, facts: Awaited<ReturnType<typeof treeFacts>>) {
  const moisture = facts.moisture === null ? null : Math.round(facts.moisture)
  const feeling: "thirsty" | "fine" | "refreshed" | "unknown" =
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

// The tree speaks first when a voice conversation opens: who it is and how it's doing.
export async function greetTree(input: { treeId: string; userId: string }) {
  const [tree, user] = await Promise.all([treeById(input.treeId), users().findOne({ _id: input.userId })])
  if (!tree || !user) return null
  const [facts, memories] = await Promise.all([
    treeFacts(tree),
    recall(tree, user, "recent news, plans, worries, school, work, pets, family", 4),
  ])
  const state = treeState(tree, facts)
  let reply = ""
  if (grokConfigured()) {
    try {
      reply = await grokText([
        {
          role: "system",
          content: [
            `You are ${tree.name || "a street tree"}, a real NYC street tree.`,
            characterPrompt(tree),
            `Species: ${tree.species}. Address: ${tree.address}. Speak ${user.language}.`,
            ...voiceRules,
            "Only state facts that appear below. Never invent a reading.",
            `Live facts: ${JSON.stringify({ ...facts, ...state })}`,
            memoryLine(user, memories),
          ].join("\n"),
        },
        {
          role: "user",
          content: `${user.name} just walked up to you. Greet them by name, tell them how you're doing right now in your own words, and ask them something. If they told you something in earlier conversations, ask a warm follow-up about that specific thing instead of a generic question. Two or three short sentences.`,
        },
      ])
    } catch (error) {
      console.error("greeting failed", error)
    }
  }
  const recent = (await messages().find({ treeId: tree._id, userId: user._id, role: "tree" }).sort({ at: -1 }).limit(8).toArray()).map((item) => item.text)
  reply ||= greetingLine({ tree, user, moisture: facts.moisture, feeling: state.feeling, recent })
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

function fallbackLine(tree: TreeDoc, moisture: number | null) {
  const pct = moisture === null ? "unknown" : `${Math.round(moisture)}%`
  return `I'm ${tree.name || "the tree"}. Soil moisture is ${pct}.`
}

export async function blockLeaderboard(blockId: string) {
  const neighbors = await users().find({ blockId }).toArray()
  const ids = neighbors.map((user) => user._id)
  const logs = ids.length ? await waterings().find({ userId: { $in: ids } }).toArray() : []
  const board = neighbors.map((user) => {
    const mine = logs.filter((log) => log.userId === user._id)
    const gallons = mine.reduce((sum, log) => sum + log.gallons, 0)
    return { userId: user._id, name: user.name, gallons, streak: streakFor(mine) }
  })
  board.sort((a, b) => b.gallons - a.gallons)
  return board
}

function streakFor(logs: WateringDoc[]) {
  const days = [...new Set(logs.map((log) => log.at.slice(0, 10)))].sort().reverse()
  if (days.length === 0) return 0
  let streak = 1
  let cursor = Date.parse(`${days[0]}T00:00:00Z`)
  for (const day of days.slice(1)) {
    const time = Date.parse(`${day}T00:00:00Z`)
    if (cursor - time === 86_400_000) {
      streak += 1
      cursor = time
    } else break
  }
  return streak
}

export async function treeFacts(tree: TreeDoc) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  // Two indexed single-row reads; sensor trees write every few seconds, so a 24h scan is tens of thousands of rows.
  const [latest, first, recent] = await Promise.all([
    latestReading(tree._id),
    firstReadingSince(tree._id, since),
    waterings().find({ treeId: tree._id }).sort({ at: -1 }).limit(5).toArray(),
  ])
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
        "Describe the personality of an NYC street tree that texts its neighbors, in exactly two sentences, in the third person, starting with its name (e.g. \"Maple is a …\"). Give it a concrete quirk tied to its species or street, warm and a little dry. It is a character description, not a message: no greeting, no second person, no hashtags or emoji.",
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
