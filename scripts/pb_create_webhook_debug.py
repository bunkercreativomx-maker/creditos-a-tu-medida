#!/usr/bin/env python3
"""Crea la colección de diagnóstico `webhook_debug` en PocketBase (pb-creditos).

Guarda el payload CRUDO de cada webhook entrante de Zernio con el motivo de su
disposición ("procesado" o la razón del descarte), para poder responder si una
nota de voz (i) nunca llega, (ii) llega sin `attachments` o (iii) llega bien y se
pierde después. El webhook sigue funcionando aunque esta colección no exista
(la traza falla en silencio y lo deja en el log de la función).

USO (credenciales SOLO por entorno — nunca hardcodear en el repo):

    export PB_ADMIN_EMAIL='admin@creditos.app'
    export PB_ADMIN_PASSWORD='...'          # superusuario de PocketBase
    export PB_BASE_URL='https://creditos-pb.bunkeragent.cloud'
    python3 scripts/pb_create_webhook_debug.py

Idempotente: si la colección ya existe, no hace nada.
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("PB_BASE_URL") or os.environ.get("NEXT_PUBLIC_PB_URL") or ""
EMAIL = os.environ.get("PB_ADMIN_EMAIL", "")
PASSWORD = os.environ.get("PB_ADMIN_PASSWORD", "")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"

COLECCION = "webhook_debug"

CAMPOS = [
    # (nombre, tipo, extra)
    ("event_id", "text", {"max": 200}),
    ("event", "text", {"max": 100}),
    ("motivo", "text", {"max": 200}),
    ("account_id", "text", {"max": 100}),
    ("telefono", "text", {"max": 40}),
    ("direction", "text", {"max": 20}),
    ("has_text", "bool", {}),
    ("has_attachments", "bool", {}),
    ("attachment_types", "text", {"max": 200}),
    ("payload", "json", {"maxSize": 2_000_000}),
]


def call(path, method="GET", token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE.rstrip("/") + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", UA)
    if token:
        req.add_header("Authorization", token)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw or "{}")
        except Exception:
            return e.code, {"_raw": raw[:400]}


def campo(nombre, tipo, extra):
    base = {
        "name": nombre,
        "type": tipo,
        "required": False,
        "system": False,
        "hidden": False,
        "presentable": False,
    }
    base.update(extra)
    return base


def main() -> int:
    if not BASE or not EMAIL or not PASSWORD:
        print("Faltan variables de entorno: PB_BASE_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD")
        return 2

    st, auth = call(
        "/api/collections/_superusers/auth-with-password",
        "POST",
        body={"identity": EMAIL, "password": PASSWORD},
    )
    if st != 200 or not auth or not auth.get("token"):
        print(f"[!] auth falló ({st}). Revisa PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD.")
        return 1
    tok = auth["token"]

    st, _ = call(f"/api/collections/{COLECCION}", token=tok)
    if st == 200:
        print(f"[=] La colección {COLECCION} ya existe; nada que hacer.")
        return 0

    body = {
        "name": COLECCION,
        "type": "base",
        "listRule": None,
        "viewRule": None,
        "createRule": None,
        "updateRule": None,
        "deleteRule": None,
        "fields": [campo(n, t, e) for n, t, e in CAMPOS],
    }
    st, resp = call("/api/collections", "POST", token=tok, body=body)
    if st in (200, 201):
        print(f"[+] Colección {COLECCION} creada con {len(CAMPOS)} campos.")
        return 0
    if st == 400 and "already exists" in json.dumps(resp).lower():
        print(f"[=] La colección {COLECCION} ya existe.")
        return 0
    print(f"[!] No se pudo crear la colección ({st}): {json.dumps(resp)[:500]}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
