import io
import logging
import re
import stat
import unicodedata
from collections import Counter
from pathlib import Path, PurePosixPath
from zipfile import BadZipFile, ZipFile

from archivo import CATEGORIES, MAX_IMAGE_BYTES

MAX_ZIP_BYTES = 80 * 1024 * 1024
PHOTO_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
HEADER = r"^\s*\u200e?(?:\[[^\]\n]{6,50}\]\s*|\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}[^\n]{1,34}?\s+-\s+)"
ATTACHMENT = re.compile(
    r"<(?:adjunto|attached|archivo adjunto):\s*(?P<ios>[^>\r\n]+)>"
    r"|(?P<android>[^:<>]+?)\s*\((?:archivo adjunto|file attached|adjunto)\)",
    re.IGNORECASE,
)
CONTROLS = dict.fromkeys(map(ord, "\u200e\u200f\u202a\u202c\u2066\u2067\u2068\u2069\ufeff"))


def filename_key(name):
    return unicodedata.normalize("NFC", PurePosixPath(name.replace("\\", "/")).name).strip().casefold()


def captions_for(text, names):
    """Associate captions solely by an explicit attachment marker and an unambiguous filename."""
    captions = {}
    found = set()
    attachment_key = None
    for line in text.translate(CONTROLS).splitlines():
        header = re.match(HEADER, line)
        if header:
            attachment_key = None
            # Skip the sender at the beginning of the record.
            _, separator, content = line[header.end():].partition(": ")
            if not separator:
                continue
            match = ATTACHMENT.search(content)
            if match:
                key = filename_key(match["ios"] or match["android"])
                if key in names:
                    if key in found:
                        captions.pop(key, None)
                        continue
                    found.add(key)
                    attachment_key = key
                    captions[key] = (content[:match.start()] + " " + content[match.end():]).strip()[:500]
        elif attachment_key:
            captions[attachment_key] = (captions[attachment_key] + " " + line.strip()).strip()[:500]
    return captions


def import_zip(archive, body, batch_caption):
    counts = {"added": 0, "duplicates": 0, "skipped": 0}
    try:
        zipped = ZipFile(io.BytesIO(body))
    except BadZipFile as error:
        raise ValueError("Selecciona un archivo ZIP válido exportado por WhatsApp.") from error
    with zipped:
        members = zipped.infolist()
        if len(members) > 1500:
            raise ValueError("El ZIP tiene demasiados archivos. Divídelo en lotes más pequeños.")
        photos = [m for m in members if not m.is_dir() and Path(m.filename).suffix.lower() in PHOTO_SUFFIXES]
        if not photos:
            raise ValueError("El ZIP no contiene fotos en JPG, PNG o WebP. Exporta el chat incluyendo archivos multimedia.")
        if sum(photo.file_size for photo in photos) > 300 * 1024 * 1024:
            raise ValueError("Las fotos del ZIP superan 300 MB al descomprimirse. Divídelo en lotes más pequeños.")
        photo_names = Counter(filename_key(photo.filename) for photo in photos)
        texts = [m for m in members if not m.is_dir() and m.filename.lower().endswith(".txt")
                 and not PurePosixPath(m.filename).name.startswith("._")]
        captions = {}
        if len(texts) == 1 and texts[0].file_size <= 4 * 1024 * 1024:
            try:
                with zipped.open(texts[0]) as transcript:
                    text = transcript.read(4 * 1024 * 1024 + 1).decode("utf-8-sig", errors="replace")
                captions = captions_for(text, {name for name, count in photo_names.items() if count == 1})
            except (BadZipFile, RuntimeError, NotImplementedError):
                logging.warning("La exportación se importó sin los pies de foto.")
        for photo in photos:
            try:
                if photo.file_size > MAX_IMAGE_BYTES:
                    counts["skipped"] += 1
                    continue
                with zipped.open(photo) as image:
                    raw = image.read(MAX_IMAGE_BYTES + 1)
                caption = batch_caption or captions.get(filename_key(photo.filename), "")
                added = archive.ingest(raw, caption, "Exportación de WhatsApp")
                counts["added" if added else "duplicates"] += 1
            except (ValueError, BadZipFile, RuntimeError, NotImplementedError):
                counts["skipped"] += 1
    return counts


def scan_folder(archive, folder, seen, *, zip_only=False):
    """Wait for stable file metadata before consuming a file from the dedicated inbox."""
    current = {}
    parents = [folder] if zip_only else [folder, *(folder / category for category in CATEGORIES)]
    suffixes = {".zip"} if zip_only else PHOTO_SUFFIXES
    limit = MAX_ZIP_BYTES if zip_only else MAX_IMAGE_BYTES
    for parent in parents:
        if not parent.is_dir() or parent.is_symlink() or parent.is_junction():
            continue
        for path in parent.iterdir():
            if path.suffix.lower() not in suffixes or path.is_symlink():
                continue
            try:
                info = path.stat()
                if not stat.S_ISREG(info.st_mode):
                    continue
                identity = (info.st_size, info.st_mtime_ns)
                previous, done = seen.get(path, (None, False))
                current[path] = (identity, False)
                if previous != identity:
                    continue
                if not done and 0 < info.st_size <= limit:
                    with path.open("rb") as file:
                        raw = file.read(limit + 1)
                    after = path.stat()
                    if (after.st_size, after.st_mtime_ns) != identity:
                        continue
                    category_hint = "#" + parent.name if parent != folder else ""
                    try:
                        if zip_only:
                            result = import_zip(archive, raw, "")
                            logging.info("Lote importado. Fotos añadidas: %d. Duplicadas: %d. Omitidas: %d.",
                                         result["added"], result["duplicates"], result["skipped"])
                        else:
                            archive.ingest(raw, category_hint, "Carpeta sincronizada")
                    except ValueError:
                        logging.warning("Un archivo de la carpeta no pudo procesarse.")
                elif not done and info.st_size > limit:
                    logging.warning("Un archivo de la carpeta supera el tamaño permitido.")
                current[path] = (identity, True)
            except OSError:
                # An interrupted copy or temporarily inaccessible file is retried on the next scan.
                continue
    return current


def watch_folder(archive, folder, stop, *, zip_only=False):
    seen = {}
    while not stop.wait(4):
        try:
            seen = scan_folder(archive, folder, seen, zip_only=zip_only)
        except OSError:
            logging.warning("La carpeta de aportes aún no está disponible.")
