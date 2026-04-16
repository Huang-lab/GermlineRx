# GermlineRx — Claude Code Agent Execution Plan

> **Purpose**: This document is a complete, self-contained plan for a Claude Code agent (or human developer) to take the GermlineRx prototype from this repository and deploy it as a fully functional, patient-facing web application — locally first, then to production.
>
> **Read this entire document before starting.** Each phase depends on the previous one.

---

## What GermlineRx Does

GermlineRx is a web application that takes a patient's genetic variant (e.g. `HBB:p.Glu6Val`, `CFTR F508del`, `BRCA2`) plus age and condition, and returns:

- **Tier 0** — Variant interpretation (ClinVar pathogenicity, gnomAD frequency, gene function)
- **Tier 1** — FDA-approved therapies matched to the variant (curated knowledge base, 28 genes)
- **Tier 2** — Recruiting clinical trials from ClinicalTrials.gov, age-filtered
- **Tier 3** — Emerging / preclinical pipeline
- **Enrichment** — DDI safety flags, PGx warnings, orphan designations, gene context (OMIM, BioGRID, HPO), GWAS associations, literature evidence

---

## Repository Structure

```
germline_webapp/
├── CLAUDE_AGENT_PLAN.md          ← this file
├── docker-compose.yml            ← runs the full stack
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py               ← FastAPI app entry point
│       ├── api/
│       │   └── routes.py         ← POST /api/analyze, /api/normalize, /api/upload
│       ├── engine/
│       │   ├── normalizer.py     ← variant alias → canonical gene + HGVS
│       │   ├── tier0.py          ← ClinVar + gnomAD API calls
│       │   ├── tier1.py          ← curated therapy knowledge base (28 genes)
│       │   ├── tier2.py          ← ClinicalTrials.gov API
│       │   ├── tier3.py          ← emerging pipeline knowledge base
│       │   ├── eligibility.py    ← trial age/criteria pre-screening
│       │   └── plain_language.py ← patient-friendly summary generator
│       ├── models/
│       │   └── schemas.py        ← Pydantic request/response models
│       └── parsers/
│           ├── pdf_parser.py     ← extract variants from PDF genetic reports
│           └── vcf_parser.py     ← parse annotated VCF files
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── components/
        │   ├── input/
        │   │   ├── ManualEntry.tsx
        │   │   └── FileUpload.tsx
        │   └── results/
        │       ├── ResultsPanel.tsx
        │       ├── TrialCard.tsx
        │       └── ConfidenceBadge.tsx
        ├── types/index.ts
        └── utils/api.ts
```

---

## Architecture Overview

```
Patient Browser
      │
      │  HTTPS — one endpoint only
      ▼
FastAPI Backend  (port 8000)
      │
      ├── ClinVar API          (public, no key needed)
      ├── gnomAD API           (public, no key needed)
      ├── ClinicalTrials.gov   (public, no key needed)
      ├── NCBI E-utilities     (free key recommended)
      ├── openFDA API          (public, no key needed)
      ├── OMIM API             (free academic key required)
      ├── Orphanet API         (free registration required)
      └── Local data files     (downloaded once, see Phase 1)

React Frontend  (port 5173 / 80)
      │
      └── Calls ONLY your backend — never external APIs directly
```

**Key principle**: The browser never calls any external API. All secrets stay on the server.

---

## Phase 0 — Prerequisites

### Software required on your machine

```bash
# Check these are installed before starting
docker --version          # Docker Desktop >= 24.0
docker compose version    # >= 2.20
node --version            # >= 18.0  (for local frontend dev only)
python --version          # >= 3.11  (for local backend dev only)
git --version
curl --version
```

Install Docker Desktop from https://www.docker.com/products/docker-desktop if missing.

### Free API keys to obtain (takes ~15 minutes total)

