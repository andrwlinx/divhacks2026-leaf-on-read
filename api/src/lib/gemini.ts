export async function verifyWateringPhoto(photoBase64: string): Promise<boolean | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const data = photoBase64.replace(/^data:image\/\w+;base64,/, "")
  // gemini-2.5-flash is closed to new API keys; 3.8 Flash is the current image-understanding model.
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash"
  const ask = () =>
    fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: "image/jpeg", data } },
              {
                text: 'Does this photo show a person watering a tree, a bucket of water, or a hose at a tree? Reply JSON {"verified":true} or {"verified":false} only.',
              },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(12_000),
    },
  )
  let response = await ask()
  // Demand spikes on Gemini return 503; one quick retry usually lands.
  if (response.status === 503) {
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    response = await ask()
  }
  if (!response.ok) {
    console.error(`Gemini ${response.status}: ${await response.text()}`)
    return null
  }
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? ""
  try {
    const parsed = JSON.parse(text) as { verified?: boolean }
    return Boolean(parsed.verified)
  } catch {
    return null
  }
}
