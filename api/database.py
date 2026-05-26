"""
SQLite database layer for service requests, users, and garages.
"""
import re
import sqlite3
import pandas as pd
from pathlib import Path
from datetime import datetime

DB_PATH     = Path(__file__).resolve().parents[1] / "data" / "requests.db"
GARAGES_CSV = Path(__file__).resolve().parents[1] / "data" / "garages.csv"


def get_conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create all tables if they don't exist."""
    with get_conn() as conn:
        # ── Users table ───────────────────────────────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                name         TEXT    NOT NULL,
                phone        TEXT    NOT NULL UNIQUE,
                email        TEXT    NOT NULL DEFAULT '',
                password_hash TEXT   NOT NULL,
                created_at   TEXT    NOT NULL
            )
        """)

        # ── Garages (registered accounts) table ───────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS garage_accounts (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                garage_name   TEXT    NOT NULL,
                phone         TEXT    NOT NULL UNIQUE,
                email         TEXT    NOT NULL DEFAULT '',
                password_hash TEXT    NOT NULL,
                district      TEXT    NOT NULL DEFAULT '',
                address       TEXT    NOT NULL DEFAULT '',
                status        TEXT    NOT NULL DEFAULT 'pending',
                created_at    TEXT    NOT NULL
            )
        """)

        # ── Service requests table ─────────────────────────────────────────────
        conn.execute("""
            CREATE TABLE IF NOT EXISTS service_requests (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                garage_id    TEXT    NOT NULL,
                garage_name  TEXT    NOT NULL,
                user_id      INTEGER DEFAULT NULL,
                user_name    TEXT    NOT NULL DEFAULT 'Anonymous',
                user_phone   TEXT    NOT NULL DEFAULT '',
                user_lat     REAL    NOT NULL,
                user_lon     REAL    NOT NULL,
                user_address TEXT    NOT NULL DEFAULT '',
                problem_type TEXT    NOT NULL,
                urgency      TEXT    NOT NULL,
                message      TEXT    NOT NULL DEFAULT '',
                status       TEXT    NOT NULL DEFAULT 'pending',
                user_rating  REAL    DEFAULT NULL,
                user_review  TEXT    DEFAULT NULL,
                rated_at     TEXT    DEFAULT NULL,
                created_at   TEXT    NOT NULL,
                updated_at   TEXT    NOT NULL
            )
        """)

        # Add columns to existing DBs created before this version
        migrations = [
            ("service_requests", "user_rating", "REAL DEFAULT NULL"),
            ("service_requests", "user_review", "TEXT DEFAULT NULL"),
            ("service_requests", "rated_at",    "TEXT DEFAULT NULL"),
            ("service_requests", "user_id",     "INTEGER DEFAULT NULL"),
            ("garage_accounts",  "email",        "TEXT NOT NULL DEFAULT ''"),
            ("users",            "email",        "TEXT NOT NULL DEFAULT ''"),
        ]
        for table, col, definition in migrations:
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {definition}")
            except Exception:
                pass
        conn.commit()


# ── User auth ─────────────────────────────────────────────────────────────────

def _normalize_phone(phone: str) -> str:
    """
    Normalize any Rwandan phone format to +250XXXXXXXXX for storage & lookup.
    Accepts: 0785761688 / 250785761688 / +250785761688 / +250 785 761 688
    """
    digits = re.sub(r'\D', '', str(phone).strip())
    if digits.startswith("250") and len(digits) == 12:
        return f"+{digits}"          # +250XXXXXXXXX
    if digits.startswith("0") and len(digits) == 10:
        return f"+250{digits[1:]}"   # 0785... → +250785...
    if len(digits) == 9:
        return f"+250{digits}"       # 785... → +250785...
    return f"+{digits}" if not phone.strip().startswith("+") else phone.strip()


def create_user(name: str, phone: str, password_hash: str) -> dict:
    now = datetime.utcnow().isoformat()
    phone = _normalize_phone(phone)
    with get_conn() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (name, phone, password_hash, created_at) VALUES (?,?,?,?)",
                (name.strip(), phone.strip(), password_hash, now)
            )
            conn.commit()
            return get_user_by_id(cur.lastrowid)
        except sqlite3.IntegrityError:
            raise ValueError("Phone number already registered")


