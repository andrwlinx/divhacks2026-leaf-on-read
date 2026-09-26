let moisture = 80
let forceRain = false

export const demoState = {
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
