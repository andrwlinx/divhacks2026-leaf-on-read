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
  // The real sensor is plugged in and reporting; don't fight it. Resumes ~10s after it goes quiet.
  if (demoState.hardwareLive) return
  const tree = await treeById(GUS_ID).catch(() => null)
  if (!tree) return
  // Checked on the tree in Mongo too, so every API instance sharing the database yields to the hardware.
  if (tree.hardwareAt && Date.now() - Date.parse(tree.hardwareAt) < 10_000) return
  await recordReading({
    sensorId: tree.sensorId || GUS_SENSOR,
    moisture: demoState.moisture,
    temp: 22,
    light: 400,
    time: new Date(),
  })
}
