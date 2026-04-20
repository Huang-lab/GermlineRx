FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend app
COPY app/ ./app/

# Copy startup script
COPY startup.sh .
RUN chmod +x startup.sh

# HuggingFace Spaces runs as non-root user 1000
RUN useradd -m -u 1000 user
RUN mkdir -p /data/datalake && chown -R user:user /app /data
USER user

ENV HOME=/home/user \
    BIOMNI_DATA_PATH=/data/datalake \
    HF_DATALAKE_REPO=Rita9CoreX/biomni-datalake \
    PYTHONPATH=/app

EXPOSE 8000

CMD ["./startup.sh"]
