import pandas as pd
from sklearn.preprocessing import LabelEncoder


def clean_dataset(df: pd.DataFrame) -> pd.DataFrame:
    clean_df = df.copy()
    clean_df = clean_df.dropna().reset_index(drop=True)
    return clean_df


def fit_problem_encoder(df: pd.DataFrame) -> LabelEncoder:
    encoder = LabelEncoder()
    encoder.fit(df["problem_type"])
    return encoder


def apply_problem_encoding(df: pd.DataFrame, encoder: LabelEncoder) -> pd.DataFrame:
    encoded = df.copy()
    encoded["problem_type_encoded"] = encoder.transform(encoded["problem_type"])
    return encoded
