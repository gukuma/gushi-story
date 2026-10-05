#!/usr/bin/env python3
"""Create the Market Desk custom agents and scheduled tasks in a running DeerFlow.

Idempotent: agents that exist are updated, tasks with the same title are skipped (or updated with --update).

Logs in with your DeerFlow account (personal access tokens can't manage agents or schedules).
Credentials come from DEERFLOW_EMAIL / DEERFLOW_PASSWORD, or you are prompted.
  python3 market-desk/setup/seed.py                 # agents + tasks
  python3 market-desk/setup/seed.py --update        # also overwrite prompts/schedules of existing tasks
  python3 market-desk/setup/seed.py --paused        # create tasks paused (resume them in the UI)
  python3 market-desk/setup/seed.py --list          # show what's scheduled
  python3 market-desk/setup/seed.py --lang zh       # switch desk language (en | zh | both) and sync schedules

Language: market-desk/settings.json holds the active desk language. Agents for both languages are
always created; scheduled tasks for the active language(s) are created/resumed, the others paused.
Env: DEERFLOW_URL (default http://127.0.0.1:2026)
"""

from __future__ import annotations

import argparse
import getpass
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SETTINGS = HERE.parent / "settings.json"
LANGS = {"en": {"en"}, "zh": {"zh"}, "both": {"en", "zh"}}


def get_language() -> str:
    try:
        lang = json.loads(SETTINGS.read_text(encoding="utf-8")).get("language", "en")
    except (OSError, ValueError):
        lang = "en"
    return lang if lang in LANGS else "en"


