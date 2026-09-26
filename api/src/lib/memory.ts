import { collection } from "../db/mongo.ts"
import type { TreeDoc, UserDoc } from "../types.ts"

// Backboard long-term memory: one assistant per (tree, neighbor), so Gus remembers Maya's
// midterms without mixing them up with anyone else's life.
const base = "https://app.backboard.io/api"

type MemoryLink = { _id: string; assistantId: string; threadId: string | null }

const links = () => collection<MemoryLink>("memory_links")
const cache = new Map<string, MemoryLink>()

export function memoryConfigured() {
  return Boolean(process.env.BACKBOARD_API_KEY)
}

function headers() {
  return { "X-API-Key": process.env.BACKBOARD_API_KEY ?? "", "Content-Type": "application/json" }
}

async function linkFor(tree: TreeDoc, user: UserDoc) {
  const key = `${tree._id}:${user._id}`
  const cached = cache.get(key)
  if (cached) return cached
  const stored = await links().findOne({ _id: key })
  if (stored) {
    cache.set(key, stored)
    return stored
  }
  const response = await fetch(`${base}/assistants`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: `leaf-${tree._id}-${user._id}`.slice(0, 255),
      system_prompt: `Facts ${tree.name || "a street tree"} knows about ${user.name}, a neighbor who talks with it. Attribute personal details to ${user.name}.`,
    }),
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`Backboard assistant ${response.status}: ${await response.text()}`)
  const body = (await response.json()) as { assistant_id: string }
  const link: MemoryLink = { _id: key, assistantId: body.assistant_id, threadId: null }
  await links().updateOne({ _id: key }, { $setOnInsert: link }, { upsert: true })
  cache.set(key, link)
  return link
}

// Relevant facts for this turn. Capped so memory never slows a reply by more than ~1.5s.
export async function recall(tree: TreeDoc, user: UserDoc, query: string, limit = 5): Promise<string[]> {
  if (!memoryConfigured()) return []
  try {
    const link = await linkFor(tree, user)
    const response = await fetch(`${base}/assistants/${link.assistantId}/memories/search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ query, limit }),
      signal: AbortSignal.timeout(1_500),
    })
    if (!response.ok) return []
    const body = (await response.json()) as { memories?: { content: string }[] }
    return (body.memories ?? []).map((memory) => memory.content)
  } catch (error) {
    console.error("memory recall failed", error)
    return []
  }
}

// Fire-and-forget: Backboard extracts facts from what the neighbor said, without generating a reply.
export function remember(tree: TreeDoc, user: UserDoc, message: string) {
  if (!memoryConfigured() || message.trim().length < 12) return
  void (async () => {
    const link = await linkFor(tree, user)
    const response = await fetch(`${base}/threads/messages`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        assistant_id: link.assistantId,
        ...(link.threadId ? { thread_id: link.threadId } : {}),
        content: message,
        memory: "Auto",
        send_to_llm: "false",
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`Backboard remember ${response.status}`)
    const body = (await response.json()) as { thread_id?: string }
    if (body.thread_id && body.thread_id !== link.threadId) {
      link.threadId = body.thread_id
      await links().updateOne({ _id: link._id }, { $set: { threadId: body.thread_id } })
    }
  })().catch((error) => console.error("memory save failed", error))
}
