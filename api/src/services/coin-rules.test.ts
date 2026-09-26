import assert from "node:assert/strict"
import test from "node:test"
import { checkinReward, nyDay, wateringReward } from "./coin-rules.ts"

test("first check-in pays the base with no streak bonus", () => {
  assert.deepEqual(checkinReward(null, null, "2026-09-26"), { awarded: 5, streak: 1 })
})

test("a second check-in the same day pays nothing", () => {
  assert.deepEqual(checkinReward("2026-09-26", 1, "2026-09-26"), { awarded: 0, streak: 1 })
})

test("consecutive days grow the streak bonus, capped at +5", () => {
  assert.deepEqual(checkinReward("2026-09-25", 2, "2026-09-26"), { awarded: 7, streak: 3 })
  assert.deepEqual(checkinReward("2026-09-25", 9, "2026-09-26"), { awarded: 10, streak: 10 })
})

test("a missed day resets the streak", () => {
  assert.deepEqual(checkinReward("2026-09-23", 6, "2026-09-26"), { awarded: 5, streak: 1 })
})

test("streaks cross month boundaries", () => {
  assert.deepEqual(checkinReward("2026-09-30", 1, "2026-10-01"), { awarded: 6, streak: 2 })
})

test("nyDay uses New York time, not UTC", () => {
  assert.equal(nyDay(Date.parse("2026-09-27T02:00:00Z")), "2026-09-26")
})

const base = { nowMs: 100_000, wasThirsty: false, lastRewardForTreeMs: null, rewardedToday: 0, cooldownMs: 60_000 }

test("watering pays 10, plus 10 for rescuing a thirsty tree", () => {
  assert.equal(wateringReward(base).coins, 10)
  assert.equal(wateringReward({ ...base, wasThirsty: true }).coins, 20)
})

test("the same tree pays again only after the cooldown", () => {
  assert.equal(wateringReward({ ...base, lastRewardForTreeMs: 70_000 }).reason, "cooldown")
  assert.equal(wateringReward({ ...base, lastRewardForTreeMs: 30_000 }).coins, 10)
})

test("at most five rewarded waterings a day", () => {
  assert.equal(wateringReward({ ...base, rewardedToday: 5 }).reason, "daily_cap")
})
