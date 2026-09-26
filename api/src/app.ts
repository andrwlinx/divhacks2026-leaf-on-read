import { Hono } from "hono"
import { cors } from "hono/cors"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { collection, database } from "./db/mongo.ts"
import { pool, hourlyBuckets, latestReading, minuteBuckets, readingsSince } from "./db/tiger.ts"
import { demoState } from "./demoState.ts"
import { demoMode, GUS_BLOCK, GUS_ID, publicApiUrl } from "./env.ts"
import { alertText } from "./copy.ts"
import { speechConfigured, transcribe } from "./lib/speech.ts"
import { cachedVoice, clipAudio, speakClip, synthesizeVoice } from "./lib/voice.ts"
import {
  blockLeaderboard,
  chatWithTree,
  claimTree,
  greetTree,
  logWatering,
  messages,
  recordReading,
  releaseClaim,
  suggestPersona,
  treeById,
  trees,
  userCode,
  users,
  waterings,
} from "./services/domain.ts"
import type { AlertDoc, BlockDoc, TreeDoc, UserDoc, WateringDoc } from "./types.ts"

const blocks = () => collection<BlockDoc>("blocks")

const readingBody = z.object({
  sensorId: z.string().min(1),
  moisture: z.number(),
  temp: z.number(),
  light: z.number(),
  ts: z.string().min(1),
})

