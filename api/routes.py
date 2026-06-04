from flask import Blueprint, jsonify, request as flask_request
from functools import wraps
import jwt
import datetime as dt
from flask_bcrypt import Bcrypt

from api.recommender import get_recommendations
from api.database import (
    init_db, create_request, get_request,
    get_requests_for_garage, update_request_status, count_pending,
    submit_rating, get_garage_reviews,
    create_user, get_user_by_phone, get_user_by_id,
    register_garage, get_garage_account_by_phone, get_garage_account_by_id,
    get_all_garage_accounts, update_garage_status,
    get_all_users, update_user, delete_user,
    update_garage_account, delete_garage_account,
    reset_garage_password, reset_user_password,
)

api_bp  = Blueprint("api", __name__)
bcrypt  = Bcrypt()
SECRET  = "smf-jwt-secret-2025"   # change in production

# Initialise DB on first import
init_db()


# ── Background email helper ───────────────────────────────────────────────────
import threading

def send_email_async(fn, *args, **kwargs):
    """Run any email function in a background thread so it never blocks the API."""
    t = threading.Thread(target=fn, args=args, kwargs=kwargs, daemon=True)
    t.start()


# ── JWT helpers ───────────────────────────────────────────────────────────────

def make_token(payload: dict, expires_hours: int = 24) -> str:
    payload = dict(payload)
    payload["exp"] = dt.datetime.utcnow() + dt.timedelta(hours=expires_hours)
    return jwt.encode(payload, SECRET, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET, algorithms=["HS256"])
    except Exception:
        return None


def token_required(f):
    """Decorator — requires a valid user JWT in Authorization header."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = flask_request.headers.get("Authorization", "")
        token = auth.replace("Bearer ", "").strip()
        data = decode_token(token)
        if not data or data.get("role") != "user":
            return jsonify({"error": "Authentication required"}), 401
        return f(data, *args, **kwargs)
    return decorated


def garage_token_required(f):
    """Decorator — requires a valid verified garage JWT."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = flask_request.headers.get("Authorization", "")
        token = auth.replace("Bearer ", "").strip()
        data = decode_token(token)
        if not data or data.get("role") != "garage":
            return jsonify({"error": "Garage authentication required"}), 401
        return f(data, *args, **kwargs)
    return decorated


@api_bp.get("/garages/list")
def list_garages_for_registration():
    """Return all garage names from CSV grouped by district for registration dropdown."""
    import pandas as pd
    from pathlib import Path
    csv_path = Path(__file__).resolve().parents[1] / "data" / "garages.csv"
    if not csv_path.exists():
        return jsonify({"garages": []})
    df = pd.read_csv(csv_path, dtype={"phone": str})[["name", "district", "address", "phone"]]
    df = df.drop_duplicates(subset=["name"]).fillna("").sort_values("name")

    # Clean phone numbers — convert scientific notation floats to proper format
    def clean_phone(p):
        p = str(p).strip()
        if not p or p == "nan":
            return ""
        # Remove decimal and exponent if stored as float e.g. "2.50788469751E+11"
        try:
            cleaned = str(int(float(p)))
            # Format as +250 XXX XXX XXX
            if cleaned.startswith("250") and len(cleaned) == 12:
                return f"+{cleaned[:3]} {cleaned[3:6]} {cleaned[6:9]} {cleaned[9:]}"
            return "+" + cleaned if not cleaned.startswith("+") else cleaned
        except (ValueError, OverflowError):
            return p

    df["phone"] = df["phone"].apply(clean_phone)
    return jsonify({"garages": df.to_dict(orient="records")})


@api_bp.get("/garage/location")
def garage_location():
    """Return lat/lng for a garage by name from garages.csv."""
    import pandas as pd
    from pathlib import Path
    name = flask_request.args.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    csv_path = Path(__file__).resolve().parents[1] / "data" / "garages.csv"
    if not csv_path.exists():
        return jsonify({"error": "Garage data not found"}), 404
    df = pd.read_csv(csv_path)
    match = df[df["name"].str.strip().str.lower() == name.lower()]
    if match.empty:
        return jsonify({"error": "Garage not found"}), 404
    row = match.iloc[0]
    return jsonify({
        "name":      str(row["name"]),
        "latitude":  float(row["latitude"]),
        "longitude": float(row["longitude"]),
        "address":   str(row.get("address", "")),
    })


