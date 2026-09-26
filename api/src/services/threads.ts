import { randomUUID } from "node:crypto"
import { collection } from "../db/mongo.ts"
import type { NeighborMessageDoc, ThreadDoc, TreeDoc, UserDoc } from "../types.ts"

// Neighbors talking to each other: each tree's crew chat plus 1:1 DMs.
// Membership is checked by userId like the rest of the API (no auth in the demo); phones are never exposed.

const threads = () => collection<ThreadDoc>("threads")
const neighborMessages = () => collection<NeighborMessageDoc>("neighbor_messages")
const trees = () => collection<TreeDoc>("trees")
const users = () => collection<UserDoc>("users")

export const crewId = (treeId: string) => `crew:${treeId}`
const treeSender = (treeId: string) => `tree:${treeId}`

/** Display name for a sender id: neighbors by name, the tree by its own name. */
function senderName(id: string | null | undefined, people: Map<string, string>, treeNames: Map<string, string>) {
  if (!id) return "A neighbor"
  if (id.startsWith("tree:")) return treeNames.get(id.slice("tree:".length)) ?? "Your tree"
  return people.get(id) ?? "A neighbor"
}
export const dmId = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`

async function members(threadId: string) {
  if (threadId.startsWith("crew:")) {
    const tree = await trees().findOne({ _id: threadId.slice("crew:".length) })
    return tree ? { tree, memberIds: tree.adopterIds } : null
  }
  const thread = await threads().findOne({ _id: threadId })
  return thread ? { tree: null, memberIds: thread.memberIds } : null
}

export async function openDm(userId: string, otherUserId: string) {
  if (userId === otherUserId) return null
  const found = await users().countDocuments({ _id: { $in: [userId, otherUserId] } })
  if (found !== 2) return null
  const id = dmId(userId, otherUserId)
  await threads().updateOne(
    { _id: id },
    {
      $setOnInsert: {
        _id: id,
        kind: "dm",
        treeId: null,
        memberIds: [userId, otherUserId].sort(),
        lastText: null,
        lastSenderId: null,
        lastAt: null,
        createdAt: new Date().toISOString(),
      },
    },
    { upsert: true },
  )
  return id
}

/** Crews for every tree the user looks after (even before anyone has posted), plus their DMs. */
export async function listThreads(userId: string) {
  const [adopted, dms] = await Promise.all([
    trees().find({ adopterIds: userId }).toArray(),
    threads().find({ kind: "dm", memberIds: userId }).toArray(),
  ])
  const crewDocs = await threads().find({ _id: { $in: adopted.map((tree) => crewId(tree._id)) } }).toArray()
  const crewById = new Map(crewDocs.map((thread) => [thread._id, thread]))
  const otherIds = dms.map((thread) => thread.memberIds.find((id) => id !== userId)!).filter(Boolean)
  const senderIds = [...crewDocs, ...dms].map((thread) => thread.lastSenderId).filter((id): id is string => Boolean(id))
  const people = new Map(
    (await users().find({ _id: { $in: [...new Set([...otherIds, ...senderIds])] } }).toArray()).map((user) => [user._id, user.name]),
  )

  const treeNames = new Map(adopted.map((tree) => [tree._id, tree.name ?? tree.species]))
  const crews = adopted.map((tree) => {
    const thread = crewById.get(crewId(tree._id))
    return {
      id: crewId(tree._id),
      kind: "crew" as const,
      title: `${tree.name ?? tree.species} crew`,
      treeId: tree._id,
      status: tree.status,
      otherUserId: null,
      memberCount: tree.adopterIds.length,
      last: thread?.lastAt
        ? { text: thread.lastText ?? "", senderId: thread.lastSenderId, senderName: senderName(thread.lastSenderId, people, treeNames), at: thread.lastAt }
        : null,
    }
  })
  const direct = dms.map((thread) => {
    const otherUserId = thread.memberIds.find((id) => id !== userId) ?? null
    return {
      id: thread._id,
      kind: "dm" as const,
      title: people.get(otherUserId ?? "") ?? "A neighbor",
      treeId: null,
      status: null,
      otherUserId,
      memberCount: 2,
      last: thread.lastAt
        ? { text: thread.lastText ?? "", senderId: thread.lastSenderId, senderName: people.get(thread.lastSenderId ?? "") ?? "A neighbor", at: thread.lastAt }
        : null,
    }
  })
  // Conversations with messages first (newest on top), then quiet crews.
  return [...crews, ...direct].sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? ""))
}

export async function readThread(threadId: string, userId: string, limit = 60) {
  const scope = await members(threadId)
  if (!scope || !scope.memberIds.includes(userId)) return null
  const rows = await neighborMessages().find({ threadId }).sort({ at: -1 }).limit(limit).toArray()
  rows.reverse()
  const people = await users().find({ _id: { $in: [...new Set([...scope.memberIds, ...rows.map((row) => row.senderId)])] } }).toArray()
  const names = new Map(people.map((user) => [user._id, user.name]))
  const treeNames = new Map(scope.tree ? [[scope.tree._id, scope.tree.name ?? scope.tree.species]] : [])
  const claim = scope.tree?.claim && Date.parse(scope.tree.claim.until) > Date.now() ? scope.tree.claim : null
  return {
    id: threadId,
    kind: threadId.startsWith("crew:") ? "crew" : "dm",
    treeId: scope.tree?._id ?? null,
    tree: scope.tree
      ? { id: scope.tree._id, name: scope.tree.name ?? scope.tree.species, status: scope.tree.status, claim }
      : null,
    title: scope.tree ? `${scope.tree.name ?? scope.tree.species} crew` : names.get(scope.memberIds.find((id) => id !== userId) ?? "") ?? "A neighbor",
    members: scope.memberIds.map((id) => ({ id, name: names.get(id) ?? "A neighbor" })),
    messages: rows.map((row) => ({ ...row, senderName: senderName(row.senderId, names, treeNames) })),
  }
}

export async function postToThread(threadId: string, userId: string, text: string) {
  const scope = await members(threadId)
  if (!scope || !scope.memberIds.includes(userId)) return null
  const message: NeighborMessageDoc = { _id: randomUUID(), threadId, senderId: userId, text, at: new Date().toISOString() }
  await neighborMessages().insertOne(message)
  await threads().updateOne(
    { _id: threadId },
    {
      $set: { lastText: text, lastSenderId: userId, lastAt: message.at },
      $setOnInsert: {
        kind: scope.tree ? "crew" : "dm",
        treeId: scope.tree?._id ?? null,
        memberIds: scope.tree ? [] : scope.memberIds,
        createdAt: message.at,
      },
    },
    { upsert: true },
  )
  return message
}

/**
 * The tree posts in its own crew (thirsty, claimed, watered, thanks). No membership check: the tree is
 * always in its crew. Demo re-alerts repeat every couple of minutes, so an identical post within ten
 * minutes is skipped.
 */
export async function postTreeToCrew(tree: TreeDoc, text: string, action: "claim" | null = null) {
  const threadId = crewId(tree._id)
  const last = await neighborMessages().find({ threadId, senderId: treeSender(tree._id) }).sort({ at: -1 }).limit(1).next()
  if (last && last.text === text && Date.now() - Date.parse(last.at) < 10 * 60_000) return null
  const message: NeighborMessageDoc = {
    _id: randomUUID(),
    threadId,
    senderId: treeSender(tree._id),
    text,
    at: new Date().toISOString(),
    kind: "tree",
    action,
  }
  await neighborMessages().insertOne(message)
  await threads().updateOne(
    { _id: threadId },
    {
      $set: { lastText: text, lastSenderId: message.senderId, lastAt: message.at },
      $setOnInsert: { kind: "crew", treeId: tree._id, memberIds: [], createdAt: message.at },
    },
    { upsert: true },
  )
  return message
}
