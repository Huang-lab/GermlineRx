#!/bin/bash
set -e

echo "=== GermlineRx startup ==="

# Download datalake from HuggingFace Datasets if not already present
if [ -n "$HF_DATALAKE_REPO" ] && [ "$HF_DATALAKE_REPO" != "YOUR_HF_USERNAME/biomni-datalake" ]; then
    python download_datalake.py
else
    echo "HF_DATALAKE_REPO not set — skipping datalake download (enrichment will be empty)"
fi

echo "=== Starting FastAPI server ==="
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
