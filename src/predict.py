from pathlib import Path
from typing import Dict, List

import joblib
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
MODEL_FILE = ROOT / "models" / "mechanic_model.pkl"


def load_model():
    return joblib.load(MODEL_FILE)


def predict_mechanics(model, mechanic_rows: List[Dict]) -> pd.DataFrame:
    df = pd.DataFrame(mechanic_rows)
    scores = model.predict_proba(df)[:, 1]
    labels = model.predict(df)
    df["score"] = scores
    df["recommended"] = labels
    return df
