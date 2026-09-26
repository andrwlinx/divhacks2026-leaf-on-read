import { publicApiUrl } from "../env.ts"
import type { TreeDoc } from "../types.ts"

// Pushes live changes to the DeepSpace Block Board (web/src/server/leaf-sync.ts).
// Fire-and-forget: the board also re-pulls every minute, so a missed push only delays it.

type BoardTree = {
  treeId: string
  name: string | null
  species: string
  address: string
  lat: number
  lng: number
  status: TreeDoc["status"]
  moisture?: number | null
  hasSensor: boolean
  claimedBy: string | null
  adopters: number
  lastWateredAt: string | null
  threshold: number
  portraitUrl?: string | null
}

const lastPush = new Map<string, { status: string; moisture: number | null; at: number }>()

export function boardConfigured() {
  return Boolean(process.env.DEEPSPACE_SYNC_URL && process.env.DEEPSPACE_SYNC_TOKEN)
}

function send(body: Record<string, unknown>) {
  if (!boardConfigured()) return
  void fetch(process.env.DEEPSPACE_SYNC_URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DEEPSPACE_SYNC_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  })
    .then((response) => {
      if (!response.ok) console.error(`board sync ${response.status}`)
    })
    .catch((error) => console.error("board sync failed", error))
}

// Sensor trees report every few seconds; only push when the board would visibly change.
export function pushTree(tree: TreeDoc, moisture?: number | null, force = false) {
  const now = Date.now()
  const last = lastPush.get(tree._id)
  const level = moisture === undefined ? (last?.moisture ?? null) : moisture
  if (
    !force &&
    last &&
    last.status === tree.status &&
    Math.abs((level ?? 0) - (last.moisture ?? 0)) < 3 &&
    now - last.at < 15_000
  ) {
    return
  }
  lastPush.set(tree._id, { status: tree.status, moisture: level, at: now })
  const claimed = tree.claim && Date.parse(tree.claim.until) > now ? tree.claim.name : null
  const row: BoardTree = {
    treeId: tree._id,
    name: tree.name,
    species: tree.species,
    address: tree.address,
    lat: tree.lat,
    lng: tree.lng,
    status: tree.status,
    hasSensor: Boolean(tree.sensorId),
    claimedBy: claimed,
    adopters: tree.adopterIds.length,
    lastWateredAt: tree.lastWateredAt,
    threshold: tree.thirstThreshold,
    // The board loads images from the public API, so only send an absolute URL.
    ...(publicApiUrl && tree.portraitAt
      ? { portraitUrl: `${publicApiUrl}/trees/${tree._id}/portrait?v=${encodeURIComponent(tree.portraitAt)}` }
      : {}),
    ...(moisture === undefined ? {} : { moisture: moisture === null ? null : Math.round(moisture * 10) / 10 }),
  }
  send({ trees: [row] })
}

const lastTreeNote = new Map<string, { text: string; at: number }>()

export function pushNote(treeId: string, text: string, kind: "watered" | "tree", authorName?: string) {
  // Demo cooldowns re-alert every 30s; the board only needs a repeated line once every few minutes.
  if (kind === "tree") {
    const last = lastTreeNote.get(treeId)
    if (last && last.text === text && Date.now() - last.at < 5 * 60_000) return
    lastTreeNote.set(treeId, { text, at: Date.now() })
  }
  send({ notes: [{ treeId, text: text.slice(0, 500), kind, ...(authorName ? { authorName } : {}) }] })
}

export function pushNeighbors(rows: { userId: string; name: string; gallons: number; streak: number }[]) {
  send({
    neighbors: rows.map((row) => ({ leafUserId: row.userId, name: row.name, gallons: row.gallons, streak: row.streak })),
  })
}
