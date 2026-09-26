import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const cacheDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../cache/voice")

export function voiceModel(language: string) {
  if (language === "ht") return null
  if (language === "bn") return "eleven_v3"
  return "eleven_multilingual_v2"
}

export function voiceCachePath(treeId: string, type: string, language: string) {
  return path.join(cacheDir, `${treeId}-${type}-${language}.mp3`)
}

export async function cachedVoice(treeId: string, type: string, language: string) {
  try {
    return await readFile(voiceCachePath(treeId, type, language))
  } catch {
    return null
  }
}

export async function synthesizeVoice(treeId: string, type: string, language: string, text: string) {
  const model = voiceModel(language)
  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID
  if (!model || !apiKey || !voiceId || !text) return null
  const existing = await cachedVoice(treeId, type, language)
  if (existing) return existing

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, model_id: model }),
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) return null
  const audio = Buffer.from(await response.arrayBuffer())
  await mkdir(cacheDir, { recursive: true })
  await writeFile(voiceCachePath(treeId, type, language), audio)
  return audio
}

const clipId = /^[0-9a-f-]{36}$/

export function clipPath(id: string) {
  if (!clipId.test(id)) return null
  return path.join(cacheDir, `talk-${id}.mp3`)
}

// Conversation voice: Flash is ~0.4s vs ~1.5s for multilingual v2, and covers all our languages but Bengali.
function talkModel(language: string) {
  if (language === "ht") return null
  if (language === "bn") return "eleven_v3"
  return "eleven_flash_v2_5"
}

const pending = new Map<string, Promise<Buffer | null>>()

async function synthesizeClip(id: string, text: string, model: string) {
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: model }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    const audio = Buffer.from(await response.arrayBuffer())
    await mkdir(cacheDir, { recursive: true })
    await writeFile(path.join(cacheDir, `talk-${id}.mp3`), audio)
    return audio
  } catch (error) {
    console.error("tts failed", error)
    return null
  } finally {
    setTimeout(() => pending.delete(id), 60_000)
  }
}

// Returns a clip id right away and synthesizes in the background, so the reply text isn't held up by TTS.
export function speakClip(text: string, language: string) {
  const model = talkModel(language)
  const spoken = text.replace(/\p{Extended_Pictographic}/gu, "").trim()
  if (!model || !process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID || !spoken) return null
  const id = randomUUID()
  pending.set(id, synthesizeClip(id, spoken, model))
  return id
}

// Waits for an in-flight clip, else reads a finished one from disk.
export async function clipAudio(id: string) {
  const file = clipPath(id)
  if (!file) return null
  const inFlight = pending.get(id)
  if (inFlight) return inFlight
  try {
    return await readFile(file)
  } catch {
    return null
  }
}
