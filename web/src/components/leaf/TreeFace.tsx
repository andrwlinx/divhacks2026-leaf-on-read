import { leaf, type Mood } from './palette'

const canopy: Record<Mood, { base: string; light: string }> = {
  happy: { base: '#4cb872', light: '#74d394' },
  thirsty: { base: '#b9c45c', light: '#d3db85' },
  sleepy: { base: '#8fb39a', light: '#afcab7' },
}

/** The Leaf on Read mascot (same drawing as the phone app): a street tree whose face shows how it's doing. */
export function TreeFace({ mood = 'happy', size = 96 }: { mood?: Mood; size?: number }) {
  const tone = canopy[mood]
  const ink = leaf.ink
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 100 110" aria-hidden>
      <ellipse cx={50} cy={101} rx={28} ry={5} fill="rgba(31,58,43,0.10)" />
      <rect x={43} y={70} width={14} height={30} rx={6} fill={leaf.soil} />
      <circle cx={28} cy={50} r={21} fill={tone.base} />
      <circle cx={72} cy={50} r={21} fill={tone.base} />
      <circle cx={50} cy={32} r={26} fill={tone.base} />
      <circle cx={50} cy={56} r={27} fill={tone.base} />
      <circle cx={40} cy={22} r={8} fill={tone.light} opacity={0.8} />
      {mood === 'happy' && (
        <>
          <circle cx={41} cy={50} r={3.4} fill={ink} />
          <circle cx={59} cy={50} r={3.4} fill={ink} />
          <circle cx={42.2} cy={48.8} r={1.1} fill="#fff" />
          <circle cx={60.2} cy={48.8} r={1.1} fill="#fff" />
          <path d="M44 58 Q50 64.5 56 58" stroke={ink} strokeWidth={2.6} fill="none" strokeLinecap="round" />
          <circle cx={34} cy={57} r={4.2} fill={leaf.blush} opacity={0.65} />
          <circle cx={66} cy={57} r={4.2} fill={leaf.blush} opacity={0.65} />
        </>
      )}
      {mood === 'thirsty' && (
        <>
          <path d="M36 45 L45 47.5" stroke={ink} strokeWidth={2.2} strokeLinecap="round" />
          <path d="M64 45 L55 47.5" stroke={ink} strokeWidth={2.2} strokeLinecap="round" />
          <circle cx={41} cy={52} r={3} fill={ink} />
          <circle cx={59} cy={52} r={3} fill={ink} />
          <path d="M43 61 Q46.5 58 50 61 Q53.5 64 57 61" stroke={ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <path d="M76 24 C76 24 70.5 31.5 70.5 35 A5.5 5.5 0 0 0 81.5 35 C81.5 31.5 76 24 76 24 Z" fill={leaf.water} />
        </>
      )}
      {mood === 'sleepy' && (
        <>
          <path d="M37 50 Q41 53.5 45 50" stroke={ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <path d="M55 50 Q59 53.5 63 50" stroke={ink} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <path d="M47 59 Q50 61.5 53 59" stroke={ink} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <text x={72} y={26} fontSize={13} fontWeight={700} fill={ink} opacity={0.5}>z</text>
          <text x={80} y={16} fontSize={9} fontWeight={700} fill={ink} opacity={0.35}>z</text>
        </>
      )}
    </svg>
  )
}
