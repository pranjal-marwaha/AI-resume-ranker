import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

DB_PATH = Path(__file__).resolve().parent.parent / "hirelens.db"

def get_db():
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """Hashes password with PBKDF2-HMAC-SHA256 using 100,000 iterations."""
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        bytes.fromhex(salt),
        100000
    )
    return key.hex(), salt

def verify_password(password: str, password_hash: str, salt: str) -> bool:
    """Verifies a plain password against the stored hash and salt."""
    computed_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(computed_hash, password_hash)

def init_auth_db():
    """Initializes users and sessions tables with demo accounts if empty."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('student', 'hr')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """)
        conn.commit()

        # Seed demo student and HR accounts if table is fresh
        cur = conn.execute("SELECT COUNT(*) as cnt FROM users")
        if cur.fetchone()["cnt"] == 0:
            h_st, s_st = hash_password("StudentPass123!")
            conn.execute(
                "INSERT INTO users (email, password_hash, salt, full_name, role) VALUES (?, ?, ?, ?, ?)",
                ("student@hirelens.ai", h_st, s_st, "Demo Student", "student")
            )
            h_hr, s_hr = hash_password("HRRecruiter123!")
            conn.execute(
                "INSERT INTO users (email, password_hash, salt, full_name, role) VALUES (?, ?, ?, ?, ?)",
                ("hr@hirelens.ai", h_hr, s_hr, "Enterprise Recruiter", "hr")
            )
            conn.commit()

def register_user(email: str, password: str, full_name: str, role: str) -> Dict[str, Any]:
    """Registers a new user account with secure password hashing."""
    email_clean = email.strip().lower()
    if not email_clean or "@" not in email_clean:
        raise ValueError("A valid email address is required.")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")
    if role not in ("student", "hr"):
        raise ValueError("Role must be either 'student' or 'hr'.")
    if not full_name.strip():
        full_name = email_clean.split("@")[0].capitalize()

    pwd_hash, salt = hash_password(password)

    try:
        with get_db() as conn:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash, salt, full_name, role) VALUES (?, ?, ?, ?, ?)",
                (email_clean, pwd_hash, salt, full_name.strip(), role)
            )
            conn.commit()
            user_id = cur.lastrowid
            return {
                "id": user_id,
                "email": email_clean,
                "full_name": full_name.strip(),
                "role": role
            }
    except sqlite3.IntegrityError:
        raise ValueError("An account with this email already exists.")

def authenticate_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    """Authenticates email and password, returning user dictionary on success."""
    email_clean = email.strip().lower()
    with get_db() as conn:
        cur = conn.execute(
            "SELECT id, email, password_hash, salt, full_name, role FROM users WHERE email = ?",
            (email_clean,)
        )
        user = cur.fetchone()
        if not user:
            return None
        if verify_password(password, user["password_hash"], user["salt"]):
            return {
                "id": user["id"],
                "email": user["email"],
                "full_name": user["full_name"],
                "role": user["role"]
            }
        return None

def create_session(user_id: int, role: str) -> str:
    """Creates a persistent random session token valid for 7 days."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=7)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, role, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, role, expires_at.isoformat())
        )
        conn.commit()
    return token

def get_session_user(token: str) -> Optional[Dict[str, Any]]:
    """Validates session token and returns user information."""
    if not token:
        return None
    with get_db() as conn:
        cur = conn.execute("""
            SELECT s.token, s.role, s.expires_at, u.id as user_id, u.email, u.full_name
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ?
        """, (token,))
        row = cur.fetchone()
        if not row:
            return None

        # Check expiration
        expires = datetime.fromisoformat(row["expires_at"])
        if datetime.utcnow() > expires:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
            return None

        return {
            "token": row["token"],
            "user_id": row["user_id"],
            "email": row["email"],
            "full_name": row["full_name"],
            "role": row["role"]
        }

def terminate_session(token: str):
    """Logs out by deleting the session from SQLite."""
    if not token:
        return
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()

# Initialize DB on load
init_auth_db()
