export function speechConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY)
}

// ElevenLabs Scribe; language is auto-detected so neighbors can talk however they like.
export async function transcribe(audio: Blob, filename: string) {
  const form = new FormData()
  form.append("model_id", "scribe_v2")
  form.append("file", audio, filename)
  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
    body: form,
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    throw new Error(`Speech-to-text ${response.status}: ${await response.text()}`)
  }
  const body = (await response.json()) as { text?: string }
  return (body.text ?? "").trim()
}
