"""Web push end to end, minus the network: our VAPID keys sign, the payload
decrypts with the browser's keys, a 410 reaches the caller.

A local HTTP server plays the push service (FCM / Apple). Catches the failure
that matters: keys in a format pywebpush or the browser rejects, which in prod
would look like "push enabled, nothing ever arrives".

Run it:  python3 -m pytest app/api/test_webpush.py   (from backend/)
"""
import base64
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import http_ece
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.services.webpush import _send_one, generate_vapid, split_title


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def test_webpush_roundtrip():
    got = {}

    class PushService(BaseHTTPRequestHandler):
        def do_POST(self):
            got["auth"] = self.headers["authorization"]
            got["body"] = self.rfile.read(int(self.headers["Content-Length"]))
            self.send_response(201 if self.path == "/ok" else 410)
            self.end_headers()

        def log_message(self, *a):
            pass

    srv = HTTPServer(("127.0.0.1", 0), PushService)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"

    public_key, private_key = generate_vapid()
    browser = ec.generate_private_key(ec.SECP256R1())
    secret = os.urandom(16)
    sub = {
        "endpoint": f"{base}/ok",
        "p256dh": _b64(browser.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)),
        "auth": _b64(secret),
    }
    payload = json.dumps({"title": "T", "body": "Привет", "url": "/app?ap=1"}, ensure_ascii=False)

    assert _send_one(sub, payload, private_key) == 201
    assert got["auth"].startswith("vapid t=") and f"k={public_key}" in got["auth"]
    plain = http_ece.decrypt(got["body"], private_key=browser, auth_secret=secret, version="aes128gcm")
    assert json.loads(plain)["body"] == "Привет"
    assert _send_one({**sub, "endpoint": f"{base}/gone"}, payload, private_key) == 410
    srv.shutdown()


def test_split_title():
    assert split_title("Подписка заканчивается\n\n<b>Продлите</b> сейчас") == ("Подписка заканчивается", "Продлите сейчас")
    assert split_title("") == ("ModeMorph", "")


if __name__ == "__main__":
    test_webpush_roundtrip()
    test_split_title()
    print("test_webpush: OK")
