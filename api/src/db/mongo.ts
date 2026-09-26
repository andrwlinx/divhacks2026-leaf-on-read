import { MongoClient, type Collection, type Db } from "mongodb"

let db: Db | null = null

export async function connectMongo(uri: string) {
  const client = new MongoClient(uri)
  await client.connect()
  db = client.db()
  return db
}

export function database() {
  if (!db) throw new Error("Mongo is not connected")
  return db
}

export function collection<T extends { _id: string }>(name: string): Collection<T> {
  return database().collection<T>(name)
}
