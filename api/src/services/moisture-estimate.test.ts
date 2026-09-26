import assert from "node:assert/strict"
import test from "node:test"
import { dryingPerHour, estimateMoisture } from "./moisture-estimate.ts"

const now = Date.parse("2026-09-26T18:00:00Z")
const hours = (count: number, tempC: number, precipMm = 0) =>
  Array.from({ length: count }, (_, i) => ({ timeMs: now - (i + 1) * 3_600_000, tempC, precipMm }))

test("just watered reads near saturated", () => {
  assert.equal(estimateMoisture({ nowMs: now, lastWateredMs: now, hours: [] }), 85)
})

test("a day of mild weather dries a watered tree by about 14 points", () => {
  assert.equal(estimateMoisture({ nowMs: now, lastWateredMs: now - 24 * 3_600_000, hours: hours(24, 20) }), 71)
})

test("heat dries faster than cold", () => {
  assert.ok(dryingPerHour(32) > dryingPerHour(20))
  assert.ok(dryingPerHour(5) < dryingPerHour(20))
})

test("three hot dry days leave a watered tree thirsty", () => {
  const pct = estimateMoisture({ nowMs: now, lastWateredMs: now - 71 * 3_600_000, hours: hours(72, 30) })
  assert.ok(pct < 30, `expected thirsty, got ${pct}`)
})

test("rain tops the soil back up", () => {
  const dry = estimateMoisture({ nowMs: now, lastWateredMs: null, hours: hours(72, 22) })
  const rainy = estimateMoisture({ nowMs: now, lastWateredMs: null, hours: hours(72, 22, 0.5) })
  assert.ok(rainy > dry + 30)
})

test("estimates stay between 5 and 95", () => {
  assert.equal(estimateMoisture({ nowMs: now, lastWateredMs: null, hours: hours(72, 20, 10) }), 95)
  assert.equal(estimateMoisture({ nowMs: now, lastWateredMs: null, hours: hours(72, 40) }), 5)
})