| Service | Why needed | How to get | Where to put it |
|---|---|---|---|
| NCBI / Entrez | ClinVar + PubMed queries (rate limit 3→10 req/s) | https://www.ncbi.nlm.nih.gov/account/ → API Keys | `NCBI_API_KEY` in `.env` |
| OMIM | Gene-disease MIM numbers, inheritance patterns | https://www.omim.org/api → Request API Key | `OMIM_API_KEY` in `.env` |
| Orphanet | Gene → rare disease → orphan drug links | https://api.orphacode.org/ → Register | `ORPHANET_API_KEY` in `.env` |

> **Note**: ClinicalTrials.gov, openFDA, gnomAD, and DDInter do not require API keys.

---

## Phase 1 — Download Local Data Files

Several enrichment modules use local database files for speed and reliability. Download these once and place them in `backend/data/`.

```bash
mkdir -p germline_webapp/backend/data
cd germline_webapp/backend/data
```

### 1.1 Broad Drug Repurposing Hub

**What**: ~7,000 compounds with gene targets, MOA, and clinical phase. Used for Tier 1 drug cross-referencing.

**Size**: ~5 MB (CSV)

**Download**:
```bash
curl -L "https://repo-hub.broadinstitute.org/repurposing/repurposing_drugs_20200324.txt" \
  -o broad_repurposing_hub.tsv
```

**Fallback** (if URL changes): https://www.broadinstitute.org/drug-repurposing-hub → Download

**Expected columns**: `pert_iname`, `clinical_phase`, `moa`, `target`, `disease_area`, `indication`

---

### 1.2 DDInter Drug-Drug Interaction Database

**What**: ~200,000 drug-drug interactions with severity (major/moderate/minor). Used for DDI safety flags.

**Size**: ~50 MB (CSV or SQLite)

**Download**:
```bash
# Option A: Direct download from DDInter
curl -L "https://ddinter.scbdd.com/static/media/DDInter.csv.zip" \
  -o ddinter.csv.zip
unzip ddinter.csv.zip

# Option B: If the above fails, use the API endpoint directly
# (no download needed — the backend will call it live)
# Set DDINTER_USE_API=true in .env
```

**Expected columns**: `Drug1`, `Drug2`, `Level`, `Mechanism`, `Management`

---

### 1.3 GWAS Catalog

**What**: Genome-wide association study hits linking variants/genes to traits. Used for variant context enrichment.

**Size**: ~200 MB (TSV)

**Download**:
```bash
curl -L "https://www.ebi.ac.uk/gwas/api/search/downloads/full" \
  -o gwas_catalog_full.tsv

# The backend expects this as a pickle for fast loading.
# Run the conversion script after download:
python ../scripts/convert_gwas.py gwas_catalog_full.tsv gwas_catalog.pkl
```

**Conversion script** (`backend/scripts/convert_gwas.py`):
```python
import pandas as pd, sys, pickle
df = pd.read_csv(sys.argv[1], sep='\t', low_memory=False)
df = df[['MAPPED_GENE','DISEASE/TRAIT','P-VALUE','OR or BETA','PUBMEDID']].dropna(subset=['MAPPED_GENE'])
with open(sys.argv[2], 'wb') as f:
    pickle.dump(df, f)
print(f"Saved {len(df)} rows to {sys.argv[2]}")
```

---

### 1.4 MSigDB Gene Sets (3 collections)

**What**: Curated gene set collections for pathway enrichment context. Used to show which pathways a gene belongs to.

**Size**: ~30 MB total (3 GMT files)

