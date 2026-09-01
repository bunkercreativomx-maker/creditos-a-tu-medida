import json, urllib.request, sys
from urllib.error import HTTPError

PBPASS = "2wJEAhdqexRy1K7beBhq"
base = "https://creditos-pb.bunkeragent.cloud"

def call(path, method="GET", token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", token)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

st, auth = call("/api/collections/_superusers/auth-with-password", "POST",
                body={"identity": "admin@creditos.app", "password": PBPASS})
print("auth:", st)
tok = auth.get("token", "")

st, d = call("/api/collections/conversations", token=tok)
print("get conversations:", st)
if st != 200:
    print(d)
    sys.exit(1)
fields = d.get("fields", [])
names = [f["name"] for f in fields]
print("before:", names)

def make_text(name):
    return {"name": name, "type": "text", "required": False, "max": 500, "min": 0,
            "pattern": "", "autogeneratePattern": "", "primaryKey": False,
            "system": False, "hidden": False, "presentable": False, "unique": False}

if "zernio_conversation_id" not in names:
    fields.append(make_text("zernio_conversation_id"))
if "zernio_account_id" not in names:
    fields.append(make_text("zernio_account_id"))

d["fields"] = fields
st, resp = call("/api/collections/conversations", "PUT", token=tok, body=d)
print("update:", st)
print("after:", [f["name"] for f in resp.get("fields", [])] if st == 200 else resp)
