import hashlib
import json
import re
import sqlite3
import unicodedata
from contextlib import contextmanager
from datetime import date
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError
from coincidencias import fingerprint, match_photo, published_photos

MAX_IMAGE_BYTES = 12 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 24_000_000

# Each category has a label for the archive, a room and an indicative caption pattern.
CATEGORIES = {
    "promociones": ("Promociones", "promociones", r"\bpromocion\s+\d{4}\b"),
    "danza": ("Danza", "tradiciones", r"\b(?:danza|danzas|baile|bail[eoa]|bailando|coreografia)\b"),
    "desfile": ("Desfiles", "tradiciones", r"\b(?:desfile|desfiles|desfil[eoa]|desfilando)\b"),
    "pasacalle": ("Pasacalles", "tradiciones", r"\bpasacalles?\b"),
    "futbol": ("Fútbol y fulbito", "universidad", r"\b(?:futbol|futsal|fulbito|futbolito|futbolistas|pichanga)\b"),
    "aniversario-facultad": ("Aniversario de la facultad", "tradiciones", r"\baniversario\b.{0,80}\bfacultad\b"),
    "aniversario-carrera": ("Aniversario de la carrera", "tradiciones", r"\baniversario\b.{0,80}\b(?:carrera|matematica y fisica)\b"),
    "cachimbeada": ("Cachimbeada", "tradiciones", r"\b(?:cachimbeada|cachimbos|bienvenida a ingresantes)\b"),
    "congreso": ("Congresos", "universidad", r"\b(?:congreso|congresos)\b"),
    "voley": ("Vóley", "universidad", r"\b(?:voley|voleibol|volleyball)\b"),
    "balonmano": ("Balonmano", "universidad", r"\bbalonmano\b"),
    "premiacion": ("Premiación deportiva", "universidad", r"\b(?:premiacion(?:es)?|entrega de medallas)\b"),
    "deportes": ("Deportes", "universidad", r"\b(?:ajedrez|atletismo|basquet|baloncesto|deporte|deportes)\b"),
}
TAGS = {"bailes": "danza", "desfiles": "desfile", "fulbito": "futbol", "congresos": "congreso"}


def suggest(caption):
    plain = ''.join(c for c in unicodedata.normalize('NFD', caption.lower()) if not unicodedata.combining(c))
    tags = (TAGS.get(tag, tag) for tag in re.findall(r'#([\w-]+)', plain))
    explicit = {tag for tag in tags if tag in CATEGORIES}
    matches = explicit or {key for key, (_, _, pattern) in CATEGORIES.items() if re.search(pattern, plain)}
    if len(matches) == 1:
        return next(iter(matches)), "etiqueta" if explicit else "pie de foto"
    return None, "actividades múltiples" if matches else "sin datos suficientes"


def clean_photo(raw):
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("El tamaño de la foto debe ser de hasta 12 MB.")
    try:
        with Image.open(BytesIO(raw), formats=["JPEG", "PNG", "WEBP"]) as original:
            if original.width * original.height > Image.MAX_IMAGE_PIXELS or getattr(original, "n_frames", 1) != 1:
                raise ValueError("Usa una foto fija de hasta 24 megapíxeles.")
            image = ImageOps.exif_transpose(original).convert("RGB")
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as error:
        raise ValueError("Usa una foto válida en JPG, PNG o WebP.") from error
    # Create a fresh image so EXIF, coordinates, and other input metadata cannot travel with the file.
    clean = Image.new("RGB", image.size)
    clean.paste(image)
    clean.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
    main = BytesIO()
    clean.save(main, "WEBP", quality=86)
    clean.thumbnail((540, 540), Image.Resampling.LANCZOS)
    thumb = BytesIO()
    clean.save(thumb, "WEBP", quality=80)
    return main.getvalue(), thumb.getvalue()


def text_field(value, length):
    if not isinstance(value, str):
        return ""
    return ' '.join(value.split())[:length]


APPROVAL = """UPDATE submissions SET category=?, title=?, detail=?, alt=?, event_date=?, promotion_year=?,
              state='approved', published_at=CURRENT_TIMESTAMP WHERE id=? AND state='pending'"""


