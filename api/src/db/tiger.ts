import pg from "pg"

export const pool = new pg.Pool({
  connectionString: process.env.TIGER_DATABASE_URL,
})

const statements = [
  `CREATE EXTENSION IF NOT EXISTS timescaledb`,
  `CREATE TABLE IF NOT EXISTS readings (
    time TIMESTAMPTZ NOT NULL,
    sensor_id TEXT NOT NULL,
    tree_id TEXT,
    moisture DOUBLE PRECISION,
    temp DOUBLE PRECISION,
    light DOUBLE PRECISION
  )`,
  `SELECT create_hypertable('readings', by_range('time'), if_not_exists => TRUE)`,
  `CREATE INDEX IF NOT EXISTS readings_tree_time ON readings (tree_id, time DESC)`,
  `CREATE MATERIALIZED VIEW IF NOT EXISTS readings_hourly
   WITH (timescaledb.continuous) AS
   SELECT time_bucket(INTERVAL '1 hour', time) AS bucket,
          tree_id,
          avg(moisture) AS moisture
   FROM readings
   GROUP BY bucket, tree_id
   WITH NO DATA`,
  `SELECT add_continuous_aggregate_policy(
     'readings_hourly',
     start_offset => INTERVAL '30 days',
     end_offset => INTERVAL '1 hour',
     schedule_interval => INTERVAL '1 hour',
     if_not_exists => TRUE
   )`,
  // One compressed segment per tree. Chunks newer than a day stay writable for the live demo.
  `ALTER TABLE readings SET (
     timescaledb.compress,
     timescaledb.compress_segmentby = 'tree_id',
     timescaledb.compress_orderby = 'time DESC'
   )`,
  `SELECT add_compression_policy(
     'readings',
     compress_after => INTERVAL '1 day',
     if_not_exists => TRUE
   )`,
]

export async function migrateTiger() {
  for (const statement of statements) {
    try {
      await pool.query(statement)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/already exists/i.test(message)) continue
      throw error
    }
  }
}

export type ReadingRow = {
  t: string
  moisture: number
  temp: number | null
  light: number | null
}

export async function insertReading(row: {
  time: Date
  sensorId: string
  treeId: string | null
  moisture: number
  temp: number | null
  light: number | null
}) {
  await pool.query(
    `INSERT INTO readings (time, sensor_id, tree_id, moisture, temp, light)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.time, row.sensorId, row.treeId, row.moisture, row.temp, row.light],
  )
}

export async function firstReadingSince(treeId: string, since: Date) {
  const result = await pool.query<{ moisture: number; time: Date }>(
    `SELECT moisture, time FROM readings
     WHERE tree_id = $1 AND time >= $2
     ORDER BY time ASC LIMIT 1`,
    [treeId, since],
  )
  return result.rows[0] ?? null
}

export async function latestReading(treeId: string) {
  const result = await pool.query<{
    moisture: number
    temp: number | null
    light: number | null
    time: Date
  }>(
    `SELECT moisture, temp, light, time
     FROM readings WHERE tree_id = $1
     ORDER BY time DESC LIMIT 1`,
    [treeId],
  )
  return result.rows[0] ?? null
}

export async function readingsSince(treeId: string, since: Date) {
  const result = await pool.query<{ time: Date; moisture: number; temp: number | null }>(
    `SELECT time, moisture, temp FROM readings
     WHERE tree_id = $1 AND time >= $2
     ORDER BY time ASC`,
    [treeId, since],
  )
  return result.rows
}

export async function minuteBuckets(treeId: string, since: Date) {
  const result = await pool.query<{ t: Date; moisture: number }>(
    `SELECT time_bucket('1 minute', time) AS t, avg(moisture) AS moisture
     FROM readings
     WHERE tree_id = $1 AND time >= $2
     GROUP BY t
     ORDER BY t ASC`,
    [treeId, since],
  )
  return result.rows
}

export async function hourlyBuckets(treeId: string, since: Date) {
  try {
    const result = await pool.query<{ t: Date; moisture: number }>(
      `SELECT bucket AS t, moisture FROM readings_hourly
       WHERE tree_id = $1 AND bucket >= $2
       ORDER BY bucket ASC`,
      [treeId, since],
    )
    return result.rows
  } catch {
    const result = await pool.query<{ t: Date; moisture: number }>(
      `SELECT time_bucket('1 hour', time) AS t, avg(moisture) AS moisture
       FROM readings
       WHERE tree_id = $1 AND time >= $2
       GROUP BY t
       ORDER BY t ASC`,
      [treeId, since],
    )
    return result.rows
  }
}
