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