@api_bp.get("/garages/specialities")
def garage_specialities():
    """Return a curated list of car problem types used for recommendations."""
    specialities = [
        "Engine Repair",
        "Brake System",
        "Electrical Systems",
        "Transmission Repair",
        "Suspension & Steering",
        "Diagnostic Scanning",
        "Oil Change",
        "Tire & Wheel",
        "Air Conditioning",
        "Bodywork",
        "Welding",
        "Exhaust System",
        "General Repair",
    ]
    return jsonify({"specialities": specialities})


@api_bp.get("/health")
def health():
    return jsonify({"status": "ok"})


@api_bp.get("/user/requests")
def user_requests():
    """Get all requests made by the logged-in user."""
    auth  = flask_request.headers.get("Authorization", "")
    token = auth.replace("Bearer ", "").strip()
    data  = decode_token(token)
    if not data or data.get("role") != "user":
        return jsonify({"error": "Authentication required"}), 401

    user_id = data.get("user_id")
    user    = get_user_by_id(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    from api.database import get_conn
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT * FROM service_requests
            WHERE LOWER(user_name) = LOWER(?)
               OR user_id = ?
            ORDER BY created_at DESC
        """, (user["name"], user_id)).fetchall()
        requests_list = [dict(r) for r in rows]

    return jsonify({"requests": requests_list, "total": len(requests_list)})


# ── User Auth ─────────────────────────────────────────────────────────────────

@api_bp.post("/auth/user/register")
def user_register():
    payload = flask_request.get_json(silent=True) or {}
    for field in ["name", "phone", "password"]:
        if not payload.get(field, "").strip():
            return jsonify({"error": f"{field} is required"}), 400
    if len(payload["password"]) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    try:
        pw_hash = bcrypt.generate_password_hash(payload["password"]).decode("utf-8")
        user = create_user(payload["name"], payload["phone"], pw_hash)
        token = make_token({"role": "user", "user_id": user["id"], "name": user["name"]})
        # Send welcome email if provided
        if payload.get("email", "").strip():
            try:
                from api.email_service import email_welcome_user
                from api.database import get_conn
                with get_conn() as conn:
                    conn.execute("UPDATE users SET email=? WHERE id=?",
                                 (payload["email"].strip().lower(), user["id"]))
                    conn.commit()
                user["email"] = payload["email"].strip().lower()
                send_email_async(email_welcome_user, payload["email"].strip(), payload["name"])
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Welcome email failed: {e}")
        return jsonify({"success": True, "token": token, "user": user}), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 409


@api_bp.post("/auth/user/login")
def user_login():
    payload = flask_request.get_json(silent=True) or {}
    phone    = payload.get("phone", "").strip()
    password = payload.get("password", "")
    if not phone or not password:
        return jsonify({"error": "Phone and password are required"}), 400
    user = get_user_by_phone(phone)
    if not user or not bcrypt.check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid phone number or password"}), 401
    token = make_token({"role": "user", "user_id": user["id"], "name": user["name"]})
    return jsonify({"success": True, "token": token, "user": {
        "id": user["id"], "name": user["name"], "phone": user["phone"]
    }})


# ── Garage Auth ───────────────────────────────────────────────────────────────

@api_bp.post("/auth/garage/register")
def garage_register():
    payload = flask_request.get_json(silent=True) or {}
    for field in ["garage_name", "phone", "password", "district"]:
        if not payload.get(field, "").strip():
            return jsonify({"error": f"{field} is required"}), 400
    if len(payload["password"]) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    try:
        pw_hash = bcrypt.generate_password_hash(payload["password"]).decode("utf-8")
        garage = register_garage({
            "garage_name":   payload["garage_name"],
            "phone":         payload["phone"],
            "email":         payload.get("email", ""),
            "password_hash": pw_hash,
            "district":      payload["district"],
            "address":       payload.get("address", ""),
        })
        # Send confirmation email
        if payload.get("email", "").strip():
            try:
                from api.email_service import email_garage_registered
                send_email_async(email_garage_registered, payload["email"].strip(), payload["garage_name"])
            except Exception: pass
        return jsonify({
            "success": True,
            "message": "Registration submitted. Your account is pending verification by admin.",
            "garage": garage,
        }), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 409


@api_bp.post("/auth/garage/login")
def garage_login():
    payload  = flask_request.get_json(silent=True) or {}
    phone    = payload.get("phone", "").strip()
    password = payload.get("password", "")
    if not phone or not password:
        return jsonify({"error": "Phone and password are required"}), 400
    garage = get_garage_account_by_phone(phone)
    if not garage or not bcrypt.check_password_hash(garage["password_hash"], password):
        return jsonify({"error": "Invalid phone number or password"}), 401
    if garage["status"] == "pending":
        return jsonify({"error": "Your garage account is pending verification. Please wait for admin approval."}), 403
    if garage["status"] == "rejected":
        return jsonify({"error": "Your garage registration was rejected. Please contact support."}), 403
    token = make_token({
        "role":        "garage",
        "garage_id":   garage["id"],
        "garage_name": garage["garage_name"],
    })
    return jsonify({"success": True, "token": token, "garage": {
        "id":          garage["id"],
        "garage_name": garage["garage_name"],
        "phone":       garage["phone"],
        "district":    garage["district"],
        "status":      garage["status"],
    }})


# ── Admin: list & verify garages (simple secret-key protection) ───────────────

@api_bp.get("/admin/garages")
def admin_list_garages():
    if flask_request.headers.get("X-Admin-Key") != "smf-admin-2025":
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify({"garages": get_all_garage_accounts()})


@api_bp.patch("/admin/garage/<int:garage_id>/status")
def admin_update_garage(garage_id: int):
    if flask_request.headers.get("X-Admin-Key") != "smf-admin-2025":
        return jsonify({"error": "Unauthorized"}), 401
    payload = flask_request.get_json(silent=True) or {}
    status  = payload.get("status", "").strip().lower()
    if status not in {"verified", "rejected", "pending"}:
        return jsonify({"error": "status must be verified, rejected, or pending"}), 400
    garage = update_garage_status(garage_id, status)
    # Email garage when verified
    if status == "verified" and garage and garage.get("email"):
        try:
            from api.email_service import email_garage_verified
            send_email_async(email_garage_verified, garage["email"], garage["garage_name"])
        except Exception: pass
    return jsonify({"success": True, "garage": garage})


@api_bp.post("/recommend")
def recommend():
    payload = flask_request.get_json(silent=True) or {}
    required = ["latitude", "longitude", "problem_type", "urgency"]
    missing = [key for key in required if key not in payload]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        latitude = float(payload["latitude"])
        longitude = float(payload["longitude"])
    except (TypeError, ValueError):
        return jsonify({"error": "latitude and longitude must be numeric"}), 400

    result, radius_used = get_recommendations(
        user_lat=latitude,
        user_lon=longitude,
        problem_type=str(payload["problem_type"]),
        urgency=str(payload["urgency"]),
    )
    # Get district for display
    from api.recommender import _load_garages, _detect_user_district
    garages = _load_garages()
    district = _detect_user_district(latitude, longitude, garages) if not garages.empty else ""
    return jsonify({"count": len(result), "search_radius_km": radius_used, "district": district, "recommendations": result})
# ── Service Request endpoints ─────────────────────────────────────────────────

@api_bp.post("/request")
def send_request():
    """User sends a service request to a specific garage."""
    payload = flask_request.get_json(silent=True) or {}
    required = ["garage_id", "garage_name", "user_lat", "user_lon",
                "problem_type", "urgency"]
    missing = [k for k in required if k not in payload]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        payload["user_lat"] = float(payload["user_lat"])
        payload["user_lon"] = float(payload["user_lon"])
    except (TypeError, ValueError):
        return jsonify({"error": "user_lat and user_lon must be numeric"}), 400

    req = create_request(payload)

    # Attach user_id if logged in
    auth  = flask_request.headers.get("Authorization", "")
    token = auth.replace("Bearer ", "").strip()
    tdata = decode_token(token)
    if tdata and tdata.get("role") == "user":
        from api.database import get_conn
        with get_conn() as conn:
            conn.execute("UPDATE service_requests SET user_id=? WHERE id=?",
                         (tdata["user_id"], req["id"]))
            conn.commit()
        req["user_id"] = tdata["user_id"]

    # ── Send SMS + Email to garage ────────────────────────────────────────────
    try:
        import pandas as pd
        from pathlib import Path
        from api.sms import send_request_sms
        from api.email_service import email_garage_new_request

        garages_csv = Path(__file__).resolve().parents[1] / "data" / "garages.csv"
        garage_phone = ""
        if garages_csv.exists():
            df = pd.read_csv(garages_csv, dtype={"phone": str})
            match = df[df["name"].str.strip().str.lower() == payload["garage_name"].strip().lower()]
            if not match.empty:
                garage_phone = str(match.iloc[0]["phone"]).strip()
                send_request_sms(
                    garage_phone  = garage_phone,
                    garage_name   = payload["garage_name"],
                    user_name     = payload.get("user_name", "Customer"),
                    problem_type  = payload.get("problem_type", ""),
                    urgency       = payload.get("urgency", "normal"),
                    user_address  = payload.get("user_address", ""),
                    user_phone    = payload.get("user_phone", ""),
                )

        # Email to registered garage account if they have an email
        garage_acc = get_garage_account_by_phone(garage_phone) if garage_phone else None
        if not garage_acc:
            # Try by name
            from api.database import get_conn
            with get_conn() as conn:
                row = conn.execute(
                    "SELECT * FROM garage_accounts WHERE LOWER(garage_name)=LOWER(?)",
                    (payload["garage_name"],)
                ).fetchone()
                if row: garage_acc = dict(row)
        if garage_acc and garage_acc.get("email"):
            send_email_async(
                email_garage_new_request,
                garage_email = garage_acc["email"],
                garage_name  = payload["garage_name"],
                user_name    = payload.get("user_name", "Customer"),
                user_phone   = payload.get("user_phone", ""),
                problem_type = payload.get("problem_type", ""),
                urgency      = payload.get("urgency", "normal"),
                user_address = payload.get("user_address", ""),
            )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Notification failed: {e}")

    return jsonify({"success": True, "request": req}), 201


@api_bp.get("/garage/<garage_id>/requests")
def garage_requests(garage_id: str):
    """Garage polls this to get all its service requests."""
    requests_list = get_requests_for_garage(garage_id)
    pending = count_pending(garage_id)
    return jsonify({
        "garage_id": garage_id,
        "pending": pending,
        "total": len(requests_list),
        "requests": requests_list,
    })


@api_bp.get("/request/<int:request_id>")
def get_single_request(request_id: int):
    """User polls this to check their request status."""
    req = get_request(request_id)
    if not req:
        return jsonify({"error": "Request not found"}), 404
    return jsonify({"request": req})


@api_bp.patch("/request/<int:request_id>/status")
def update_status(request_id: int):
    """Garage updates a request status: pending → accepted / declined / completed."""
    payload = flask_request.get_json(silent=True) or {}
    status = payload.get("status", "").strip().lower()
    allowed = {"accepted", "declined", "completed", "pending"}
    if status not in allowed:
        return jsonify({"error": f"status must be one of: {', '.join(allowed)}"}), 400

    req = get_request(request_id)
    if not req:
        return jsonify({"error": "Request not found"}), 404

    updated = update_request_status(request_id, status)

    # ── Send SMS + Email to user when garage responds ─────────────────────────
    if status in ("accepted", "declined", "completed"):
        try:
            from api.sms import send_status_sms
            from api.email_service import email_user_status

            user_phone   = req.get("user_phone", "")
            garage_name  = req["garage_name"]
            problem_type = req["problem_type"]

            # SMS
            if user_phone:
                send_status_sms(user_phone, garage_name, status, problem_type)

            # Email — look up user email from users table
            user_id = req.get("user_id")
            user = None
            if user_id:
                user = get_user_by_id(user_id)
            # Fallback: look up by phone or name if user_id missing
            if not user and req.get("user_phone"):
                user = get_user_by_phone(req["user_phone"])
            if not user and req.get("user_name"):
                from api.database import get_conn
                with get_conn() as conn:
                    row = conn.execute(
                        "SELECT id, name, phone, email FROM users WHERE LOWER(name)=LOWER(?)",
                        (req["user_name"],)
                    ).fetchone()
                    if row:
                        user = dict(row)
            if user and user.get("email"):
                send_email_async(email_user_status, user["email"], user["name"], garage_name, problem_type, status)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Notification failed: {e}")

    return jsonify({"success": True, "request": updated})


# ── Rating endpoints ──────────────────────────────────────────────────────────

@api_bp.post("/request/<int:request_id>/rate")
def rate_request(request_id: int):
    """User submits a star rating + optional review for a completed request."""
    payload = flask_request.get_json(silent=True) or {}

    try:
        rating = float(payload.get("rating", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "rating must be a number between 1 and 5"}), 400

    review = str(payload.get("review", "")).strip()

    try:
        updated = submit_rating(request_id, rating, review)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify({"success": True, "request": updated})


@api_bp.get("/garage/<garage_name>/reviews")
def garage_reviews(garage_name: str):
    """Get all user reviews for a garage (shown on dashboard)."""
    reviews = get_garage_reviews(garage_name)
    avg = round(sum(r["user_rating"] for r in reviews) / len(reviews), 1) if reviews else None
    return jsonify({
        "garage_name": garage_name,
        "total_reviews": len(reviews),
        "average_rating": avg,
        "reviews": reviews,
    })


# ── Admin Statistics ──────────────────────────────────────────────────────────

@api_bp.get("/admin/stats")
def admin_stats():
    if flask_request.headers.get("X-Admin-Key") != "smf-admin-2025":
        return jsonify({"error": "Unauthorized"}), 401

    import pandas as pd
    from pathlib import Path
    from api.database import get_conn

    with get_conn() as conn:
        # ── Request counts ────────────────────────────────────────────────────
        total = conn.execute("SELECT COUNT(*) as c FROM service_requests").fetchone()["c"]
        pending   = conn.execute("SELECT COUNT(*) as c FROM service_requests WHERE status='pending'").fetchone()["c"]
        accepted  = conn.execute("SELECT COUNT(*) as c FROM service_requests WHERE status='accepted'").fetchone()["c"]
        completed = conn.execute("SELECT COUNT(*) as c FROM service_requests WHERE status='completed'").fetchone()["c"]
        declined  = conn.execute("SELECT COUNT(*) as c FROM service_requests WHERE status='declined'").fetchone()["c"]

        # ── Most requested garages (top 5) ────────────────────────────────────
        top_garages = conn.execute("""
            SELECT garage_name, COUNT(*) as requests,
                   AVG(CASE WHEN user_rating IS NOT NULL THEN user_rating END) as avg_rating
            FROM service_requests
            GROUP BY garage_name
            ORDER BY requests DESC
            LIMIT 5
        """).fetchall()

        # ── Busiest districts ─────────────────────────────────────────────────
        districts_raw = conn.execute("""
            SELECT user_address, COUNT(*) as c
            FROM service_requests
            GROUP BY user_address
            ORDER BY c DESC
            LIMIT 20
        """).fetchall()

        # ── Most common problems ──────────────────────────────────────────────
        problems = conn.execute("""
            SELECT problem_type, COUNT(*) as c
            FROM service_requests
            GROUP BY problem_type
            ORDER BY c DESC
            LIMIT 5
        """).fetchall()

        # ── Urgency breakdown ─────────────────────────────────────────────────
        urgency = conn.execute("""
            SELECT urgency, COUNT(*) as c
            FROM service_requests
            GROUP BY urgency
        """).fetchall()

        # ── Ratings overview ──────────────────────────────────────────────────
        ratings = conn.execute("""
            SELECT COUNT(*) as total_rated,
                   AVG(user_rating) as avg_rating,
                   MIN(user_rating) as min_rating,
                   MAX(user_rating) as max_rating
            FROM service_requests
            WHERE user_rating IS NOT NULL
        """).fetchone()

        # ── Registered users & garages ────────────────────────────────────────
        total_users   = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
        total_garages = conn.execute("SELECT COUNT(*) as c FROM garage_accounts").fetchone()["c"]
        verified_garages = conn.execute("SELECT COUNT(*) as c FROM garage_accounts WHERE status='verified'").fetchone()["c"]
        pending_garages  = conn.execute("SELECT COUNT(*) as c FROM garage_accounts WHERE status='pending'").fetchone()["c"]

    # ── Garages in CSV ────────────────────────────────────────────────────────
    csv_path = Path(__file__).resolve().parents[1] / "data" / "garages.csv"
    csv_garages = 0
    district_counts = {}
    if csv_path.exists():
        df = pd.read_csv(csv_path)
        csv_garages = len(df)
        district_counts = df["district"].value_counts().head(8).to_dict()

    return jsonify({
        "requests": {
            "total": total,
            "pending": pending,
            "accepted": accepted,
            "completed": completed,
            "declined": declined,
            "completion_rate": round(completed / total * 100, 1) if total else 0,
        },
        "top_garages": [
            {
                "name": r["garage_name"],
                "requests": r["requests"],
                "avg_rating": round(r["avg_rating"], 1) if r["avg_rating"] else None,
            }
            for r in top_garages
        ],
        "top_problems": [{"type": r["problem_type"], "count": r["c"]} for r in problems],
        "urgency": [{"level": r["urgency"], "count": r["c"]} for r in urgency],
        "ratings": {
            "total_rated": ratings["total_rated"],
            "average":     round(ratings["avg_rating"], 2) if ratings["avg_rating"] else None,
            "min":         ratings["min_rating"],
            "max":         ratings["max_rating"],
        },
        "users": {
            "total_registered": total_users,
        },
        "garages": {
            "in_csv":    csv_garages,
            "registered": total_garages,
            "verified":   verified_garages,
            "pending":    pending_garages,
        },
        "busiest_districts": district_counts,
    })


# ── Admin: User management ────────────────────────────────────────────────────

def _admin_check():
    return flask_request.headers.get("X-Admin-Key") == "smf-admin-2025"


@api_bp.get("/admin/users")
def admin_list_users():
    if not _admin_check(): return jsonify({"error": "Unauthorized"}), 401
    users = get_all_users()
    # Add request count per user
    from api.database import get_conn
    with get_conn() as conn:
        for u in users:
            row = conn.execute(
                "SELECT COUNT(*) as c FROM service_requests WHERE LOWER(user_name)=LOWER(?)",
                (u["name"],)
            ).fetchone()
            u["request_count"] = row["c"] if row else 0
    return jsonify({"users": users, "total": len(users)})


@api_bp.patch("/admin/user/<int:user_id>")
def admin_update_user(user_id: int):
    if not _admin_check(): return jsonify({"error": "Unauthorized"}), 401
    payload = flask_request.get_json(silent=True) or {}
    name  = payload.get("name", "").strip()
    phone = payload.get("phone", "").strip()
    if not name or not phone:
        return jsonify({"error": "name and phone are required"}), 400
    updated = update_user(user_id, name, phone)
    return jsonify({"success": True, "user": updated})


@api_bp.delete("/admin/user/<int:user_id>")
def admin_delete_user(user_id: int):
    if not _admin_check(): return jsonify({"error": "Unauthorized"}), 401
    delete_user(user_id)
    return jsonify({"success": True})


@api_bp.post("/admin/user/<int:user_id>/reset-password")
def admin_reset_user_password(user_id: int):
    if not _admin_check(): return jsonify({"error": "Unauthorized"}), 401
    payload  = flask_request.get_json(silent=True) or {}
    password = payload.get("password", "").strip()
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    pw_hash = bcrypt.generate_password_hash(password).decode("utf-8")
    reset_user_password(user_id, pw_hash)
    return jsonify({"success": True})


# ── Admin: Garage account management ─────────────────────────────────────────

@api_bp.patch("/admin/garage-account/<int:garage_id>")
def admin_update_garage_account(garage_id: int):
    if not _admin_check(): return jsonify({"error": "Unauthorized"}), 401
    payload = flask_request.get_json(silent=True) or {}
    updated = update_garage_account(garage_id, payload)
    return jsonify({"success": True, "garage": updated})


@api_bp.delete("/admin/garage-account/<int:garage_id>")
def admin_delete_garage_account(garage_id: int):
    if not _admin_check(): return jsonify({"error": "Unauthorized"}), 401
    delete_garage_account(garage_id)
    return jsonify({"success": True})


@api_bp.post("/admin/garage-account/<int:garage_id>/reset-password")
def admin_reset_garage_password(garage_id: int):
    if not _admin_check(): return jsonify({"error": "Unauthorized"}), 401
    payload  = flask_request.get_json(silent=True) or {}
    password = payload.get("password", "").strip()
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    pw_hash = bcrypt.generate_password_hash(password).decode("utf-8")
    reset_garage_password(garage_id, pw_hash)
    return jsonify({"success": True})

