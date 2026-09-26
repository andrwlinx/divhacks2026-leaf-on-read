import { Expo } from "expo-server-sdk"

const expo = new Expo()

export async function sendPush(messages: { to?: string | null; body: string; title: string }[]) {
  const notifications = messages.flatMap((message) => {
    if (!message.to || !Expo.isExpoPushToken(message.to)) return []
    return [{ to: message.to, sound: "default" as const, title: message.title, body: message.body }]
  })
  if (notifications.length === 0) return
  try {
    await expo.sendPushNotificationsAsync(notifications)
  } catch (error) {
    console.error("push failed", error)
  }
}

export async function postEvents(payload: unknown) {
  const url = process.env.AGENT_URL
  if (!url) return false
  try {
    const response = await fetch(new URL("/events", url.endsWith("/") ? url : `${url}/`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4_000),
    })
    return response.ok
  } catch (error) {
    console.error("agent events failed", error)
    return false
  }
}