def get_user_by_phone(phone: str) -> dict | None:
    """Match regardless of spaces — handles old accounts stored with spaces."""
    normalized = re.sub(r'\D', '', _normalize_phone(phone))  # digits only
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE REPLACE(REPLACE(REPLACE(phone,' ',''),'+',''),'-','') = ?",
            (normalized,)
        ).fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id: int) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, name, phone, email, created_at FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return dict(row) if row else None


# ── Garage auth ───────────────────────────────────────────────────────────────

def register_garage(data: dict) -> dict:
    now = datetime.utcnow().isoformat()
    data["phone"] = _normalize_phone(data["phone"])
    with get_conn() as conn:
        try:
            cur = conn.execute("""
                INSERT INTO garage_accounts
                    (garage_name, phone, email, password_hash, district, address, status, created_at)
                VALUES (?,?,?,?,?,?,?,?)
            """, (
                data["garage_name"].strip(),
                data["phone"].strip(),
                data.get("email", "").strip().lower(),
                data["password_hash"],
                data.get("district", "").strip(),
                data.get("address", "").strip(),
                "pending",
                now,
            ))
            conn.commit()
            return get_garage_account_by_id(cur.lastrowid)
        except sqlite3.IntegrityError:
            raise ValueError("Phone number already registered")


def get_garage_account_by_phone(phone: str) -> dict | None:
    """Match regardless of spaces — handles old accounts stored with spaces."""
    normalized = re.sub(r'\D', '', _normalize_phone(phone))  # digits only
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM garage_accounts WHERE REPLACE(REPLACE(REPLACE(phone,' ',''),'+',''),'-','') = ?",
            (normalized,)
        ).fetchone()
        return dict(row) if row else None


def get_garage_account_by_id(garage_id: int) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, garage_name, phone, email, district, address, status, created_at FROM garage_accounts WHERE id = ?",
            (garage_id,)
        ).fetchone()
        return dict(row) if row else None


def get_all_garage_accounts() -> list:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, garage_name, phone, district, address, status, created_at FROM garage_accounts ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def update_garage_status(garage_id: int, status: str) -> dict:
    with get_conn() as conn:
        conn.execute(
            "UPDATE garage_accounts SET status = ? WHERE id = ?", (status, garage_id)
        )
        conn.commit()
        return get_garage_account_by_id(garage_id)



def create_request(data: dict) -> dict:
    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        cur = conn.execute("""
            INSERT INTO service_requests
                (garage_id, garage_name, user_name, user_phone,
                 user_lat, user_lon, user_address,
                 problem_type, urgency, message, status, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            data["garage_id"],
            data["garage_name"],
            data.get("user_name", "Anonymous"),
            data.get("user_phone", ""),
            data["user_lat"],
            data["user_lon"],
            data.get("user_address", ""),
            data["problem_type"],
            data["urgency"],
            data.get("message", ""),
            "pending",
            now, now,
        ))
        conn.commit()
        return get_request(cur.lastrowid)


def get_request(request_id: int) -> dict:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM service_requests WHERE id = ?", (request_id,)
        ).fetchone()
        return dict(row) if row else None


def get_requests_for_garage(garage_id: str) -> list:
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT * FROM service_requests
            WHERE LOWER(garage_id) = LOWER(?)
               OR LOWER(garage_name) = LOWER(?)
            ORDER BY created_at DESC
        """, (garage_id, garage_id)).fetchall()
        return [dict(r) for r in rows]


def update_request_status(request_id: int, status: str) -> dict:
    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        conn.execute("""
            UPDATE service_requests
            SET status = ?, updated_at = ?
            WHERE id = ?
        """, (status, now, request_id))
        conn.commit()
        return get_request(request_id)


def count_pending(garage_id: str) -> int:
    with get_conn() as conn:
        row = conn.execute("""
            SELECT COUNT(*) as cnt FROM service_requests
            WHERE (LOWER(garage_id) = LOWER(?) OR LOWER(garage_name) = LOWER(?))
              AND status = 'pending'
        """, (garage_id, garage_id)).fetchone()
        return row["cnt"] if row else 0


