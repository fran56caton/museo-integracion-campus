import argparse
import hmac
import json
import logging
import os
import re
import shutil
import threading
from http.server import BaseHTTPRequestHandler, SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.parse import parse_qs, unquote, urlsplit

from archivo import Archive, CATEGORIES, MAX_IMAGE_BYTES
from lotes import MAX_ZIP_BYTES, import_zip, watch_folder
from whatsapp import WhatsApp, verify_signature

ROOT = Path(__file__).resolve().parent.parent
PHOTO = r"(wa-[a-f0-9]{64})(-mini)?\.webp"
FORM_OP = r"/api/(wa-[a-f0-9]{64})/(approve|withdraw|discard)"


class Connection:
    def setup(self):
        self.request.settimeout(35)
        super().setup()

    def reply(self, status, body=b"", content="text/plain; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def reply_json(self, status, value):
        self.reply(status, json.dumps(value).encode(), "application/json; charset=utf-8")

    def body(self, limit):
        if self.headers.get("Transfer-Encoding"):
            raise ValueError("La solicitud debe incluir el tamaño del contenido.")
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= limit:
            raise ValueError("El tamaño de la solicitud no es válido.")
        body = self.rfile.read(length)
        if len(body) != length:
            raise ValueError("La solicitud quedó incompleta.")
        return body

    def log_request(self, code="-", size="-"):
        # Keep verify tokens, message details and request URLs out of the access log.
        if isinstance(code, int) and code >= 500:
            logging.warning("Error HTTP %s al procesar %s", code, self.command)


class Admin(Connection, BaseHTTPRequestHandler):
    def allowed(self, mutating=False):
        host = f"127.0.0.1:{self.server.server_port}"
        origin = self.headers.get("Origin")
        return (self.headers.get("Host") == host and
                self.headers.get("Sec-Fetch-Site") not in {"cross-site", "same-site"} and
                (origin is None or origin == f"http://{host}") and
                (not mutating or self.headers.get("X-Museo-Editor") == "1"))

    def do_GET(self):
        if not self.allowed():
            return self.reply(403)
        route = urlsplit(self.path).path
        if route == "/":
            return self.reply(200, (ROOT / "aportes/bandeja.html").read_bytes(), "text/html; charset=utf-8")
        if route == "/bandeja.js":
            return self.reply(200, (ROOT / "aportes/bandeja.js").read_bytes(), "text/javascript; charset=utf-8")
        if route == "/api/aportes":
            return self.reply_json(200, {
                "items": self.server.archive.list(),
                "categories": {key: data[0] for key, data in CATEGORIES.items()},
            })
        photo = re.fullmatch(r"/foto/" + PHOTO, route)
        if photo:
            image = self.server.archive.get_image(photo[1], bool(photo[2]), public=False)
            if image:
                return self.reply(200, image, "image/webp")
        if route.startswith("/museo/"):
            original = route.removeprefix("/museo/")
            if any(item[1] == original for item in self.server.archive.originals):
                return self.reply(200, (ROOT / "dist" / original).read_bytes(), "image/webp")
        return self.reply(404)

    def do_POST(self):
        if not self.allowed(mutating=True):
            return self.reply(403)
        route = urlsplit(self.path).path
        try:
            if route == "/api/importar":
                caption = unquote(self.headers.get("X-Museo-Caption", ""))
                added = self.server.archive.ingest(self.body(MAX_IMAGE_BYTES), caption, "Importación local")
                return self.reply_json(201 if added else 200, {"added": added})
            if route == "/api/importar-zip":
                caption = unquote(self.headers.get("X-Museo-Caption", ""))
                return self.reply_json(200, import_zip(self.server.archive, self.body(MAX_ZIP_BYTES), caption))
            if route == "/api/aprobar-lote":
                fields = json.loads(self.body(16 * 1024))
                keys = fields.get("keys") if isinstance(fields, dict) else None
                if (not isinstance(keys, list) or not 2 <= len(keys) <= 100 or
                        any(not isinstance(key, str) or not re.fullmatch(r"wa-[a-f0-9]{64}", key) for key in keys)
                        or len(set(keys)) != len(keys)):
                    raise ValueError("Elige entre 2 y 100 fotos para aprobar juntas.")
                try:
                    self.server.archive.approve_batch(keys, fields)
                except LookupError as error:
                    return self.reply_json(409, {"error": str(error)})
                return self.reply_json(200, {"published": len(keys)})
            change = re.fullmatch(FORM_OP, route)
            if change:
                fields = json.loads(self.body(4096))
                if not isinstance(fields, dict):
                    raise ValueError("La ficha debe contener un objeto.")
                updated = self.server.archive.decide(change[1], change[2], fields)
                return self.reply_json(200 if updated else 409, {"updated": updated})
        except ValueError as error:
            return self.reply_json(400, {"error": str(error)})
        return self.reply(404)


class Museum(Connection, SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.video_remaining = None
        super().__init__(*args, directory=str(ROOT / "dist"), **kwargs)

    def list_directory(self, path):
        self.reply(404)
        return None

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        target = urlsplit(self.path)
        if target.path == "/aportes.js":
            return self.reply(200, self.server.archive.catalog(), "text/javascript; charset=utf-8")
        photo = re.fullmatch(r"/aportes/" + PHOTO, target.path)
        if photo:
            image = self.server.archive.get_image(photo[1], bool(photo[2]), public=True)
            return self.reply(200, image, "image/webp") if image else self.reply(404)
        if target.path == "/webhook/whatsapp":
            connector = self.server.connector
            challenge = parse_qs(target.query)
            mode = challenge.get("hub.mode", [""])[0]
            token = challenge.get("hub.verify_token", [""])[0]
            value = challenge.get("hub.challenge", [""])[0]
            if (connector and mode == "subscribe" and value.isascii() and value.isdigit() and
                    hmac.compare_digest(token.encode(), connector.verify_token.encode())):
                return self.reply(200, value.encode())
            return self.reply(403)
        if self.command == "HEAD":
            return super().do_HEAD()
        return super().do_GET()

    def send_head(self):
        # Safari and mobile players use byte ranges for existing recordings.
        filename = self.translate_path(self.path)
        range_value = self.headers.get("Range")
        if not range_value or not filename.endswith(".mp4") or not os.path.isfile(filename):
            return super().send_head()
        video = open(filename, "rb")
        size = os.fstat(video.fileno()).st_size
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_value)
        start, end = size, -1
        if match and match[1]:
            start = int(match[1])
            end = min(int(match[2]), size - 1) if match[2] else size - 1
        elif match and match[2]:
            start, end = max(0, size - int(match[2])), size - 1
        if not 0 <= start <= end < size:
            video.close()
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        video.seek(start)
        self.video_remaining = end - start + 1
        self.send_response(206)
        self.send_header("Content-Type", "video/mp4")
        self.send_header("Content-Length", str(self.video_remaining))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        return video

    def copyfile(self, source, output):
        if self.video_remaining is None:
            return shutil.copyfileobj(source, output)
        while self.video_remaining:
            data = source.read(min(self.video_remaining, 65536))
            if not data:
                break
            output.write(data)
            self.video_remaining -= len(data)

    def do_POST(self):
        connector = self.server.connector
        if self.path != "/webhook/whatsapp" or connector is None:
            return self.reply(404)
        try:
            body = self.body(512 * 1024)
        except ValueError:
            return self.reply(400)
        if not verify_signature(body, self.headers.get("X-Hub-Signature-256"), connector.secret):
            return self.reply(403)
        try:
            payload = json.loads(body)
            if not isinstance(payload, dict):
                return self.reply(400)
            photos = list(connector.photos(payload))
        except (ValueError, AttributeError, TypeError):
            return self.reply(400)
        try:
            for key, media_id, caption in photos:
                if self.server.archive.received(key):
                    continue
                raw = connector.download(media_id)
                try:
                    self.server.archive.ingest(raw, caption, "WhatsApp", key)
                except ValueError:
                    logging.warning("Se descartó una imagen incompatible recibida de WhatsApp.")
        except (URLError, TimeoutError, ValueError, KeyError):
            # Meta can deliver the event again. Saved photos are idempotent across retries.
            return self.reply(503)
        return self.reply(200, b"EVENT_RECEIVED")


def main():
    parser = argparse.ArgumentParser(description="Bandeja de fotos para el museo de Matemática y Física.")
    parser.add_argument("--port", type=int, default=8752, help="Puerto del museo y del webhook")
    parser.add_argument("--admin-port", type=int, default=8753, help="Puerto local de la bandeja")
    parser.add_argument("--data", type=Path, default=ROOT / ".museo-data/aportes.sqlite3")
    parser.add_argument("--watch-folder", type=Path, help="Carpeta dedicada de imágenes que revisa el museo")
    parser.add_argument("--watch-zip-folder", type=Path, help="Carpeta dedicada de exportaciones ZIP")
    args = parser.parse_args()
    try:
        connector = WhatsApp.from_environment()
    except ValueError as error:
        parser.error(str(error))
    archive = Archive(args.data, ROOT / "dist/catalogo.js")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    stop = threading.Event()
    watchers = []
    with ThreadingHTTPServer(("127.0.0.1", args.port), Museum) as site:
        with ThreadingHTTPServer(("127.0.0.1", args.admin_port), Admin) as admin:
            site.archive = admin.archive = archive
            site.connector = connector
            thread = threading.Thread(target=admin.serve_forever, daemon=True)
            thread.start()
            print(f"Museo:   http://127.0.0.1:{site.server_port}/", flush=True)
            print(f"Bandeja: http://127.0.0.1:{admin.server_port}/", flush=True)
            print("Recepción WhatsApp configurada." if connector else "Modo local, importar fotos desde la bandeja.", flush=True)
            for watch_path, zip_only in ((args.watch_folder, False), (args.watch_zip_folder, True)):
                if not watch_path:
                    continue
                folder = watch_path.absolute()
                folder.mkdir(parents=True, exist_ok=True)
                watcher = threading.Thread(
                    target=watch_folder, args=(archive, folder, stop),
                    kwargs={"zip_only": zip_only}, daemon=True)
                watcher.start()
                watchers.append(watcher)
                print(f"Carpeta observada ({'ZIP' if zip_only else 'fotos'}): {folder}", flush=True)
            try:
                site.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                stop.set()
                for watcher in watchers:
                    watcher.join()
                admin.shutdown()


if __name__ == "__main__":
    main()
