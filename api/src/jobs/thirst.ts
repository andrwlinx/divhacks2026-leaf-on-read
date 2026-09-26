import { randomUUID } from "node:crypto"
import { readingsSince } from "../db/tiger.ts"
import { demoState } from "../demoState.ts"
import { cooldownMs, demoMode, jobEveryMs, wateringGraceMs, windowMs } from "../env.ts"
import { bucketReadings, decideAlert } from "./decide.ts"
import { rainForTree } from "../lib/rain.ts"
import { emitAlert, moistureNow, thankIfOpen, trees } from "../services/domain.ts"
import type { TreeDoc } from "../types.ts"

let running = false

export function startThirst() {
  setInterval(() => {
    void tick()
  }, jobEveryMs)
}

async function tick() {
  if (running) return
  running = true
  try {
    const rows = await trees().find({ sensorId: { $ne: null } }).toArray()
    for (const tree of rows) await evaluate(tree)
  } catch (error) {
    console.error("thirst job", error)
  } finally {
    running = false
  }
}

async function evaluate(tree: TreeDoc) {
  const horizon = demoMode ? 60_000 : 3 * 60 * 60 * 1000
  const readings = await readingsSince(tree._id, new Date(Date.now() - horizon))
  const buckets = bucketReadings(
    readings.map((row) => ({ t: row.time.getTime(), moisture: row.moisture })),
    windowMs,
  )
  const nowMs = Date.now()
  const base = {
    nowMs,
    windowMs,
    threshold: tree.thirstThreshold,
    buckets,
    lastAlertAtMs: tree.lastAlertAt ? Date.parse(tree.lastAlertAt) : null,
    cooldownMs,
    claimUntilMs: tree.claim ? Date.parse(tree.claim.until) : null,
    rainSkipUntilMs: tree.rainSkipUntil ? Date.parse(tree.rainSkipUntil) : null,
    rainWouldSkip: false,
    rainSkipMs: 12 * 60 * 60 * 1000,
    thirstEpisodeId: tree.thirstEpisodeId,
    thankedEpisodeId: tree.thankedEpisodeId,
    thirstEpisodeAtMs: tree.thirstEpisodeAt ? Date.parse(tree.thirstEpisodeAt) : null,
    lastWateredAtMs: tree.lastWateredAt ? Date.parse(tree.lastWateredAt) : null,
    wateringGraceMs,
  }
  let decision = decideAlert(base)
  if (decision.type === "thirsty") {
    const rain = await rainForTree(tree.blockId, tree.lat, tree.lng)
    if (rain.skip) decision = { type: "rain_skip", untilMs: rain.untilMs }
  }

  const moisture = (await moistureNow(tree._id)) ?? tree.thirstThreshold
  if (decision.type === "thirsty") {
    const at = new Date().toISOString()
    const episode = randomUUID()
    const updated = await trees().findOneAndUpdate(
      { _id: tree._id, lastAlertAt: tree.lastAlertAt },
      { $set: { lastAlertAt: at, thirstEpisodeId: episode, thirstEpisodeAt: at, status: "thirsty" } },
    )
    if (!updated) return
    await emitAlert({ type: "thirsty", tree, moisturePct: moisture })
    return
  }
  if (decision.type === "rain_skip") {
    demoState.clearRain()
    await trees().updateOne(
      { _id: tree._id },
      { $set: { rainSkipUntil: new Date(decision.untilMs).toISOString() } },
    )
    await emitAlert({ type: "rain_skip", tree, moisturePct: moisture })
    return
  }
  if (decision.type === "thanks") {
    await thankIfOpen(tree._id)
    return
  }
  if (decision.type === "claim_expired" && tree.claim) {
    await trees().updateOne({ _id: tree._id }, { $set: { claim: null, lastAlertAt: null } })
    await emitAlert({
      type: "claim_expired",
      tree,
      moisturePct: moisture,
      exceptUserId: tree.claim.userId,
    })
  }
}
