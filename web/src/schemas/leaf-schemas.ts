import type { CollectionSchema } from 'deepspace/schema'

/**
 * Leaf on Read collections. Tree status and the leaderboard are mirrored from
 * the Leaf on Read API by the worker (src/server/leaf-sync.ts), so only the
 * server writes them; anyone, signed in or not, can watch them live.
 */

const serverOwned = {
  '*': { read: true, create: false, update: false, delete: false },
  viewer: { read: true, create: false, update: false, delete: false },
  member: { read: true, create: false, update: false, delete: false },
  admin: { read: true, create: true, update: true, delete: true },
} as const

export const treesSchema: CollectionSchema = {
  name: 'trees',
  columns: [
    { name: 'treeId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'name', storage: 'text', interpretation: 'plain' },
    { name: 'species', storage: 'text', interpretation: 'plain' },
    { name: 'address', storage: 'text', interpretation: 'plain' },
    { name: 'lat', storage: 'number', interpretation: 'plain' },
    { name: 'lng', storage: 'number', interpretation: 'plain' },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['thirsty', 'ok', 'no_sensor'] } },
    { name: 'moisture', storage: 'number', interpretation: 'plain' },
    { name: 'hasSensor', storage: 'number', interpretation: { kind: 'boolean' } },
    { name: 'claimedBy', storage: 'text', interpretation: 'plain' },
    { name: 'adopters', storage: 'number', interpretation: 'plain' },
    { name: 'lastWateredAt', storage: 'text', interpretation: 'plain' },
    { name: 'threshold', storage: 'number', interpretation: 'plain' },
    { name: 'portraitUrl', storage: 'text', interpretation: 'plain' },
    { name: 'syncedAt', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['treeId'],
  permissions: serverOwned,
}

export const neighborsSchema: CollectionSchema = {
  name: 'neighbors',
  columns: [
    { name: 'leafUserId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'name', storage: 'text', interpretation: 'plain' },
    { name: 'gallons', storage: 'number', interpretation: 'plain' },
    { name: 'streak', storage: 'number', interpretation: 'plain' },
  ],
  uniqueOn: ['leafUserId'],
  permissions: serverOwned,
}

/** The block board: public notes per tree. Neighbors post; the tree posts its own alerts. */
export const notesSchema: CollectionSchema = {
  name: 'notes',
  columns: [
    { name: 'treeId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'text', storage: 'text', interpretation: 'plain', required: true },
    { name: 'kind', storage: 'text', interpretation: { kind: 'select', options: ['note', 'watered', 'tree'] } },
    { name: 'authorName', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