def submit_rating(request_id: int, rating: float, review: str) -> dict:
    """
    Save user rating on a completed request, then update the garage's
    rating in garages.csv using a running weighted average.
    Returns the updated request dict.
    """
    req = get_request(request_id)
    if not req:
        raise ValueError("Request not found")
    if req["status"] != "completed":
        raise ValueError("Can only rate completed requests")
    if req["user_rating"] is not None:
        raise ValueError("This request has already been rated")
    if not (1 <= rating <= 5):
        raise ValueError("Rating must be between 1 and 5")

    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        conn.execute("""
            UPDATE service_requests
            SET user_rating = ?, user_review = ?, rated_at = ?, updated_at = ?
            WHERE id = ?
        """, (rating, review or "", now, now, request_id))
        conn.commit()

    # ── Update garages.csv rating (weighted average) ──────────────────────
    _update_garage_rating(req["garage_name"], rating)

    return get_request(request_id)


def _update_garage_rating(garage_name: str, new_rating: float):
    """
    Recalculate the garage's rating in garages.csv using a simple running
    average of all user ratings stored in the DB for this garage.
    """
    if not GARAGES_CSV.exists():
        return

    df = pd.read_csv(GARAGES_CSV)

    # Match by name (case-insensitive)
    mask = df["name"].str.strip().str.lower() == garage_name.strip().lower()
    if not mask.any():
        return

    # Get the true average of ALL ratings for this garage from the DB
    with get_conn() as conn:
        row = conn.execute("""
            SELECT COUNT(*) as cnt, AVG(user_rating) as avg_r
            FROM service_requests
            WHERE garage_name = ? AND user_rating IS NOT NULL
        """, (garage_name,)).fetchone()

    if not row or not row["avg_r"]:
        return

    total_ratings = row["cnt"]
    db_avg = row["avg_r"]

    # Blend: weight DB average against the original CSV rating as a prior
    # original CSV rating counts as 1 prior vote to avoid wild swings on 1 rating
    original_rating = float(df.loc[mask, "rating"].iloc[0])
    blended = (original_rating + db_avg * total_ratings) / (1 + total_ratings)
    blended = round(min(max(blended, 1.0), 5.0), 1)

    df.loc[mask, "rating"] = blended
    df.to_csv(GARAGES_CSV, index=False)


def get_garage_reviews(garage_name: str) -> list:
    """Return all rated reviews for a garage."""
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT user_name, user_rating, user_review, rated_at, problem_type
            FROM service_requests
            WHERE garage_name = ? AND user_rating IS NOT NULL
            ORDER BY rated_at DESC
        """, (garage_name,)).fetchall()
        return [dict(r) for r in rows]


# ── Admin: User management ────────────────────────────────────────────────────

def get_all_users() -> list:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, name, phone, created_at FROM users ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def update_user(user_id: int, name: str, phone: str) -> dict:
    phone = _normalize_phone(phone)
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET name=?, phone=? WHERE id=?",
            (name.strip(), phone, user_id)
        )
        conn.commit()
        return get_user_by_id(user_id)


def delete_user(user_id: int) -> bool:
    with get_conn() as conn:
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))
        conn.commit()
        return True


# ── Admin: Garage account management ─────────────────────────────────────────

def update_garage_account(garage_id: int, data: dict) -> dict:
    with get_conn() as conn:
        conn.execute("""
            UPDATE garage_accounts
            SET garage_name=?, phone=?, district=?, address=?
            WHERE id=?
        """, (
            data.get("garage_name", "").strip(),
            _normalize_phone(data.get("phone", "")),
            data.get("district", "").strip(),
            data.get("address", "").strip(),
            garage_id,
        ))
        conn.commit()
        return get_garage_account_by_id(garage_id)


def delete_garage_account(garage_id: int) -> bool:
    with get_conn() as conn:
        conn.execute("DELETE FROM garage_accounts WHERE id=?", (garage_id,))
        conn.commit()
        return True


def reset_garage_password(garage_id: int, password_hash: str) -> bool:
    with get_conn() as conn:
        conn.execute(
            "UPDATE garage_accounts SET password_hash=? WHERE id=?",
            (password_hash, garage_id)
        )
        conn.commit()
        return True


def reset_user_password(user_id: int, password_hash: str) -> bool:
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET password_hash=? WHERE id=?",
            (password_hash, user_id)
        )
        conn.commit()
        return True
