"""
Run this script to generate the feature importance bar chart for Figure 4.2.
It saves the chart as: models/feature_importance.png
"""
import joblib
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

ROOT       = Path(__file__).resolve().parents[1]
MODEL_FILE = ROOT / "models" / "mechanic_model.pkl"
OUT_FILE   = ROOT / "models" / "feature_importance.png"

# Load trained pipeline
pipeline = joblib.load(MODEL_FILE)

# Get feature names from preprocessor
preprocessor = pipeline.named_steps["preprocessor"]
num_features  = preprocessor.transformers_[0][2]   # numeric feature names
cat_encoder   = preprocessor.transformers_[1][1]   # OneHotEncoder
cat_features  = cat_encoder.get_feature_names_out(["problem_type"]).tolist()
all_features  = num_features + cat_features

# Get importances from Random Forest
rf = pipeline.named_steps["model"]
importances = rf.feature_importances_

# Group one-hot encoded problem_type back into one bar
grouped_names  = list(num_features) + ["problem_type"]
grouped_values = list(importances[:len(num_features)]) + [sum(importances[len(num_features):])]

# Sort descending
pairs = sorted(zip(grouped_names, grouped_values), key=lambda x: x[1], reverse=True)
names, values = zip(*pairs)

# Friendly display names
display_names = {
    "distance_km":      "Distance (km)",
    "mechanic_rating":  "Garage Rating",
    "speciality_match": "Speciality Match",
    "urgency_level":    "Urgency Level",
    "open_24hrs":       "Open 24/7",
    "problem_type":     "Problem Type",
}
labels = [display_names.get(n, n) for n in names]

# Plot
colors = ["#1f4fd6" if v == max(values) else "#4a90d9" for v in values]
fig, ax = plt.subplots(figsize=(9, 5))
bars = ax.barh(labels[::-1], [v*100 for v in values[::-1]], color=colors[::-1], edgecolor="white", height=0.6)

# Value labels on bars
for bar, val in zip(bars, [v*100 for v in values[::-1]]):
    ax.text(bar.get_width() + 0.3, bar.get_y() + bar.get_height()/2,
            f"{val:.1f}%", va="center", fontsize=10, color="#12263a")

ax.set_xlabel("Feature Importance (%)", fontsize=11)
ax.set_title("Random Forest — Feature Importance\nSmart Mechanic Finder", fontsize=13, fontweight="bold", pad=14)
ax.set_xlim(0, max(v*100 for v in values) * 1.18)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.tick_params(axis="y", labelsize=11)
plt.tight_layout()

plt.savefig(OUT_FILE, dpi=150, bbox_inches="tight")
print(f"Saved to: {OUT_FILE}")
# plt.show()  — open the file manually from models/feature_importance.png
