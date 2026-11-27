"""Prepare a protected, read-only Vercel deployment from approved museum records."""

import argparse
from contextlib import closing
import hashlib
import json
import re
from pathlib import Path
import secrets
import shutil
import sqlite3
from tempfile import TemporaryDirectory

from archivo import Archive

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / ".museo-data"
KEY_FILE = DATA / "vercel-access.key"


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def archive_for_deployment(source, dest, site):
    with TemporaryDirectory(dir=DATA) as temp:
        copy = Path(temp) / "snapshot.sqlite3"
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as original:
            with closing(sqlite3.connect(copy)) as snapshot:
                original.backup(snapshot)
        catalog = Archive(copy).catalog()
        with closing(sqlite3.connect(copy)) as snapshot:
            photos = snapshot.execute("SELECT id, image, thumb FROM submissions WHERE state='approved'").fetchall()
            videos = snapshot.execute("SELECT id FROM published_videos").fetchall()
        if videos:
            recent = site / "recientes"
            recent.mkdir()
            for (video_id,) in videos:
                if not re.fullmatch(r"[a-z0-9-]{1,110}", video_id):
                    raise ValueError("El ID del video no es válido para la publicación.")
                for suffix in (".mp4", ".webp", "-mini.webp"):
                    name = video_id + suffix
                    shutil.copyfile(ROOT / "dist" / "recientes" / name, recent / name)
        with closing(sqlite3.connect(dest)) as output, output:
            output.execute("CREATE TABLE catalog (id INTEGER PRIMARY KEY, body BLOB NOT NULL)")
            output.execute("CREATE TABLE photos (id TEXT PRIMARY KEY, image BLOB NOT NULL, thumb BLOB NOT NULL)")
            output.execute("INSERT INTO catalog (id, body) VALUES (1, ?)", (catalog,))
            output.executemany("INSERT INTO photos VALUES (?, ?, ?)", photos)
    return len(photos), len(videos)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=DATA / "aportes.sqlite3")
    args = parser.parse_args()
    source = args.data.resolve(strict=True)
    DATA.mkdir(exist_ok=True)
    try:
        with KEY_FILE.open("x", encoding="ascii") as key_file:
            key_file.write(secrets.token_urlsafe(32) + "\n")
    except FileExistsError:
        pass
    key = KEY_FILE.read_text(encoding="ascii").strip()
    if len(key) != 43 or not all(c.isascii() and (c.isalnum() or c in "-_") for c in key):
        raise ValueError("La llave local de Vercel no es válida.")

    with TemporaryDirectory(dir=DATA) as temp:
        output = Path(temp) / "output"
        function = output / "functions" / "archive.func"
        function.mkdir(parents=True)
        site = function / "site"
        shutil.copytree(ROOT / "dist", site, ignore=shutil.ignore_patterns("recientes"))
        shutil.copyfile(ROOT / "aportes/vercel_archive.cjs", function / "index.cjs")
        (function / "access.sha256").write_text(hashlib.sha256(key.encode("ascii")).hexdigest(), encoding="ascii")
        photos, videos = archive_for_deployment(source, function / "archive.sqlite3", site)
        write_json(function / ".vc-config.json", {
            "runtime": "nodejs24.x",
            "handler": "index.cjs",
            "launcherType": "Nodejs",
            "supportsResponseStreaming": True,
            "maxDuration": 30,
        })
        write_json(output / "config.json", {"version": 3, "routes": [
            {"src": "^/visita/([A-Za-z0-9_-]{43})/(.*)$", "dest": "/archive?__entry=$1&__file=$2"},
            {"src": "^/$", "dest": "/archive"},
        ]})
        build = DATA / "vercel-release" / ".vercel"
        build.mkdir(parents=True, exist_ok=True)
        old = build / "output"
        if old.exists():
            shutil.move(old, Path(temp) / "previous-output")
        try:
            shutil.move(output, old)
        except OSError:
            previous = Path(temp) / "previous-output"
            if previous.exists():
                shutil.move(previous, old)
            raise
    print(f"{photos} fotos y {videos} videos aprobados empaquetados para Vercel.")
    print(f"Directorio: {build.parent}")


if __name__ == "__main__":
    main()
