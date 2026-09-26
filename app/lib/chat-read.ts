import * as SecureStore from "expo-secure-store"
import type { ChatSummary, ThreadSummary } from "@/lib/types"

// When each tree's chat was last opened, kept on the phone so the Chats tab can show unread dots.
const KEY = "leaf-chat-read"
let cache: Record<string, string> | null = null

async function load() {
  if (cache) return cache
  try {
    cache = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? "{}") as Record<string, string>
  } catch {
    cache = {}
  }
  return cache
}

// Keys are tree ids for tree chats and thread ids ("crew:gus", "dm:a:b") for neighbor conversations.
export async function markChatRead(key: string) {
  const reads = await load()
  reads[key] = new Date().toISOString()
  await SecureStore.setItemAsync(KEY, JSON.stringify(reads))
}

export async function unreadTreeIds(chats: ChatSummary[]) {
  const reads = await load()
  return new Set(
    chats.filter((chat) => chat.last.role === "tree" && chat.last.at > (reads[chat.treeId] ?? "")).map((chat) => chat.treeId),
  )
}

export async function unreadThreadIds(threads: ThreadSummary[], userId: string) {
  const reads = await load()
  return new Set(
    threads
      .filter((thread) => thread.last && thread.last.senderId !== userId && thread.last.at > (reads[thread.id] ?? ""))
      .map((thread) => thread.id),
  )
}

export async function clearChatReads() {
  cache = {}
  await SecureStore.deleteItemAsync(KEY)
}
