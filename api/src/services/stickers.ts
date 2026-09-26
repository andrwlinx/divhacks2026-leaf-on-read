import { collection } from "../db/mongo.ts"
import { publicApiUrl } from "../env.ts"
import type { Binary } from "mongodb"

export type Slot = "head" | "face" | "side" | "ground"
export const slots: Slot[] = ["head", "face", "side", "ground"]

export type Sticker = { id: string; name: string; slot: Slot; price: number; subject: string }

// Grok Imagine draws each subject once (scripts/generate-stickers.ts). Slots are the four corners of a
// tree's card (head = top left, face = top right, side = bottom right, ground = bottom left).
export const catalog: Sticker[] = [
  { id: "crown", name: "Gold crown", slot: "head", price: 60, subject: "a tiny golden crown with three points and little jewels" },
  { id: "flower-crown", name: "Flower crown", slot: "head", price: 40, subject: "a flower crown of pink and yellow daisies" },
  { id: "party-hat", name: "Party hat", slot: "head", price: 30, subject: "a striped cone party hat with a pom-pom on top" },
  { id: "bow", name: "Pink bow", slot: "head", price: 20, subject: "a big glossy pink ribbon bow" },
  { id: "heart-shades", name: "Heart shades", slot: "face", price: 40, subject: "heart-shaped red sunglasses" },
  { id: "round-glasses", name: "Round glasses", slot: "face", price: 25, subject: "round wire-rim reading glasses" },
  { id: "mustache", name: "Mustache", slot: "face", price: 20, subject: "a curly brown handlebar mustache" },
  { id: "star-blush", name: "Star blush", slot: "face", price: 15, subject: "two sparkly pink star-shaped blush marks" },
  { id: "bluebird", name: "Bluebird", slot: "side", price: 35, subject: "a round little bluebird singing" },
  { id: "butterfly", name: "Butterfly", slot: "side", price: 30, subject: "an orange monarch butterfly" },
  { id: "balloon", name: "Balloon", slot: "side", price: 25, subject: "a shiny red heart balloon on a string" },
  { id: "sunflower", name: "Sunflower", slot: "side", price: 15, subject: "a bright smiling sunflower" },
  { id: "puppy", name: "Puppy", slot: "ground", price: 60, subject: "a happy beagle puppy sitting" },
  { id: "bodega-cat", name: "Bodega cat", slot: "ground", price: 60, subject: "an orange tabby bodega cat loafing" },
  { id: "rubber-duck", name: "Rubber duck", slot: "ground", price: 25, subject: "a yellow rubber duck" },
  { id: "watering-can", name: "Watering can", slot: "ground", price: 20, subject: "a small green watering can pouring water drops" },
]

export const stickerById = new Map(catalog.map((sticker) => [sticker.id, sticker]))

export function stickerPrompt(sticker: Sticker) {
  return `Cute kawaii sticker of ${sticker.subject}, thick soft white outline, flat pastel colors, simple and bold so it reads when small, plain white background, centered, no text, no words, no letters.`
}

// Bump when the art changes so phones and browsers drop their cached copies.
const ART_VERSION = "cutout-1"
export const stickerImageUrl = (id: string) => `${publicApiUrl}/stickers/${id}/image?v=${ART_VERSION}`

type StickerArtDoc = { _id: string; image: Binary; mimeType: string; createdAt: string }
export const stickerArt = () => collection<StickerArtDoc>("sticker_art")
