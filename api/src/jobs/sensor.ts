import { demoMode, GUS_ID, GUS_SENSOR } from "../env.ts"
import { demoState } from "../demoState.ts"
import { recordReading, treeById } from "../services/domain.ts"

export function startSensor() {
  if (!demoMode) return
  setInterval(() => {
    void tick()
  }, 2_000)
}

async function tick() {
  const tree = await treeById(GUS_ID).catch(() => null)
  if (!tree) return
  await recordReading({
    sensorId: tree.sensorId || GUS_SENSOR,
    moisture: demoState.moisture,
    temp: 22,
    light: 400,
    time: new Date(),
  })
}
