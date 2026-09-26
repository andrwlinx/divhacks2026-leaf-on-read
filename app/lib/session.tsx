import * as SecureStore from "expo-secure-store"
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api"
import type { AlertItem, TreeStatus, User } from "@/lib/types"

const KEY = "leaf-user"

type Session = {
  ready: boolean
  user: User | null
  demoMode: boolean
  banner: AlertItem | null
  dismissBanner: () => void
  pinOverrides: Record<string, TreeStatus>
  setPin: (id: string, status: TreeStatus) => void
  reconcilePins: (rows: { id: string; status: TreeStatus }[]) => void
  saveUser: (user: User) => Promise<void>
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [banner, setBanner] = useState<AlertItem | null>(null)
  const [pinOverrides, setPinOverrides] = useState<Record<string, TreeStatus>>({})

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((raw) => {
        if (raw) setUser(JSON.parse(raw) as User)
      })
      .finally(() => setReady(true))
    api<{ demoMode: boolean }>("/health")
      .then((health) => setDemoMode(Boolean(health.demoMode)))
      .catch(() => setDemoMode(false))
  }, [])

  useEffect(() => {
    if (!user) return
    let cursor = new Date().toISOString()
    let stopped = false
    const poll = async () => {
      try {
        const rows = await api<AlertItem[]>(
          `/users/${user._id}/alerts?since=${encodeURIComponent(cursor)}`,
        )
        if (stopped || rows.length === 0) return
        cursor = rows[rows.length - 1].at
        setBanner(rows[rows.length - 1])
      } catch {
        // The map still works if a poll misses.
      }
    }
    const timer = setInterval(poll, 2000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [user])

  const value = useMemo<Session>(
    () => ({
      ready,
      user,
      demoMode,
      banner,
      dismissBanner: () => setBanner(null),
      pinOverrides,
      setPin: (id, status) => setPinOverrides((current) => ({ ...current, [id]: status })),
      reconcilePins: (rows) =>
        setPinOverrides((current) => {
          const next = { ...current }
          let changed = false
          for (const row of rows) {
            if (next[row.id] === row.status) {
              delete next[row.id]
              changed = true
            }
          }
          return changed ? next : current
        }),
      saveUser: async (next) => {
        await SecureStore.setItemAsync(KEY, JSON.stringify(next))
        setUser(next)
      },
    }),
    [ready, user, demoMode, banner, pinOverrides],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error("Session missing")
  return session
}
