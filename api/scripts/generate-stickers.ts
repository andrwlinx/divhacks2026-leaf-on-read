// One-off: draw every sticker in the catalog with Grok Imagine and store 256px JPEGs in Mongo.
// Skips stickers already drawn. Uses macOS `sips` to shrink them. Run: npx tsx scripts/generate-stickers.ts
import "dotenv/config"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Binary } from "mongodb"
import { connectMongo } from "../src/db/mongo.ts"
import { drawImage } from "../src/lib/imagine.ts"
import { catalog, stickerArt, stickerPrompt, type Sticker } from "../src/services/stickers.ts"

await connectMongo(process.env.MONGODB_URI!)
const dir = mkdtempSync(path.join(tmpdir(), "leaf-stickers-"))
const existing = new Set((await stickerArt().find({}, { projection: { _id: 1 } }).toArray()).map((doc) => doc._id))
const todo = catalog.filter((sticker) => !existing.has(sticker.id))
console.log(`${todo.length} to draw, ${existing.size} already done`)

async function draw(sticker: Sticker) {
  const { image } = await drawImage(stickerPrompt(sticker))
  const raw = path.join(dir, `${sticker.id}.raw`)
  const small = path.join(dir, `${sticker.id}.jpg`)
  writeFileSync(raw, image)
  execFileSync("sips", ["-Z", "256", "-s", "format", "jpeg", "-s", "formatOptions", "85", raw, "--out", small], { stdio: "ignore" })
  const bytes = readFileSync(small)
  await stickerArt().updateOne(
    { _id: sticker.id },
    { $set: { image: new Binary(bytes), mimeType: "image/jpeg", createdAt: new Date().toISOString() } },
    { upsert: true },
  )
  console.log(`  ${sticker.id}: ${bytes.length} bytes`)
}

// Four at a time keeps it to about a minute.
for (let i = 0; i < todo.length; i += 4) {
  const results = await Promise.allSettled(todo.slice(i, i + 4).map(draw))
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") console.error(`  ${todo[i + index].id} failed:`, result.reason)
  }
}
console.log(`done; images in ${dir}`)
process.exit(0)
