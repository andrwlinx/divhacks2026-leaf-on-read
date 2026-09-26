import { Binary } from "mongodb"
import { collection } from "../db/mongo.ts"
import { pushTree } from "../lib/deepspace.ts"
import { drawPortrait } from "../lib/imagine.ts"
import type { TreeDoc } from "../types.ts"

type PortraitDoc = { _id: string; image: Binary; mimeType: string; prompt: string; createdAt: string }

const portraits = () => collection<PortraitDoc>("portraits")
const trees = () => collection<TreeDoc>("trees")
const drawing = new Set<string>()

export function portraitsConfigured() {
  return Boolean(process.env.XAI_API_KEY)
}

export async function savePortrait(treeId: string, image: Buffer, mimeType: string, prompt: string) {
  const createdAt = new Date().toISOString()
  await portraits().updateOne(
    { _id: treeId },
    { $set: { image: new Binary(image), mimeType, prompt, createdAt } },
    { upsert: true },
  )
  const tree = await trees().findOneAndUpdate({ _id: treeId }, { $set: { portraitAt: createdAt } }, { returnDocument: "after" })
  if (tree) pushTree(tree, undefined, true)
}

/** Draw in the background (about 15s) so adopting a tree never waits on the image. */
export function drawPortraitSoon(tree: TreeDoc) {
  if (!portraitsConfigured() || drawing.has(tree._id)) return false
  drawing.add(tree._id)
  void drawPortrait(tree)
    .then(({ image, mimeType, prompt }) => savePortrait(tree._id, image, mimeType, prompt))
    .catch((error) => console.error(`portrait for ${tree._id} failed`, error))
    .finally(() => drawing.delete(tree._id))
  return true
}

export function isDrawing(treeId: string) {
  return drawing.has(treeId)
}

export async function portraitFor(treeId: string) {
  const doc = await portraits().findOne({ _id: treeId })
  return doc ? { bytes: Buffer.from(doc.image.buffer), mimeType: doc.mimeType } : null
}
