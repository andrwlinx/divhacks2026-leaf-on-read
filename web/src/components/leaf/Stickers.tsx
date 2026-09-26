export type TreeSticker = { slot: 'head' | 'face' | 'side' | 'ground'; stickerId: string; imageUrl: string }

// Same corners as the phone app: each slot is a corner of the tree's card, slapped on at an angle.
const corners: Record<TreeSticker['slot'], (size: number) => React.CSSProperties> = {
  head: (size) => ({ top: -size * 0.28, left: -size * 0.18, transform: 'rotate(-12deg)' }),
  face: (size) => ({ top: -size * 0.28, right: -size * 0.18, transform: 'rotate(10deg)' }),
  side: (size) => ({ bottom: -size * 0.24, right: -size * 0.16, transform: 'rotate(-8deg)' }),
  ground: (size) => ({ bottom: -size * 0.24, left: -size * 0.16, transform: 'rotate(9deg)' }),
}

/** Die-cut stickers on the corners of a tree's card (the card must be position: relative, not clipped). */
export function CardStickers({ stickers, size }: { stickers?: TreeSticker[] | null; size: number }) {
  return (
    <>
      {(stickers ?? []).map((sticker) => (
        <img
          key={sticker.slot}
          src={sticker.imageUrl}
          alt=""
          className="pointer-events-none absolute z-10 object-contain drop-shadow"
          style={{ width: size, height: size, ...corners[sticker.slot](size) }}
        />
      ))}
    </>
  )
}
