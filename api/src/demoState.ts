let moisture = 80
let forceRain = false
// When the real Arduino last reported for Gus; while fresh, the simulated sensor stays quiet.
let hardwareAt = 0
const HARDWARE_FRESH_MS = 10_000

export const demoState = {
  markHardwareReading() {
    hardwareAt = Date.now()
  },
  get hardwareLive() {
    return Date.now() - hardwareAt < HARDWARE_FRESH_MS
  },
  get moisture() {
    return moisture
  },
  set moisture(value: number) {
    moisture = Math.max(0, Math.min(100, value))
  },
  armRain() {
    forceRain = true
  },
  peekRain() {
    return forceRain || process.env.DEMO_FORCE_RAIN === "1"
  },
  clearRain() {
    forceRain = false
  },
}
