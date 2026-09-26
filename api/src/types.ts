export type TreeStatus = "thirsty" | "ok" | "no_sensor"

export type Claim = { userId: string; name: string; until: string }

export type TreeDoc = {
  _id: string
  censusId: string | null
  species: string
  lat: number
  lng: number
  address: string
  blockId: string
  name: string | null
  persona: string | null
  backstory?: string | null
  sensorId: string | null
  adopterIds: string[]
  thirstThreshold: number
  status: TreeStatus
  lastAlertAt: string | null
  claim: Claim | null
  rainSkipUntil: string | null
  thirstEpisodeId: string | null
  thankedEpisodeId: string | null
  thirstEpisodeAt: string | null
  lastWateredAt: string | null
}

export type UserDoc = {
  _id: string
  phone: string
  // iMessage sender handle (phone or Apple ID email), linked by the join code.
  imessageId?: string | null
  name: string
  blockId: string
  /** What the neighbor calls home: a reverse-geocoded street or what they typed ("W 116th St & Amsterdam"). */
  homeBlock?: string | null
  language: string
  pushToken?: string | null
  userCode: string
  createdAt: string
}

export type WateringDoc = {
  _id: string
  treeId: string
  userId: string
  gallons: number
  photoUrl: string | null
  verified: boolean | null
  source: "app" | "imessage"
  at: string
}

export type AlertDoc = {
  _id: string
  userId: string
  treeId: string
  treeName: string
  type: string
  text: string
  voiceUrl?: string
  at: string
}

export type MessageDoc = {
  _id: string
  treeId: string
  userId: string
  role: "user" | "tree"
  text: string
  channel: "app" | "imessage"
  actions: unknown[]
  at: string
}

export type BlockDoc = {
  _id: string
  name: string
  bbox: [number, number, number, number] | null
}

/** Neighbor-to-neighbor conversations: a tree's caretaker crew, or a 1:1 DM. */
export type ThreadDoc = {
  _id: string // "crew:<treeId>" or "dm:<userA>:<userB>" (ids sorted)
  kind: "crew" | "dm"
  treeId: string | null
  memberIds: string[] // DMs only; a crew's members are always its tree's current adopters
  lastText: string | null
  lastSenderId: string | null
  lastAt: string | null
  createdAt: string
}

export type NeighborMessageDoc = {
  _id: string
  threadId: string
  senderId: string // a user id, or "tree:<treeId>" when the tree itself posts in its crew
  text: string
  at: string
  kind?: "tree"
  /** A tree post the crew can act on from the chat ("I'm on it"). */
  action?: "claim" | null
}
