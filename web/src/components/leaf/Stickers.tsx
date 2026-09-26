export type TreeSticker = { slot: 'head' | 'face' | 'side' | 'ground'; stickerId: string; imageUrl: string }

// Same slot spots as the phone app, as fractions of the icon's size.
export const stickerAnchors: Record<TreeSticker['slot'], { top: number; left: number }> = {
  head: { top: -0.14, left: 0.33 },
  face: { top: 0.36, left: 0.33 },
  side: { top: 0.12, left: 0.74 },
  ground: { top: 0.7, left: -0.06 },
}

/** Die-cut (transparent) stickers laid over a tree icon of `size` px (the parent must be position: relative). */
export function StickerBadges({ stickers, size }: { stickers?: TreeSticker[] | null; size: number }) {
  const badge = Math.round(size * 0.4)
  return (
    <>
      {(stickers ?? []).map((sticker) => (
        <img
          key={sticker.slot}
          src={sticker.imageUrl}
          alt=""
          className="pointer-events-none absolute object-contain drop-shadow"
          style={{
            width: badge,
            height: badge,
            top: stickerAnchors[sticker.slot].top * size,
            left: stickerAnchors[sticker.slot].left * size,
          }}
        />
      ))}
    </>
  )
}

/** The same badges as HTML for Leaflet divIcons. */
export function stickerBadgesHtml(stickers: TreeSticker[] | null | undefined, size: number) {
  const badge = Math.round(size * 0.4)
  return (stickers ?? [])
    .map(
      (sticker) =>
        `<img src="${sticker.imageUrl}" alt="" style="position:absolute;width:${badge}px;height:${badge}px;top:${stickerAnchors[sticker.slot].top * size}px;left:${stickerAnchors[sticker.slot].left * size}px;object-fit:contain;filter:drop-shadow(0 1px 1.5px rgba(31,58,43,.3))" />`,
    )
    .join('')
}
