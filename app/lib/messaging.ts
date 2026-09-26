import { api } from "@/lib/api"
import type { useRouter } from "expo-router"

type Router = ReturnType<typeof useRouter>

/** Open (or create) a 1:1 conversation with another neighbor and navigate to it. */
export async function messageNeighbor(router: Router, userId: string, otherUserId: string) {
  const { id } = await api<{ id: string }>("/threads/dm", {
    method: "POST",
    body: JSON.stringify({ userId, otherUserId }),
  })
  router.push({ pathname: "/thread/[id]", params: { id } })
}

export function openCrew(router: Router, treeId: string) {
  router.push({ pathname: "/thread/[id]", params: { id: `crew:${treeId}` } })
}
