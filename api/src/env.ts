export const demoMode = process.env.DEMO_MODE === "1"
export const port = Number(process.env.PORT) || 3000

export const windowMs = demoMode ? 3_000 : 60 * 60 * 1000
export const jobEveryMs = demoMode ? 1_000 : 60_000
// Real phones get these texts; a 2-minute demo cooldown keeps a stage demo from buzzing four times.
export const cooldownMs = demoMode ? 2 * 60_000 : 6 * 60 * 60 * 1000
export const claimMs = demoMode ? 2 * 60 * 1000 : 2 * 60 * 60 * 1000
export const wateringGraceMs = demoMode ? 30_000 : 0

export const xaiModel = process.env.XAI_MODEL || "grok-4.20-0309-non-reasoning"
export const publicApiUrl = (process.env.PUBLIC_API_URL || "").replace(/\/$/, "")

export const GUS_ID = "gus"
export const GUS_SENSOR = "gus-demo"
export const GUS_BLOCK = "morningside"
