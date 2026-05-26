from pathlib import Path
from typing import Dict, List, Optional
from difflib import SequenceMatcher

import numpy as np
import pandas as pd

from config.config import CONFIG
from src.predict import load_model, predict_mechanics
from utils.distance import haversine_km
from utils.encoding import encode_urgency


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / CONFIG.data_file
GARAGES_FILE = ROOT / "data" / "garages.csv"


# ── Problem type keywords mapping ─────────────────────────────────────────────
# Maps ML dataset problem_type labels → keywords that appear in garages speciality
PROBLEM_KEYWORD_MAP: Dict[str, List[str]] = {
    "Electrical Systems":    ["electrical", "auto electrical", "electrical faults", "electrical systems", "electrical diagnostics"],
    "Diagnostic Scanning":   ["diagnostics", "computer diagnostics", "computerized diagnostics", "full diagnostic", "smart diagnostics", "modern diagnostics"],
    "Exhaust System":        ["exhaust", "exhaust systems", "exhaust & muffler", "mufflers"],
    "Brake System":          ["brake", "brake repair", "brake service", "suspension & brake"],
    "Oil Change":            ["oil change", "lube", "quick lube", "lubricants", "filter change"],
    "Bodywork":              ["body work", "body repair", "panel beating", "painting", "spray painting", "accident repair"],
    "Suspension & Steering": ["suspension", "alignment", "wheel alignment", "wheel balancing", "suspension lift"],
    "Engine Repair":         ["engine overhaul", "engine upgrade", "general repair", "full service center", "multi-service"],
    "Transmission Repair":   ["transmission repair", "transmission specialist", "gearbox"],
    "Tire & Wheel":          ["tyre", "tire service", "tyre service", "tyre clinic", "rims", "tyres"],
    "Air Conditioning":      ["air conditioning", "ac", "ac service", "cooling systems"],
    "Welding":               ["welding", "fabrication"],
    # Common free-text variants users might type
    "Fleet Maintenance":     ["fleet maintenance", "car rental fleet maintenance", "bus maintenance", "trucks & buses"],
    "General Repair":        ["general repair", "general service", "full vehicle services", "car repairs and maintenance"],
    "Engine Issue":          ["engine overhaul", "engine upgrade", "general repair"],
    "Brake Failure":         ["brake repair", "brake service", "suspension & brake"],
    "Electrical Issue":      ["electrical", "auto electrical", "electrical faults"],
}


def _normalize_text(value: str) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _resolve_problem_type(user_problem: str) -> str:
    """
    Map any free-text user input to the closest ML dataset problem_type label.
    Returns the best matching label, or the original input title-cased if nothing matches.
    """
    normalized = _normalize_text(user_problem)
    if not normalized:
        return "General Repair"

    # 1) Exact match against known labels (case-insensitive)
    for label in PROBLEM_KEYWORD_MAP:
        if normalized == label.lower():
            return label

    # 2) Keyword containment — does the user input contain any known keyword?
    for label, keywords in PROBLEM_KEYWORD_MAP.items():
        for kw in keywords:
            if kw in normalized or normalized in kw:
                return label

    # 3) Fuzzy match against all labels
    best_label = "General Repair"
    best_score = 0.0
    for label in PROBLEM_KEYWORD_MAP:
        score = SequenceMatcher(None, normalized, label.lower()).ratio()
        if score > best_score:
            best_score = score
            best_label = label

    return best_label if best_score >= 0.4 else "General Repair"


def _speciality_match_score(speciality: str, problem_type: str) -> int:
    """
    Returns 1 if the garage speciality matches the problem type, 0 otherwise.
    Uses keyword list from PROBLEM_KEYWORD_MAP for accurate matching.
    """
    if not speciality or not problem_type:
        return 0

    speciality_lower = _normalize_text(speciality)
    problem_lower = _normalize_text(problem_type)

    # Check against all keywords for this problem type
    keywords = PROBLEM_KEYWORD_MAP.get(problem_type, [problem_lower])
    for kw in keywords:
        if kw in speciality_lower:
            return 1

    # Also check direct word overlap
    problem_words = set(problem_lower.replace("&", "").split())
    speciality_words = set(speciality_lower.replace("&", "").split())
    if problem_words & speciality_words:
        return 1

    return 0


