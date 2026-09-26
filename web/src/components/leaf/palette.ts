export type TreeStatus = 'thirsty' | 'ok' | 'no_sensor'
export type Mood = 'happy' | 'thirsty' | 'sleepy'

export const leaf = {
  ink: '#1f3a2b',
  inkSoft: '#5b6b5f',
  cream: '#f7f3e8',
  line: '#ede6d6',
  leaf: '#3fa66b',
  leafDeep: '#1f6b45',
  mint: '#ddf3e4',
  water: '#3b9eea',
  waterSoft: '#dceffd',
  thirsty: '#f2735b',
  thirstySoft: '#fde3dc',
  sleepy: '#8fa89a',
  sleepySoft: '#ecf0ec',
  soil: '#8a6a4f',
  blush: '#ff9aa2',
}

export function statusMeta(status: TreeStatus) {
  if (status === 'thirsty') return { label: 'Thirsty', color: leaf.thirsty, soft: leaf.thirstySoft, mood: 'thirsty' as Mood }
  if (status === 'ok') return { label: 'Happy', color: leaf.leaf, soft: leaf.mint, mood: 'happy' as Mood }
  return { label: 'No sensor', color: leaf.sleepy, soft: leaf.sleepySoft, mood: 'sleepy' as Mood }
}
