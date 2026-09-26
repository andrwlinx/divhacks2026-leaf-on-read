// Pure coin rules (no database) so they can be unit-tested; coins.ts applies them.

export const CHECKIN_BASE = 5
export const CHECKIN_STREAK_MAX_BONUS = 5
export const WATERING_COINS = 10
export const RESCUE_BONUS = 10
export const PHOTO_BONUS = 5
export const MAX_REWARDED_WATERINGS_PER_DAY = 5

/** "YYYY-MM-DD" in New York, where the block lives. */
export function nyDay(ms: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms)
}

function previousDay(day: string) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

/** One check-in per day; consecutive days grow a streak that adds +1 per day up to +5. */
export function checkinReward(lastDay: string | null | undefined, lastStreak: number | null | undefined, today: string) {
  if (lastDay === today) return { awarded: 0, streak: lastStreak ?? 1 }
  const streak = lastDay === previousDay(today) ? (lastStreak ?? 0) + 1 : 1
  return { awarded: CHECKIN_BASE + Math.min(streak - 1, CHECKIN_STREAK_MAX_BONUS), streak }
}

/**
 * Coins for a watering. `recent` is this user's rewarded waterings (ms timestamps) today; the same tree
 * pays again only after the cooldown, and at most five rewarded waterings a day.
 */
export function wateringReward(input: {
  nowMs: number
  wasThirsty: boolean
  lastRewardForTreeMs: number | null
  rewardedToday: number
  cooldownMs: number
}) {
  if (input.rewardedToday >= MAX_REWARDED_WATERINGS_PER_DAY) return { coins: 0, reason: "daily_cap" as const }
  if (input.lastRewardForTreeMs !== null && input.nowMs - input.lastRewardForTreeMs < input.cooldownMs) {
    return { coins: 0, reason: "cooldown" as const }
  }
  return { coins: WATERING_COINS + (input.wasThirsty ? RESCUE_BONUS : 0), reason: "rewarded" as const }
}