def _load_garages() -> pd.DataFrame:
    """Load and normalize all 10,000 real garages from garages.csv."""
    if not GARAGES_FILE.exists():
        return pd.DataFrame()

    garages = pd.read_csv(GARAGES_FILE)
    if garages.empty:
        return garages

    # Normalize column names to match what the rest of the code expects
    garages = garages.rename(columns={
        "name":      "garage_name",
        "latitude":  "garage_latitude",
        "longitude": "garage_longitude",
    })

    garages["garage_latitude"]  = pd.to_numeric(garages["garage_latitude"],  errors="coerce")
    garages["garage_longitude"] = pd.to_numeric(garages["garage_longitude"], errors="coerce")
    garages["rating"]           = pd.to_numeric(garages["rating"],           errors="coerce").fillna(3.0)
    garages["open_24hrs"]       = garages["open_24hrs"].astype(str).str.lower().isin(["true", "1", "yes"])

    garages = garages.dropna(subset=["garage_latitude", "garage_longitude", "garage_name"]).reset_index(drop=True)
    return garages


def _detect_user_district(user_lat: float, user_lon: float, garages: pd.DataFrame) -> str:
    """
    Detect the user's district by finding the nearest garage in the CSV
    and returning its district. Fast and requires no external API.
    """
    if garages.empty:
        return ""
    g_lats = garages["garage_latitude"].to_numpy(dtype=float)
    g_lons = garages["garage_longitude"].to_numpy(dtype=float)
    # Quick bounding box — nearest within 15 km
    lat_delta = 15.0 / 111.0
    lon_delta = 15.0 / (111.0 * abs(np.cos(np.radians(user_lat))) + 1e-9)
    mask = (
        (g_lats >= user_lat - lat_delta) & (g_lats <= user_lat + lat_delta) &
        (g_lons >= user_lon - lon_delta) & (g_lons <= user_lon + lon_delta)
    )
    nearby = garages[mask]
    if nearby.empty:
        return ""
    # Find the single nearest garage
    distances = nearby.apply(
        lambda r: haversine_km(user_lat, user_lon, r["garage_latitude"], r["garage_longitude"]),
        axis=1
    )
    nearest_idx = distances.idxmin()
    return str(garages.loc[nearest_idx, "district"]).strip()


