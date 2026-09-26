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
import { pushTree } from "./lib/deepspace.ts"
import { listThreads, openDm, postToThread, readThread } from "./services/threads.ts"
import { drawPortraitSoon, isDrawing, portraitFor } from "./services/portraits.ts"
import { buySticker, checkIn, placeSticker, treeStickers, wallet } from "./services/coins.ts"
import { catalog, slots, stickerArt, stickerImageUrl } from "./services/stickers.ts"
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
    homeBlock: z.string().trim().max(80).optional(),
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
      homeBlock: body.homeBlock || null,
      pushToken: body.pushToken ?? null,
      userCode: userCode(),
      createdAt: new Date().toISOString(),
    }
    if (!existing) await users().insertOne(user)
    else {
      const refresh = {
        ...(body.pushToken ? { pushToken: body.pushToken } : {}),
        ...(body.homeBlock ? { homeBlock: body.homeBlock } : {}),
      }
      if (Object.keys(refresh).length) {
        await users().updateOne({ _id: user._id }, { $set: refresh })
        Object.assign(user, refresh)
      }
    }
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

  // Trees this neighbor adopted, thirsty first, with live moisture for the My trees tab.
  app.get("/users/:id/trees", async (c) => {
    const rows = await trees().find({ adopterIds: c.req.param("id") }).toArray()
    const withReadings = await Promise.all(
      rows.map(async (tree) => {
        const latest = tree.sensorId ? await latestReading(tree._id) : null
        return {
          ...publicTree(tree),
          persona: tree.persona,
          claim: tree.claim && Date.parse(tree.claim.until) > Date.now() ? tree.claim : null,
          moisture: latest?.moisture ?? null,
        }
      }),
    )
    const rank = { thirsty: 0, ok: 1, no_sensor: 2 } as const
    withReadings.sort((a, b) => rank[a.status] - rank[b.status] || (a.name ?? a.species).localeCompare(b.name ?? b.species))
    return c.json(withReadings)
  })

  // One row per tree this neighbor has talked to (app or iMessage), newest conversation first.
  app.get("/users/:id/chats", async (c) => {
    const rows = await messages()
      .aggregate<{ _id: string; text: string; role: "user" | "tree"; at: string }>([
        { $match: { userId: c.req.param("id") } },
        { $sort: { at: -1 } },
        { $group: { _id: "$treeId", text: { $first: "$text" }, role: { $first: "$role" }, at: { $first: "$at" } } },
        { $sort: { at: -1 } },
        { $limit: 50 },
      ])
      .toArray()
    const byId = new Map((await trees().find({ _id: { $in: rows.map((row) => row._id) } }).toArray()).map((tree) => [tree._id, tree]))
    return c.json(
      rows.flatMap((row) => {
        const tree = byId.get(row._id)
        if (!tree) return []
        return [{
          treeId: row._id,
          treeName: tree.name ?? tree.species,
          status: tree.status,
          last: { text: row.text, role: row.role, at: row.at },
        }]
      }),
    )
  })

  app.get("/users/:id/stats", async (c) => {
    const user = await users().findOne({ _id: c.req.param("id") })
    if (!user) return c.json({ error: "not found" }, 404)
    const [board, adopted] = await Promise.all([
      blockLeaderboard(user.blockId),
      trees().countDocuments({ adopterIds: user._id }),
    ])
    const index = board.findIndex((row) => row.userId === user._id)
    const mine = board[index]
    return c.json({
      gallons: mine?.gallons ?? 0,
      waterings: await waterings().countDocuments({ userId: user._id }),
      streak: mine?.streak ?? 0,
      trees: adopted,
      rank: index >= 0 ? index + 1 : null,
      neighbors: board.length,
    })
  })

  app.patch("/users/:id", zValidator("json", z.object({
    name: z.string().trim().min(1).max(40).optional(),
    language: z.string().min(2).max(5).optional(),
    homeBlock: z.string().trim().max(80).optional(),
  })), async (c) => {
    const patch = c.req.valid("json")
    const user = await users().findOneAndUpdate({ _id: c.req.param("id") }, { $set: patch }, { returnDocument: "after" })
    if (!user) return c.json({ error: "not found" }, 404)
    return c.json(user)
  })

  // Neighbor messaging: tree crews and 1:1 DMs.
  app.get("/users/:id/threads", async (c) => c.json(await listThreads(c.req.param("id"))))

  app.post("/threads/dm", zValidator("json", z.object({ userId: z.string(), otherUserId: z.string() })), async (c) => {
    const body = c.req.valid("json")
    const id = await openDm(body.userId, body.otherUserId)
    if (!id) return c.json({ error: "can't message that neighbor" }, 400)
    return c.json({ id })
  })

  app.get("/threads/:id/messages", async (c) => {
    const userId = c.req.query("userId")
    if (!userId) return c.json({ error: "userId required" }, 400)
    const thread = await readThread(c.req.param("id"), userId)
    if (!thread) return c.json({ error: "not a member of this conversation" }, 403)
    return c.json(thread)
  })

  app.post("/threads/:id/messages", zValidator("json", z.object({
    userId: z.string(),
    text: z.string().trim().min(1).max(1000),
  })), async (c) => {
    const body = c.req.valid("json")
    const message = await postToThread(c.req.param("id"), body.userId, body.text)
    if (!message) return c.json({ error: "not a member of this conversation" }, 403)
    return c.json(message, 201)
  })

  // Coins and stickers.
  app.post("/users/:id/checkin", async (c) => {
    const result = await checkIn(c.req.param("id"))
    if (!result) return c.json({ error: "not found" }, 404)
    return c.json(result)
  })

  app.get("/users/:id/wallet", async (c) => {
    const result = await wallet(c.req.param("id"))
    if (!result) return c.json({ error: "not found" }, 404)
    return c.json(result)
  })

  app.get("/stickers", (c) =>
    c.json(catalog.map(({ subject: _subject, ...sticker }) => ({ ...sticker, imageUrl: stickerImageUrl(sticker.id) }))),
  )

  app.get("/stickers/:id/image", async (c) => {
    const art = await stickerArt().findOne({ _id: c.req.param("id") })
    if (!art) return c.json({ error: "not drawn yet" }, 404)
    return c.body(new Uint8Array(art.image.buffer), 200, { "Content-Type": art.mimeType, "Cache-Control": "public, max-age=86400" })
  })

  app.post("/users/:id/stickers/:stickerId/buy", async (c) => {
    const result = await buySticker(c.req.param("id"), c.req.param("stickerId"))
    if ("error" in result) {
      const status = result.error === "not_found" || result.error === "unknown_sticker" ? 404 : 409
      return c.json({ error: result.error }, status)
    }
    return c.json(result.wallet)
  })

  app.put("/trees/:id/stickers", zValidator("json", z.object({
    userId: z.string(),
    slot: z.enum(slots as [string, ...string[]]),
    stickerId: z.string().nullable(),
  })), async (c) => {
    const body = c.req.valid("json")
    const result = await placeSticker(c.req.param("id"), body.userId, body.slot as (typeof slots)[number], body.stickerId)
    if ("error" in result) {
      const status = result.error === "not_found" ? 404 : result.error === "wrong_slot" ? 400 : 403
      return c.json({ error: result.error }, status)
    }
    return c.json(result.tree ? publicTree(result.tree) : null)
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
    // A tree that already has a name (Gus) keeps it and its personality; new adopters just join its caretakers.
    const naming = tree.name ? {} : { name, persona: await suggestPersona(tree, name) }
    await trees().updateOne({ _id: tree._id }, { $set: naming, $addToSet: { adopterIds: userId } })
    const next = await treeById(tree._id)
    if (next) pushTree(next, undefined, true)
    // A newly named tree gets its portrait drawn in the background.
    if (next && !tree.name && !next.portraitAt) drawPortraitSoon(next)
    return c.json(next)
  })

  app.get("/trees/:id/portrait", async (c) => {
    const portrait = await portraitFor(c.req.param("id"))
    if (!portrait) return c.json({ error: "no portrait yet" }, 404)
    return c.body(new Uint8Array(portrait.bytes), 200, {
      "Content-Type": portrait.mimeType,
      // The URL carries ?v=<portraitAt>, so a redraw is a new URL.
      "Cache-Control": "public, max-age=86400",
    })
  })

  // Draw (or redraw) a tree's portrait; used to backfill trees named before portraits existed.
  app.post("/trees/:id/portrait", async (c) => {
    const tree = await treeById(c.req.param("id"))
    if (!tree) return c.json({ error: "not found" }, 404)
    if (!tree.name) return c.json({ error: "adopt and name the tree first" }, 400)
    return c.json({ drawing: drawPortraitSoon(tree) || isDrawing(tree._id) }, 202)
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

  // Neighborhoods people join. Census block ids (b-108318) are only an internal grouping for trees.
  app.get("/blocks", async (c) => {
    const rows = await blocks().find({ bbox: { $ne: null } }).toArray()
    return c.json(rows)
  })

  // Onboarding: which neighborhood a location belongs to, and how much the block around it needs help.
  app.get("/blocks/near", async (c) => {
    const lat = Number(c.req.query("lat"))
    const lng = Number(c.req.query("lng"))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return c.json({ error: "lat and lng required" }, 400)
    const hoods = await blocks().find({ bbox: { $ne: null } }).toArray()
    const inside = hoods.find((hood) => {
      const [minLng, minLat, maxLng, maxLat] = hood.bbox as number[]
      return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
    })
    const hood = inside ?? hoods.find((row) => row._id === GUS_BLOCK) ?? hoods[0]
    const nearby = (await trees().find({}).toArray()).filter((tree) => metersBetween(lat, lng, tree.lat, tree.lng) <= 400)
    return c.json({
      blockId: hood?._id ?? GUS_BLOCK,
      name: hood?.name ?? "Morningside Heights",
      inArea: Boolean(inside),
      nearbyTrees: nearby.length,
      needCaretakers: nearby.filter((tree) => tree.adopterIds.length === 0).length,
      thirsty: nearby.filter((tree) => tree.status === "thirsty").length,
      neighbors: await users().countDocuments({ blockId: hood?._id ?? GUS_BLOCK }),
    })
  })

  // Recent waterings on the block plus who is thirsty right now, for the Block tab.
  app.get("/blocks/:id/activity", async (c) => {
    const blockId = c.req.param("id")
    const blockTrees = await trees().find({ blockId }).toArray()
    const treeNames = new Map(blockTrees.map((tree) => [tree._id, tree.name ?? tree.species]))
    const logs = await waterings()
      .find({ treeId: { $in: blockTrees.map((tree) => tree._id) } })
      .sort({ at: -1 })
      .limit(25)
      .toArray()
    const people = new Map(
      (await users().find({ _id: { $in: [...new Set(logs.map((log) => log.userId))] } }).toArray()).map((user) => [user._id, user.name]),
    )
    return c.json({
      waterings: logs.map((log) => ({
        id: log._id,
        treeId: log.treeId,
        treeName: treeNames.get(log.treeId) ?? "a tree",
        name: people.get(log.userId) ?? "A neighbor",
        gallons: log.gallons,
        at: log.at,
      })),
      thirsty: blockTrees
        .filter((tree) => tree.status === "thirsty")
        .map((tree) => ({ id: tree._id, name: tree.name ?? tree.species, claimedBy: tree.claim?.name ?? null })),
    })
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

function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6_371_000 * 2 * Math.asin(Math.sqrt(a))
}

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
    portraitUrl: tree.portraitAt ? `${publicApiUrl}/trees/${tree._id}/portrait?v=${encodeURIComponent(tree.portraitAt)}` : null,
    stickers: treeStickers(tree),
    drawingPortrait: isDrawing(tree._id),
  }
}