**Download** (requires free registration at https://www.gsea-msigdb.org/gsea/msigdb):
```bash
# After logging in, download these three collections:
# 1. Hallmark gene sets
wget "https://data.gsea-msigdb.org/file/msigdb/current/human/h.all.v2024.1.Hs.symbols.gmt" \
  -O msigdb_hallmark.gmt

# 2. Curated gene sets (C2)
wget "https://data.gsea-msigdb.org/file/msigdb/current/human/c2.all.v2024.1.Hs.symbols.gmt" \
  -O msigdb_c2_curated.gmt

# 3. Disease gene sets (C5 — HPO)
wget "https://data.gsea-msigdb.org/file/msigdb/current/human/c5.hpo.v2024.1.Hs.symbols.gmt" \
  -O msigdb_c5_hpo.gmt
```

**Alternative** (no login): Use the `msigdbr` R package or `gseapy` Python package which bundle MSigDB locally.

---

### 1.5 Human Phenotype Ontology (HPO)

**What**: Standardised phenotype terms linked to genes. Used for HPO badge display in enrichment panel.

**Size**: ~15 MB (OBO + annotation files)

**Download**:
```bash
# Ontology structure
curl -L "https://github.com/obophenotype/human-phenotype-ontology/releases/latest/download/hp.obo" \
  -o hp.obo

# Gene-to-phenotype annotations (this is the key file — hp.obo alone has no gene links)
curl -L "https://github.com/obophenotype/human-phenotype-ontology/releases/latest/download/genes_to_phenotype.txt" \
  -o hpo_genes_to_phenotype.txt
```

> **Important**: `hp.obo` contains ontology structure only. Gene-phenotype links are in `genes_to_phenotype.txt`. Both files are needed.

---

### 1.6 ClinPGx / PharmGKB PGx Data

**What**: Pharmacogenomics drug-gene pairs with clinical annotation levels. Used for PGx warnings.

**Size**: ~2 MB (TSV)

**Download**:
```bash
# Clinical annotation evidence (requires free PharmGKB account)
# https://www.pharmgkb.org/downloads → "Clinical Annotations"
curl -L "https://api.pharmgkb.org/v1/download/file/data/clinicalAnnotations.zip" \
  -o pharmgkb_clinical_annotations.zip
unzip pharmgkb_clinical_annotations.zip
```

**Alternative**: The backend includes a curated 10-pair hardcoded table for the most common PGx interactions (CYP3A4, CYP2C19, CYP2D6). This works without downloading PharmGKB if you only need the top interactions.

---

### 1.7 DisGeNET

**What**: Gene-disease associations with scores. Used for gene context enrichment.

**Size**: ~100 MB (TSV)

**Download** (requires free registration at https://www.disgenet.org):
```bash
# After registering, get your API key from your profile page
curl -H "Authorization: Bearer YOUR_DISGENET_KEY" \
  "https://www.disgenet.org/api/gda/gene/all?format=tsv" \
  -o disgenet_gda.tsv
```

**Alternative**: Use the DisGeNET REST API live (no download). Set `DISGENET_USE_API=true` and `DISGENET_API_KEY=your_key` in `.env`. The backend will call it per-query instead of reading a local file.

---

### 1.8 BioGRID Protein-Protein Interactions

**What**: Curated PPI network. Used to show top interaction partners for a gene.

**Size**: ~500 MB (tab-delimited, all organisms)

**Download**:
```bash
# Get the human-only file (much smaller, ~50 MB)
curl -L "https://downloads.thebiogrid.org/Download/BioGRID/Latest-Release/BIOGRID-ORGANISM-Homo_sapiens-LATEST.tab3.zip" \
  -o biogrid_human.zip
unzip biogrid_human.zip
mv BIOGRID-ORGANISM-Homo_sapiens-*.tab3.txt biogrid_human.txt
```

**Expected columns**: `Official Symbol Interactor A`, `Official Symbol Interactor B`, `Experimental System`, `Throughput`

---

### Summary: Data Files Checklist

```
backend/data/
├── broad_repurposing_hub.tsv        ~5 MB    ← Broad Institute (public)
├── ddinter.csv                      ~50 MB   ← DDInter (public)
├── gwas_catalog.pkl                 ~80 MB   ← EBI GWAS Catalog (converted)
├── msigdb_hallmark.gmt              ~1 MB    ← MSigDB (free account)
├── msigdb_c2_curated.gmt            ~20 MB   ← MSigDB (free account)
├── msigdb_c5_hpo.gmt                ~10 MB   ← MSigDB (free account)
├── hp.obo                           ~15 MB   ← HPO (public)
├── hpo_genes_to_phenotype.txt       ~5 MB    ← HPO (public)
├── pharmgkb_clinical_annotations/   ~2 MB    ← PharmGKB (free account)
├── disgenet_gda.tsv                 ~100 MB  ← DisGeNET (free account)
└── biogrid_human.txt                ~50 MB   ← BioGRID (public)

Total: ~340 MB
```

> **If you skip any file**: The backend gracefully degrades — that enrichment layer returns `null` instead of crashing. The core T0–T3 pipeline (ClinVar, gnomAD, CT.gov, Tier 1 KB) works with zero local files.

---

## Phase 2 — Environment Configuration

### 2.1 Create the `.env` file

```bash
cd germline_webapp
cp .env.example .env   # if .env.example exists, otherwise create fresh
```

Edit `.env`:

```bash
# ── Required for full functionality ──────────────────────────────
NCBI_API_KEY=your_ncbi_key_here
OMIM_API_KEY=your_omim_key_here
ORPHANET_API_KEY=your_orphanet_key_here

# ── Optional: use API instead of local file ───────────────────────
DISGENET_API_KEY=your_disgenet_key_here
DISGENET_USE_API=false          # set true to skip local file download
DDINTER_USE_API=false           # set true to skip local file download

# ── App configuration ─────────────────────────────────────────────
CORS_ORIGINS=http://localhost:5173
LOG_LEVEL=INFO
DATA_DIR=/app/data              # path inside Docker container

# ── Production only (leave empty for local dev) ───────────────────
SECRET_KEY=
DATABASE_URL=
```

### 2.2 Update docker-compose.yml to mount data directory

The current `docker-compose.yml` does not mount the data directory. Update it:

```yaml
# docker-compose.yml
version: "3.9"

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - NCBI_API_KEY=${NCBI_API_KEY}
      - OMIM_API_KEY=${OMIM_API_KEY}
      - ORPHANET_API_KEY=${ORPHANET_API_KEY}
      - DISGENET_API_KEY=${DISGENET_API_KEY}
      - CORS_ORIGINS=${CORS_ORIGINS:-http://localhost:5173}
      - LOG_LEVEL=${LOG_LEVEL:-INFO}
      - DATA_DIR=/app/data
    volumes:
      - ./backend/data:/app/data:ro    # ← ADD THIS LINE
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "5173:80"
    depends_on:
      - backend
    restart: unless-stopped
```

---

## Phase 3 — Replace Biomni Datalake Reads with Real APIs

> **Context**: The enrichment modules were originally built inside Biomni and read from `/mnt/datalake/`. These paths do not exist on a local machine. This phase replaces those reads with either local file reads (from `backend/data/`) or live API calls.

### Files to update and what to change

#### `backend/app/engine/tier0.py`
- **Current**: Calls ClinVar and gnomAD APIs directly ✅ — no change needed
- **Action**: None

#### `backend/app/engine/tier1.py`
- **Current**: Pure Python knowledge base (no file reads) ✅ — no change needed
- **Action**: None. The KB covers 28 genes with 40+ entries. To extend it, add entries to `THERAPY_KB` list.

#### `backend/app/engine/tier2.py`
- **Current**: Calls ClinicalTrials.gov API directly ✅ — no change needed
- **Action**: None

#### `backend/app/engine/tier3.py`
- **Current**: Pure Python knowledge base ✅ — no change needed
- **Action**: None

#### `backend/app/enrichment/tier1_orphan.py` (if present)
- **Current**: Reads from `/mnt/datalake/broad_drug_repurposing_hub/`
- **Change to**:
```python
import os, pandas as pd

DATA_DIR = os.environ.get("DATA_DIR", "./data")

def load_broad_hub():
    path = os.path.join(DATA_DIR, "broad_repurposing_hub.tsv")
    if not os.path.exists(path):
        return None
    return pd.read_csv(path, sep='\t', comment='!')

def get_orphan_designations(gene: str) -> list:
    # 1. Try Orphanet API
    orphanet_results = _query_orphanet(gene)
    # 2. Try openFDA API
    fda_results = _query_openfda(gene)
    # 3. Cross-reference Broad Hub
    hub_df = load_broad_hub()
    broad_results = []
    if hub_df is not None:
        hits = hub_df[hub_df['target'].str.contains(gene, na=False, case=False)]
        broad_results = hits[['pert_iname','clinical_phase','moa']].to_dict('records')
    return _merge(orphanet_results, fda_results, broad_results)
```

#### `backend/app/enrichment/ddi_safety.py` (if present)
- **Current**: Reads from `/mnt/datalake/ddinter/`
- **Change to**:
```python
import os, pandas as pd

DATA_DIR = os.environ.get("DATA_DIR", "./data")

def load_ddinter():
    path = os.path.join(DATA_DIR, "ddinter.csv")
    if not os.path.exists(path):
        return None
    df = pd.read_csv(path, low_memory=False)
    # Normalise drug name keys to lowercase stripped
    df['drug1_key'] = df['Drug1'].str.lower().str.strip()
    df['drug2_key'] = df['Drug2'].str.lower().str.strip()
    return df
```

#### `backend/app/enrichment/variant_impact.py` (if present)
- **Current**: Reads GWAS pkl from `/mnt/datalake/gwas_catalog/`
- **Change to**:
```python
import os, pickle

DATA_DIR = os.environ.get("DATA_DIR", "./data")

def load_gwas():
    path = os.path.join(DATA_DIR, "gwas_catalog.pkl")
    if not os.path.exists(path):
        return None
    with open(path, 'rb') as f:
        return pickle.load(f)
```

#### `backend/app/enrichment/gene_context.py` (if present)
- **Current**: Reads BioGRID from `/mnt/datalake/biogrid/`
- **Change to**:
```python
import os, pandas as pd

DATA_DIR = os.environ.get("DATA_DIR", "./data")

def load_biogrid():
    path = os.path.join(DATA_DIR, "biogrid_human.txt")
    if not os.path.exists(path):
        return None
    # Note: do NOT use comment='#' — BioGRID header starts with #
    # but the data rows do not. Read with header=0.
    df = pd.read_csv(path, sep='\t', header=0, low_memory=False)
    return df
```

---

## Phase 4 — Add Production-Ready Layers

These are required before real patients use the app.

### 4.1 Rate Limiting

```bash
cd backend
pip install slowapi
```

In `backend/app/main.py`:
```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

In `backend/app/api/routes.py`:
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

@router.post("/analyze")
@limiter.limit("10/minute")   # 10 queries per IP per minute
async def analyze(request: Request, req: AnalyzeRequest):
    ...
```

Add to `requirements.txt`:
```
slowapi==0.1.9
```

### 4.2 Response Caching

Same variant queried twice should not hit ClinVar twice:

```bash
pip install cachetools
```

In `backend/app/engine/tier0.py`:
```python
from cachetools import TTLCache, cached

_cache = TTLCache(maxsize=500, ttl=86400)  # 500 entries, 24-hour TTL

@cached(_cache)
async def interpret_variant(gene: str, hgvs: str, fc: str) -> dict:
    ...
```

### 4.3 Disclaimer Modal (Frontend)

In `frontend/src/App.tsx`, add before showing any results:

```tsx
const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

if (!disclaimerAccepted) {
  return (
    <div className="disclaimer-modal">
      <h2>Important Notice</h2>
      <p>
        GermlineRx provides information for <strong>educational and research
        purposes only</strong>. It is not a substitute for advice from a
        qualified healthcare professional. Do not make medical decisions based
        solely on these results.
      </p>
      <button onClick={() => setDisclaimerAccepted(true)}>
        I understand — Continue
      </button>
    </div>
  );
}
```

### 4.4 HTTPS (automatic in production)

- **Vercel** (frontend): HTTPS automatic
- **Railway / Render** (backend): HTTPS automatic
- **Local dev**: HTTP is fine (localhost only)

---

## Phase 5 — Run Locally

```bash
# From the germline_webapp/ directory
cd germline_webapp

# Build and start both services
docker compose up --build

# First run takes 3-5 minutes (npm install + pip install inside containers)
# Subsequent runs: ~30 seconds
```

**Access the app**:
- Frontend: http://localhost:5173
- Backend API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/health

**Test with demo cases**:

```bash
# Test 1: CFTR F508del (should return Trikafta)
curl -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"variant": {"gene": "CFTR", "hgvs": "p.Phe508del", "functional_class": "f508del", "age": 24, "disease": "cystic fibrosis", "patient_label": "Demo"}}'

# Test 2: HBB p.Glu6Val (should return Casgevy, Lyfgenia, Hydroxyurea)
curl -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"variant": {"gene": "HBB", "hgvs": "p.Glu6Val", "functional_class": "sickle_cell", "age": 35, "disease": "sickle cell disease", "patient_label": "Demo"}}'

# Test 3: BRCA2 (should return PARP inhibitors + surveillance)
curl -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"variant": {"gene": "BRCA2", "hgvs": "p.Arg2336His", "functional_class": null, "age": 25, "disease": "hereditary breast cancer", "patient_label": "Demo"}}'
```

**Expected responses**:
- Test 1: `overall_status: "FULLY_ACTIONABLE"`, Trikafta in drugs list
- Test 2: `overall_status: "FULLY_ACTIONABLE"`, Casgevy + Hydroxyurea in drugs list, Voxelotor NOT present (withdrawn Sep 2024)
- Test 3: `overall_status: "ACTIONABLE"`, Olaparib in drugs list, surveillance recommendations

---

## Phase 6 — Extend the Knowledge Base

The Tier 1 knowledge base (`backend/app/engine/tier1.py`) currently covers **28 genes**. To add a new gene:

```python
# Add to THERAPY_KB list in tier1.py
{
    "gene": "YOUR_GENE",
    "match_functional_classes": None,   # None = all variants; or ["specific_class"]
    "action_type": "drug",              # "drug", "surveillance", or "surgery"
    "drug_name": "Drug Name (Brand)",
    "action": "Mechanism and clinical use description.",
    "fda_approved": True,
    "approval_year": "2024",
    "evidence_level": "FDA_approved",   # or "NCCN_guideline", "ATA_guideline", etc.
    "line": "1st-line (indication)",
    "caveat": "Any important caveats or restrictions.",
    "source": "FDA NDA/BLA number or guideline citation",
},
```

**Genes currently covered**: CFTR, DMD, SOD1, SMN1, BRCA1, BRCA2, MLH1, MSH2, MSH6, PMS2, TTR, HBB, LDLR, MYBPC3, MYH7, NF1, VHL, FXN, RET (19 genes with drug entries; 28 total including surveillance-only)

---

## Phase 7 — Deploy to Production

### Option A: Vercel (frontend) + Railway (backend) — Recommended for pilot

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "GermlineRx initial commit"
git remote add origin https://github.com/YOUR_USERNAME/germline-rx.git
git push -u origin main

# 2. Deploy backend to Railway
# - Go to https://railway.app → New Project → Deploy from GitHub
# - Select germline_webapp/backend as root directory
# - Add environment variables from your .env file
# - Railway auto-detects Dockerfile and deploys
# - Note your Railway URL: https://germline-rx-backend.up.railway.app

# 3. Deploy frontend to Vercel
# - Go to https://vercel.com → New Project → Import from GitHub
# - Set root directory to germline_webapp/frontend
# - Add environment variable: VITE_API_URL=https://germline-rx-backend.up.railway.app
# - Vercel auto-builds and deploys
```

### Option B: Single server (VPS / EC2)

```bash
# On your server (Ubuntu 22.04)
git clone https://github.com/YOUR_USERNAME/germline-rx.git
cd germline-rx/germline_webapp

# Copy data files
scp -r ./backend/data user@your-server:/path/to/germline-rx/germline_webapp/backend/data

# Copy .env
scp .env user@your-server:/path/to/germline-rx/germline_webapp/.env

# Run
docker compose up -d --build

# Add nginx reverse proxy for HTTPS (use certbot for SSL)
```

---

## Phase 8 — Known Limitations and Future Work

### Current limitations

| Limitation | Impact | Fix |
|---|---|---|
| Tier 1 KB covers 28 genes only | Variants in other genes return no drug matches | Add entries to `THERAPY_KB` |
| Orphan drug table is partially hardcoded | Only 16 genes have orphan data | Implement Orphanet API fully |
| No user authentication | Cannot store history, no audit trail | Add Auth0 or Clerk |
| No patient data storage | Users cannot retrieve past queries | Add PostgreSQL + HIPAA-compliant hosting |
| TxGNN model not included | Repurposing suggestions unavailable | Host TxGNN as separate GPU microservice |
| No VUS interpretation | VUS variants return limited output | Integrate SpliceAI, REVEL, AlphaMissense scores |
| Voxelotor still in some code comments | Potential confusion | Confirm all references removed from active KB |

### Regulatory note

If this app is used with real patients in a clinical context in the US, it may be subject to FDA Software as a Medical Device (SaMD) regulations. Consult a regulatory specialist before clinical deployment. The current disclaimer ("educational purposes only") is appropriate for research use.

---

## Quick Reference: All External APIs Used

| API | Base URL | Auth | Rate Limit | Used for |
|---|---|---|---|---|
| ClinVar | `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/` | NCBI key (optional) | 3/s (10/s with key) | Variant pathogenicity |
| gnomAD | `https://gnomad.broadinstitute.org/api` | None | ~10/s | Population frequency |
| ClinicalTrials.gov v2 | `https://clinicaltrials.gov/api/v2/studies` | None | ~10/s | Recruiting trials |
| openFDA | `https://api.fda.gov/drug/` | None | 240/min | Drug labels, orphan designations |
| OMIM | `https://api.omim.org/api/` | Key required | 10/s | MIM numbers, inheritance |
| Orphanet | `https://api.orphacode.org/` | Key required | 10/s | Rare disease → drug links |
| DisGeNET | `https://www.disgenet.org/api/` | Key required | 10/s | Gene-disease associations |
| PharmGKB | `https://api.pharmgkb.org/v1/` | None (public) | ~5/s | PGx annotations |
| BioGRID | `https://webservice.thebiogrid.org/` | Key required | 10/s | Protein interactions |
| EBI GWAS Catalog | `https://www.ebi.ac.uk/gwas/rest/api/` | None | ~5/s | GWAS associations |
| RummaGEO | `https://rummageo.com/graphql` | None | ~5/s | GEO dataset evidence |

---

## Troubleshooting

### Docker build fails on `cyvcf2`
```bash
# cyvcf2 requires htslib. If build fails, replace with pysam:
pip install pysam
# Or use the pure-Python fallback in vcf_parser.py
```

### Frontend cannot reach backend
```bash
# Check CORS_ORIGINS in .env matches your frontend URL exactly
# Check backend is running: curl http://localhost:8000/api/health
# Check vite.config.ts proxy settings point to http://backend:8000
```

### ClinVar returns no results
```bash
# ClinVar HGVS format is strict. Test with:
curl "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=HBB[gene]+AND+pathogenic[clinical_significance]&retmode=json"
# If NCBI is down, tier0 returns a graceful fallback with confidence=LOW
```

### Data files not found
```bash
# Check DATA_DIR env var matches the volume mount in docker-compose.yml
# Check file names match exactly what the enrichment modules expect
# All enrichment modules degrade gracefully — check logs for "data file not found" warnings
docker compose logs backend | grep "not found"
```

### Port 5173 already in use
```bash
# Change in docker-compose.yml:
ports:
  - "3000:80"   # use port 3000 instead
```

---

*GermlineRx — Built with FastAPI, React, and Biomni. For educational and research purposes only.*
*Not a substitute for clinical judgement.*
