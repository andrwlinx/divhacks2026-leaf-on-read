const base = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? ""

export function apiBase() {
  return base
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!base) throw new Error("EXPO_PUBLIC_API_URL is not set")
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  })
  if (response.status === 204) return undefined as T
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) {
    const error = new Error(body?.error || response.statusText) as Error & { status?: number; body?: unknown }
    error.status = response.status
    error.body = body
    throw error
  }
  return body as T
}
