import type { WeatherHour } from "../services/moisture-estimate.ts"

// Past three days of hourly rain and temperature from Open-Meteo (free, no key), for sensorless estimates.
// One area's weather is the same for every tree on the block, so cache by rounded coordinates.

const cache = new Map<string, { at: number; hours: WeatherHour[] }>()

export async function recentWeather(lat: number, lng: number): Promise<WeatherHour[]> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.hours
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast")
    url.searchParams.set("latitude", String(lat))
    url.searchParams.set("longitude", String(lng))
    url.searchParams.set("hourly", "precipitation,temperature_2m")
    url.searchParams.set("past_days", "3")
    url.searchParams.set("forecast_days", "1")
    url.searchParams.set("timezone", "UTC")
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!response.ok) return cached?.hours ?? []
    const body = (await response.json()) as {
      hourly?: { time?: string[]; precipitation?: (number | null)[]; temperature_2m?: (number | null)[] }
    }
    const times = body.hourly?.time ?? []
    const hours = times
      .map((time, i) => ({
        timeMs: Date.parse(`${time}Z`),
        precipMm: body.hourly?.precipitation?.[i] ?? 0,
        tempC: body.hourly?.temperature_2m?.[i] ?? 20,
      }))
      .filter((hour) => hour.timeMs <= Date.now())
    cache.set(key, { at: Date.now(), hours })
    return hours
  } catch {
    return cached?.hours ?? []
  }
}
