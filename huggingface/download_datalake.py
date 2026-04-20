"""
Download Biomni datalake files from a HuggingFace Datasets repo at startup.
Only downloads files that are missing — safe to re-run.

Set environment variables:
  HF_DATALAKE_REPO   e.g. "yourname/biomni-datalake"
  HF_TOKEN           optional, only needed if repo is private
  BIOMNI_DATA_PATH   where to save files (default: /data/datalake)
"""
import os
import sys

repo_id = os.environ.get("HF_DATALAKE_REPO", "")
data_path = os.environ.get("BIOMNI_DATA_PATH", "/data/datalake")
hf_token = os.environ.get("HF_TOKEN", None)

# Files required for enrichment
DATALAKE_FILES = [
    "omim.parquet",
    "DisGeNET.parquet",
    "gwas_catalog.pkl",
    "broad_repurposing_hub_phase_moa_target_info.parquet",
    "ddinter_downloads_code_A.csv",
    "ddinter_downloads_code_B.csv",
    "ddinter_downloads_code_C.csv",
    "ddinter_downloads_code_D.csv",
    "ddinter_downloads_code_E.csv",
    "ddinter_downloads_code_F.csv",
    "ddinter_downloads_code_G.csv",
    "affinity_capture-ms.parquet",
    "two-hybrid.parquet",
    "proximity_label-ms.parquet",
    "gene_info.parquet",
    "kg.csv",
]

if not repo_id:
    print("HF_DATALAKE_REPO not set — skipping datalake download")
    sys.exit(0)

try:
    from huggingface_hub import hf_hub_download
except ImportError:
    print("huggingface_hub not installed — skipping datalake download")
    sys.exit(0)

os.makedirs(data_path, exist_ok=True)

print(f"Downloading datalake from {repo_id} → {data_path}")
missing = [f for f in DATALAKE_FILES if not os.path.exists(os.path.join(data_path, f))]

if not missing:
    print("All datalake files already present — skipping download")
    sys.exit(0)

print(f"{len(missing)} files to download...")
failed = []
for filename in missing:
    dest = os.path.join(data_path, filename)
    try:
        hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            repo_type="dataset",
            token=hf_token,
            local_dir=data_path,
        )
        print(f"  ✓  {filename}")
    except Exception as e:
        print(f"  ✗  {filename}  ({e})")
        failed.append(filename)

if failed:
    print(f"\nWarning: {len(failed)} files failed to download — enrichment may be partial")
else:
    print(f"\nDatalake ready at {data_path}")