export function createApp() {
  const app = new Hono()
  app.use("*", cors())
  app.onError((error, c) => {
    console.error(error)
    return c.json({ error: error.message }, 500)
  })

  app.get("/health", async (c) => {
    let mongo = false
    let tiger = false
    try {
      await database().command({ ping: 1 })
      mongo = true
    } catch {
      mongo = false
    }
    try {
      await pool.query("select 1")
      tiger = true
    } catch {
      tiger = false
    }
    const ok = mongo && tiger
    return c.json({ ok, mongo, tiger, demoMode }, ok ? 200 : 503)
  })

  app.post("/readings", zValidator("json", readingBody), async (c) => {
    const body = c.req.valid("json")
    const time = new Date(body.ts)
    if (Number.isNaN(time.getTime())) return c.json({ error: "bad ts" }, 400)
    const tree = await recordReading({
      sensorId: body.sensorId,
      moisture: body.moisture,
      temp: body.temp,
      light: body.light,
      time,
    })
    return c.json({ ok: true, treeId: tree?._id ?? null }, 201)
  })

  app.get("/trees", async (c) => {
    const bbox = c.req.query("bbox")
    const filter: Record<string, unknown> = {}
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(",").map(Number)
      if ([minLng, minLat, maxLng, maxLat].some((value) => Number.isNaN(value))) {
        return c.json({ error: "bad bbox" }, 400)
      }
      filter.lng = { $gte: minLng, $lte: maxLng }
      filter.lat = { $gte: minLat, $lte: maxLat }
    }
    const rows = await trees().find(filter).limit(200).toArray()
    return c.json(rows.map(publicTree))
  })

  app.get("/trees/:id", async (c) => {
    const tree = await treeById(c.req.param("id"))
    if (!tree) return c.json({ error: "not found" }, 404)
    const latest = await latestReading(tree._id)
    const caretakers = tree.adopterIds.length
      ? await users().find({ _id: { $in: tree.adopterIds } }).toArray()
      : []
    return c.json({
      ...publicTree(tree),
      persona: tree.persona,
      address: tree.address,
      threshold: tree.thirstThreshold,
      claim: tree.claim,
      latest: latest
        ? { moisture: latest.moisture, temp: latest.temp, light: latest.light, t: latest.time.toISOString() }
        : null,
      caretakers: caretakers.map((user) => ({ id: user._id, name: user.name })),
    })
  })

  app.get("/trees/:id/readings", async (c) => {
    const range = c.req.query("range") || "live"
    const treeId = c.req.param("id")
    const now = Date.now()
    if (range === "live") {
      const rows = await readingsSince(treeId, new Date(now - 5 * 60 * 1000))
      return c.json(rows.map((row) => ({ t: row.time.toISOString(), moisture: row.moisture })))
    }
    if (range === "24h") {
      const rows = await minuteBuckets(treeId, new Date(now - 24 * 60 * 60 * 1000))
      return c.json(rows.map((row) => ({ t: row.t.toISOString(), moisture: row.moisture })))
    }
    const rows = await hourlyBuckets(treeId, new Date(now - 7 * 24 * 60 * 60 * 1000))
    return c.json(rows.map((row) => ({ t: row.t.toISOString(), moisture: row.moisture })))
  })

  app.post("/users", zValidator("json", z.object({
    phone: z.string().min(1),
    name: z.string().min(1),
    blockId: z.string().min(1),
    language: z.string().min(2),
    pushToken: z.string().optional(),
  })), async (c) => {
    const body = c.req.valid("json")
    const existing = await users().findOne({ phone: body.phone })
    const user: UserDoc = existing ?? {
      _id: crypto.randomUUID(),
      phone: body.phone,
      name: body.name,
      blockId: body.blockId,
      language: body.language,
      pushToken: body.pushToken ?? null,
      userCode: userCode(),
      createdAt: new Date().toISOString(),
    }
    if (!existing) await users().insertOne(user)
    else if (body.pushToken) await users().updateOne({ _id: user._id }, { $set: { pushToken: body.pushToken } })
    if (demoMode) await trees().updateOne({ _id: GUS_ID }, { $addToSet: { adopterIds: user._id } })
    return c.json(user, existing ? 200 : 201)
  })

  // The agent resolves an iMessage sender: by join code, by linked handle, or by phone digits.
  app.get("/users/lookup", async (c) => {
    const code = c.req.query("code")
    const handle = c.req.query("handle")
    if (!code && !handle) return c.json({ error: "code or handle required" }, 400)
    const user = code ? await users().findOne({ userCode: code.toUpperCase() }) : await userByHandle(handle!)
    if (!user) return c.json({ error: "not found" }, 404)
    return c.json({ ...user, treeId: await homeTree(user._id) })
  })

  // "Hi 🌳 join AB12CD" from iMessage ties that sender to the app user.
  app.post("/users/link", zValidator("json", z.object({ code: z.string().min(4), handle: z.string().min(3) })), async (c) => {
    const body = c.req.valid("json")
    const user = await users().findOneAndUpdate(
      { userCode: body.code.toUpperCase() },
      { $set: { imessageId: body.handle } },
      { returnDocument: "after" },
    )
    if (!user) return c.json({ error: "not found" }, 404)
    return c.json({ ...user, treeId: await homeTree(user._id) })
  })

  app.get("/users/:id/alerts", async (c) => {
    const since = c.req.query("since")
    const filter: Record<string, unknown> = { userId: c.req.param("id") }
    if (since) filter.at = { $gt: since }
    const rows = await collection<AlertDoc>("alerts")
      .find(filter)
      .sort({ at: 1 })
      .limit(20)
      .toArray()
    return c.json(rows)
  })

  app.post("/trees/:id/adopt", zValidator("json", z.object({
    userId: z.string(),
    name: z.string().min(1),
  })), async (c) => {
    const tree = await treeById(c.req.param("id"))
    if (!tree) return c.json({ error: "not found" }, 404)
    const { userId, name } = c.req.valid("json")
    const persona = await suggestPersona(tree, name)
    await trees().updateOne(
      { _id: tree._id },
      { $set: { name, persona }, $addToSet: { adopterIds: userId } },
    )
    const next = await treeById(tree._id)
    return c.json(next)
  })

  app.post("/trees/:id/waterings", zValidator("json", z.object({
    userId: z.string(),
    gallons: z.number().positive(),
    photoBase64: z.string().optional(),
    source: z.enum(["app", "imessage"]).optional(),
  })), async (c) => {
    const body = c.req.valid("json")
    const watering = await logWatering({
      treeId: c.req.param("id"),
      userId: body.userId,
      gallons: body.gallons,
      photoBase64: body.photoBase64,
      source: body.source ?? "app",
    })
    if (!watering) return c.json({ error: "not found" }, 404)
    return c.json(watering, 201)
  })

  app.post("/trees/:id/claim", zValidator("json", z.object({ userId: z.string() })), async (c) => {
    const result = await claimTree(c.req.param("id"), c.req.valid("json").userId)
    if (result.error === "not_found") return c.json({ error: "not found" }, 404)
    if (result.error === "claimed") return c.json(result, 409)
    return c.json(result)
  })

  app.delete("/trees/:id/claim", zValidator("json", z.object({ userId: z.string() })), async (c) => {
    const ok = await releaseClaim(c.req.param("id"), c.req.valid("json").userId)
    if (!ok) return c.json({ error: "not the claim holder" }, 403)
    return c.body(null, 204)
  })

  app.post("/trees/:id/chat", zValidator("json", z.object({
    userId: z.string(),
    message: z.string().min(1),
    channel: z.enum(["app", "imessage"]),
  })), async (c) => {
    const body = c.req.valid("json")
    const result = await chatWithTree({
      treeId: c.req.param("id"),
      userId: body.userId,
      message: body.message,
      channel: body.channel,
    })
    if (!result) return c.json({ error: "not found" }, 404)
    return c.json(result)
  })

  app.get("/trees/:id/chat", async (c) => {
    const userId = c.req.query("userId")
    if (!userId) return c.json({ error: "userId required" }, 400)
    const limit = Number(c.req.query("limit") || 50)
    const rows = await messages()
      .find({ treeId: c.req.param("id"), userId })
      .sort({ at: 1 })
      .limit(limit)
      .toArray()
    return c.json(rows)
  })

  // Voice conversation: the tree greets the neighbor and says how it's doing.
  app.post("/trees/:id/talk/greet", zValidator("json", z.object({ userId: z.string() })), async (c) => {
    const greeting = await greetTree({ treeId: c.req.param("id"), userId: c.req.valid("json").userId })
    if (!greeting) return c.json({ error: "not found" }, 404)
    const clip = speakClip(greeting.reply, greeting.language)
    return c.json({
      reply: greeting.reply,
      state: greeting.state,
      audioUrl: clip ? `/voice/clips/${clip}` : null,
    })
  })

  // One spoken turn: multipart { userId, audio } (or { userId, text } when typed or dictated).
  app.post("/trees/:id/talk", async (c) => {
    const form = await c.req.parseBody()
    const userId = typeof form.userId === "string" ? form.userId : ""
    if (!userId) return c.json({ error: "userId required" }, 400)
    let transcript = typeof form.text === "string" ? form.text.trim() : ""
    const audio = form.audio
    if (!transcript && audio instanceof File) {
      if (!speechConfigured()) return c.json({ error: "speech-to-text is not configured" }, 503)
      try {
        transcript = await transcribe(audio, audio.name || "talk.m4a")
      } catch (error) {
        console.error(error)
        return c.json({ error: "speech-to-text is unavailable" }, 503)
      }
    }
    if (!transcript) return c.json({ error: "didn't catch that" }, 422)
    const [user, result] = await Promise.all([
      users().findOne({ _id: userId }),
      chatWithTree({ treeId: c.req.param("id"), userId, message: transcript, channel: "app", mode: "voice" }),
    ])
    if (!result || !user) return c.json({ error: "not found" }, 404)
    const clip = speakClip(result.reply, user.language)
    return c.json({
      transcript,
      reply: result.reply,
      actions: result.actions,
      state: result.state,
      audioUrl: clip ? `/voice/clips/${clip}` : null,
    })
  })

  app.get("/voice/clips/:id", async (c) => {
    const audio = await clipAudio(c.req.param("id"))
    if (!audio) return c.json({ error: "clip not found" }, 404)
    return c.body(new Uint8Array(audio), 200, { "Content-Type": "audio/mpeg" })
  })

  app.get("/trees/:id/voice", async (c) => {
    const type = c.req.query("type") === "thanks" ? "thanks" : "thirsty"
    const lang = c.req.query("lang") || "en"
    const tree = await treeById(c.req.param("id"))
    if (!tree) return c.json({ error: "not found" }, 404)
    const text = alertText(type, lang, tree.name || "This tree", tree.thirstThreshold)
    let audio = await cachedVoice(tree._id, type, lang)
    if (!audio) audio = await synthesizeVoice(tree._id, type, lang, text)
    if (!audio) return c.json({ error: "voice unavailable" }, 404)
    return c.body(new Uint8Array(audio), 200, { "Content-Type": "audio/mpeg" })
  })

  app.get("/blocks", async (c) => {
    const rows = await blocks().find().toArray()
    return c.json(rows)
  })

  app.get("/blocks/:id/leaderboard", async (c) => c.json(await blockLeaderboard(c.req.param("id"))))

  app.post("/demo/sensor", async (c) => {
    if (!demoMode) return c.json({ error: "demo mode is off" }, 403)
    const body = z.object({ moisture: z.number() }).parse(await c.req.json())
    demoState.moisture = body.moisture
    return c.json({ moisture: demoState.moisture })
  })

  app.post("/demo/rain", async (c) => {
    if (!demoMode) return c.json({ error: "demo mode is off" }, 403)
    demoState.armRain()
    return c.json({ armed: true })
  })

  app.get("/demo/gus", (c) => c.json({ id: GUS_ID, blockId: GUS_BLOCK, publicApiUrl }))

  return app
}

