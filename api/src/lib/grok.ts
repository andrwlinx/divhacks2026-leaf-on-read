import { xaiModel } from "../env.ts"

type ContentPart = { type?: string; text?: string }
type OutputItem = {
  type?: string
  role?: string
  name?: string
  arguments?: string
  call_id?: string
  content?: ContentPart[] | string
  encrypted_content?: string
}

export type GrokTurn = {
  text: string
  output: OutputItem[]
  calls: { name: string; arguments: string; callId: string }[]
}

export function grokConfigured() {
  return Boolean(process.env.XAI_API_KEY)
}

export async function grokRespond(input: unknown[], tools?: unknown[]): Promise<GrokTurn> {
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: xaiModel,
      reasoning: { effort: "low" },
      input,
      ...(tools ? { tools } : {}),
    }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new Error(`Grok ${response.status}: ${await response.text()}`)
  }
  const body = (await response.json()) as { output?: OutputItem[]; output_text?: string }
  const output = body.output ?? []
  const calls = output
    .filter((item) => item.type === "function_call" && item.name && item.call_id)
    .map((item) => ({
      name: item.name as string,
      arguments: item.arguments || "{}",
      callId: item.call_id as string,
    }))
  return { text: textFrom(output) || body.output_text || "", output, calls }
}

function textFrom(output: OutputItem[]) {
  const chunks: string[] = []
  for (const item of output) {
    if (typeof item.content === "string") chunks.push(item.content)
    if (Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part.text) chunks.push(part.text)
      }
    }
  }
  return chunks.join("").trim()
}

export async function grokText(input: unknown[]) {
  const turn = await grokRespond(input)
  return turn.text
}
