export async function verifyWateringPhoto(photoBase64: string): Promise<boolean | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const data = photoBase64.replace(/^data:image\/\w+;base64,/, "")
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  if (!response.ok) return null
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
