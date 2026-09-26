// Soil moisture for trees without a sensor, estimated from their last watering and recent weather.
// Pure so it can be unit-tested; the /users/:id/trees route feeds it Open-Meteo hours.

export type WeatherHour = { timeMs: number; precipMm: number; tempC: number }

const AFTER_WATERING = 85 // a good soak (15-20 gal) leaves a young tree bed near saturated
const UNKNOWN_START = 60 // no watering on record: assume middling soil three days ago
const LOOKBACK_MS = 72 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/** Percent lost per hour: about 0.6%/h at 20°C, faster in heat, slower in cold. */
export function dryingPerHour(tempC: number) {
  return 0.6 * Math.min(1.8, Math.max(0.4, tempC / 20))
}

export function estimateMoisture(input: { nowMs: number; lastWateredMs: number | null; hours: WeatherHour[] }) {
  const watered = input.lastWateredMs !== null && input.nowMs - input.lastWateredMs < LOOKBACK_MS
  const startMs = watered ? input.lastWateredMs! : input.nowMs - LOOKBACK_MS
  let moisture = watered ? AFTER_WATERING : UNKNOWN_START
  const byHour = new Map(input.hours.map((hour) => [Math.floor(hour.timeMs / HOUR_MS), hour]))
  for (let t = startMs; t < input.nowMs; t += HOUR_MS) {
    const hour = byHour.get(Math.floor(t / HOUR_MS))
    const fraction = Math.min(1, (input.nowMs - t) / HOUR_MS)
    moisture -= dryingPerHour(hour?.tempC ?? 20) * fraction
    moisture += (hour?.precipMm ?? 0) * 4 * fraction // roughly 4 points per mm of rain
    moisture = Math.min(95, Math.max(5, moisture))
  }
  return Math.round(moisture)
}
