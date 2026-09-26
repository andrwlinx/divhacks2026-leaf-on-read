// Arduino → Leaf on Read API bridge.
// The firmware (leafonread_firmware_code/) prints one JSON record per line at 115200 baud: telemetry every
// 2s with a calibrated `moisture_avg` (0-100), plus events like "gus_petted". This forwards telemetry to
// POST /readings as Gus's sensor and events to POST /sensors/:id/events.
//
//   npm start                      auto-detect the Arduino's USB port
//   SERIAL_PORT=/dev/cu.usbmodem1101 npm start
//   npm run replay < sample.jsonl  feed recorded lines from stdin (no hardware)

import { createInterface } from "node:readline"
import { ReadlineParser } from "@serialport/parser-readline"
import { SerialPort } from "serialport"

const api = (process.env.LEAF_API_URL || "http://localhost:3000").replace(/\/$/, "")
const sensorId = process.env.SENSOR_ID || "gus-demo" // Gus's sensor id in the API
const baudRate = Number(process.env.BAUD) || 115200

type Telemetry = {
  record_type: "telemetry"
  device_id: string
  moisture_avg: number
  soil_calibrated?: boolean
  uneven_moisture?: boolean
  temperature_c?: number | null
  powered_on?: boolean
  health?: string
}
type DeviceEvent = { record_type: "event"; device_id: string; event: string }

let sent = 0
let lastLog = 0

async function post(path: string, body: unknown) {
  try {
    const response = await fetch(`${api}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) console.error(`${path} → ${response.status} ${await response.text()}`)
    return response.ok
  } catch (error) {
    console.error(`${path} failed: ${error instanceof Error ? error.message : error}`)
    return false
  }
}

async function handle(line: string) {
  const trimmed = line.trim()
  if (!trimmed.startsWith("{")) return // boot noise, partial lines
  let record: Telemetry | DeviceEvent | { record_type?: string }
  try {
    record = JSON.parse(trimmed)
  } catch {
    return
  }
  if (record.record_type === "telemetry") {
    const telemetry = record as Telemetry
    if (telemetry.powered_on === false || typeof telemetry.moisture_avg !== "number") return
    const ok = await post("/readings", {
      sensorId: telemetry.device_id || sensorId,
      moisture: Math.max(0, Math.min(100, telemetry.moisture_avg)),
      temp: telemetry.temperature_c ?? null,
      light: null,
      ts: new Date().toISOString(), // the Arduino only knows its uptime; the laptop adds real time
    })
    if (ok) sent += 1
    if (Date.now() - lastLog > 10_000) {
      lastLog = Date.now()
      console.log(`moisture ${telemetry.moisture_avg}% (${telemetry.health ?? "?"}) → ${api} · ${sent} readings sent`)
    }
  } else if (record.record_type === "event") {
    const event = (record as DeviceEvent).event
    console.log(`event: ${event}`)
    await post(`/sensors/${(record as DeviceEvent).device_id || sensorId}/events`, { event })
  }
}

async function findPort() {
  if (process.env.SERIAL_PORT) return process.env.SERIAL_PORT
  const ports = await SerialPort.list()
  const arduino = ports.find(
    (port) =>
      /arduino/i.test(port.manufacturer ?? "") ||
      /usbmodem|usbserial|wchusbserial|ttyACM|ttyUSB/i.test(port.path),
  )
  return arduino?.path ?? null
}

async function connect() {
  const path = await findPort()
  if (!path) {
    console.log("waiting for the Arduino… (plug it in, or set SERIAL_PORT)")
    setTimeout(() => void connect(), 3_000)
    return
  }
  const port = new SerialPort({ path, baudRate })
  const lines = port.pipe(new ReadlineParser({ delimiter: "\n" }))
  port.on("open", () => console.log(`connected to ${path} at ${baudRate} baud → ${api} as ${sensorId}`))
  lines.on("data", (line: string) => void handle(line))
  port.on("error", (error) => console.error(`serial error: ${error.message}`))
  port.on("close", () => {
    console.log("Arduino disconnected; retrying in 3s (the API's simulated sensor takes over after ~10s)")
    setTimeout(() => void connect(), 3_000)
  })
}

if (process.argv.includes("--stdin")) {
  const input = createInterface({ input: process.stdin })
  for await (const line of input) await handle(line)
  console.log(`replayed; ${sent} readings sent`)
} else {
  await connect()
}
