from pathlib import Path

import pandas as pd

from data_preprocessing import apply_problem_encoding, clean_dataset, fit_problem_encoder


ROOT = Path(__file__).resolve().parents[1]
RAW_DATA = ROOT / "smart_mechanic_ml_dataset.csv"
OUTPUT_DATA = ROOT / "data" / "ml_mechanic_dataset.csv"


def build_dataset() -> pd.DataFrame:
    df = pd.read_csv(RAW_DATA)
    cleaned = clean_dataset(df)
    problem_encoder = fit_problem_encoder(cleaned)
    enriched = apply_problem_encoding(cleaned, problem_encoder)
    OUTPUT_DATA.parent.mkdir(parents=True, exist_ok=True)
    enriched.to_csv(OUTPUT_DATA, index=False)
    return enriched


if __name__ == "__main__":
    data = build_dataset()
    print(f"Saved dataset to {OUTPUT_DATA} ({len(data)} rows)")
