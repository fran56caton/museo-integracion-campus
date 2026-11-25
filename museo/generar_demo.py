"""Genera los recursos de demostración del museo sin fotografías de personas."""

import hashlib
import json
from pathlib import Path
import subprocess
import textwrap

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
MEDIA = DIST / "media"
COLORS = [
    ((25, 50, 55), (111, 152, 131)),
    ((23, 43, 61), (111, 155, 168)),
    ((53, 44, 52), (194, 133, 98)),
    ((38, 48, 44), (146, 152, 93)),
]


def plate(title, token):
    digest = hashlib.sha256(token.encode()).digest()
    base, accent = COLORS[digest[0] % len(COLORS)]
    image = Image.new("RGB", (1440, 900), base)
    draw = ImageDraw.Draw(image)
    for y in range(image.height):
        t = y / image.height * 0.22
        fill = tuple(round(a * (1 - t) + b * t) for a, b in zip(base, accent))
        draw.line((0, y, image.width, y), fill=fill)
    for radius in (170, 225, 285):
        x = 1076 + digest[1] % 71
        y = 418 + digest[2] % 86
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), outline=accent, width=3)
    draw.rectangle((61, 63, 1379, 837), outline=accent, width=2)
    draw.text((114, 131), "MATEMÁTICA Y FÍSICA", fill=(227, 218, 190), font=ImageFont.load_default(27))
    draw.multiline_text(
        (114, 540), textwrap.fill(title, width=28),
        fill=(255, 240, 211), font=ImageFont.load_default(49), spacing=9,
    )
    draw.text((115, 776), "RECURSO DE DEMOSTRACIÓN", fill=(239, 229, 198), font=ImageFont.load_default(20))
    return image


def save_photo(file, image, thumbnail=False):
    if file.exists():
        return
    if thumbnail:
        image = image.copy()
        image.thumbnail((500, 320), Image.Resampling.LANCZOS)
    image.save(file, quality=81, method=5)


def save_video(file, poster):
    if file.exists():
        return
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-n", "-loop", "1", "-i", str(poster),
        "-vf", "scale=960:-2,fade=t=in:st=0:d=0.35,fade=t=out:st=2.55:d=0.45",
        "-t", "3", "-r", "24", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an",
        "-crf", "26", "-movflags", "+faststart", str(file),
    ], check=True)


def main():
    MEDIA.mkdir(parents=True, exist_ok=True)
    raw = (DIST / "catalogo.js").read_text(encoding="utf-8")
    catalog = json.loads(raw.partition("=")[2].strip().removesuffix(";"))
    for piece in catalog["pieces"]:
        if not (DIST / piece["image"]).exists() or not (DIST / piece["thumb"]).exists():
            image = plate(piece["title"], piece["id"])
            save_photo(DIST / piece["image"], image)
            save_photo(DIST / piece["thumb"], image, thumbnail=True)
        if piece["video"]:
            save_video(DIST / piece["video"], DIST / piece["image"])

    for name, initials in [("logo-unheval.webp", "U"), ("logo-escuela.webp", "MF")]:
        file = MEDIA / name
        if file.exists():
            continue
        badge = Image.new("RGB", (128, 128), (22, 46, 49))
        draw = ImageDraw.Draw(badge)
        draw.ellipse((8, 8, 120, 120), outline=(229, 202, 143), width=3)
        draw.text((64, 67), initials, fill=(255, 239, 202), anchor="mm", font=ImageFont.load_default(42))
        save_photo(file, badge)


if __name__ == "__main__":
    main()
