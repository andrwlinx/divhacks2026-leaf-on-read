import { createServer } from "node:http"
import { Spectrum, voice, type Space } from "spectrum-ts"
import { imessage } from "spectrum-ts/providers/imessage"

// The tree's brain lives in the API; this process only moves messages between iMessage and it.
const api = (process.env.LEAF_API_URL || "http://localhost:3000").replace(/\/$/, "")
const port = Number(process.env.AGENT_PORT) || 4000

type LeafUser = { _id: string; name: string; treeId: string }
type TalkTurn = { reply: string; audioUrl: string | null }
type Event = {
  type: string
  treeName: string
  messages: { phone: string; text: string; voiceUrl?: string }[]
}

const app = await Spectrum({
  projectId: process.env.PROJECT_ID!,
  projectSecret: process.env.PROJECT_SECRET!,
  providers: [imessage.config()],
})
const im = imessage(app)

// Conversations we've seen, so alerts go into the thread the neighbor opened (shared lines need opt-in first).
const spaces = new Map<string, Space>()

async function leaf<T>(path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
  })
  if (!response.ok) return null
  return (await response.json()) as T
}

async function audio(url: string) {
  const response = await fetch(url.startsWith("http") ? url : `${api}${url}`)
  if (!response.ok) return null
  return Buffer.from(await response.arrayBuffer())
}

async function sendTurn(space: Space, turn: { text: string; voiceUrl?: string | null }) {
  await space.send(turn.text)
  if (!turn.voiceUrl) return
  const clip = await audio(turn.voiceUrl)
  if (clip) await space.send(voice(clip, { name: "tree.mp3", mimeType: "audio/mpeg" }))
}

async function handle(space: Space, handleId: string, content: { type: string; text?: string; read?: () => Promise<Uint8Array | Buffer> }) {
  const join = content.type === "text" ? content.text?.match(/\bjoin\s+([A-Z0-9]{6})\b/i) : null
  if (join) {
    const user = await leaf<LeafUser>("/users/link", {
      method: "POST",
      body: JSON.stringify({ code: join[1], handle: handleId }),
    })
    if (!user) {
      await space.send("Hmm, I don't recognize that code. Double-check it in the Leaf on Read app?")
      return
    }
    const hello = await leaf<TalkTurn>(`/trees/${user.treeId}/talk/greet`, {
      method: "POST",
      body: JSON.stringify({ userId: user._id }),
    })
    await sendTurn(space, { text: hello?.reply ?? `Hi ${user.name}! You're all set. I'll text you when I'm thirsty.`, voiceUrl: hello?.audioUrl })
    return
  }

  const user = await leaf<LeafUser>(`/users/lookup?handle=${encodeURIComponent(handleId)}`)
  if (!user) {
    await space.send(
      "Hi! I'm a street tree on your block 🌳 Open the Leaf on Read app and tap “Say hi to your tree” so I know who you are.",
    )
    return
  }

  if (content.type === "text" && content.text) {
    const turn = await leaf<{ reply: string }>(`/trees/${user.treeId}/chat`, {
      method: "POST",
      body: JSON.stringify({ userId: user._id, message: content.text, channel: "imessage" }),
    })
    await space.send(turn?.reply ?? "Sorry, my roots got tangled. Say that again?")
    return
  }

  // Voice notes: the tree listens and answers out loud.
  if (content.type === "voice" && content.read) {
    const form = new FormData()
    form.append("userId", user._id)
    form.append("audio", new Blob([await content.read()]), "note.m4a")
    const turn = await leaf<TalkTurn>(`/trees/${user.treeId}/talk`, { method: "POST", body: form })
    await sendTurn(space, { text: turn?.reply ?? "I couldn't quite hear that. Try texting me?", voiceUrl: turn?.audioUrl })
  }
}

// Phones typed into the app may lack a country code; iMessage needs E.164 (Apple ID emails pass through).
function handleFor(phone: string) {
  if (phone.includes("@")) return phone
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  return phone.startsWith("+") ? phone : `+${digits}`
}

async function deliver(event: Event) {
  for (const message of event.messages) {
    const handle = handleFor(message.phone)
    try {
      const space = spaces.get(handle) ?? (await im.space.create(await im.user(handle)))
      spaces.set(handle, space)
      await sendTurn(space, { text: message.text, voiceUrl: message.voiceUrl })
    } catch (error) {
      // On shared lines this fails until the neighbor has texted the tree first.
      console.error(`couldn't deliver ${event.type} to ${handle}: ${error instanceof Error ? error.message : error}`)
    }
  }
}

// API → agent: POST /events with alert copy already written per recipient.
createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/events") {
    res.writeHead(404).end()
    return
  }
  let body = ""
  req.on("data", (chunk) => (body += chunk))
  req.on("end", () => {
    try {
      const event = JSON.parse(body) as Event
      res.writeHead(202).end()
      void deliver(event)
    } catch {
      res.writeHead(400).end()
    }
  })
}).listen(port, () => console.log(`agent: events on :${port}, API at ${api}`))

for await (const [space, message] of app.messages) {
  if (message.direction === "outbound") continue
  const sender = message.sender?.id
  if (!sender) continue
  spaces.set(sender, space)
  try {
    await space.responding(() => handle(space, sender, message.content as Parameters<typeof handle>[2]))
  } catch (error) {
    console.error("message failed", error)
  }
}
