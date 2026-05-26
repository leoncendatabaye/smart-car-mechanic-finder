"""
Regenerate ml_mechanic_dataset.csv with a logically consistent target variable.

Target = 1 (recommended) when the garage is a genuinely good match:
  - Close distance (lower is better)
  - High rating
  - Speciality matches the problem
  - Available 24hrs when urgency is high
  - Urgency level considered

A score is computed for each record and thresholded to assign the target.
"""
import numpy as np
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW  = ROOT / "smart_mechanic_ml_dataset.csv"
OUT  = ROOT / "data" / "ml_mechanic_dataset.csv"

np.random.seed(42)

df = pd.read_csv(RAW)

# ── Compute a logical suitability score ──────────────────────────────────────
# Each component is normalised to 0-1 range

# 1. Distance score: closer = better (max useful distance = 25 km)
df["dist_score"] = 1.0 - (df["distance_km"].clip(0, 25) / 25.0)

# 2. Rating score: normalise 1-5 to 0-1
df["rating_score"] = (df["mechanic_rating"] - 1.0) / 4.0

# 3. Speciality match bonus
df["spec_score"] = df["speciality_match"].astype(float)

# 4. Availability bonus: open_24hrs matters more when urgency is high
df["avail_score"] = df["open_24hrs"].astype(float) * (df["urgency_level"] / 3.0)

# 5. Urgency penalty for far garages:
#    emergency + far distance = bad match
df["urgency_dist_penalty"] = (df["urgency_level"] / 3.0) * (df["distance_km"].clip(0, 25) / 25.0) * 0.3

# ── Weighted suitability score ────────────────────────────────────────────────
df["suitability"] = (
    df["dist_score"]   * 0.40 +   # distance is most important
    df["rating_score"] * 0.25 +   # rating second
    df["spec_score"]   * 0.20 +   # speciality match third
    df["avail_score"]  * 0.10 +   # availability fourth
    - df["urgency_dist_penalty"]  # penalty for far + emergency
)

# Add small noise to avoid a perfectly clean boundary (more realistic)
df["suitability"] += np.random.normal(0, 0.03, len(df))
df["suitability"] = df["suitability"].clip(0, 1)

# ── Assign target using threshold ─────────────────────────────────────────────
# Use 0.45 threshold → gives roughly 60/40 positive/negative split
threshold = 0.45
df["target"] = (df["suitability"] >= threshold).astype(int)

print("Target distribution:")
print(df["target"].value_counts())
print(f"Positive rate: {df['target'].mean():.1%}")

# ── Save cleaned dataset ──────────────────────────────────────────────────────
# Keep only the columns needed for training
keep_cols = [
    "user_latitude", "user_longitude",
    "problem_type", "urgency_level",
    "mechanic_latitude", "mechanic_longitude",
    "distance_km", "mechanic_rating",
    "open_24hrs", "speciality_match",
    "district", "target"
]
out_df = df[keep_cols].copy()

# Add problem_type_encoded for compatibility
from sklearn.preprocessing import LabelEncoder
le = LabelEncoder()
out_df = out_df.copy()
out_df["problem_type_encoded"] = le.fit_transform(out_df["problem_type"])

out_df.to_csv(OUT, index=False)
print(f"\nSaved {len(out_df)} records to {OUT}")
