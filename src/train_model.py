from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.metrics import classification_report


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "ml_mechanic_dataset.csv"
MODEL_FILE = ROOT / "models" / "mechanic_model.pkl"


def train() -> None:
    df = pd.read_csv(DATA_FILE)

    feature_cols = [
        "distance_km",
        "mechanic_rating",
        "open_24hrs",
        "speciality_match",
        "urgency_level",
        "problem_type",
    ]
    target_col = "target"

    x = df[feature_cols]
    y = df[target_col]

    numeric_features = [
        "distance_km",
        "mechanic_rating",
        "open_24hrs",
        "speciality_match",
        "urgency_level",
    ]
    categorical_features = ["problem_type"]

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), numeric_features),
            ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_features),
        ]
    )

    model = RandomForestClassifier(n_estimators=200, random_state=42, class_weight="balanced")

    pipeline = Pipeline(steps=[("preprocessor", preprocessor), ("model", model)])

    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=42, stratify=y)
    pipeline.fit(x_train, y_train)
    preds = pipeline.predict(x_test)
    print(classification_report(y_test, preds))

    MODEL_FILE.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_FILE)
    print(f"Model saved to {MODEL_FILE}")


if __name__ == "__main__":
    train()
