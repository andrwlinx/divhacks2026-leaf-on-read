/**
 * The Block Board: every street tree on the block, live.
 *
 * Tree status and the leaderboard are mirrored from the Leaf on Read API into
 * this app's RecordRoom (src/server/leaf-sync.ts), so every open browser sees
 * a pin turn red the moment the sensor dries out. Notes are the neighbors' own
 * public board per tree; the tree posts its alerts there too.
 */

import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AuthOverlay, useAuth, useMutations, usePresenceRoom, useQuery, useUser } from 'deepspace'
import { Droplets, Eye, Hand, Send, Trophy } from 'lucide-react'
import { BlockMap, type MapTree } from '../../components/leaf/BlockMap'
import { leaf, statusMeta, type TreeStatus } from '../../components/leaf/palette'
import { TreeFace } from '../../components/leaf/TreeFace'

type Tree = {
  treeId: string
  name: string | null
  species: string
  address: string
  lat: number
  lng: number
  status: TreeStatus
  moisture: number | null
  hasSensor: boolean
  claimedBy: string | null
  portraitUrl?: string | null
  syncedAt: string
}
type Neighbor = { leafUserId: string; name: string; gallons: number; streak: number }
type Note = { treeId: string; text: string; kind: 'note' | 'watered' | 'tree'; authorName: string | null }

const quickNotes = [
  { text: 'Just watered it 💧', kind: 'watered' as const },
  { text: 'Someone chained a bike to it 🚲', kind: 'note' as const },
  { text: 'Trash in the tree bed 🗑️', kind: 'note' as const },
]

function ago(iso: string | undefined) {
  if (!iso) return ''
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  return `${Math.round(seconds / 3600)}h ago`
}

export default function BlockBoard() {
  const { records: treeRecords, status } = useQuery<Tree>('trees')
  const { records: neighborRecords } = useQuery<Neighbor>('neighbors')
  const { peers } = usePresenceRoom('board:morningside')
  const [params] = useSearchParams()
  // Admin links deep-link a tree with ?tree=<id>.
  const [selectedId, setSelectedId] = useState<string | null>(params.get('tree'))

  const trees = useMemo(() => treeRecords.map((record) => ({ recordId: record.recordId, ...record.data })), [treeRecords])
  const selected =
    trees.find((tree) => tree.treeId === selectedId) ??
    trees.find((tree) => tree.hasSensor) ??
    trees[0] ??
    null
  const thirsty = trees.filter((tree) => tree.status === 'thirsty').length
  const board = [...neighborRecords.map((record) => record.data)].sort((a, b) => b.gallons - a.gallons)
  const totalGallons = board.reduce((sum, row) => sum + row.gallons, 0)

  return (
    <div className="flex h-full flex-col lg:grid lg:grid-cols-[1fr_420px]">
      <section className="relative h-[55vh] shrink-0 lg:h-full">
        <BlockMap trees={trees as MapTree[]} selectedId={selected?.treeId ?? null} onSelect={setSelectedId} />

        <div className="pointer-events-none absolute left-3 right-3 top-3 z-[500] flex flex-wrap items-start gap-2">
          <div className="pointer-events-auto rounded-2xl bg-white/95 px-4 py-3 shadow-lg">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span className="leaf-live-dot inline-block h-2 w-2 rounded-full" style={{ background: leaf.thirsty }} />
              Live · Morningside Heights
            </div>
            <div className="mt-1 text-lg font-extrabold text-foreground">
              {status === 'loading'
                ? 'Waking the trees up…'
                : thirsty > 0
                  ? `${thirsty === 1 ? '1 tree needs' : `${thirsty} trees need`} water right now`
                  : 'Every tree on the block is happy'}
            </div>
          </div>
          <div
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-2 text-sm font-bold shadow-lg"
            style={{ color: leaf.leafDeep }}
            data-testid="presence-count"
          >
            <Eye className="h-4 w-4" aria-hidden />
            {peers.length + 1} watching now
          </div>
        </div>
      </section>

      <aside className="flex flex-col gap-4 overflow-y-auto p-4 lg:border-l lg:border-border">
        {selected ? <TreeCard tree={selected} /> : <EmptyCard loading={status === 'loading'} />}

        <div className="rounded-3xl bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Trophy className="h-5 w-5" style={{ color: '#f6c453' }} aria-hidden />
              Block leaderboard
            </h2>
            <span className="rounded-full px-3 py-1 text-sm font-extrabold" style={{ background: leaf.waterSoft, color: leaf.water }}>
              {totalGallons} gal
            </span>
          </div>
          <ol className="mt-3 flex flex-col gap-2">
            {board.length === 0 && <li className="text-sm text-muted-foreground">No waterings yet. First bucket gets the crown 👑</li>}
            {board.slice(0, 6).map((row, index) => (
              <li key={row.leafUserId} className="flex items-center gap-3 rounded-2xl bg-background px-3 py-2">
                <span className="w-6 text-center text-lg">{['🥇', '🥈', '🥉'][index] ?? index + 1}</span>
                <span className="flex-1 font-bold">{row.name}</span>
                {row.streak > 0 && <span className="text-xs text-muted-foreground">🔥 {row.streak}d</span>}
                <span className="font-extrabold" style={{ color: leaf.water }}>
                  {row.gallons} gal
                </span>
              </li>
            ))}
          </ol>
        </div>

        <p className="px-2 pb-2 text-center text-xs text-muted-foreground">
          Trees text their neighbors when they&apos;re thirsty. Get the Leaf on Read app to adopt one.
        </p>
      </aside>
    </div>
  )
}

