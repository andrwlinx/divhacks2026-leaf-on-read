/**
 * Landing page — a STATIC page (no providers, no WebSocket). The live board
 * lives at /home under (app)/.
 */

import { Link } from 'react-router-dom'
import { TreeFace } from '../components/leaf/TreeFace'

export default function Landing() {
  return (
    <div
      data-testid="static-landing"
      className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <div className="rounded-2xl bg-card px-4 py-2 text-sm font-bold text-primary shadow-sm">psst… I get thirsty 💧</div>
      <TreeFace mood="happy" size={150} />
      <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">Leaf on Read</h1>
      <p className="max-w-md text-lg text-muted-foreground">
        NYC street trees that text their neighbors when they&apos;re thirsty. Watch the block live: who&apos;s
        dry, who&apos;s on it, and what neighbors are saying.
      </p>
      <Link
        to="/home"
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-md transition-opacity hover:opacity-90"
      >
        Open the live block map
      </Link>
    </div>
  )
}
