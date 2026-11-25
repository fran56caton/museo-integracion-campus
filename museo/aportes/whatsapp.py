import hashlib
import hmac
import json
import os
import re
from dataclasses import dataclass
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener

from archivo import MAX_IMAGE_BYTES


def verify_signature(body, signature, secret):
    if not secret or not signature or not re.fullmatch(r"sha256=[a-f0-9]{64}", signature):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature[7:], expected)


def validate_download_url(url):
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    if (parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443)
            or not (host == "lookaside.fbsbx.com" or host == "graph.facebook.com"
                    or host.endswith(".fbcdn.net") or host.endswith(".fbsbx.com"))):
        raise ValueError("URL de descarga fuera de Meta.")


class MetaRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, url):
        validate_download_url(url)
        return super().redirect_request(request, fp, code, message, headers, url)


@dataclass(frozen=True)
class WhatsApp:
    token: str
    secret: str
    verify_token: str
    phone_id: str
    version: str
    senders: frozenset
    groups: frozenset

    @classmethod
    def from_environment(cls):
        fields = [os.environ.get("WHATSAPP_" + field, "").strip() for field in
                  ("TOKEN", "APP_SECRET", "VERIFY_TOKEN", "PHONE_ID", "GRAPH_VERSION")]
        senders = frozenset(filter(None, (item.strip() for item in os.environ.get("WHATSAPP_SENDERS", "").split(","))))
        groups = frozenset(filter(None, (item.strip() for item in os.environ.get("WHATSAPP_GROUPS", "").split(","))))
        if not any(fields) and not senders and not groups:
            return None
        if not all(fields) or not re.fullmatch(r"v\d+\.\d+", fields[4]) or not fields[3].isdigit() or not (senders or groups):
            raise ValueError("Completa las variables de WhatsApp y autoriza al menos un remitente o grupo Business.")
        return cls(*fields, senders, groups)

    def photos(self, payload):
        if payload.get("object") != "whatsapp_business_account":
            return
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                if change.get("field") != "messages" or value.get("metadata", {}).get("phone_number_id") != self.phone_id:
                    continue
                for message in value.get("messages", []):
                    group_id = message.get("group_id")
                    allowed = group_id in self.groups if group_id else not self.senders.isdisjoint(
                        (message.get("from"), message.get("from_user_id")))
                    if not allowed or message.get("type") != "image":
                        continue
                    image = message.get("image", {})
                    media_id = image.get("id", "")
                    message_id = message.get("id")
                    if isinstance(media_id, str) and media_id.isdigit() and isinstance(message_id, str) and message_id:
                        yield (hashlib.sha256(message_id.encode()).hexdigest(), media_id, image.get("caption", ""))

    def download(self, media_id):
        headers = {"Authorization": "Bearer " + self.token}
        request = Request(
            f"https://graph.facebook.com/{self.version}/{media_id}?{urlencode({'phone_number_id': self.phone_id})}", headers=headers)
        opener = build_opener(MetaRedirect())
        with opener.open(request, timeout=12) as response:
            media_url = json.loads(response.read(64 * 1024))["url"]
        validate_download_url(media_url)
        with opener.open(Request(media_url, headers=headers), timeout=12) as response:
            return response.read(MAX_IMAGE_BYTES + 1)
