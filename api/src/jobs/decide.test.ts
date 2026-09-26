import assert from "node:assert/strict"
import test from "node:test"
import { bucketReadings, decideAlert, type DecideInput } from "./decide.ts"

const windowMs = 3_000

function input(overrides: Partial<DecideInput> = {}): DecideInput {
  return {
    nowMs: 12_000,
    windowMs,
    threshold: 30,
    buckets: [],
    lastAlertAtMs: null,
    cooldownMs: 30_000,
    claimUntilMs: null,
    rainSkipUntilMs: null,
    rainWouldSkip: false,
    rainSkipMs: 12 * 60 * 60 * 1000,
    thirstEpisodeId: null,
    thankedEpisodeId: null,
    thirstEpisodeAtMs: null,
    lastWateredAtMs: null,
    wateringGraceMs: 30_000,
    ...overrides,
  }
}

test("two completed dry buckets alert, and the open bucket does not count", () => {
  const buckets = bucketReadings(
    [
      { t: 1_000, moisture: 15 },
      { t: 4_000, moisture: 14 },
      { t: 7_000, moisture: 12 },
    ],
    windowMs,
  )
  assert.equal(decideAlert(input({ nowMs: 8_000, buckets })).type, "thirsty")
  assert.equal(decideAlert(input({ nowMs: 5_000, buckets })).type, "none")
})

test("a sliding pile of dry samples inside one bucket does not alert", () => {
  const buckets = bucketReadings(
    [
      { t: 1_000, moisture: 10 },
      { t: 2_000, moisture: 10 },
    ],
    windowMs,
  )
  assert.equal(decideAlert(input({ nowMs: 9_000, buckets })).type, "none")
})

test("cooldown, claim, rain skip, and grace suppress a thirsty alert", () => {
  const buckets = bucketReadings(
    [
      { t: 1_000, moisture: 10 },
      { t: 4_000, moisture: 10 },
    ],
    windowMs,
  )
  const nowMs = 9_000
  assert.equal(decideAlert(input({ nowMs, buckets, lastAlertAtMs: 8_000 })).type, "none")
  assert.equal(decideAlert(input({ nowMs, buckets, claimUntilMs: 20_000 })).type, "none")
  assert.equal(decideAlert(input({ nowMs, buckets, rainSkipUntilMs: 20_000 })).type, "none")
  assert.equal(decideAlert(input({ nowMs, buckets, lastWateredAtMs: 8_000 })).type, "none")
  assert.equal(decideAlert(input({ nowMs, buckets, rainWouldSkip: true })).type, "rain_skip")
})

test("one thanks per dry spell, from a watering or a later wet bucket", () => {
  const dry = bucketReadings(
    [
      { t: 1_000, moisture: 10 },
      { t: 4_000, moisture: 10 },
    ],
    windowMs,
  )
  const open = {
    thirstEpisodeId: "ep-1",
    thankedEpisodeId: null,
    thirstEpisodeAtMs: 6_000,
  }
  assert.equal(
    decideAlert(input({ nowMs: 9_000, buckets: dry, ...open, lastWateredAtMs: 7_000 })).type,
    "thanks",
  )
  const wet = bucketReadings(
    [
      { t: 7_000, moisture: 80 },
      { t: 10_000, moisture: 82 },
    ],
    windowMs,
  )
  assert.equal(decideAlert(input({ nowMs: 12_000, buckets: wet, ...open })).type, "thanks")
  assert.equal(
    decideAlert(input({ nowMs: 12_000, buckets: wet, ...open, thankedEpisodeId: "ep-1" })).type,
    "none",
  )
})

test("an expired claim notifies once the holder has not watered", () => {
  assert.equal(
    decideAlert(input({ nowMs: 10_000, claimUntilMs: 9_000 })).type,
    "claim_expired",
  )
})
