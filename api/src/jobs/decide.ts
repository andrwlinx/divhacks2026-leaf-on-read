export type Bucket = { startMs: number; avgMoisture: number }

export type DecideInput = {
  nowMs: number
  windowMs: number
  threshold: number
  buckets: Bucket[]
  lastAlertAtMs: number | null
  cooldownMs: number
  claimUntilMs: number | null
  rainSkipUntilMs: number | null
  rainWouldSkip: boolean
  rainSkipMs: number
  thirstEpisodeId: string | null
  thankedEpisodeId: string | null
  thirstEpisodeAtMs: number | null
  lastWateredAtMs: number | null
  wateringGraceMs: number
}

export type Decision =
  | { type: "thirsty" }
  | { type: "rain_skip"; untilMs: number }
  | { type: "claim_expired" }
  | { type: "thanks" }
  | { type: "none" }

export function bucketReadings(
  readings: { t: number; moisture: number }[],
  windowMs: number,
): Bucket[] {
  const groups = new Map<number, number[]>()
  for (const reading of readings) {
    const startMs = Math.floor(reading.t / windowMs) * windowMs
    const group = groups.get(startMs) ?? []
    group.push(reading.moisture)
    groups.set(startMs, group)
  }
  return [...groups.entries()].map(([startMs, values]) => ({
    startMs,
    avgMoisture: values.reduce((sum, value) => sum + value, 0) / values.length,
  }))
}

function completedBuckets(buckets: Bucket[], nowMs: number, windowMs: number) {
  const currentStart = Math.floor(nowMs / windowMs) * windowMs
  return buckets
    .filter((bucket) => bucket.startMs < currentStart)
    .sort((a, b) => b.startMs - a.startMs)
}

export function decideAlert(input: DecideInput): Decision {
  const completed = completedBuckets(input.buckets, input.nowMs, input.windowMs)
  const latest = completed[0]
  const previous = completed[1]
  const episodeOpen =
    input.thirstEpisodeId !== null && input.thirstEpisodeId !== input.thankedEpisodeId
  const wateredAfterEpisode =
    episodeOpen &&
    input.lastWateredAtMs !== null &&
    input.thirstEpisodeAtMs !== null &&
    input.lastWateredAtMs >= input.thirstEpisodeAtMs
  const wetAfterEpisode =
    episodeOpen &&
    latest !== undefined &&
    latest.avgMoisture >= input.threshold &&
    input.thirstEpisodeAtMs !== null &&
    latest.startMs >= input.thirstEpisodeAtMs

  if (wateredAfterEpisode || wetAfterEpisode) return { type: "thanks" }

  if (
    input.claimUntilMs !== null &&
    input.claimUntilMs <= input.nowMs &&
    !wateredAfterEpisode
  ) {
    return { type: "claim_expired" }
  }

  const consecutive =
    latest !== undefined &&
    previous !== undefined &&
    latest.startMs - previous.startMs === input.windowMs
  const bothDry =
    consecutive &&
    latest.avgMoisture < input.threshold &&
    previous.avgMoisture < input.threshold
  const inGrace =
    input.lastWateredAtMs !== null &&
    input.nowMs - input.lastWateredAtMs < input.wateringGraceMs

  if (!bothDry || inGrace) return { type: "none" }
  if (input.rainSkipUntilMs !== null && input.rainSkipUntilMs > input.nowMs) {
    return { type: "none" }
  }
  if (input.claimUntilMs !== null && input.claimUntilMs > input.nowMs) {
    return { type: "none" }
  }
  if (
    input.lastAlertAtMs !== null &&
    input.nowMs - input.lastAlertAtMs < input.cooldownMs
  ) {
    return { type: "none" }
  }
  if (input.rainWouldSkip) {
    return { type: "rain_skip", untilMs: input.nowMs + input.rainSkipMs }
  }
  return { type: "thirsty" }
}