def set_language(lang: str) -> None:
    try:
        data = json.loads(SETTINGS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    data["language"] = lang
    SETTINGS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


class Api:
    """Session-cookie client with DeerFlow's double-submit CSRF header."""

    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def login(self, email: str, password: str) -> tuple[int, object]:
        form = urllib.parse.urlencode({"username": email, "password": password}).encode()
        req = urllib.request.Request(self.base + "/api/v1/auth/login/local", data=form, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        return self._send(req)

    def initialize(self, email: str, password: str) -> tuple[int, object]:
        """Create the first admin account (only works while DeerFlow has no admin). Also logs in."""
        return self.call("POST", "/api/v1/auth/initialize", {"email": email, "password": password, "remember_me": True})

    def _csrf(self) -> str | None:
        return next((c.value for c in self.jar if c.name == "csrf_token"), None)

    def call(self, method: str, path: str, body: dict | None = None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if method not in ("GET", "HEAD") and self._csrf():
            req.add_header("X-CSRF-Token", self._csrf())
        return self._send(req)

    def _send(self, req):
        try:
            with self.opener.open(req, timeout=30) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read().decode(errors="replace")
            try:
                return e.code, json.loads(raw)
            except json.JSONDecodeError:
                return e.code, raw


def ask_new_password() -> str:
    while True:
        p1 = getpass.getpass("Choose a password (8+ characters, not a common one): ")
        if len(p1) < 8:
            print("  Too short.")
            continue
        if p1 != getpass.getpass("Repeat the password: "):
            print("  Didn't match, try again.")
            continue
        return p1


def login_or_create(api: "Api") -> bool:
    """Log in; if DeerFlow has no account yet, create the admin account first."""
    try:
        st, status = api.call("GET", "/api/v1/auth/setup-status")
    except urllib.error.URLError as e:
        print(f"Cannot reach DeerFlow at {api.base}: {e.reason}. Is it running? (make dev / desk start)", file=sys.stderr)
        return False
    if st == 200 and isinstance(status, dict) and status.get("needs_setup"):
        print("DeerFlow has no account yet — let's create yours (this becomes the admin account).")
        email = os.environ.get("DEERFLOW_EMAIL") or input("Email for your DeerFlow account: ").strip()
        while True:
            password = os.environ.get("DEERFLOW_PASSWORD") or ask_new_password()
            st, res = api.initialize(email, password)
            if st in (200, 201):
                print(f"✓ Created account {email}. Use it to sign in at {api.base}")
                return True
            print(f"! Could not create the account ({st}): {res}", file=sys.stderr)
            if st != 422 or os.environ.get("DEERFLOW_PASSWORD"):
                return False
            print("  (Usually: password too common or email malformed. Try again.)")
    email = os.environ.get("DEERFLOW_EMAIL") or input("DeerFlow email: ").strip()
    password = os.environ.get("DEERFLOW_PASSWORD") or getpass.getpass("DeerFlow password: ")
    st, res = api.login(email, password)
    if st == 200:
        return True
    print(f"Login failed ({st}): {res}", file=sys.stderr)
    if st == 401:
        print("An account already exists but this email/password doesn't match it.\n"
              "  - If you created it in the browser (http://localhost:2026), use those details.\n"
              "  - To see which email it is: sqlite3 backend/.deer-flow/data/deerflow.db 'select email from users;'\n"
              "  - Forgot the password: see 'Forgot your DeerFlow password' in market-desk/README.md.", file=sys.stderr)
    return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--update", action="store_true")
    ap.add_argument("--paused", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--skip-agents", action="store_true")
    ap.add_argument("--lang", choices=sorted(LANGS), help="set the desk language before syncing")
    ap.add_argument("--account-only", action="store_true", help="just create the first account / check the login")
    a = ap.parse_args()

    if a.lang:
        set_language(a.lang)
        print(f"Desk language set to '{a.lang}' (market-desk/settings.json).")
    lang = get_language()
    active = LANGS[lang]

    api = Api(os.environ.get("DEERFLOW_URL", "http://127.0.0.1:2026"))
    desk = json.loads((HERE / "desk.json").read_text(encoding="utf-8"))

    if not login_or_create(api):
        return 1
    if a.account_only:
        print(f"✓ Signed in to DeerFlow at {api.base}. Next: bash market-desk/desk.sh seed")
        return 0

    st, tasks = api.call("GET", "/api/scheduled-tasks")
    if st != 200:
        print(f"Cannot list scheduled tasks ({st}): {tasks}", file=sys.stderr)
        return 1
    if a.list:
        for t in tasks:
            print(f"{t['status']:8} {t.get('schedule_spec')} {t.get('timezone')}  next={t.get('next_run_at')}  {t['title']}  [{t['id']}]")
        return 0

    if not a.skip_agents:
        for ag in desk["agents"]:
            soul = (HERE / ag["soul_file"]).read_text(encoding="utf-8")
            # No skills whitelist: the local sandbox (host bash on) refuses per-agent skill lists.
            # The SOUL names the skills each agent should use; all enabled skills stay loadable.
            body = {k: ag[k] for k in ("display_name", "description")}
            body["skills"] = None
            body["soul"] = soul
            st, res = api.call("POST", "/api/agents", {"name": ag["name"], **body})
            if st == 201:
                print(f"+ agent {ag['name']}")
            elif st == 409:
                st, res = api.call("PUT", f"/api/agents/{ag['name']}", body)
                print(f"~ agent {ag['name']} updated" if st == 200 else f"! agent {ag['name']} update failed ({st}): {res}")
            elif st == 403 or (isinstance(res, dict) and "agents_api" in json.dumps(res)):
                print(f"! agent API disabled ({st}). Run apply_config.py (agents_api.enabled: true) and restart.", file=sys.stderr)
                return 1
            else:
                print(f"! agent {ag['name']} failed ({st}): {res}", file=sys.stderr)
                return 1

    print(f"Syncing schedules for language mode '{lang}' (active: {', '.join(sorted(active))})")
    by_title = {t["title"]: t for t in tasks}
    for t in desk["scheduled_tasks"]:
        existing = by_title.get(t["title"])
        if t.get("lang", "en") not in active:
            if existing and existing.get("status") in ("enabled", "active"):
                st, res = api.call("POST", f"/api/scheduled-tasks/{existing['id']}/pause")
                print(f"⏸ paused '{t['title']}' ({t.get('lang')})" if st == 200 else f"! pause '{t['title']}' failed ({st}): {res}")
            continue
        if existing and existing.get("status") == "paused" and not a.paused:
            st, res = api.call("POST", f"/api/scheduled-tasks/{existing['id']}/resume")
            print(f"▶ resumed '{t['title']}'" if st == 200 else f"! resume '{t['title']}' failed ({st}): {res}")
        body = {
            "title": t["title"],
            "prompt": t["prompt"],
            "assistant_id": t["assistant_id"],
            "schedule_type": "cron",
            "schedule_spec": {"cron": t["cron"]},
            "timezone": desk["timezone"],
            "context_mode": "fresh_thread_per_run",
        }
        if existing and not a.update:
            print(f"= task '{t['title']}' exists (use --update to overwrite)")
            continue
        if existing:
            patch = {k: body[k] for k in ("prompt", "assistant_id", "schedule_spec", "timezone")}
            st, res = api.call("PATCH", f"/api/scheduled-tasks/{existing['id']}", patch)
            print(f"~ task '{t['title']}' updated" if st == 200 else f"! update '{t['title']}' failed ({st}): {res}")
            continue
        st, res = api.call("POST", "/api/scheduled-tasks", body)
        if st in (200, 201):
            print(f"+ task '{t['title']}'  cron '{t['cron']}' {desk['timezone']}  next={res.get('next_run_at')}")
            if a.paused:
                api.call("POST", f"/api/scheduled-tasks/{res['id']}/pause")
                print("  (paused)")
        else:
            print(f"! task '{t['title']}' failed ({st}): {res}", file=sys.stderr)

    print("\nDone. Open http://localhost:2026/workspace/scheduled-tasks to review; use 'Trigger now' to test one.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
