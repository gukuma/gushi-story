#!/usr/bin/env python3
"""Reset a DeerFlow account password from the terminal (local SQLite install).

Run via:  bash market-desk/desk.sh reset-password
(that runs this inside DeerFlow's backend environment, which has bcrypt).

Uses DeerFlow's own v2 hash format ($dfv2$ + bcrypt(b64(sha256(password)))) and bumps the
account's token_version so any existing sessions are signed out.
"""

from __future__ import annotations

import base64
import getpass
import hashlib
import os
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def db_path() -> Path:
    home = Path(os.environ.get("DEER_FLOW_HOME", REPO / "backend" / ".deer-flow"))
    for p in (home / "data" / "deerflow.db", REPO / ".deer-flow" / "data" / "deerflow.db"):
        if p.exists():
            return p
    sys.exit("No DeerFlow database found (backend/.deer-flow/data/deerflow.db). Has DeerFlow been started once?")


def hash_password(pw: str) -> str:
    try:  # prefer DeerFlow's own implementation when importable
        from app.gateway.auth.password import hash_password as df_hash  # type: ignore
        return df_hash(pw)
    except Exception:
        import bcrypt  # available in DeerFlow's backend venv
        pre = base64.b64encode(hashlib.sha256(pw.encode("utf-8")).digest())
        return "$dfv2$" + bcrypt.hashpw(pre, bcrypt.gensalt()).decode("utf-8")


def main() -> int:
    db = db_path()
    con = sqlite3.connect(db)
    users = con.execute("SELECT email, system_role FROM users WHERE password_hash IS NOT NULL ORDER BY created_at").fetchall()
    if not users:
        print("No password accounts exist yet. Create one with:  bash market-desk/desk.sh account")
        return 1
    print("Accounts:")
    for i, (email, role) in enumerate(users, 1):
        print(f"  {i}. {email} ({role})")
    pick = input("Reset which one? [1]: ").strip() or "1"
    try:
        email = users[int(pick) - 1][0]
    except (ValueError, IndexError):
        email = pick
    while True:
        p1 = getpass.getpass(f"New password for {email} (8+ characters): ")
        if len(p1) < 8:
            print("  Too short.")
            continue
        if p1 != getpass.getpass("Repeat: "):
            print("  Didn't match.")
            continue
        break
    cur = con.execute("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE email = ?", (hash_password(p1), email))
    con.commit()
    if cur.rowcount != 1:
        print(f"No account with email {email!r}.")
        return 1
    print(f"✓ Password reset for {email}. Sign in at http://localhost:2026 (restart DeerFlow if it was running: desk restart).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