const digits = (value: string) => value.replace(/\D/g, "").slice(-10)

async function userByHandle(handle: string) {
  const linked = await users().findOne({ imessageId: handle })
  if (linked || !/\d{10}/.test(handle.replace(/\D/g, ""))) return linked
  const wanted = digits(handle)
  const candidates = await users().find({ phone: { $regex: wanted.slice(-4) + "$" } }).toArray()
  return candidates.find((user) => digits(user.phone) === wanted) ?? null
}

// The tree a neighbor's thread talks to: a sensor tree they adopted, else any adopted tree, else Gus.
async function homeTree(userId: string) {
  const sensor = await trees().findOne({ adopterIds: userId, sensorId: { $ne: null } })
  if (sensor) return sensor._id
  const any = await trees().findOne({ adopterIds: userId })
  return any?._id ?? GUS_ID
}

function publicTree(tree: TreeDoc) {
  return {
    id: tree._id,
    name: tree.name,
    species: tree.species,
    lat: tree.lat,
    lng: tree.lng,
    status: tree.status,
    blockId: tree.blockId,
    sensorId: tree.sensorId,
    address: tree.address,
    adopters: tree.adopterIds.length,
    lastWateredAt: tree.lastWateredAt,
    threshold: tree.thirstThreshold,
  }
}

