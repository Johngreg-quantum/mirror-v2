import os
import re
import time
import sqlite3
import difflib
import hashlib
import tempfile
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone, date
from typing import Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
import openai
from jose import JWTError, jwt
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="MIRROR — Movie Scene Language Learning")

# ---------------------------------------------------------------------------
# CORS — only the production domain and local dev origins are allowed.
# The frontend is served from the same domain as the API, so these origins
# matter only for external/cross-origin callers.
# ---------------------------------------------------------------------------
_ALLOWED_ORIGINS = [
    "https://mirror-app-z8wr.onrender.com",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
_RATE_WINDOW        = 3600          # sliding window — 1 hour in seconds
_IP_LIMIT           = 100           # max API requests per IP per window
_SUBMIT_LIMIT       = 10            # max recording submissions per user per window
_MAX_AUDIO_BYTES    = 10 * 1024 * 1024   # 10 MB upload cap
_ALLOWED_AUDIO_EXT  = {".webm", ".mp4", ".ogg", ".mp3", ".wav", ".m4a"}

# Sliding-window buckets keyed by IP address (in-memory; resets on restart,
# which is acceptable for a single-instance deployment).
_ip_hits: dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    """Return the real client IP, honouring Render's X-Forwarded-For header."""
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def ip_rate_limit(request: Request, call_next):
    """Reject requests from IPs that exceed _IP_LIMIT API calls per hour.
    OPTIONS (CORS preflight) and the HTML root are exempt."""
    if request.method != "OPTIONS" and request.url.path.startswith("/api/"):
        ip  = _client_ip(request)
        now = time.monotonic()
        dq  = _ip_hits[ip]
        while dq and dq[0] < now - _RATE_WINDOW:
            dq.popleft()
        if len(dq) >= _IP_LIMIT:
            return JSONResponse(
                {"detail": "Too many requests — please try again later"},
                status_code=429,
                headers={"Retry-After": "3600"},
            )
        dq.append(now)
    return await call_next(request)


def _check_submit_rate(user_id: int, conn) -> None:
    """Raise 429 when this user has already submitted _SUBMIT_LIMIT recordings
    in the past hour.  Uses the scores table so the check survives restarts."""
    cur = conn.cursor()
    if USE_PG:
        cur.execute(
            "SELECT COUNT(*) FROM scores "
            "WHERE user_id = %s AND created_at > NOW() - INTERVAL '1 hour'",
            (user_id,),
        )
    else:
        cur.execute(
            "SELECT COUNT(*) FROM scores "
            "WHERE user_id = ? AND created_at > datetime('now', '-1 hour')",
            (user_id,),
        )
    count = cur.fetchone()[0]
    if count >= _SUBMIT_LIMIT:
        raise HTTPException(
            429,
            f"Submission limit reached — max {_SUBMIT_LIMIT} recordings per hour",
        )


# ---------------------------------------------------------------------------
DB_PATH   = "mirror.db"
SECRET    = os.getenv("JWT_SECRET", "change-me-to-a-long-random-string-in-production")
ALGORITHM = "HS256"
TOKEN_TTL = 30  # days

# ---------------------------------------------------------------------------
# Database backend — PostgreSQL when DATABASE_URL is set, SQLite otherwise
#
# Render's free PostgreSQL addon supplies DATABASE_URL as "postgres://…".
# psycopg2 requires the "postgresql://" scheme, so we normalise it here.
# ---------------------------------------------------------------------------

_raw_db_url  = os.getenv("DATABASE_URL", "")
DATABASE_URL = _raw_db_url.replace("postgres://", "postgresql://", 1) if _raw_db_url else ""
USE_PG       = bool(DATABASE_URL)

if USE_PG:
    import ssl
    import pg8000.dbapi
    PH              = "%s"                      # PostgreSQL parameter placeholder
    _IntegrityError = pg8000.dbapi.IntegrityError
else:
    PH              = "?"                       # SQLite parameter placeholder
    _IntegrityError = sqlite3.IntegrityError


def _pg_params(url: str) -> dict:
    """Parse a postgres:// or postgresql:// URL into pg8000.dbapi.connect kwargs.
    pg8000 does not accept a connection string — it requires keyword arguments.
    Handles ?sslmode=require that Render adds to external connection URLs."""
    from urllib.parse import urlparse, parse_qs
    p  = urlparse(url)
    qs = parse_qs(p.query)
    params: dict = {
        "host":     p.hostname,
        "port":     p.port or 5432,
        "database": p.path.lstrip("/"),
        "user":     p.username,
        "password": p.password,
    }
    if qs.get("sslmode", [""])[0] == "require":
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode    = ssl.CERT_NONE
        params["ssl_context"] = ctx
    return params


def get_conn():
    """Return a fresh database connection for the configured backend."""
    if USE_PG:
        return pg8000.dbapi.connect(**_pg_params(DATABASE_URL))
    return sqlite3.connect(DB_PATH)


def get_openai_client() -> openai.OpenAI:
    """Create the OpenAI client on first use so a missing API key doesn't
    crash the process at import time — it only fails when a recording is
    actually submitted."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(500, "OPENAI_API_KEY environment variable is not set")
    return openai.OpenAI(api_key=api_key)


pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer  = HTTPBearer(auto_error=False)

SCENES = {
    "fight_club": {
        "movie": "Fight Club",
        "quote": "You know what a duvet is?",
        "year": 1999, "difficulty": "Intermediate", "actor": "Brad Pitt",
    },
    "back_to_the_future": {
        "movie": "Back to the Future",
        "quote": "Roads Where we're going, we don't need roads.",
        "year": 1985, "difficulty": "Advanced", "actor": "Christopher Lloyd",
    },
    "forrest_gump": {
        "movie": "Forrest Gump",
        "quote": "You never know what you're gonna get.",
        "year": 1994, "difficulty": "Advanced", "actor": "Tom Hanks",
    },
    "the_matrix": {
        "movie": "The Matrix",
        "quote": "I know kung fu.",
        "year": 1999, "difficulty": "Beginner", "actor": "Keanu Reeves",
    },
    "seven": {
        "movie": "Se7en",
        "quote": "What's in the box?",
        "year": 1995, "difficulty": "Beginner", "actor": "Brad Pitt",
    },
    "heat": {
        "movie": "Heat",
        "quote": "Stop talking okay Slick",
        "year": 1995, "difficulty": "Advanced", "actor": "Al Pacino",
    },
    "avengers": {
        "movie": "Avengers",
        "quote": "Hulk... Smash",
        "year": 2012, "difficulty": "Beginner", "actor": "Mark Ruffalo",
    },
    "taken": {
        "movie": "Taken",
        "quote": "I will find you and I will kill you",
        "year": 2008, "difficulty": "Intermediate", "actor": "Liam Neeson",
    },
    "titanic": {
        "movie": "Titanic",
        "quote": "I'm flying Jack!",
        "year": 1997, "difficulty": "Beginner", "actor": "Kate Winslet",
    },
    "basic_instinct": {
        "movie": "Basic Instinct",
        "quote": "No I'm an amateur",
        "year": 1992, "difficulty": "Advanced", "actor": "Sharon Stone", "mature": True,
    },
    "sixth_sense": {
        "movie": "The Sixth Sense",
        "quote": "I see dead people",
        "year": 1999, "difficulty": "Intermediate", "actor": "Haley Joel Osment",
    },
    "terminator": {
        "movie": "The Terminator",
        "quote": "I'll be back",
        "year": 1984, "difficulty": "Beginner", "actor": "Arnold Schwarzenegger",
    },
}

# Level unlock rules — must be kept in sync with LEVEL_MAP in index.html.
# Each level lists which scene IDs belong to it and what minimum sync_score
# (%) a user needs on any scene from the *previous* level to unlock it.
LEVELS = [
    {"level": 1, "scenes": ["the_matrix", "seven", "avengers", "titanic", "terminator"],     "unlock_score": 0},
    {"level": 2, "scenes": ["fight_club", "taken", "sixth_sense"],                           "unlock_score": 60},
    {"level": 3, "scenes": ["back_to_the_future", "forrest_gump", "heat", "basic_instinct"], "unlock_score": 70},
]

# ---------------------------------------------------------------------------
# Division / rank system
# ---------------------------------------------------------------------------
DIVISIONS = [
    {"name": "Bronze",   "min": 0,     "max": 499,   "color": "#cd7f32"},
    {"name": "Silver",   "min": 500,   "max": 1999,  "color": "#b8b8b8"},
    {"name": "Gold",     "min": 2000,  "max": 4999,  "color": "#c9a84c"},
    {"name": "Diamond",  "min": 5000,  "max": 9999,  "color": "#67e8f9"},
    {"name": "Director", "min": 10000, "max": None,  "color": "#c9a84c"},
]

def get_division(points: int) -> dict:
    for d in reversed(DIVISIONS):
        if points >= d["min"]:
            return d
    return DIVISIONS[0]

def get_next_division(points: int) -> Optional[dict]:
    for d in DIVISIONS:
        if d["min"] > points:
            return d
    return None  # already at max rank

# ---------------------------------------------------------------------------
# Spanish translations — unlocked after 3+ attempts with 70%+ best score
# ---------------------------------------------------------------------------
SCENE_TRANSLATIONS = {
    "fight_club":         "¿Sabes lo que es un edredón?",
    "back_to_the_future": "Caminos. A donde vamos no necesitamos caminos.",
    "forrest_gump":       "Nunca sabes lo que te va a tocar.",
    "the_matrix":         "Sé kung fu.",
    "seven":              "¿Qué hay en la caja?",
    "heat":               "Para de hablar, ¿vale, listo?",
    "avengers":           "¡Hulk... aplasta!",
    "taken":              "Te voy a encontrar y te voy a matar.",
    "titanic":            "¡Estoy volando, Jack!",
    "basic_instinct":     "No, soy una aficionada.",
    "sixth_sense":        "Veo gente muerta.",
    "terminator":         "Volveré.",
}


# ---------------------------------------------------------------------------
# Daily challenge — deterministic scene selection from UTC date
# ---------------------------------------------------------------------------

def get_daily_scene_id() -> str:
    """Return today's challenge scene.  MD5 of the UTC date string gives a
    stable, evenly-distributed index — same result for every server instance."""
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    h = int(hashlib.md5(date_str.encode()).hexdigest(), 16)
    return list(SCENES.keys())[h % len(SCENES)]


# ---------------------------------------------------------------------------
# Database initialisation
# ---------------------------------------------------------------------------

def init_db():
    conn = get_conn()
    cur  = conn.cursor()

    if USE_PG:
        # PostgreSQL: SERIAL primary key, %s placeholders.
        # CREATE TABLE IF NOT EXISTS is idempotent, so re-deploys are safe.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            SERIAL PRIMARY KEY,
                username      TEXT    NOT NULL UNIQUE,
                email         TEXT    NOT NULL UNIQUE,
                password_hash TEXT    NOT NULL,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS scores (
                id            SERIAL PRIMARY KEY,
                scene_id      TEXT NOT NULL,
                movie         TEXT NOT NULL,
                quote         TEXT NOT NULL,
                transcription TEXT,
                sync_score    REAL,
                username      TEXT    DEFAULT '',
                user_id       INTEGER,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
    else:
        # SQLite: AUTOINCREMENT primary key, ? placeholders.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT    NOT NULL UNIQUE,
                email         TEXT    NOT NULL UNIQUE,
                password_hash TEXT    NOT NULL,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS scores (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                scene_id      TEXT NOT NULL,
                movie         TEXT NOT NULL,
                quote         TEXT NOT NULL,
                transcription TEXT,
                sync_score    REAL,
                username      TEXT    DEFAULT '',
                user_id       INTEGER,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Non-destructive migrations for pre-existing SQLite scores tables
        for col, dfn in [("username", "TEXT DEFAULT ''"), ("user_id", "INTEGER")]:
            try:
                cur.execute(f"ALTER TABLE scores ADD COLUMN {col} {dfn}")
            except sqlite3.OperationalError:
                pass  # column already exists
        # Non-destructive migration for users.points / streak / last_daily
        for col, dfn in [
            ("points",     "INTEGER DEFAULT 0"),
            ("streak",     "INTEGER DEFAULT 0"),
            ("last_daily", "TEXT"),
        ]:
            try:
                cur.execute(f"ALTER TABLE users ADD COLUMN {col} {dfn}")
            except sqlite3.OperationalError:
                pass  # column already exists

    if USE_PG:
        # Non-destructive migrations for PostgreSQL
        for col, dfn in [
            ("points",     "INTEGER DEFAULT 0"),
            ("streak",     "INTEGER DEFAULT 0"),
            ("last_daily", "TEXT"),
        ]:
            cur.execute(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} {dfn}")

    conn.commit()
    conn.close()


@app.on_event("startup")
async def startup():
    """Run DB initialisation when uvicorn is ready, not at import time.
    Errors here appear in the Render log with a full traceback instead of
    killing the process silently during module load."""
    init_db()


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=30)
    email:    str = Field(..., max_length=255)
    password: str = Field(..., min_length=6, max_length=128)

class LoginRequest(BaseModel):
    email:    str = Field(..., max_length=255)
    password: str = Field(..., max_length=128)


def hash_pw(password: str) -> str:
    return pwd_ctx.hash(password)

def verify_pw(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)

def make_token(user_id: int, username: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL)
    return jwt.encode({"sub": str(user_id), "username": username, "exp": exp}, SECRET, algorithm=ALGORITHM)

def decode_token(creds: Optional[HTTPAuthorizationCredentials]) -> dict:
    if not creds:
        raise HTTPException(401, "Authentication required")
    try:
        payload = jwt.decode(creds.credentials, SECRET, algorithms=[ALGORITHM])
        return {"id": int(payload["sub"]), "username": payload["username"]}
    except (JWTError, KeyError, ValueError):
        raise HTTPException(401, "Invalid or expired token")

def current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    return decode_token(creds)


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s']", "", text)
    return re.sub(r"\s+", " ", text).strip()

def sync_score(expected: str, transcribed: str) -> float:
    ratio = difflib.SequenceMatcher(None, normalize(expected), normalize(transcribed)).ratio()
    return round(ratio * 100, 1)


def calc_points(score: float, is_first_attempt: bool) -> int:
    """Return points earned for a single submission."""
    pts = 0
    if is_first_attempt:
        pts += 10
    if score >= 100:
        pts += 100
    elif score >= 95:
        pts += 75
    elif score >= 85:
        pts += 50
    elif score >= 70:
        pts += 25
    return pts


# ---------------------------------------------------------------------------
# Routes — frontend
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def read_root():
    try:
        with open("index.html", "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return HTMLResponse("<h1>index.html not found</h1>", status_code=404)


# ---------------------------------------------------------------------------
# Routes — auth
# ---------------------------------------------------------------------------

@app.post("/api/auth/register")
async def register(req: RegisterRequest):
    username = req.username.strip()
    email    = req.email.lower().strip()

    if not re.match(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,28}[A-Za-z0-9]$|^[A-Za-z0-9]{2}$', username):
        raise HTTPException(400, "Username may only contain letters, numbers, dots, hyphens and underscores")
    if not re.match(r'^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{1,63}$', email):
        raise HTTPException(400, "Invalid email address")
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    conn = get_conn()
    cur  = conn.cursor()
    try:
        if USE_PG:
            # RETURNING id is the PostgreSQL way to get the new row's id
            cur.execute(
                f"INSERT INTO users (username, email, password_hash) VALUES ({PH}, {PH}, {PH}) RETURNING id",
                (username, email, hash_pw(req.password)),
            )
            user_id = cur.fetchone()[0]
        else:
            cur.execute(
                f"INSERT INTO users (username, email, password_hash) VALUES ({PH}, {PH}, {PH})",
                (username, email, hash_pw(req.password)),
            )
            user_id = cur.lastrowid
        conn.commit()
    except _IntegrityError:
        raise HTTPException(400, "Email or username already taken")
    finally:
        conn.close()

    return {"access_token": make_token(user_id, username), "token_type": "bearer", "username": username}


@app.post("/api/auth/login")
async def login(req: LoginRequest):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute(
        f"SELECT id, username, password_hash FROM users WHERE email = {PH}",
        (req.email.lower().strip(),),
    )
    row = cur.fetchone()
    conn.close()

    if not row or not verify_pw(req.password, row[2]):
        raise HTTPException(401, "Invalid email or password")

    return {"access_token": make_token(row[0], row[1]), "token_type": "bearer", "username": row[1]}


@app.get("/api/auth/me")
async def me(user: dict = Depends(current_user)):
    return user


# ---------------------------------------------------------------------------
# Routes — scenes & scores
# ---------------------------------------------------------------------------

@app.get("/api/scenes")
async def get_scenes():
    return SCENES


@app.get("/api/progress")
async def get_progress(user: dict = Depends(current_user)):
    """Return the authenticated user's level, best scores per scene, and
    progress toward the next unlock threshold."""
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute(
        f"SELECT scene_id, MAX(sync_score) FROM scores WHERE user_id = {PH} GROUP BY scene_id",
        (user["id"],),
    )
    best: dict[str, float] = {row[0]: float(row[1] or 0) for row in cur.fetchall()}
    conn.close()

    # Walk levels in order; each requires a qualifying score on the previous
    # level's scenes.  Break as soon as a threshold isn't met so levels can't
    # be skipped.
    current_level = 1
    for lvl in LEVELS[1:]:
        prev_scenes  = next(l["scenes"] for l in LEVELS if l["level"] == lvl["level"] - 1)
        best_on_prev = max((best.get(s, 0.0) for s in prev_scenes), default=0.0)
        if best_on_prev >= lvl["unlock_score"]:
            current_level = lvl["level"]
        else:
            break

    unlocked = [s for lvl in LEVELS if lvl["level"] <= current_level for s in lvl["scenes"]]

    # Progress info for the bar displayed below the level badge
    next_lvl_def = next((l for l in LEVELS if l["level"] == current_level + 1), None)
    next_level   = None
    if next_lvl_def:
        curr_scenes  = next(l["scenes"] for l in LEVELS if l["level"] == current_level)
        best_on_curr = max((best.get(s, 0.0) for s in curr_scenes), default=0.0)
        next_level   = {
            "level":          next_lvl_def["level"],
            "required_score": next_lvl_def["unlock_score"],
            "best_score":     round(best_on_curr, 1),
        }

    return {
        "level":           current_level,
        "best_scores":     best,
        "unlocked_scenes": unlocked,
        "next_level":      next_level,
    }


@app.get("/api/history")
async def get_history(user: dict = Depends(current_user)):
    """Return the authenticated user's score history and aggregate stats."""
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute(
        f"SELECT id, scene_id, movie, sync_score, created_at "
        f"FROM scores WHERE user_id = {PH} ORDER BY created_at DESC LIMIT 100",
        (user["id"],),
    )
    rows = cur.fetchall()
    conn.close()

    history = [
        {
            "id":         r[0],
            "scene_id":   r[1],
            "movie":      r[2],
            "sync_score": float(r[3]) if r[3] is not None else 0.0,
            "created_at": r[4].isoformat() if hasattr(r[4], "isoformat") else r[4],
        }
        for r in rows
    ]

    scores = [h["sync_score"] for h in history]
    avg_score     = round(sum(scores) / len(scores), 1) if scores else 0
    best_score    = round(max(scores), 1)               if scores else 0
    first_score   = history[-1]["sync_score"]           if history else 0
    improvement   = round(best_score - first_score, 1)  if history else 0
    unique_scenes = len({h["scene_id"] for h in history})

    return {
        "history": history,
        "stats": {
            "avg_score":      avg_score,
            "best_score":     best_score,
            "total_attempts": len(history),
            "unique_scenes":  unique_scenes,
            "improvement":    improvement,
        },
    }


@app.get("/api/daily")
async def get_daily():
    """Return today's challenge scene (same for every user, resets at UTC midnight)."""
    sid   = get_daily_scene_id()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Seconds until next UTC midnight
    now     = datetime.now(timezone.utc)
    midnight = datetime(now.year, now.month, now.day, tzinfo=timezone.utc) + timedelta(days=1)
    secs_left = int((midnight - now).total_seconds())
    return {
        "scene_id":       sid,
        "scene":          SCENES[sid],
        "date":           today,
        "bonus_multiplier": 2,
        "secs_until_reset": secs_left,
    }


@app.post("/api/submit")
async def submit_recording(
    scene_id: str = Form(...),
    audio: UploadFile = File(...),
    creds: HTTPAuthorizationCredentials = Depends(bearer),
):
    user = decode_token(creds)  # raises 401 if missing / invalid

    if scene_id not in SCENES:
        raise HTTPException(400, "Invalid scene_id")

    # Per-user submission rate limit (uses DB so it survives restarts)
    conn_rl = get_conn()
    try:
        _check_submit_rate(user["id"], conn_rl)
    finally:
        conn_rl.close()

    scene          = SCENES[scene_id]
    expected_quote = scene["quote"]

    # Validate and read audio
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(400, "Empty audio file")
    if len(audio_bytes) > _MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio file too large — maximum 10 MB")

    suffix = ".webm"
    if audio.filename and "." in audio.filename:
        ext = "." + audio.filename.rsplit(".", 1)[-1].lower()
        suffix = ext if ext in _ALLOWED_AUDIO_EXT else ".webm"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as f:
            transcript = get_openai_client().audio.transcriptions.create(model="whisper-1", file=f)
        transcription = transcript.text
    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {e}")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    score = sync_score(expected_quote, transcription)

    conn = get_conn()
    cur  = conn.cursor()

    # Check if this is the user's first attempt on this scene (before inserting)
    cur.execute(
        f"SELECT COUNT(*) FROM scores WHERE user_id = {PH} AND scene_id = {PH}",
        (user["id"], scene_id),
    )
    attempt_count = cur.fetchone()[0]
    is_first_attempt = attempt_count == 0

    # Insert the new score
    cur.execute(
        f"INSERT INTO scores (scene_id, movie, quote, transcription, sync_score, username, user_id) "
        f"VALUES ({PH}, {PH}, {PH}, {PH}, {PH}, {PH}, {PH})",
        (scene_id, scene["movie"], expected_quote, transcription, score, user["username"], user["id"]),
    )

    # Daily challenge detection
    daily_scene_id     = get_daily_scene_id()
    is_daily           = scene_id == daily_scene_id
    today_str          = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    yesterday_str      = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    # Fetch user streak and last_daily before updating
    cur.execute(f"SELECT streak, last_daily FROM users WHERE id = {PH}", (user["id"],))
    u_row          = cur.fetchone()
    current_streak = int(u_row[0] or 0) if u_row else 0
    last_daily     = u_row[1] if u_row else None
    daily_already_done = (last_daily == today_str)

    # Award points (2× if it's the daily and not yet done today)
    base_pts   = calc_points(score, is_first_attempt)
    daily_bonus = 0
    if is_daily and not daily_already_done:
        daily_bonus = base_pts          # extra pts from doubling
        pts_earned  = base_pts * 2
    else:
        pts_earned  = base_pts

    if pts_earned > 0:
        cur.execute(
            f"UPDATE users SET points = points + {PH} WHERE id = {PH}",
            (pts_earned, user["id"]),
        )

    # Update streak if this completes today's daily for the first time
    new_streak = current_streak
    if is_daily and not daily_already_done:
        if last_daily == yesterday_str:
            new_streak = current_streak + 1
        else:
            new_streak = 1
        cur.execute(
            f"UPDATE users SET streak = {PH}, last_daily = {PH} WHERE id = {PH}",
            (new_streak, today_str, user["id"]),
        )

    # Fetch updated total points
    cur.execute(f"SELECT points FROM users WHERE id = {PH}", (user["id"],))
    total_points = cur.fetchone()[0] or 0

    # Check translation unlock: 3+ attempts AND best score >= 70%
    cur.execute(
        f"SELECT COUNT(*), MAX(sync_score) FROM scores WHERE user_id = {PH} AND scene_id = {PH}",
        (user["id"], scene_id),
    )
    row = cur.fetchone()
    total_attempts = row[0]
    best_score_scene = float(row[1] or 0)
    translation_unlocked = total_attempts >= 3 and best_score_scene >= 70

    conn.commit()
    conn.close()

    division = get_division(total_points)
    return {
        "transcription":        transcription,
        "expected":             expected_quote,
        "sync_score":           score,
        "scene":                scene,
        "points_earned":        pts_earned,
        "total_points":         total_points,
        "division":             division,
        "is_perfect":           score >= 100,
        "is_first_attempt":     is_first_attempt,
        "translation_unlocked": translation_unlocked,
        "translation":          SCENE_TRANSLATIONS.get(scene_id) if translation_unlocked else None,
        "is_daily":             is_daily,
        "daily_bonus":          daily_bonus,
        "daily_already_done":   daily_already_done,
        "streak":               new_streak,
    }


@app.get("/api/leaderboard")
async def get_leaderboard():
    """Top 10 per scene ordered by sync_score desc, with user points and division."""
    conn   = get_conn()
    cur    = conn.cursor()
    result = {}
    for sid in SCENES:
        cur.execute(
            f"SELECT s.id, s.scene_id, s.movie, s.quote, s.transcription, s.sync_score, "
            f"s.username, s.created_at, COALESCE(u.points, 0), COALESCE(u.streak, 0) "
            f"FROM scores s LEFT JOIN users u ON s.user_id = u.id "
            f"WHERE s.scene_id = {PH} ORDER BY s.sync_score DESC LIMIT 10",
            (sid,),
        )
        rows = cur.fetchall()
        result[sid] = []
        for r in rows:
            pts    = int(r[8]) if r[8] is not None else 0
            streak = int(r[9]) if r[9] is not None else 0
            div    = get_division(pts)
            result[sid].append({
                "id": r[0], "scene_id": r[1], "movie": r[2], "quote": r[3],
                "transcription": r[4], "sync_score": r[5], "username": r[6] or "",
                "created_at": r[7].isoformat() if hasattr(r[7], "isoformat") else r[7],
                "user_points": pts,
                "division": div,
                "streak": streak,
            })
    conn.close()
    return result


@app.get("/api/profile")
async def get_profile(user: dict = Depends(current_user)):
    """Return the authenticated user's points, division, and scene stats."""
    conn = get_conn()
    cur  = conn.cursor()

    cur.execute(f"SELECT points, streak, last_daily FROM users WHERE id = {PH}", (user["id"],))
    row = cur.fetchone()
    total_points   = int(row[0]) if row and row[0] else 0
    streak         = int(row[1]) if row and row[1] else 0
    last_daily     = row[2] if row else None
    today_str      = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    daily_done_today = (last_daily == today_str)

    # Per-scene stats: attempt count + best score
    cur.execute(
        f"SELECT scene_id, COUNT(*), MAX(sync_score) "
        f"FROM scores WHERE user_id = {PH} GROUP BY scene_id",
        (user["id"],),
    )
    scene_rows = cur.fetchall()
    conn.close()

    scene_stats = {}
    translations_unlocked = []
    for r in scene_rows:
        sid, attempts, best = r[0], int(r[1]), float(r[2] or 0)
        scene_stats[sid] = {"attempts": attempts, "best_score": round(best, 1)}
        if attempts >= 3 and best >= 70:
            translations_unlocked.append(sid)

    division      = get_division(total_points)
    next_div      = get_next_division(total_points)
    pts_to_next   = (next_div["min"] - total_points) if next_div else 0

    return {
        "username":              user["username"],
        "total_points":          total_points,
        "division":              division,
        "next_division":         next_div,
        "points_to_next":        pts_to_next,
        "scene_stats":           scene_stats,
        "translations_unlocked": translations_unlocked,
        "streak":                streak,
        "daily_done_today":      daily_done_today,
        "daily_scene_id":        get_daily_scene_id(),
    }
