import urllib.request, json
from urllib.error import HTTPError

PBPASS = "2wJEAhdqexRy1K7beBhq"
base = "https://creditos-pb.bunkeragent.cloud"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"

def call(path, method="GET", token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", UA)
    if token:
        req.add_header("Authorization", token)
    try:
        with urllib.request.urlopen(req) as r:
            if r.status == 204:
                return 204, None
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"_raw": raw[:300]}

st, auth = call("/api/collections/_superusers/auth-with-password", "POST",
                body={"identity": "admin@creditos.app", "password": PBPASS})
assert st == 200, f"auth failed {st}"
tok = auth["token"]

# Orden: hijos -> conversations -> leads. NO se tocan financieras, users, push_subscriptions.
COLLECTIONS_ORDER = [
    "processed_webhook_events",
    "messages",
    "lead_notes",
    "lead_audit",
    "citas",
    "operaciones",
    "conversations",
    "leads",
]

total_deleted = 0
for coll in COLLECTIONS_ORDER:
    page = 0
    deleted = 0
    while True:
        st, d = call(f"/api/collections/{coll}/records?perPage=200&page={page+1}", token=tok)
        if st != 200:
            print(f"[!] {coll}: error {st} {d}")
            break
        items = d.get("items", [])
        if not items:
            break
        for rec in items:
            rid = rec["id"]
            s2, _ = call(f"/api/collections/{coll}/records/{rid}", "DELETE", token=tok)
            if s2 == 204:
                deleted += 1
            else:
                print(f"[!!] no borrado {coll}/{rid}: {s2}")
        if len(items) < 200:
            break
        page += 1
    total_deleted += deleted
    print(f"{coll}: borrados {deleted}")

print(f"TOTAL borrados: {total_deleted}")

# Verificación final de que quedaron vacías
print("\n=== VERIFICACIÓN FINAL ===")
for coll in COLLECTIONS_ORDER:
    st, d = call(f"/api/collections/{coll}/records?perPage=1", token=tok)
    print(f"  {coll}: {d.get('totalItems', '?')} restantes" if st == 200 else f"  {coll}: error")