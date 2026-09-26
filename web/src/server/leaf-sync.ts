/**
 * Mirror of the Leaf on Read API into this app's RecordRoom.
 *
 * The API pushes changes to POST /api/leaf/sync the moment they happen (tree
 * status and moisture, waterings, the tree's own alerts), authenticated with
 * the shared LEAF_SYNC_TOKEN secret. The `leaf-pull` cron task in src/cron.ts
 * re-pulls the whole block every minute as a backstop. Both write through the
 * owner-scoped cron context, so RBAC on the public collections stays read-only.
 */

import type { Hono } from 'hono'
import { buildCronContext } from 'deepspace/worker'
import { z } from 'zod'
import type { AppContext, Env } from '../../worker.js'

const treeRow = z.object({
  treeId: z.string().min(1),
  name: z.string().nullable().optional(),
  species: z.string().optional(),
  address: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  status: z.enum(['thirsty', 'ok', 'no_sensor']),
  moisture: z.number().nullable().optional(),
  hasSensor: z.boolean().optional(),
  claimedBy: z.string().nullable().optional(),
  adopters: z.number().int().nonnegative().optional(),
  lastWateredAt: z.string().nullable().optional(),
  threshold: z.number().optional(),
  portraitUrl: z.string().url().nullable().optional(),
  stickers: z
    .array(z.object({ slot: z.enum(['head', 'face', 'side', 'ground']), stickerId: z.string(), imageUrl: z.string().url() }))
    .max(4)
    .optional(),
})

const neighborRow = z.object({
  leafUserId: z.string().min(1),
  name: z.string(),
  gallons: z.number(),
  streak: z.number(),
})

const noteRow = z.object({
  treeId: z.string().min(1),
  text: z.string().min(1).max(500),
  kind: z.enum(['watered', 'tree']),
  authorName: z.string().optional(),
})

const syncBody = z.object({
  trees: z.array(treeRow).max(500).optional(),
  neighbors: z.array(neighborRow).max(200).optional(),
  notes: z.array(noteRow).max(20).optional(),
})

type TreeRow = z.infer<typeof treeRow>
type NeighborRow = z.infer<typeof neighborRow>
type Envelope = { recordId: string; data: Record<string, unknown> }

function context(env: Env) {
  return buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
}

/** Upsert by a natural key: the cron context has no upsert-by-id, so look the row up first. */
async function upsert(env: Env, collection: string, key: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return
  const ctx = context(env)
  const existing =
    rows.length === 1
      ? ((await ctx.records.query(collection, { where: { [key]: rows[0][key] }, limit: 1 })) as Envelope[])
      : ((await ctx.records.query(collection, { limit: 500 })) as Envelope[])
  const ids = new Map(existing.map((record) => [record.data[key] as string, record.recordId]))
  for (const row of rows) {
    const recordId = ids.get(row[key] as string)
    if (recordId) await ctx.records.update(collection, recordId, row)
    else await ctx.records.create(collection, row)
  }
}

export async function syncTrees(env: Env, rows: TreeRow[]) {
  const syncedAt = new Date().toISOString()
  await upsert(
    env,
    'trees',
    'treeId',
    // put/update merges, so a field left out (moisture from the list pull) keeps its last pushed value.
    rows.map((row) => ({
      ...row,
      name: row.name ?? null,
      hasSensor: row.hasSensor ?? row.status !== 'no_sensor',
      syncedAt,
    })),
  )
}

export async function syncNeighbors(env: Env, rows: NeighborRow[]) {
  await upsert(env, 'neighbors', 'leafUserId', rows)
}

/** Backstop pull from the public Leaf on Read API (the leaf-pull cron task). */
export async function pullFromLeaf(env: Env) {
  const base = env.LEAF_API_URL?.replace(/\/$/, '')
  if (!base) return
  // Morningside Heights, matching the seeded block.
  const bbox = '-73.970,40.802,-73.955,40.813'
  const [treesRes, boardRes] = await Promise.all([
    fetch(`${base}/trees?bbox=${bbox}`),
    fetch(`${base}/blocks/morningside/leaderboard`),
  ])
  if (treesRes.ok) {
    const pins = (await treesRes.json()) as {
      id: string
      name: string | null
      species: string
      address: string
      lat: number
      lng: number
      status: TreeRow['status']
      sensorId: string | null
      adopters?: number
      lastWateredAt?: string | null
      threshold?: number
      portraitUrl?: string | null
      stickers?: { slot: 'head' | 'face' | 'side' | 'ground'; stickerId: string; imageUrl: string }[]
    }[]
    // The list endpoint has no moisture; keep whatever the last push recorded.
    await syncTrees(
      env,
      pins.map((pin) => ({
        treeId: pin.id,
        name: pin.name,
        species: pin.species,
        address: pin.address,
        lat: pin.lat,
        lng: pin.lng,
        status: pin.status,
        hasSensor: Boolean(pin.sensorId),
        adopters: pin.adopters,
        lastWateredAt: pin.lastWateredAt ?? null,
        threshold: pin.threshold,
        // Only absolute URLs load in the browser; a relative one means the API has no public address yet.
        ...(pin.portraitUrl?.startsWith('http') ? { portraitUrl: pin.portraitUrl } : {}),
        ...(pin.stickers?.every((sticker) => sticker.imageUrl.startsWith('http')) ? { stickers: pin.stickers } : {}),
      })),
    )
  }
  if (boardRes.ok) {
    const board = (await boardRes.json()) as { userId: string; name: string; gallons: number; streak: number }[]
    await syncNeighbors(
      env,
      board.map((row) => ({ leafUserId: row.userId, name: row.name, gallons: row.gallons, streak: row.streak })),
    )
  }
}

function authorized(env: Env, header: string | undefined) {
  const token = env.LEAF_SYNC_TOKEN
  if (!token || !header) return false
  const given = header.replace(/^Bearer\s+/i, '')
  if (given.length !== token.length) return false
  let diff = 0
  for (let i = 0; i < token.length; i += 1) diff |= given.charCodeAt(i) ^ token.charCodeAt(i)
  return diff === 0
}

export function registerLeafRoutes(app: Hono<AppContext>): void {
  app.post('/api/leaf/sync', async (c) => {
    if (!authorized(c.env, c.req.header('Authorization'))) return c.json({ error: 'unauthorized' }, 401)
    const parsed = syncBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'bad body', issues: parsed.error.issues }, 400)
    const body = parsed.data
    if (body.trees) await syncTrees(c.env, body.trees)
    if (body.neighbors) await syncNeighbors(c.env, body.neighbors)
    if (body.notes?.length) {
      const ctx = context(c.env)
      for (const note of body.notes) await ctx.records.create('notes', note)
    }
    return c.json({ ok: true })
  })
}
