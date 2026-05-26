# Smart Mechanic Finder

AI-powered recommendation engine that suggests the best nearby mechanics based on user location, car problem, and urgency.

## Project Structure

- `data/` - processed and helper datasets
- `src/` - preprocessing, dataset builder, model training, prediction utilities
- `models/` - trained machine learning model artifacts
- `api/` - Flask backend and recommendation endpoints
- `frontend/` - user interface with map-based results
- `utils/` - haversine distance and encoding helpers
- `config/` - app-level settings

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Build Dataset

```bash
python src/dataset_builder.py
```

This reads `smart_mechanic_ml_dataset.csv` and creates `data/ml_mechanic_dataset.csv`.

## Train Model

```bash
python src/train_model.py
```

This saves `models/mechanic_model.pkl`.

## Run Backend

```bash
python run.py
```

The API starts on `http://127.0.0.1:5000`.

### Endpoints

- `GET /api/health`
- `POST /api/recommend`

Sample request:

```json
{
  "latitude": -1.95,
  "longitude": 30.06,
  "problem_type": "Brake System",
  "urgency": "emergency"
}
```

## Run Frontend

Open `frontend/index.html` in the browser (or serve it using any static server).

## Final Year Demo Flow

1. Enter location, problem type, urgency
2. Submit recommendation request
3. View top ranked mechanics and map pins
4. Explain ranking features: distance, rating, availability, speciality, urgency
