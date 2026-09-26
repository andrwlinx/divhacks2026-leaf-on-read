"""Turn a Grok Imagine sticker (flat JPEG on white) into a transparent die-cut PNG.

Flood-fills the white background from the image edges, trims the pale fringe, adds a clean white
outline, crops to the art, and saves a 256px PNG.
Usage: python3 cutout_sticker.py <input> <output.png>
"""

import sys

from PIL import Image, ImageDraw, ImageFilter

KEY = (255, 0, 255)


def cutout(src: str, dst: str, size: int = 256) -> None:
    art = Image.open(src).convert("RGB")
    width, height = art.size
    work = art.copy()
    # Seed the fill all around the border so every patch of background that touches an edge goes.
    step = max(8, width // 64)
    edges = [(x, 0) for x in range(0, width, step)] + [(x, height - 1) for x in range(0, width, step)]
    edges += [(0, y) for y in range(0, height, step)] + [(width - 1, y) for y in range(0, height, step)]
    for point in edges:
        r, g, b = work.getpixel(point)
        if min(r, g, b) > 200 and (r, g, b) != KEY:
            ImageDraw.floodfill(work, point, KEY, thresh=60)

    background = Image.eval(
        Image.merge("RGB", [channel.point(lambda v, k=k: 255 if v == k else 0) for channel, k in zip(work.split(), KEY)])
        .convert("L"),
        lambda v: 255 if v == 255 else 0,
    )
    alpha = Image.eval(background, lambda v: 0 if v else 255)
    # Shave the anti-aliased white fringe, then soften the edge.
    alpha = alpha.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1))

    # Our own die-cut outline: a white silhouette a few pixels wider than the art.
    outline = alpha.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(1.5))
    sticker = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    sticker.paste(Image.new("RGBA", (width, height), (255, 255, 255, 255)), (0, 0), outline)
    sticker.paste(art.convert("RGBA"), (0, 0), alpha)

    box = outline.point(lambda v: 255 if v > 8 else 0).getbbox()
    if box:
        sticker = sticker.crop(box)
    side = max(sticker.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(sticker, ((side - sticker.width) // 2, (side - sticker.height) // 2))
    square.resize((size, size), Image.LANCZOS).save(dst, "PNG", optimize=True)


if __name__ == "__main__":
    cutout(sys.argv[1], sys.argv[2])
