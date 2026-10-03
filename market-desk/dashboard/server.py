#!/usr/bin/env python3
"""Market Desk — a local reading room and health board for DeerFlow research.

Reads, never writes:
  - market-desk/library/          reports (*.md with front matter), calls.csv, watchlist.yaml
  - backend/.deer-flow/           thread outputs (*.md) and deerflow.db (runs, scheduled tasks, tokens)
  - config.yaml                   which Market Desk switches are on

  python3 market-desk/dashboard/server.py            # http://127.0.0.1:2027
  python3 market-desk/dashboard/server.py --port 8090 --open

Env overrides: DEER_FLOW_HOME, MARKET_LIBRARY, DEERFLOW_UI (default http://127.0.0.1:2026),
DEERFLOW_GATEWAY (default http://127.0.0.1:8001).
Standard library only.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import os
import re
import sqlite3
import sys
import threading
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DF_HOME = Path(os.environ.get("DEER_FLOW_HOME", REPO / "backend" / ".deer-flow"))
LIBRARY = Path(os.environ.get("MARKET_LIBRARY", REPO / "market-desk" / "library"))
CONFIG = REPO / "config.yaml"
SETTINGS = REPO / "market-desk" / "settings.json"
UI = os.environ.get("DEERFLOW_UI", "http://127.0.0.1:2026").rstrip("/")
GATEWAY = os.environ.get("DEERFLOW_GATEWAY", "http://127.0.0.1:8001").rstrip("/")
MAX_MD_BYTES = 2_000_000


# ------------------------------------------------------------------ helpers
def db_path() -> Path | None:
    for p in (DF_HOME / "data" / "deerflow.db", REPO / "backend" / ".deer-flow" / "data" / "deerflow.db", REPO / ".deer-flow" / "data" / "deerflow.db"):
        if p.exists():
            return p
    return None


def query(sql: str, params: tuple = ()) -> list[dict]:
    p = db_path()
    if not p:
        return []
    con = sqlite3.connect(f"file:{p}?mode=ro", uri=True, timeout=3)
    con.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in con.execute(sql, params)]
    except sqlite3.Error:
        return []
    finally:
        con.close()


def table_exists(name: str) -> bool:
    return bool(query("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,)))


def parse_front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    meta: dict = {}
    for line in text[3:end].splitlines():
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*?)\s*(#.*)?$", line)
        if not m:
            continue
        k, v = m.group(1), m.group(2)
        if v.startswith("[") and v.endswith("]"):
            meta[k] = [x.strip().strip("'\"") for x in v[1:-1].split(",") if x.strip()]
        else:
            meta[k] = v.strip("'\"")
    body = text[end + 4:].lstrip("\n")
    return meta, body


def desk_language() -> str:
    try:
        lang = json.loads(SETTINGS.read_text(encoding="utf-8")).get("language", "en")
        return lang if lang in ("en", "zh", "both") else "en"
    except (OSError, ValueError):
        return "en"


_CJK = re.compile(r"[\u4e00-\u9fff]")


def detect_lang(meta: dict, title: str, body: str) -> str:
    if meta.get("lang") in ("zh", "en"):
        return meta["lang"]
    sample = (title or "") + body[:1500]
    cjk = len(_CJK.findall(sample))
    return "zh" if cjk > max(20, len(sample) * 0.15) or (title and len(_CJK.findall(title)) > len(title) * 0.3) else "en"


def first_heading(body: str) -> str | None:
    m = re.search(r"(?m)^#\s+(.+)$", body)
    return m.group(1).strip() if m else None


def to_iso(v) -> str | None:
    if v is None:
        return None
    s = str(v).replace(" ", "T")
    if re.search(r"(Z|[+-]\d\d:?\d\d)$", s) is None:
        s += "Z"  # SQLAlchemy stores naive UTC
    return s


# ------------------------------------------------------------------ report index
_INDEX: dict[str, Path] = {}
_LOCK = threading.Lock()


def thread_titles() -> dict[str, str]:
    if not table_exists("threads_meta"):
        return {}
    return {r["thread_id"]: r["display_name"] or "" for r in query("SELECT thread_id, display_name FROM threads_meta")}


def scan_reports() -> list[dict]:
    items: list[dict] = []
    seen_hashes: set[str] = set()
    titles = thread_titles()

    def add(path: Path, origin: str, thread_id: str | None):
        try:
            st = path.stat()
            if st.st_size > MAX_MD_BYTES:
                return
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return
        h = hashlib.sha1(text.encode()).hexdigest()
        if h in seen_hashes:
            return
        seen_hashes.add(h)
        meta, body = parse_front_matter(text)
        rid = h[:16]
        _INDEX[rid] = path
        date = meta.get("date") or dt.datetime.fromtimestamp(st.st_mtime).date().isoformat()
        tickers = meta.get("tickers") if isinstance(meta.get("tickers"), list) else []
        title = meta.get("title") or first_heading(body) or path.stem
        items.append({
            "id": rid,
            "title": title,
            "lang": detect_lang(meta, title, body),
            "date": str(date),
            "type": meta.get("type") or ("note" if origin == "library" else "thread-output"),
            "mode": meta.get("mode"),
            "summary": meta.get("summary") or "",
            "confidence": meta.get("confidence"),
            "stance": meta.get("stance"),
            "tickers": tickers,
            "calls": meta.get("calls") if isinstance(meta.get("calls"), list) else [],
            "origin": origin,
            "path": str(path.relative_to(REPO)) if path.is_relative_to(REPO) else str(path),
            "thread_id": thread_id,
            "thread_title": titles.get(thread_id or "", ""),
            "thread_url": f"{UI}/workspace/chats/{thread_id}" if thread_id else None,
            "mtime": dt.datetime.fromtimestamp(st.st_mtime, dt.timezone.utc).isoformat(),
            "words": len(body.split()) if detect_lang(meta, title, body) == "en" else len(_CJK.findall(body)),
        })

    # 1) curated library first, so duplicates resolve to the library copy
    if (LIBRARY / "reports").exists():
        for p in sorted((LIBRARY / "reports").rglob("*.md")):
            add(p, "library", None)
    # 2) every thread's outputs (current per-user layout and legacy layout)
    for pattern in ("users/*/threads/*/user-data/outputs/**/*.md", "threads/*/user-data/outputs/**/*.md"):
        for p in DF_HOME.glob(pattern):
            parts = p.parts
            tid = parts[parts.index("threads") + 1] if "threads" in parts else None
            add(p, "thread", tid)
    items.sort(key=lambda r: (r["date"], r["origin"] == "library", r["mtime"]), reverse=True)
    return items


# ------------------------------------------------------------------ status
def config_flags() -> dict:
    if not CONFIG.exists():
        return {"exists": False}
    t = CONFIG.read_text(encoding="utf-8", errors="replace")

    def block_flag(block, key):
        m = re.search(rf"(?m)^{block}:\s*\n((?:[ \t]+.*\n|[ \t]*\n|#.*\n)*)", t)
        if not m:
            return None
        km = re.search(rf"(?m)^  {key}:\s*(\S+)", m.group(1))
        return km.group(1) == "true" if km else None

    mb = re.search(r"(?m)^models:.*\n((?:[ \t]+.*\n|-.*\n|[ \t]*\n|#.*\n)*)", t)
    models = re.findall(r"(?m)^[ \t]*- name:\s*(\S+)", mb.group(1)) if mb else []
    search = re.search(r"(?m)^  - name: web_search\s*\n(?:\s+#.*\n)*\s+group: web\s*\n\s+use:\s*(\S+)", t)
    return {
        "exists": True,
        "scheduler": block_flag("scheduler", "enabled"),
        "agents_api": block_flag("agents_api", "enabled"),
        "host_bash": block_flag("sandbox", "allow_host_bash"),
        "library_mount": "container_path: /mnt/library" in t,
        "models": models[:6],
        "search_provider": search.group(1).split(".")[2] if search and search.group(1).count(".") >= 2 else (search.group(1) if search else None),
    }


def gateway_up() -> bool:
    try:
        with urllib.request.urlopen(GATEWAY + "/health", timeout=1.5) as r:
            return r.status == 200
    except Exception:
        return False


def overview() -> dict:
    cfg = config_flags()
    reports = scan_reports()
    tasks = schedules()["tasks"]
    usage = usage_summary(7)
    calls = calls_data()
    week_ago = (dt.date.today() - dt.timedelta(days=7)).isoformat()
    return {
        "now": dt.datetime.now(dt.timezone.utc).isoformat(),
        "gateway_up": gateway_up(),
        "ui_url": UI,
        "desk_language": desk_language(),
        "db": str(db_path()) if db_path() else None,
        "library": str(LIBRARY),
        "library_exists": LIBRARY.exists(),
        "config": cfg,
        "reports_total": len(reports),
        "reports_7d": sum(1 for r in reports if r["date"] >= week_ago),
        "tasks_active": sum(1 for t in tasks if t["status"] == "active"),
        "tasks_total": len(tasks),
        "tasks_failing": sum(1 for t in tasks if t.get("last_error")),
        "next_run": min((t["next_run_at"] for t in tasks if t["next_run_at"] and t["status"] == "active"), default=None),
        "tokens_7d": usage["totals"]["tokens"],
        "runs_7d": usage["totals"]["runs"],
        "failed_runs_7d": usage["totals"]["failed"],
        "brier": calls["score"].get("brier"),
        "calls_open": sum(1 for c in calls["rows"] if c.get("status") == "open"),
    }


def schedules() -> dict:
    if not table_exists("scheduled_tasks"):
        return {"tasks": [], "runs": []}
    tasks = query("SELECT id, title, assistant_id, prompt, schedule_type, schedule_spec, timezone, status, next_run_at, last_run_at, "
                  "last_thread_id, last_error, run_count FROM scheduled_tasks ORDER BY title")
    for t in tasks:
        try:
            spec = json.loads(t["schedule_spec"]) if isinstance(t["schedule_spec"], str) else t["schedule_spec"]
        except (TypeError, json.JSONDecodeError):
            spec = {}
        t["schedule"] = spec.get("cron") or (f"every {spec.get('every_seconds')}s" if spec.get("every_seconds") else spec.get("run_at", ""))
        t["next_run_at"] = to_iso(t["next_run_at"])
        t["last_run_at"] = to_iso(t["last_run_at"])
        t["last_thread_url"] = f"{UI}/workspace/chats/{t['last_thread_id']}" if t.get("last_thread_id") else None
        t.pop("schedule_spec", None)
    has_runs = table_exists("runs")
    runs = query(
        "SELECT r.id, r.task_id, t.title, r.thread_id, r.run_id, r.scheduled_for, r.trigger, r.status, r.error, r.started_at, r.finished_at"
        + (", x.total_tokens, x.model_name" if has_runs else "")
        + " FROM scheduled_task_runs r LEFT JOIN scheduled_tasks t ON t.id = r.task_id"
        + (" LEFT JOIN runs x ON x.run_id = r.run_id" if has_runs else "")
        + " ORDER BY r.scheduled_for DESC LIMIT 60"
    ) if table_exists("scheduled_task_runs") else []
    for r in runs:
        for k in ("scheduled_for", "started_at", "finished_at"):
            r[k] = to_iso(r[k])
        r["thread_url"] = f"{UI}/workspace/chats/{r['thread_id']}" if r.get("thread_id") else None
    return {"tasks": tasks, "runs": runs}


def usage_summary(days: int = 30) -> dict:
    empty = {"days": [], "models": [], "totals": {"tokens": 0, "runs": 0, "failed": 0}, "recent_failures": []}
    if not table_exists("runs"):
        return empty
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)).strftime("%Y-%m-%d")
    rows = query("SELECT substr(created_at,1,10) AS day, COUNT(*) AS runs, COALESCE(SUM(total_tokens),0) AS tokens, "
                 "SUM(CASE WHEN status IN ('error','timeout') THEN 1 ELSE 0 END) AS failed "
                 "FROM runs WHERE created_at >= ? GROUP BY day ORDER BY day", (since,))
    models = query("SELECT COALESCE(model_name,'(default)') AS model, COUNT(*) AS runs, COALESCE(SUM(total_tokens),0) AS tokens, "
                   "COALESCE(SUM(total_input_tokens),0) AS input_tokens, COALESCE(SUM(total_output_tokens),0) AS output_tokens "
                   "FROM runs WHERE created_at >= ? GROUP BY model ORDER BY tokens DESC", (since,))
    fails = query("SELECT run_id, thread_id, status, error, created_at, assistant_id FROM runs WHERE status IN ('error','timeout') "
                  "AND created_at >= ? ORDER BY created_at DESC LIMIT 15", (since,))
    for f in fails:
        f["created_at"] = to_iso(f["created_at"])
        f["thread_url"] = f"{UI}/workspace/chats/{f['thread_id']}"
    # fill missing days so the bar chart has an honest time axis
    by_day = {r["day"]: r for r in rows}
    start = dt.date.today() - dt.timedelta(days=days - 1)
    filled = []
    for i in range(days):
        d = (start + dt.timedelta(days=i)).isoformat()
        filled.append(by_day.get(d, {"day": d, "runs": 0, "tokens": 0, "failed": 0}))
    return {
        "days": filled,
        "models": models,
        "totals": {"tokens": sum(r["tokens"] for r in rows), "runs": sum(r["runs"] for r in rows), "failed": sum(r["failed"] or 0 for r in rows)},
        "recent_failures": fails,
    }


def calls_data() -> dict:
    p = LIBRARY / "calls.csv"
    rows = []
    if p.exists():
        with p.open(newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
        for r in rows:  # ledgers created before the `lang` column existed
            extra = r.pop(None, None)
            if extra and not r.get("lang"):
                r["lang"] = extra[0]
    done = [(float(r["prob"]), int(r["outcome"])) for r in rows if r.get("status") == "resolved" and r.get("outcome") in ("0", "1")]
    score: dict = {"resolved": len(done)}
    if done:
        score["brier"] = round(sum((p_ - o) ** 2 for p_, o in done) / len(done), 4)
        score["hit_rate"] = round(sum(1 for p_, o in done if (p_ >= 0.5) == (o == 1)) / len(done), 3)
        grouped: dict[int, list] = {}
        for p_, o in done:
            conf = max(p_, 1 - p_)
            grouped.setdefault(min(int(conf * 10), 9) * 10, []).append((conf, int((p_ >= 0.5) == (o == 1))))
        score["buckets"] = [{"bucket": f"{lo}–{lo + 10}%", "n": len(v), "stated": sum(c for c, _ in v) / len(v),
                             "realized": sum(r for _, r in v) / len(v)} for lo, v in sorted(grouped.items())]
    return {"rows": list(reversed(rows)), "score": score}


def watchlist() -> dict:
    p = LIBRARY / "watchlist.yaml"
    if not p.exists():
        return {"sections": [], "path": str(p), "exists": False}
    sections, cur = [], None
    for line in p.read_text(encoding="utf-8").splitlines():
        if re.match(r"^[A-Za-z_][\w-]*:\s*$", line):
            cur = {"name": line.strip()[:-1], "items": []}
            sections.append(cur)
        elif cur is not None and (m := re.match(r"^\s+-\s+(.*)$", line)):
            head, _, note = m.group(1).partition("|")
            bits = head.split(None, 1)
            cur["items"].append({"code": bits[0], "name": bits[1].strip() if len(bits) > 1 else "", "note": note.strip()})
    return {"sections": sections, "path": str(p), "exists": True}


# ------------------------------------------------------------------ http
class Handler(BaseHTTPRequestHandler):
    server_version = "MarketDesk/1.0"

    def log_message(self, fmt, *args):  # quiet
        pass

    def _send(self, code: int, body: bytes, ctype: str):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False, default=str).encode(), "application/json; charset=utf-8")

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(u.query)
        try:
            if u.path in ("/", "/index.html", "/zh", "/zh/", "/en", "/en/"):
                return self._send(200, (HERE / "index.html").read_bytes(), "text/html; charset=utf-8")
            if u.path == "/api/overview":
                return self._json(overview())
            if u.path == "/api/reports":
                with _LOCK:
                    return self._json(scan_reports())
            if u.path == "/api/report":
                rid = (qs.get("id") or [""])[0]
                with _LOCK:
                    if rid not in _INDEX:
                        scan_reports()
                    p = _INDEX.get(rid)
                if not p or not p.exists():
                    return self._json({"error": "not found"}, 404)
                meta, body = parse_front_matter(p.read_text(encoding="utf-8", errors="replace"))
                return self._json({"meta": meta, "body": body, "path": str(p)})
            if u.path == "/api/schedules":
                return self._json(schedules())
            if u.path == "/api/usage":
                return self._json(usage_summary(int((qs.get("days") or ["30"])[0])))
            if u.path == "/api/calls":
                return self._json(calls_data())
            if u.path == "/api/watchlist":
                return self._json(watchlist())
            return self._json({"error": "unknown path"}, 404)
        except BrokenPipeError:
            pass
        except Exception as e:  # surface errors to the page instead of a blank screen
            return self._json({"error": f"{type(e).__name__}: {e}"}, 500)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2027)
    ap.add_argument("--open", action="store_true", help="open the browser")
    a = ap.parse_args()
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    url = f"http://{a.host}:{a.port}"
    print(f"Market Desk on {url}\n  library : {LIBRARY}\n  deerflow: {DF_HOME}  (db: {db_path() or 'not created yet'})\nCtrl-C to stop.")
    if a.open:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
