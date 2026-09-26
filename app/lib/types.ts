export type TreeStatus = "thirsty" | "ok" | "no_sensor"

export type User = {
  _id: string
  phone: string
  name: string
  blockId: string
  language: string
  userCode: string
}

export type TreePin = {
  id: string
  name: string | null
  species: string
  lat: number
  lng: number
  status: TreeStatus
  blockId: string
  sensorId: string | null
  address: string
}

export type TreeDetail = TreePin & {
  persona: string | null
  threshold: number
  claim: { userId: string; name: string; until: string } | null
  latest: { moisture: number; temp: number | null; light: number | null; t: string } | null
  caretakers: { id: string; name: string }[]
}

export type Reading = { t: string; moisture: number }

export type AlertItem = {
  _id: string
  userId: string
  treeId: string
  treeName: string
  type: string
  text: string
  voiceUrl?: string
  at: string
}

export type ChatMessage = {
  _id: string
  role: "user" | "tree"
  text: string
  at: string
}

export const languages = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "zh", label: "中文" },
  { code: "bn", label: "বাংলা" },
  { code: "ru", label: "Русский" },
  { code: "ht", label: "Kreyòl ayisyen" },
  { code: "ko", label: "한국어" },
  { code: "ar", label: "العربية" },
]

export function pinColor(status: TreeStatus) {
  if (status === "thirsty") return "#C44536"
  if (status === "ok") return "#2D6A4F"
  return "#8D99AE"
}
