import { demoState } from "../demoState.ts"

type Forecast = { skip: boolean; untilMs: number }

const cache = new Map<string, Forecast & { at: number }>()

export async function rainForTree(blockId: string, lat: number, lng: number): Promise<Forecast> {
  if (demoState.peekRain()) {
    return { skip: true, untilMs: Date.now() + 60 * 60 * 1000 }
  }
  const cached = cache.get(blockId)
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast")
    url.searchParams.set("latitude", String(lat))
    url.searchParams.set("longitude", String(lng))
    url.searchParams.set("hourly", "precipitation,precipitation_probability")
    url.searchParams.set("forecast_days", "2")
    url.searchParams.set("timezone", "America/New_York")
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!response.ok) return { skip: false, untilMs: 0 }
    const body = (await response.json()) as {
      hourly?: { time?: string[]; precipitation?: number[]; precipitation_probability?: number[] }
    }
    const times = body.hourly?.time ?? []
    const precip = body.hourly?.precipitation ?? []
    const probability = body.hourly?.precipitation_probability ?? []
    const start = times.findIndex((time) => Date.parse(time) >= Date.now() - 60 * 60 * 1000)
    const from = Math.max(0, start)
    const rainSum = precip.slice(from, from + 12).reduce((sum, value) => sum + (value || 0), 0)
    const maxProbability = Math.max(0, ...probability.slice(from, from + 12))
    const forecast = {
      at: Date.now(),
      skip: rainSum >= 6 && maxProbability >= 60,
      untilMs: Date.now() + 12 * 60 * 60 * 1000,
    }
    cache.set(blockId, forecast)
    return forecast
  } catch {
    return { skip: false, untilMs: 0 }
  }
}
