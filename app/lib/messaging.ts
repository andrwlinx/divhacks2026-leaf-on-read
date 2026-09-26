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

/** "I can't make it after all": drop your claim so the tree asks the rest of its crew again. */
export async function cancelClaim(treeId: string, userId: string) {
  await api(`/trees/${treeId}/claim`, { method: "DELETE", body: JSON.stringify({ userId }) })
}
