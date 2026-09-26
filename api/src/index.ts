import "dotenv/config"
import { serve } from "@hono/node-server"
import { createApp } from "./app.ts"
import { connectMongo } from "./db/mongo.ts"
import { migrateTiger } from "./db/tiger.ts"
import { port } from "./env.ts"
import { startSensor } from "./jobs/sensor.ts"
import { startThirst } from "./jobs/thirst.ts"

const mongoUri = process.env.MONGODB_URI
const tigerUri = process.env.TIGER_DATABASE_URL
if (!mongoUri || !tigerUri) {
  throw new Error("MONGODB_URI and TIGER_DATABASE_URL are required")
}

await connectMongo(mongoUri)
await migrateTiger()

const app = createApp()
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`API listening on http://0.0.0.0:${info.port}`)
})

startSensor()
startThirst()
