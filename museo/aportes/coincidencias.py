"""Compare a contribution to the whole image of each published photograph."""

import hashlib
import json
from io import BytesIO

from PIL import Image, ImageOps


def fingerprint(content):
    with Image.open(BytesIO(content)) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        ratio = image.width / image.height
        colors = image.resize((16, 16), Image.Resampling.BOX).tobytes().hex()
        gray = image.convert("L").resize((9, 9), Image.Resampling.LANCZOS).tobytes()
    shape = 0
    for index in range(80):
        if index % 9 != 8:
            shape = (shape << 1) | (gray[index] > gray[index + 1])
        if index < 72:
            shape = (shape << 1) | (gray[index] > gray[index + 9])
    return (ratio, format(shape, "x"), colors)


def published_photos(catalog):
    if not catalog:
        return []
    source = catalog.read_text(encoding="utf-8")
    payload = json.loads(source.partition("=")[2].strip().removesuffix(";"))
    results = []
    for piece in payload["pieces"]:
        if piece.get("video") or piece.get("reference"):
            continue
        content = (catalog.parent / piece["image"]).read_bytes()
        results.append((piece["title"], piece["image"], hashlib.sha256(content).hexdigest(), fingerprint(content)))
    return results


def match_photo(signature, candidates):
    ratio, shape, colors = signature
    shape = int(shape, 16)
    colors = bytes.fromhex(colors)
    best = None
    distance = float("inf")
    for title, image, _, (other_ratio, other_shape, other_colors) in candidates:
        if abs(ratio - other_ratio) > .04 * other_ratio:
            continue
        shape_distance = (shape ^ int(other_shape, 16)).bit_count()
        if shape_distance > 16:
            continue
        color_distance = sum(abs(a - b) for a, b in zip(colors, bytes.fromhex(other_colors))) / len(colors)
        if color_distance <= 12 and shape_distance + color_distance < distance:
            distance = shape_distance + color_distance
            best = {"title": title, "image": image}
    return best
