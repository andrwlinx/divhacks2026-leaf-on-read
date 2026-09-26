/**
 * Admin overview: every tree on the block, what needs attention, board
 * moderation, and the health of the API → board sync.
 *
 * Gated twice: (protected)/ requires sign-in, and this page renders only for
 * the `admin` role (the app owner is pinned to admin). The real boundary is
 * server-side RBAC: only admins may delete notes, and the tree/neighbor
 * collections are read-only for everyone but the worker.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCronMonitor, useMutations, usePresenceRoom, useQuery, useUser } from 'deepspace'
import { AlertTriangle, Droplets, Hand, RefreshCw, Search, Trash2, Users, Wifi, WifiOff } from 'lucide-react'
import { leaf, statusMeta, type TreeStatus } from '../../../components/leaf/palette'
import { TreeFace } from '../../../components/leaf/TreeFace'
import { SCOPE_ID } from '../../../constants'

type Tree = {
  treeId: string
  name: string | null
  species: string
  address: string
  status: TreeStatus
  moisture: number | null
  hasSensor: boolean
  claimedBy: string | null
  adopters: number | null
  lastWateredAt: string | null
  threshold: number | null
  syncedAt: string
}
type Neighbor = { leafUserId: string; name: string; gallons: number; streak: number }
type Note = { treeId: string; text: string; kind: 'note' | 'watered' | 'tree'; authorName: string | null }
type Filter = 'all' | 'thirsty' | 'sensor' | 'unadopted'

const OFFLINE_MS = 90_000

function ago(value: string | Date | null | undefined) {
  if (!value) return '—'
  const ms = Date.now() - new Date(value).getTime()
  if (Number.isNaN(ms)) return '—'
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86_400)}d ago`
}

export default function AdminPage() {
  const { user } = useUser()
  if (!user) return <div className="p-10 text-center text-muted-foreground">Loading…</div>
  if (user.role !== 'admin') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <TreeFace mood="sleepy" size={100} />
        <h1 className="text-xl font-extrabold">Admins only</h1>
        <p className="text-muted-foreground">This overview is for the block&apos;s organizers.</p>
        <Link to="/home" className="font-bold text-primary">
          Back to the live map
        </Link>
      </div>
    )
  }
  return <Overview />
}

function Overview() {
  const { records: treeRecords } = useQuery<Tree>('trees')
  const { records: neighborRecords } = useQuery<Neighbor>('neighbors')
  const { records: noteRecords } = useQuery<Note>('notes', { orderBy: 'createdAt', orderDir: 'desc', limit: 100 })
  const { peers } = usePresenceRoom('board:morningside')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const trees = useMemo(() => treeRecords.map((record) => record.data), [treeRecords])
  const offline = (tree: Tree) => tree.hasSensor && Date.now() - new Date(tree.syncedAt).getTime() > OFFLINE_MS
  const thirsty = trees.filter((tree) => tree.status === 'thirsty').sort((a, b) => (a.moisture ?? 0) - (b.moisture ?? 0))
  const sensors = trees.filter((tree) => tree.hasSensor)
  const offlineSensors = sensors.filter(offline)
  const unadopted = trees.filter((tree) => !tree.adopters)
  const claimed = trees.filter((tree) => tree.claimedBy)
  const gallons = neighborRecords.reduce((sum, record) => sum + record.data.gallons, 0)
  const lastSync = trees.reduce<string | null>((latest, tree) => (!latest || tree.syncedAt > latest ? tree.syncedAt : latest), null)
  const names = new Map(trees.map((tree) => [tree.treeId, tree.name ?? tree.species]))

  const shown = trees
    .filter((tree) =>
      filter === 'thirsty' ? tree.status === 'thirsty'
      : filter === 'sensor' ? tree.hasSensor
      : filter === 'unadopted' ? !tree.adopters
      : true,
    )
    .filter((tree) => {
      const q = search.trim().toLowerCase()
      return !q || `${tree.name ?? ''} ${tree.species} ${tree.address}`.toLowerCase().includes(q)
    })
    .sort((a, b) => Number(b.hasSensor) - Number(a.hasSensor) || (a.name ?? a.species).localeCompare(b.name ?? b.species))

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6" data-testid="admin-overview">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Admin · Morningside Heights</p>
          <h1 className="text-3xl font-extrabold">Block overview</h1>
        </div>
        <p className="text-sm text-muted-foreground">Last sync {ago(lastSync)}</p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Trees" value={trees.length} />
        <Stat label="With sensors" value={sensors.length} />
        <Stat label="Thirsty now" value={thirsty.length} tone={thirsty.length ? leaf.thirsty : undefined} />
        <Stat label="Someone's on it" value={claimed.length} />
        <Stat label="Gallons poured" value={gallons} tone={leaf.water} />
        <Stat label="Watching the map" value={peers.length + 1} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Needs attention" icon={<AlertTriangle className="h-4 w-4" style={{ color: leaf.thirsty }} />}>
          {thirsty.length + offlineSensors.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing urgent. Every sensor tree is watered and reporting.</p>
          )}
          {thirsty.map((tree) => (
            <Row key={`t-${tree.treeId}`} tree={tree} detail={`${tree.moisture ?? '—'}% soil${tree.claimedBy ? ` · ${tree.claimedBy} is on it` : ' · nobody on it yet'}`} />
          ))}
          {offlineSensors.map((tree) => (
            <Row key={`o-${tree.treeId}`} tree={tree} detail={`Sensor silent since ${ago(tree.syncedAt)}`} icon={<WifiOff className="h-4 w-4 text-muted-foreground" />} />
          ))}
          {unadopted.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {unadopted.length} of {trees.length} trees have no adopter yet.
            </p>
          )}
        </Panel>

        <SyncPanel sensors={sensors.length} offline={offlineSensors.length} />

        <Panel title="Top neighbors" icon={<Users className="h-4 w-4" style={{ color: leaf.leafDeep }} />}>
          {[...neighborRecords]
            .sort((a, b) => b.data.gallons - a.data.gallons)
            .slice(0, 6)
            .map((record, index) => (
              <div key={record.recordId} className="flex items-center gap-2 rounded-xl bg-background px-3 py-2 text-sm">
                <span className="w-5 text-center">{['🥇', '🥈', '🥉'][index] ?? index + 1}</span>
                <span className="flex-1 font-bold">{record.data.name}</span>
                {record.data.streak > 0 && <span className="text-xs text-muted-foreground">🔥 {record.data.streak}d</span>}
                <span className="font-extrabold" style={{ color: leaf.water }}>{record.data.gallons} gal</span>
              </div>
            ))}
        </Panel>
      </section>

      <section className="rounded-3xl bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-extrabold">All trees</h2>
          {(['all', 'thirsty', 'sensor', 'unadopted'] as Filter[]).map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className="rounded-full px-3 py-1.5 text-xs font-bold capitalize"
              style={filter === value ? { background: leaf.leafDeep, color: '#fff' } : { background: leaf.cream, color: leaf.ink }}
            >
              {value === 'sensor' ? 'with sensor' : value}
            </button>
          ))}
          <label className="flex items-center gap-2 rounded-full bg-background px-3 py-1.5">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, species, street…"
              className="w-40 bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Tree</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Soil</th>
                <th className="py-2 pr-3">Adopters</th>
                <th className="py-2 pr-3">Last watered</th>
                <th className="py-2 pr-3">On it</th>
                <th className="py-2">Sensor</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((tree) => {
                const meta = statusMeta(tree.status)
                return (
                  <tr key={tree.treeId} className="border-t border-border">
                    <td className="py-2 pr-3">
                      <Link to={`/home?tree=${encodeURIComponent(tree.treeId)}`} className="font-bold hover:underline">
                        {tree.name ?? tree.species}
                      </Link>
                      <div className="text-xs text-muted-foreground">{tree.name ? `${tree.species} · ` : ''}{tree.address}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-extrabold" style={{ background: meta.soft, color: meta.color }}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-bold">
                      {tree.moisture === null || tree.moisture === undefined ? '—' : `${Math.round(tree.moisture)}%`}
                      {tree.threshold ? <span className="ml-1 text-xs font-normal text-muted-foreground">/ {tree.threshold}%</span> : null}
                    </td>
                    <td className="py-2 pr-3">{tree.adopters ?? 0}</td>
                    <td className="py-2 pr-3">{ago(tree.lastWateredAt)}</td>
                    <td className="py-2 pr-3">{tree.claimedBy ?? '—'}</td>
                    <td className="py-2">
                      {!tree.hasSensor ? (
                        <span className="text-muted-foreground">—</span>
                      ) : offline(tree) ? (
                        <span className="flex items-center gap-1 text-muted-foreground"><WifiOff className="h-4 w-4" /> silent</span>
                      ) : (
                        <span className="flex items-center gap-1 font-bold" style={{ color: leaf.leaf }}><Wifi className="h-4 w-4" /> live</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No trees match.</p>}
        </div>
      </section>

      <Moderation notes={noteRecords} names={names} />
    </div>
  )
}

function SyncPanel({ sensors, offline }: { sensors: number; offline: number }) {
  const { tasks, history, connected, canWrite, trigger } = useCronMonitor(SCOPE_ID)
  const [result, setResult] = useState<string | null>(null)
  const pull = tasks.find((task) => task.name === 'leaf-pull')
  const last = history.find((entry) => entry.taskName === 'leaf-pull')
  const failures = history.filter((entry) => entry.taskName === 'leaf-pull' && !entry.success).length

  return (
    <Panel title="Sync health" icon={<RefreshCw className="h-4 w-4" style={{ color: leaf.water }} />}>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Live pushes</dt>
        <dd className="font-bold">{sensors - offline}/{sensors} sensors reporting</dd>
        <dt className="text-muted-foreground">Backstop pull</dt>
        <dd className="font-bold">{!connected ? 'connecting…' : pull?.paused ? 'paused' : 'every minute'}</dd>
        <dt className="text-muted-foreground">Last pull</dt>
        <dd className="font-bold">
          {last ? `${last.success ? 'ok' : 'failed'} · ${last.durationMs}ms` : 'not yet'}
        </dd>
        <dt className="text-muted-foreground">Recent failures</dt>
        <dd className="font-bold" style={{ color: failures ? leaf.thirsty : undefined }}>{failures}</dd>
      </dl>
      <button
        disabled={!canWrite}
        onClick={async () => {
          setResult('syncing…')
          const receipt = await trigger('leaf-pull')
          setResult(receipt.ok ? 'synced' : (receipt.error ?? receipt.reason))
        }}
        className="mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
        style={{ background: leaf.water }}
      >
        <RefreshCw className="h-4 w-4" aria-hidden /> Sync now
      </button>
      {result && <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">{result}</p>}
    </Panel>
  )
}

function Moderation({
  notes,
  names,
}: {
  notes: { recordId: string; createdAt: string; data: Note }[]
  names: Map<string, string>
}) {
  const { remove, ready } = useMutations<Note>('notes')
  const [kind, setKind] = useState<'all' | Note['kind']>('all')
  const shown = notes.filter((note) => kind === 'all' || note.data.kind === kind)

  return (
    <section className="rounded-3xl bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-extrabold">Block board moderation</h2>
        {(['all', 'note', 'watered', 'tree'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setKind(value)}
            className="rounded-full px-3 py-1.5 text-xs font-bold capitalize"
            style={kind === value ? { background: leaf.leafDeep, color: '#fff' } : { background: leaf.cream, color: leaf.ink }}
          >
            {value === 'tree' ? 'tree alerts' : value === 'note' ? 'neighbor notes' : value}
          </button>
        ))}
        <button
          disabled={!ready || shown.length === 0}
          onClick={() => {
            if (!window.confirm(`Delete ${shown.length} ${kind === 'all' ? '' : `${kind} `}notes from the board?`)) return
            for (const note of shown) remove(note.recordId)
          }}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
          style={{ background: leaf.thirsty }}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear {shown.length}
        </button>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {shown.length === 0 && <li className="text-sm text-muted-foreground">No notes.</li>}
        {shown.map((note) => (
          <li key={note.recordId} className="flex items-start gap-3 rounded-2xl bg-background px-3 py-2 text-sm">
            <span className="mt-0.5">{note.data.kind === 'tree' ? '🌳' : note.data.kind === 'watered' ? '💧' : '📝'}</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-muted-foreground">
                {note.data.kind === 'tree' ? names.get(note.data.treeId) ?? note.data.treeId : note.data.authorName ?? 'A neighbor'}
                {' on '}
                {names.get(note.data.treeId) ?? note.data.treeId} · {ago(note.createdAt)}
              </div>
              <p className="text-foreground">{note.data.text}</p>
            </div>
            <button
              aria-label="Delete note"
              disabled={!ready}
              onClick={() => remove(note.recordId)}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <div className="text-3xl font-extrabold" style={{ color: tone ?? leaf.ink }}>{value}</div>
      <div className="text-xs font-bold text-muted-foreground">{label}</div>
    </div>
  )
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-3xl bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-extrabold">{icon}{title}</h2>
      {children}
    </div>
  )
}

function Row({ tree, detail, icon }: { tree: Tree; detail: string; icon?: React.ReactNode }) {
  const meta = statusMeta(tree.status)
  return (
    <Link to={`/home?tree=${encodeURIComponent(tree.treeId)}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-background">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full" style={{ background: meta.soft }}>
        <TreeFace mood={meta.mood} size={40} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{tree.name ?? tree.species}</div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
      {icon ?? (tree.claimedBy ? <Hand className="h-4 w-4" style={{ color: leaf.soil }} /> : <Droplets className="h-4 w-4" style={{ color: leaf.thirsty }} />)}
    </Link>
  )
}
