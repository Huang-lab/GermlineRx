# Deploying GermlineRx to HuggingFace Spaces

## Overview

```
HuggingFace Spaces     ← FastAPI backend (free, 16 GB RAM)
HuggingFace Datasets   ← Biomni datalake storage (free, unlimited)
Vercel                 ← React frontend (free)
```

---

## Step 1 — Upload datalake to HuggingFace Datasets

1. Create a free account at huggingface.co
2. Create a new Dataset repo: huggingface.co/new-dataset
   - Name: `biomni-datalake`
   - Visibility: Public (free) or Private (needs HF_TOKEN)
3. Upload all files from your local datalake:

```bash
pip install huggingface_hub

python - <<'EOF'
from huggingface_hub import HfApi
import os

api = HfApi()
data_path = "/Users/luj12/Desktop/PROJECTS/Agentic Workflow/Biomni/data/biomni_data/data_lake"

# Replace with your HuggingFace username
repo_id = "Rita9CoreX/biomni-datalake"

api.create_repo(repo_id=repo_id, repo_type="dataset", exist_ok=True)

for filename in os.listdir(data_path):
    filepath = os.path.join(data_path, filename)
    if os.path.isfile(filepath):
        print(f"Uploading {filename}...")
        api.upload_file(
            path_or_fileobj=filepath,
            path_in_repo=filename,
            repo_id=repo_id,
            repo_type="dataset",
        )
print("Done.")
EOF
```

---

## Step 2 — Create HuggingFace Space

1. Go to huggingface.co/new-space
2. Settings:
   - Name: `germline-rx`
   - SDK: **Docker**
   - Visibility: Public
3. Clone the Space repo locally:

```bash
git clone https://huggingface.co/spaces/Rita9CoreX/germline-rx
cd germline-rx
```

4. Copy files from `GermlineRx/huggingface/` into the cloned repo:

```bash
cp -r /path/to/GermlineRx/huggingface/* .
cp -r /path/to/GermlineRx/germline_webapp/backend/app ./app
```

5. Set the datalake repo in Dockerfile:
   - Replace `Rita9CoreX/biomni-datalake` with your actual username

6. Push:

```bash
git add .
git commit -m "Deploy GermlineRx backend"
git push
```

Space will build automatically (takes ~3 min first time).

---

## Step 3 — Add Space Secrets (optional)

In Space Settings → Variables and Secrets:

| Key | Value |
|---|---|
| `HF_DATALAKE_REPO` | `Rita9CoreX/biomni-datalake` |
| `HF_TOKEN` | Your HF token (only if dataset is private) |
| `NCBI_API_KEY` | Optional — increases ClinVar rate limit |

---

## Step 4 — Deploy frontend to Vercel

1. Push GermlineRx to GitHub
2. Go to vercel.com → New Project → Import from GitHub
3. Set root directory to `germline_webapp/frontend`
4. Add environment variable:
   - `VITE_API_URL` = `https://Rita9CoreX-germline-rx.hf.space`
5. Deploy

Update `vite.config.ts` proxy target to point to HF Space URL:

```ts
proxy: {
  '/api': {
    target: process.env.VITE_API_URL || 'http://localhost:8000',
    changeOrigin: true,
  }
}
```

---

## What happens at startup

```
Space boots
    ↓
startup.sh runs
    ↓
download_datalake.py checks /data/datalake/
    ↓  (files missing on first boot)
Downloads 16 files from HF Datasets (~11 GB, takes ~2-4 min)
    ↓
uvicorn starts on port 8000
    ↓
Ready — all 4 tiers + enrichment working
```

Note: Files are in RAM only (no persistent disk on free tier).
Each cold start re-downloads. Warm Space = instant response.

---

## Final URLs

| Service | URL |
|---|---|
| Backend API | `https://Rita9CoreX-germline-rx.hf.space` |
| API Docs | `https://Rita9CoreX-germline-rx.hf.space/docs` |
| Frontend | `https://germline-rx.vercel.app` |

**Total cost: $0**
