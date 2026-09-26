import { randomUUID } from "node:crypto"
import { collection } from "../db/mongo.ts"
import { demoMode } from "../env.ts"
import { pushTree } from "../lib/deepspace.ts"
import type { CoinLedgerDoc, TreeDoc, UserDoc } from "../types.ts"
import { checkinReward, nyDay, PHOTO_BONUS, wateringReward } from "./coin-rules.ts"
import { stickerById, stickerImageUrl, type Slot } from "./stickers.ts"

// Coins live on the server: every change is an atomic $inc on the user plus a ledger row.

const users = () => collection<UserDoc>("users")
const trees = () => collection<TreeDoc>("trees")
const ledger = () => collection<CoinLedgerDoc>("coin_ledger")

const WATERING_COOLDOWN_MS = demoMode ? 60_000 : 3 * 60 * 60 * 1000

export async function award(userId: string, amount: number, reason: CoinLedgerDoc["reason"], ref: string | null) {
  if (amount === 0) return
  await users().updateOne({ _id: userId }, { $inc: { coins: amount } })
  await ledger().insertOne({ _id: randomUUID(), userId, amount, reason, ref, at: new Date().toISOString() })
}

export async function checkIn(userId: string) {
  const user = await users().findOne({ _id: userId })
  if (!user) return null
  const today = nyDay(Date.now())
  const { awarded, streak } = checkinReward(user.checkinDay, user.checkinStreak, today)
  if (awarded > 0) {
    // Guard on the stored day so two app launches at once can't both collect.
    const claimed = await users().updateOne(
      { _id: userId, checkinDay: user.checkinDay ?? null },
      { $set: { checkinDay: today, checkinStreak: streak } },
    )
    if (claimed.modifiedCount === 1) await award(userId, awarded, "checkin", null)
    else return { awarded: 0, streak, coins: (await users().findOne({ _id: userId }))?.coins ?? 0 }
  }
  return { awarded, streak, coins: (user.coins ?? 0) + awarded }
}

export async function rewardWatering(userId: string, treeId: string, wasThirsty: boolean) {
  const startOfDay = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const rewarded = await ledger()
    .find({ userId, reason: "watering", at: { $gte: startOfDay } })
    .sort({ at: -1 })
    .toArray()
  const today = nyDay(Date.now())
  const lastForTree = rewarded.find((row) => row.ref === treeId)
  const { coins } = wateringReward({
    nowMs: Date.now(),
    wasThirsty,
    lastRewardForTreeMs: lastForTree ? Date.parse(lastForTree.at) : null,
    rewardedToday: rewarded.filter((row) => nyDay(Date.parse(row.at)) === today).length,
    cooldownMs: WATERING_COOLDOWN_MS,
  })
  await award(userId, coins, "watering", treeId)
  return coins
}

export async function rewardPhoto(userId: string, treeId: string) {
  await award(userId, PHOTO_BONUS, "photo", treeId)
}

export async function wallet(userId: string) {
  const user = await users().findOne({ _id: userId })
  if (!user) return null
  const recent = await ledger().find({ userId }).sort({ at: -1 }).limit(10).toArray()
  return {
    coins: user.coins ?? 0,
    streak: user.checkinStreak ?? 0,
    owned: user.ownedStickers ?? [],
    recent: recent.map(({ amount, reason, ref, at }) => ({ amount, reason, ref, at })),
  }
}

export async function buySticker(userId: string, stickerId: string) {
  const sticker = stickerById.get(stickerId)
  if (!sticker) return { error: "unknown_sticker" as const }
  // One atomic update: only succeeds when the balance covers it and it isn't owned yet.
  const bought = await users().findOneAndUpdate(
    { _id: userId, coins: { $gte: sticker.price }, ownedStickers: { $ne: stickerId } },
    { $inc: { coins: -sticker.price }, $addToSet: { ownedStickers: stickerId } },
    { returnDocument: "after" },
  )
  if (!bought) {
    const user = await users().findOne({ _id: userId })
    if (!user) return { error: "not_found" as const }
    return { error: (user.ownedStickers ?? []).includes(stickerId) ? ("owned" as const) : ("short" as const) }
  }
  await ledger().insertOne({ _id: randomUUID(), userId, amount: -sticker.price, reason: "sticker", ref: stickerId, at: new Date().toISOString() })
  return { wallet: await wallet(userId) }
}

export async function placeSticker(treeId: string, userId: string, slot: Slot, stickerId: string | null) {
  const [tree, user] = await Promise.all([trees().findOne({ _id: treeId }), users().findOne({ _id: userId })])
  if (!tree || !user) return { error: "not_found" as const }
  if (!tree.adopterIds.includes(userId)) return { error: "not_caretaker" as const }
  if (stickerId) {
    const sticker = stickerById.get(stickerId)
    if (!sticker || sticker.slot !== slot) return { error: "wrong_slot" as const }
    if (!(user.ownedStickers ?? []).includes(stickerId)) return { error: "not_owned" as const }
  }
  const updated = await trees().findOneAndUpdate(
    { _id: treeId },
    stickerId ? { $set: { [`stickers.${slot}`]: { stickerId, by: userId } } } : { $unset: { [`stickers.${slot}`]: "" } },
    { returnDocument: "after" },
  )
  if (updated) pushTree(updated, undefined, true)
  return { tree: updated }
}

/** Stickers on a tree in slot order, with image URLs for the app and the web board. */
export function treeStickers(tree: TreeDoc) {
  const order: Slot[] = ["head", "face", "side", "ground"]
  return order.flatMap((slot) => {
    const placed = tree.stickers?.[slot]
    return placed && stickerById.has(placed.stickerId)
      ? [{ slot, stickerId: placed.stickerId, imageUrl: stickerImageUrl(placed.stickerId) }]
      : []
  })
}