def get_recommendations(
    user_lat: float,
    user_lon: float,
    problem_type: str,
    urgency: str,
) -> tuple:
    """
    Returns (results_list, search_radius_km_used)
    """
    garages = _load_garages()
    if garages.empty:
        return [], CONFIG.max_distance_km

    model         = load_model()
    urgency_value = encode_urgency(urgency)
    resolved      = _resolve_problem_type(problem_type)

    # ── Detect user's district ────────────────────────────────────────────────
    user_district = _detect_user_district(user_lat, user_lon, garages)

    # ── Step 1: Build candidate pool ─────────────────────────────────────────
    # Always start with same-district garages, then add nearby ones by radius
    g_lats = garages["garage_latitude"].to_numpy(dtype=float)
    g_lons = garages["garage_longitude"].to_numpy(dtype=float)

    # Get all garages in the same district (regardless of distance)
    district_garages = pd.DataFrame()
    if user_district:
        district_garages = garages[
            garages["district"].str.strip().str.lower() == user_district.lower()
        ].copy()

    # Also get garages within radius (expands until we have enough)
    radius_garages = pd.DataFrame()
    used_radius    = CONFIG.max_distance_km

    search_radii = [
        CONFIG.max_distance_km,       # 10 km
        CONFIG.max_distance_km * 1.5, # 15 km
        CONFIG.max_distance_km * 2.0, # 20 km
        25.0,                         # hard cap
    ]
    for radius in search_radii:
        lat_delta = radius / 111.0
        lon_delta = radius / (111.0 * abs(np.cos(np.radians(user_lat))) + 1e-9)
        box_mask  = (
            (g_lats >= user_lat - lat_delta) & (g_lats <= user_lat + lat_delta) &
            (g_lons >= user_lon - lon_delta) & (g_lons <= user_lon + lon_delta)
        )
        radius_garages = garages[box_mask].copy()
        used_radius    = radius
        if len(radius_garages) >= CONFIG.top_k_results:
            break

    # Merge: district garages + radius garages, deduplicated
    if not district_garages.empty and not radius_garages.empty:
        nearby_garages = pd.concat([district_garages, radius_garages]) \
                           .drop_duplicates(subset=["garage_name"]) \
                           .reset_index(drop=True)
    elif not district_garages.empty:
        nearby_garages = district_garages.reset_index(drop=True)
    elif not radius_garages.empty:
        nearby_garages = radius_garages.reset_index(drop=True)
    else:
        nearby_garages = pd.DataFrame()

    if nearby_garages.empty:
        return [], used_radius

    # ── Step 2: Build records for every nearby garage ─────────────────────────
    records: List[Dict] = []
    for _, garage in nearby_garages.iterrows():
        distance = haversine_km(
            user_lat, user_lon,
            float(garage["garage_latitude"]),
            float(garage["garage_longitude"]),
        )

        # If we have same-district garages, skip far ones from other districts
        garage_district = str(garage.get("district", "")).strip().lower()
        is_same_district = user_district and garage_district == user_district.lower()
        if not is_same_district and distance > 15.0:
            continue  # skip garages >15km that are not in the same district

        if distance > used_radius:
            continue

        spec_match = _speciality_match_score(
            str(garage.get("speciality", "")),
            resolved,
        )

        records.append({
            # Fields used by ML model
            "distance_km":      round(distance, 2),
            "mechanic_rating":  float(garage["rating"]),
            "open_24hrs":       int(bool(garage["open_24hrs"])),
            "speciality_match": spec_match,
            "urgency_level":    urgency_value,
            "problem_type":     resolved,
            # Extra display fields
            "mechanic_latitude":  float(garage["garage_latitude"]),
            "mechanic_longitude": float(garage["garage_longitude"]),
            "district":           str(garage.get("district", "")),
            "city":               str(garage.get("city", "")),
            "mechanic_name":      str(garage["garage_name"]),
            "phone":              str(garage.get("phone", "")),
            "address":            str(garage.get("address", "")),
            "google_maps_url":    str(garage.get("google_maps_url", "")),
            "speciality":         str(garage.get("speciality", "")),
            "place_id":           str(garage.get("place_id", "")),
        })

    if not records:
        return [], used_radius

    # ── Step 3: Score every record with the ML model ──────────────────────────
    model_inputs = [
        {
            "distance_km":      r["distance_km"],
            "mechanic_rating":  r["mechanic_rating"],
            "open_24hrs":       r["open_24hrs"],
            "speciality_match": r["speciality_match"],
            "urgency_level":    r["urgency_level"],
            "problem_type":     r["problem_type"],
        }
        for r in records
    ]

    try:
        scored = predict_mechanics(model, model_inputs)
        for i, rec in enumerate(records):
            rec["score"]       = float(scored.iloc[i]["score"])
            rec["recommended"] = int(scored.iloc[i]["recommended"])
    except Exception:
        # Fallback scoring if model fails: rating + speciality bonus - distance penalty
        for rec in records:
            rec["score"]       = (rec["mechanic_rating"] / 5.0) + (rec["speciality_match"] * 0.3) - (rec["distance_km"] / 500.0)
            rec["recommended"] = 1

    # ── Step 4: Rank and return top-k ─────────────────────────────────────────
    # Compute a combined score so that:
    #   - A garage 0 km away always beats one 5 km away (regardless of rating)
    #   - Speciality match gives a strong bonus
    #   - Rating and ML score break ties
    for rec in records:
        distance_score = 1.0 / (1.0 + rec["distance_km"])   # 0→1, closer=higher
        rating_score   = rec["mechanic_rating"] / 5.0        # 0→1
        spec_bonus     = rec["speciality_match"] * 0.5       # 0 or 0.5
        ml_score       = rec.get("score", 0.5) * 0.2         # 0→0.2

        rec["_rank_score"] = (
            distance_score * 2.0   # distance is 2x more important than anything else
            + spec_bonus
            + rating_score
            + ml_score
        )

    ranked = sorted(records, key=lambda x: x["_rank_score"], reverse=True)

    # Clean up internal field before returning
    for rec in ranked:
        rec.pop("_rank_score", None)

    return ranked[: CONFIG.top_k_results], used_radius