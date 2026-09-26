import type { TreeDoc } from "../types.ts"

// Grok Imagine draws each adopted tree as a sticker in the app's mascot style.

export function portraitPrompt(tree: TreeDoc) {
  const name = tree.name ?? "a young street tree"
  const persona = (tree.persona ?? "").slice(0, 400)
  return [
    `Cute kawaii sticker illustration of a young ${tree.species} street tree named ${name},`,
    "with a friendly face (small dark eyes, rosy cheeks, a gentle smile) on its trunk,",
    `standing in a small square tree bed on a New York City sidewalk near ${tree.address}.`,
    persona ? `Add one small prop or detail that hints at its personality: ${persona}` : "",
    "Soft rounded shapes, thick soft white sticker outline, flat pastel colors, cream background, centered.",
    "No text, no words, no letters, no signs with writing.",
  ]
    .filter(Boolean)
    .join(" ")
}

export async function drawPortrait(tree: TreeDoc) {
  const prompt = portraitPrompt(tree)
  const response = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.XAI_IMAGE_MODEL || "grok-imagine-image-2.0",
      prompt,
      response_format: "b64_json",
      aspect_ratio: "1:1",
      resolution: "1k",
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`Imagine ${response.status}: ${await response.text()}`)
  const body = (await response.json()) as { data?: { b64_json?: string; mime_type?: string }[] }
  const image = body.data?.[0]
  if (!image?.b64_json) throw new Error("Imagine returned no image")
  return { image: Buffer.from(image.b64_json, "base64"), mimeType: image.mime_type || "image/jpeg", prompt }
}
