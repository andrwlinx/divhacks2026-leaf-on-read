import { Hono } from "hono"
import { cors } from "hono/cors"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { collection, database } from "./db/mongo.ts"
import { pool, hourlyBuckets, latestReading, minuteBuckets, readingsSince } from "./db/tiger.ts"
import { demoState } from "./demoState.ts"
import { demoMode, GUS_BLOCK, GUS_ID, publicApiUrl } from "./env.ts"
import { alertText } from "./copy.ts"
import { cachedVoice, synthesizeVoice } from "./lib/voice.ts"
import {
  chatWithTree,
  claimTree,
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

  app.get("/users/lookup", async (c) => {
    const code = c.req.query("code")
    if (!code) return c.json({ error: "code required" }, 400)
    const user = await users().findOne({ userCode: code.toUpperCase() })
    if (!user) return c.json({ error: "not found" }, 404)
    return c.json(user)
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

  app.get("/blocks/:id/leaderboard", async (c) => {
    const blockId = c.req.param("id")
    const neighbors = await users().find({ blockId }).toArray()
    const ids = neighbors.map((user) => user._id)
    const logs = ids.length
      ? await waterings().find({ userId: { $in: ids } }).toArray()
      : []
    const board = neighbors.map((user) => {
      const mine = logs.filter((log) => log.userId === user._id)
      const gallons = mine.reduce((sum, log) => sum + log.gallons, 0)
      return { userId: user._id, name: user.name, gallons, streak: streakFor(mine) }
    })
    board.sort((a, b) => b.gallons - a.gallons)
    return c.json(board)
  })

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
  }
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
