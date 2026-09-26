import "dotenv/config"
import { connectMongo, collection } from "../src/db/mongo.ts"
import { GUS_BLOCK, GUS_ID, GUS_SENSOR } from "../src/env.ts"
import type { BlockDoc, TreeDoc, UserDoc, WateringDoc } from "../src/types.ts"

const center = { lat: 40.8075, lng: -73.9626 }

const species = ["pin oak", "honey locust", "London planetree", "callery pear", "ginkgo", "linden"]

async function censusTrees() {
  const url = new URL("https://data.cityofnewyork.us/resource/uvpi-gqnh.json")
  url.searchParams.set("$select", "tree_id,spc_common,latitude,longitude,address,block_id,status")
  url.searchParams.set(
    "$where",
    "latitude between 40.802 and 40.813 AND longitude between -73.970 and -73.955 AND status = 'Alive'",
  )
  url.searchParams.set("$limit", "50")
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`census ${response.status}`)
  const rows = (await response.json()) as {
    tree_id: string
    spc_common: string | null
    latitude: string
    longitude: string
    address: string | null
    block_id: string | null
  }[]
  return rows
    .filter((row) => row.spc_common && row.latitude && row.longitude)
    .map((row) => ({
      _id: `census-${row.tree_id}`,
      censusId: row.tree_id,
      species: row.spc_common as string,
      lat: Number(row.latitude),
      lng: Number(row.longitude),
      address: row.address || "Manhattan",
      blockId: row.block_id ? `b-${row.block_id}` : GUS_BLOCK,
    }))
}

function syntheticTrees() {
  return Array.from({ length: 50 }, (_, index) => {
    const row = Math.floor(index / 10)
    const col = index % 10
    return {
      _id: `synthetic-${index}`,
      censusId: null,
      species: species[index % species.length] ?? "pin oak",
      lat: center.lat + (row - 2) * 0.0012,
      lng: center.lng + (col - 5) * 0.0011,
      address: `${400 + index} Amsterdam Ave`,
      blockId: GUS_BLOCK,
    }
  })
}

function blankTree(partial: Omit<TreeDoc, "status" | "lastAlertAt" | "claim" | "rainSkipUntil" | "thirstEpisodeId" | "thankedEpisodeId" | "thirstEpisodeAt" | "lastWateredAt" | "adopterIds" | "name" | "persona" | "sensorId" | "thirstThreshold"> & Partial<TreeDoc>): TreeDoc {
  return {
    name: null,
    persona: null,
    sensorId: null,
    adopterIds: [],
    thirstThreshold: 30,
    status: partial.sensorId ? "ok" : "no_sensor",
    lastAlertAt: null,
    claim: null,
    rainSkipUntil: null,
    thirstEpisodeId: null,
    thankedEpisodeId: null,
    thirstEpisodeAt: null,
    lastWateredAt: null,
    ...partial,
  }
}

const uri = process.env.MONGODB_URI
if (!uri) throw new Error("MONGODB_URI is required")
await connectMongo(uri)

const trees = collection<TreeDoc>("trees")
const users = collection<UserDoc>("users")
const blocks = collection<BlockDoc>("blocks")
const waterings = collection<WateringDoc>("waterings")

let sourced: { _id: string; censusId: string | null; species: string; lat: number; lng: number; address: string; blockId: string }[]
try {
  sourced = await censusTrees()
  console.log(`census rows ${sourced.length}`)
} catch (error) {
  console.error("census fetch failed, using a local grid", error)
  sourced = syntheticTrees()
}

for (const tree of sourced) {
  await trees.updateOne({ _id: tree._id }, { $setOnInsert: blankTree(tree) }, { upsert: true })
  await blocks.updateOne(
    { _id: tree.blockId },
    { $setOnInsert: { _id: tree.blockId, name: tree.blockId, bbox: null } },
    { upsert: true },
  )
}

const gus = blankTree({
  _id: GUS_ID,
  censusId: null,
  species: "pin oak",
  lat: 40.8078,
  lng: -73.963,
  address: "Amsterdam Ave near 116th St",
  blockId: GUS_BLOCK,
  name: "Gus",
  persona:
    "Gus is a young pin oak who texts like a neighbor you actually like. Short sentences. Dramatic only about water.",
  sensorId: GUS_SENSOR,
  adopterIds: ["neighbor-maya", "neighbor-luis"],
  status: "ok",
})
await trees.updateOne({ _id: GUS_ID }, { $setOnInsert: gus }, { upsert: true })
await trees.updateOne(
  { _id: GUS_ID },
  { $addToSet: { adopterIds: { $each: ["neighbor-maya", "neighbor-luis"] } } },
)
await blocks.updateOne(
  { _id: GUS_BLOCK },
  {
    $set: {
      name: "Morningside Heights",
      bbox: [-73.97, 40.802, -73.955, 40.813],
    },
  },
  { upsert: true },
)

const now = Date.now()
const neighbors: UserDoc[] = [
  {
    _id: "neighbor-maya",
    phone: "+12125550101",
    name: "Maya",
    blockId: GUS_BLOCK,
    language: "en",
    userCode: "MAYA01",
    createdAt: new Date(now - 86_400_000).toISOString(),
  },
  {
    _id: "neighbor-luis",
    phone: "+12125550102",
    name: "Luis",
    blockId: GUS_BLOCK,
    language: "es",
    userCode: "LUIS02",
    createdAt: new Date(now - 86_400_000).toISOString(),
  },
]
for (const neighbor of neighbors) {
  await users.updateOne({ _id: neighbor._id }, { $setOnInsert: neighbor }, { upsert: true })
}

const samples: WateringDoc[] = [
  { _id: "water-maya-1", treeId: GUS_ID, userId: "neighbor-maya", gallons: 10, photoUrl: null, verified: true, source: "app", at: new Date(now - 86_400_000).toISOString() },
  { _id: "water-maya-2", treeId: GUS_ID, userId: "neighbor-maya", gallons: 8, photoUrl: null, verified: true, source: "app", at: new Date(now - 3_600_000).toISOString() },
  { _id: "water-luis-1", treeId: GUS_ID, userId: "neighbor-luis", gallons: 12, photoUrl: null, verified: null, source: "app", at: new Date(now - 86_400_000).toISOString() },
]
for (const sample of samples) {
  await waterings.updateOne({ _id: sample._id }, { $setOnInsert: sample }, { upsert: true })
}

console.log(`seeded ${sourced.length} trees plus Gus`)
process.exit(0)
