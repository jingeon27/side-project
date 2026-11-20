"""Loopback-only blind review. Both concurrent edits and ambiguous measurements stay visible."""

import json
import os
import re
import threading
import time
import urllib.request
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from uuid import uuid4

from clash_bot.paths import ASSETS_DIR
from clash_bot.perception.labels.reader import SCREEN
from clash_bot.perception.labels.schema import CATALOGUE, Label
from clash_bot.perception.labels.store import database, queue, save_label

ASSETS = ASSETS_DIR / "label-workbench"
EVENTS = {"trophy_label_opened", "trophy_label_save_clicked", "trophy_label_saved"}
DEVICE = str(uuid4())


def track(event, split):
    key = os.environ.get("CLASH_BOT_AMPLITUDE_KEY", "").strip()
    if not key or event not in EVENTS or split not in ("measurement", "coverage"):
        return
    payload = {
        "api_key": key,
        "events": [
            {"device_id": DEVICE, "event_type": event, "event_properties": {"partition": split}}
        ],
    }

    def send():
        try:
            req = urllib.request.Request(
                "https://api2.amplitude.com/2/httpapi",
                json.dumps(payload).encode(),
                {"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=3):
                pass
        except OSError:
            pass

    threading.Thread(target=send, daemon=True).start()


def daily(db, split):
    if split not in ("coverage", "measurement"):
        raise ValueError("Unknown partition")
    db.execute(
        "CREATE TABLE IF NOT EXISTS assignments(day TEXT,split TEXT,sha TEXT REFERENCES frames,PRIMARY KEY(day,sha))"
    )
    day = datetime.now(UTC).date().isoformat()
    db.execute("BEGIN IMMEDIATE")
    cap = SCREEN["reviewPerDay"] // 2
    used = db.execute(
        "SELECT count(*) FROM assignments WHERE day=? AND split=?", (day, split)
    ).fetchone()[0]
    if used < cap:
        for row in queue(db, split, cap):
            if used >= cap:
                break
            used += db.execute(
                "INSERT OR IGNORE INTO assignments VALUES (?,?,?)", (day, split, row["sha"])
            ).rowcount
    return [
        dict(r)
        for r in db.execute(
            """SELECT f.sha,f.match,f.name,f.at,0 AS revision FROM assignments a JOIN frames f USING(sha)
      LEFT JOIN current_reviews c USING(sha) WHERE a.day=? AND a.split=? AND c.sha IS NULL ORDER BY a.rowid""",
            (day, split),
        )
    ]


def review_server(port, script):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, status, body, kind="application/json"):
            data = body if isinstance(body, bytes) else json.dumps(body, allow_nan=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; img-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'",
            )
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def allowed(self, write=False):
            host = f"127.0.0.1:{self.server.server_port}"
            return self.headers.get("Host") == host and (
                not write or self.headers.get("Origin") == "http://" + host
            )

        def do_GET(self):
            if not self.allowed():
                return self.reply(403, {"error": "Loopback origin required"})
            if self.path == "/":
                return self.reply(
                    200, (ASSETS / "index.html").read_bytes(), "text/html; charset=utf-8"
                )
            if self.path == "/style.css":
                return self.reply(200, (ASSETS / "style.css").read_bytes(), "text/css")
            if self.path == "/review.js":
                return self.reply(200, script, "text/javascript; charset=utf-8")
            if self.path == "/catalogue":
                return self.reply(
                    200,
                    {
                        "cards": sorted(CATALOGUE["cards"]),
                        "bodies": sorted(CATALOGUE["bodies"].keys() - {"?"}),
                    },
                )
            with database() as db:
                if route := re.fullmatch(r"/queue/(coverage|measurement)", self.path):
                    return self.reply(200, daily(db, route[1]))
                if route := re.fullmatch(r"/confirm/(coverage|measurement)", self.path):
                    rows = db.execute(
                        """SELECT f.sha,f.match,f.name,f.at,r.revision FROM frames f JOIN matches m ON m.id=f.match
                      JOIN current_reviews c ON c.sha=f.sha JOIN reviews r ON r.sha=c.sha AND r.revision=c.revision
                      WHERE m.split=? AND json_extract(r.label,'$.reviewer')='visual_assistant' ORDER BY f.rank LIMIT 10""",
                        (route[1],),
                    )
                    return self.reply(200, [dict(v) for v in rows])
                if route := re.fullmatch(r"/repeat/(coverage|measurement)", self.path):
                    # A second review is blind to the first one.
                    rows = db.execute(
                        """SELECT f.sha,f.match,f.name,f.at,max(r.revision) AS revision FROM frames f
                      JOIN matches m ON m.id=f.match JOIN reviews r ON r.sha=f.sha WHERE m.split=?
                      GROUP BY f.sha HAVING max(r.reviewed) <= ? AND count(*)=1 AND json_extract(r.label,'$.reviewer')='human'
                      ORDER BY f.rank LIMIT 15""",
                        (route[1], time.time() - 2 * 86400),
                    )
                    return self.reply(200, [dict(v) for v in rows])
                if route := re.fullmatch(r"/frame/([0-9a-f]{64})", self.path):
                    row = db.execute("SELECT png FROM frames WHERE sha=?", (route[1],)).fetchone()
                    if row:
                        return self.reply(200, row[0], "image/png")
            self.reply(404, {"error": "Unknown resource"})

        def do_POST(self):
            if not self.allowed(True):
                return self.reply(403, {"error": "Same-origin review required"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 100000:
                    return self.reply(413, {"error": "Invalid payload size"})
                data = json.loads(self.rfile.read(length))
                if self.path == "/event" and data.get("event") in EVENTS - {"trophy_label_saved"}:
                    track(data["event"], data["split"])
                    return self.reply(200, {"ok": True})
                if self.path != "/label":
                    return self.reply(404, {"error": "Unknown resource"})
                label = Label.model_validate({**data["label"], "reviewer": "human"})
                with database() as db:
                    revision = save_label(db, label, data["revision"])
                    split = db.execute(
                        "SELECT split FROM matches JOIN frames ON id=match WHERE sha=?",
                        (label.frameSHA256,),
                    ).fetchone()[0]
                    duration = data["seconds"]
                    if type(duration) not in (float, int) or not 0 <= duration <= 86400:
                        raise ValueError("Invalid duration")
                    db.execute(
                        "CREATE TABLE IF NOT EXISTS timings(sha TEXT,revision INTEGER,seconds REAL,PRIMARY KEY(sha,revision))"
                    )
                    db.execute(
                        "INSERT INTO timings VALUES(?,?,?)", (label.frameSHA256, revision, duration)
                    )
                track("trophy_label_saved", split)
                return self.reply(200, {"revision": revision})
            except (ValueError, TypeError, KeyError) as exc:
                return self.reply(409, {"error": str(exc)})

    with ThreadingHTTPServer(("127.0.0.1", port), Handler) as server:
        print(f"http://127.0.0.1:{server.server_port}", flush=True)
        server.serve_forever()
