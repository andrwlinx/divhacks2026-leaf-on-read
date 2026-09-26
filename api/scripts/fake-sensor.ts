import "dotenv/config"

const base = process.env.API_URL || "http://localhost:3000"
const sensorId = process.env.SENSOR_ID || "gus-demo"

let moisture = 70
const step = Number(process.argv[2] || -2)

setInterval(async () => {
  moisture = Math.max(5, Math.min(90, moisture + step))
  const response = await fetch(`${base}/readings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sensorId,
      moisture,
      temp: 23,
      light: 500,
      ts: new Date().toISOString(),
    }),
  })
  console.log(response.status, moisture)
}, 2_000)