def approval_fields(data):
    category = data.get("category")
    title = text_field(data.get("title"), 120)
    alt = text_field(data.get("alt"), 200)
    detail = text_field(data.get("detail"), 450)
    day = data.get("event_date") or None
    promotion_year = None
    if data.get("permission") != "confirmed":
        raise ValueError("Confirma que las fotos están autorizadas para el museo.")
    if not isinstance(category, str) or category not in CATEGORIES or not title or not alt:
        raise ValueError("Indica una categoría, un título y una descripción visual.")
    if category == "promociones":
        year_text = str(data.get("promotion_year", ""))
        if not re.fullmatch(r"(?:19|20)\d{2}", year_text):
            raise ValueError("Indica el año de la promoción.")
        promotion_year = int(year_text)
    if day is not None:
        if not isinstance(day, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
            raise ValueError("Indica una fecha de actividad válida.")
        try:
            day = date.fromisoformat(day).isoformat()
        except ValueError as error:
            raise ValueError("Indica una fecha de actividad válida.") from error
    return category, title, detail, alt, day, promotion_year


class Archive:
    def __init__(self, path, catalog=None):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.originals = published_photos(catalog)
        self.original_hashes = {item[2] for item in self.originals}
        with self.database() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("""CREATE TABLE IF NOT EXISTS submissions (
                id TEXT PRIMARY KEY, message_key TEXT UNIQUE, image BLOB, thumb BLOB,
                channel TEXT NOT NULL, caption TEXT NOT NULL, category TEXT, evidence TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'pending', title TEXT, detail TEXT, alt TEXT, event_date TEXT,
                received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, published_at TEXT,
                fingerprint TEXT, possible_duplicate TEXT, promotion_year INTEGER
            )""")
            columns = {row["name"] for row in db.execute("PRAGMA table_info(submissions)")}
            for name in ("fingerprint", "possible_duplicate"):
                if name not in columns:
                    db.execute(f"ALTER TABLE submissions ADD COLUMN {name} TEXT")
            if "promotion_year" not in columns:
                db.execute("ALTER TABLE submissions ADD COLUMN promotion_year INTEGER")
            old_entries = db.execute("SELECT id,image FROM submissions WHERE fingerprint IS NULL AND image IS NOT NULL").fetchall()
            db.executemany("UPDATE submissions SET fingerprint=? WHERE id=?",
                           [(json.dumps(fingerprint(row["image"])), row["id"]) for row in old_entries])

    @contextmanager
    def database(self):
        db = sqlite3.connect(self.path, timeout=12)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def received(self, message_key):
        with self.database() as db:
            return db.execute("SELECT 1 FROM submissions WHERE message_key=?", (message_key,)).fetchone() is not None

    def ingest(self, raw, caption, channel, message_key=None):
        if hashlib.sha256(raw).hexdigest() in self.original_hashes:
            return False
        image, thumb = clean_photo(raw)
        key = "wa-" + hashlib.sha256(image).hexdigest()
        caption = text_field(caption, 500)
        category, evidence = suggest(caption)
        signature = fingerprint(image)
        with self.database() as db:
            approved = [
                (row["title"], "/foto/" + row["id"] + "-mini.webp", None, json.loads(row["fingerprint"]))
                for row in db.execute("SELECT id,title,fingerprint FROM submissions WHERE state='approved'"
                                      " AND fingerprint IS NOT NULL AND id<>?", (key,))
            ]
            possible = match_photo(signature, self.originals + approved)
            if possible and not possible["image"].startswith("/"):
                possible["image"] = "/museo/" + possible["image"]
            result = db.execute(
                """INSERT INTO submissions (id, message_key, image, thumb, channel, caption, category, evidence,
                   fingerprint, possible_duplicate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING""",
                (key, message_key, image, thumb, channel, caption, category, evidence,
                 json.dumps(signature), json.dumps(possible)),
            )
            return result.rowcount == 1

    def list(self):
        with self.database() as db:
            rows = [dict(row) for row in db.execute(
                """SELECT id, channel, caption, category, evidence, state, title, detail, alt, event_date, received_at,
                          possible_duplicate, promotion_year
                   FROM submissions WHERE state <> 'discarded' ORDER BY received_at DESC, id""")]
        for row in rows:
            row["possible_duplicate"] = json.loads(row["possible_duplicate"] or "null")
        return rows

    def decide(self, key, action, data):
        with self.database() as db:
            if action in {"withdraw", "discard"}:
                expected, state = ("approved", "pending") if action == "withdraw" else ("pending", "discarded")
                query = "UPDATE submissions SET state=?, published_at=NULL WHERE id=? AND state=?"
                if state == "discarded":
                    query = ("UPDATE submissions SET state=?, caption='', image=NULL, thumb=NULL,"
                             " fingerprint=NULL, possible_duplicate=NULL WHERE id=? AND state=?")
                result = db.execute(query, (state, key, expected))
            elif action == "approve":
                result = db.execute(APPROVAL, (*approval_fields(data), key))
            else:
                raise ValueError("Acción desconocida.")
            return result.rowcount == 1

    def approve_batch(self, keys, data):
        category, title, detail, alt, day, promotion_year = approval_fields(data)
        with self.database() as db:
            params = [(category, f"{title[:110]} · {i}", detail, alt, day, promotion_year, key)
                      for i, key in enumerate(keys, 1)]
            result = db.executemany(APPROVAL, params)
            if result.rowcount != len(keys):
                raise LookupError("Alguna foto cambió de estado. Actualiza la bandeja y vuelve a elegir el lote.")

    def get_image(self, key, thumb, public):
        column = "thumb" if thumb else "image"
        state = "= 'approved'" if public else "<> 'discarded'"
        with self.database() as db:
            row = db.execute(f"SELECT {column} FROM submissions WHERE id=? AND state {state}", (key,)).fetchone()
            return row[0] if row else None

    def catalog(self):
        with self.database() as db:
            rows = db.execute("""SELECT id, category, title, detail, alt, event_date, promotion_year, channel FROM submissions
                                 WHERE state='approved'
                                 ORDER BY category, event_date DESC, title COLLATE NOCASE, id""").fetchall()
        entries = []
        for row in rows:
            label, room, _ = CATEGORIES[row["category"]]
            key = row["id"]
            day = row["event_date"]
            entries.append({
                "id": key, "room": room, "collection": label, "title": row["title"],
                "description": row["detail"], "alt": row["alt"],
                "source": "Archivo histórico de la carrera" if row["channel"] == "Archivo histórico de la carrera" else "Aporte de la comunidad",
                "url": None, "year": row["promotion_year"] or (int(day[:4]) if day else None), "eventDate": day,
                "thumb": f"aportes/{key}-mini.webp", "image": f"aportes/{key}.webp", "video": None,
            })
        return ("window.MUSEUM_APORTES = " + json.dumps(entries, ensure_ascii=True) + ";\n").encode()
