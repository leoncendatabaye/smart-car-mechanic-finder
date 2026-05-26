from dataclasses import dataclass


@dataclass(frozen=True)
class AppConfig:
    data_file: str = "data/ml_mechanic_dataset.csv"
    model_file: str = "models/mechanic_model.pkl"
    scaler_file: str = "models/scaler.pkl"
    max_distance_km: float = 10.0   # search within 10 km (same district)
    top_k_results: int = 5


CONFIG = AppConfig()
