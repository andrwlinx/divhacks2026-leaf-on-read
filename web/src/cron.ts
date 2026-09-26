/**
 * Cron task definitions — registered into the AppCronRoom DO at construction
 * time (worker.ts). Each task declares EITHER `intervalMinutes` OR
 * `schedule` + `timezone`.
 */

import type { CronTask } from 'deepspace/worker'
import type { Env } from '../worker.js'
import { pullFromLeaf } from './server/leaf-sync.js'

export const tasks: CronTask[] = [
  // Backstop for the API's instant pushes: re-mirror the block every minute.
  { name: 'leaf-pull', intervalMinutes: 1 },
]

export async function runTask(name: string, env: Env): Promise<void> {
  if (name === 'leaf-pull') await pullFromLeaf(env)
}
