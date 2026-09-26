export type TreeStatus = "thirsty" | "ok" | "no_sensor"

export type User = {
  _id: string
  phone: string
  name: string
  blockId: string
  language: string
  userCode: string
  homeBlock?: string | null
}

export type TreePin = {
  id: string
  name: string | null
  species: string
  lat: number
  lng: number
  status: TreeStatus
  blockId: string
  sensorId: string | null
  address: string
  portraitUrl?: string | null
  drawingPortrait?: boolean
  stickers?: TreeSticker[]
}

export type TreeDetail = TreePin & {
  persona: string | null
  threshold: number
  claim: { userId: string; name: string; until: string } | null
  latest: { moisture: number; temp: number | null; light: number | null; t: string } | null
  caretakers: { id: string; name: string }[]
}

export type Reading = { t: string; moisture: number }

export type AlertItem = {
  _id: string
  userId: string
  treeId: string
  treeName: string
  type: string
  text: string
  voiceUrl?: string
  at: string
}

export type ChatMessage = {
  _id: string
  role: "user" | "tree"
  text: string
  at: string
}

export const languages = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "zh", label: "中文" },
  { code: "bn", label: "বাংলা" },
  { code: "ru", label: "Русский" },
  { code: "ht", label: "Kreyòl ayisyen" },
  { code: "ko", label: "한국어" },
  { code: "ar", label: "العربية" },
]

export function pinColor(status: TreeStatus) {
  if (status === "thirsty") return "#C44536"
  if (status === "ok") return "#2D6A4F"
  return "#8D99AE"
}

export type TreeState = {
  status: TreeStatus
  feeling: "thirsty" | "fine" | "refreshed" | "unknown"
  moisture: number | null
  threshold: number
  hoursSinceWater: number | null
  claimedBy: string | null
}

export type TalkTurn = {
  reply: string
  state: TreeState | null
  audioUrl: string | null
  transcript?: string
}

export type MyTree = TreePin & {
  persona: string | null
  claim: { userId: string; name: string; until: string } | null
  moisture: number | null
  /** "sensor" = live reading; "estimate" = from the last watering and the past three days of weather. */
  moistureSource: "sensor" | "estimate"
  adopters: number
  lastWateredAt: string | null
  threshold: number
}

export type ChatSummary = {
  treeId: string
  treeName: string
  status: TreeStatus
  last: { text: string; role: "user" | "tree"; at: string }
}

export type MyStats = {
  gallons: number
  waterings: number
  streak: number
  trees: number
  rank: number | null
  neighbors: number
}

export type BlockActivity = {
  waterings: { id: string; treeId: string; treeName: string; name: string; gallons: number; at: string }[]
  thirsty: { id: string; name: string; claimedBy: string | null }[]
}

export type NearBlock = {
  blockId: string
  name: string
  inArea: boolean
  nearbyTrees: number
  needCaretakers: number
  thirsty: number
  neighbors: number
}

export type ThreadSummary = {
  id: string
  kind: "crew" | "dm"
  title: string
  treeId: string | null
  status: TreeStatus | null
  otherUserId: string | null
  memberCount: number
  last: { text: string; senderId: string | null; senderName: string; at: string } | null
}

export type NeighborMessage = {
  _id: string
  threadId: string
  senderId: string // a neighbor's id, or "tree:<treeId>" when the tree posts in its crew
  senderName: string
  text: string
  at: string
  kind?: "tree"
  action?: "claim" | null
}

export type ThreadDetail = {
  id: string
  kind: "crew" | "dm"
  treeId: string | null
  tree: { id: string; name: string; status: TreeStatus; claim: { userId: string; name: string; until: string } | null } | null
  title: string
  members: { id: string; name: string }[]
  messages: NeighborMessage[]
}

export type StickerSlot = "head" | "face" | "side" | "ground"
export type TreeSticker = { slot: StickerSlot; stickerId: string; imageUrl: string }
export type Sticker = { id: string; name: string; slot: StickerSlot; price: number; imageUrl: string }
export type Wallet = {
  coins: number
  streak: number
  owned: string[]
  recent: { amount: number; reason: "checkin" | "watering" | "photo" | "sticker"; ref: string | null; at: string }[]
}
export type CoinToast = { id: number; amount: number; text: string }