function EmptyCard({ loading }: { loading: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl bg-card p-8 text-center shadow-sm">
      <TreeFace mood="sleepy" size={90} />
      <p className="text-muted-foreground">{loading ? 'Connecting to the block…' : 'No trees synced yet.'}</p>
    </div>
  )
}

function TreeCard({ tree }: { tree: Tree }) {
  const meta = statusMeta(tree.status)
  const pct = tree.moisture === null || tree.moisture === undefined ? null : Math.round(tree.moisture)
  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm" data-testid="tree-card">
      <div className="flex items-center gap-4 rounded-2xl p-3" style={{ background: meta.soft }}>
        {tree.portraitUrl ? (
          <div className="relative h-24 w-24 shrink-0">
            <img
              src={tree.portraitUrl}
              alt={`Portrait of ${tree.name ?? tree.species}`}
              className="h-24 w-24 rounded-full object-cover shadow-sm"
            />
            <div className="absolute -bottom-1 -right-1 overflow-hidden rounded-full border-2 border-white bg-white">
              <TreeFace mood={meta.mood} size={30} />
            </div>
          </div>
        ) : (
          <TreeFace mood={meta.mood} size={84} />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">{tree.name ?? tree.species}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {tree.species} · {tree.address}
          </p>
          <span
            className="mt-1 inline-block rounded-full bg-white px-2.5 py-0.5 text-xs font-extrabold"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
        </div>
      </div>

      {tree.hasSensor && (
        <div>
          <div className="flex items-baseline justify-between">
            <span className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
              <Droplets className="h-4 w-4" style={{ color: leaf.water }} aria-hidden />
              Soil moisture
            </span>
            <span className="text-2xl font-extrabold">{pct === null ? '—' : `${pct}%`}</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct ?? 0}%`, background: meta.color }}
            />
          </div>
          <p className="mt-1 text-right text-xs text-muted-foreground">updated {ago(tree.syncedAt)}</p>
        </div>
      )}

      {tree.claimedBy && (
        <div className="flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold" style={{ background: '#fff3d1', color: leaf.soil }}>
          <Hand className="h-4 w-4" aria-hidden />
          {tree.claimedBy} is on it
        </div>
      )}

      <NotesFeed tree={tree} />
    </div>
  )
}

function NotesFeed({ tree }: { tree: Tree }) {
  const { isSignedIn } = useAuth()
  const { user } = useUser()
  const { records } = useQuery<Note>('notes', {
    where: { treeId: tree.treeId },
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: 25,
  })
  const { create, ready } = useMutations<Note>('notes')
  const [draft, setDraft] = useState('')
  const [signIn, setSignIn] = useState(false)
  const author = user?.name || user?.email?.split('@')[0] || 'A neighbor'

  function post(text: string, kind: Note['kind']) {
    if (!isSignedIn) {
      setSignIn(true)
      return
    }
    if (!text.trim() || !ready) return
    void create({ treeId: tree.treeId, text: text.trim(), kind, authorName: author })
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-extrabold">Block board</h2>

      <div className="flex flex-wrap gap-2">
        {quickNotes.map((quick) => (
          <button
            key={quick.text}
            onClick={() => post(quick.text, quick.kind)}
            disabled={isSignedIn && !ready}
            className="rounded-full px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: leaf.mint, color: leaf.leafDeep }}
          >
            {quick.text}
          </button>
        ))}
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          post(draft, 'note')
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={280}
          placeholder={isSignedIn ? `Leave a note for ${tree.name ?? 'this tree'}…` : 'Sign in to leave a note'}
          className="min-w-0 flex-1 rounded-full bg-background px-4 py-2.5 text-sm outline-none focus:ring-2"
          style={{ ['--tw-ring-color' as string]: leaf.leaf }}
        />
        <button
          type="submit"
          aria-label="Post note"
          disabled={isSignedIn && (!ready || !draft.trim())}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-40"
          style={{ background: leaf.leaf }}
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>

      <ul className="flex flex-col gap-2" data-testid="notes-feed">
        {records.length === 0 && <li className="text-sm text-muted-foreground">No notes yet. Say hi to {tree.name ?? 'this tree'}.</li>}
        {records.map((note) => (
          <li
            key={note.recordId}
            className="rounded-2xl px-3 py-2 text-sm"
            style={{
              background: note.data.kind === 'tree' ? leaf.mint : note.data.kind === 'watered' ? leaf.waterSoft : leaf.cream,
            }}
          >
            <div className="flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground">
              <span>{note.data.kind === 'tree' ? `🌳 ${tree.name ?? 'The tree'}` : note.data.authorName ?? 'A neighbor'}</span>
              <span>{ago(new Date(note.createdAt).toISOString())}</span>
            </div>
            <p className="mt-0.5 text-foreground">{note.data.text}</p>
          </li>
        ))}
      </ul>

      {signIn && !isSignedIn && <AuthOverlay onClose={() => setSignIn(false)} />}
    </div>
  )
}
