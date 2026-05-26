#!/usr/bin/env bash
# Render build script — installs Python deps and builds React frontend

set -e

echo "=== Installing Python dependencies ==="
pip install -r requirements.txt

echo "=== Installing Node dependencies and building React ==="
cd frontend-react
npm install
npm run build
cd ..

echo "=== Training ML model ==="
python src/regenerate_dataset.py
python src/train_model.py

echo "=== Build complete ==="
