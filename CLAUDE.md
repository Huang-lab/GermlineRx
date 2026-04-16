# GermlineRx — Project Cookbook for Claude

## What This Project Is

GermlineRx is a patient-facing web app that takes a germline genetic variant (e.g. `CFTR F508del`, `BRCA2 c.5946del`, `APOE c.388T>C`) plus optional age and condition, and returns:

- **Tier 0** — Variant interpretation (ClinVar pathogenicity, gnomAD allele frequency)
- **Tier 1** — FDA-approved therapies matched to the gene/variant
- **Tier 2** — Recruiting clinical trials from ClinicalTrials.gov, age-filtered
- **Tier 3** — Emerging / preclinical pipeline programs
- **Enrichment** — OMIM, DisGeNET, GWAS, BioGRID, DDInter, Broad Hub, Orphan drugs — all from local Biomni datalake files, **no API keys needed**

---

## How to Run Locally

**Backend** (Python/FastAPI):
```bash
cd germline_webapp/backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Frontend** (React/Vite):
```bash
cd germline_webapp/frontend
npm run dev
```

Open: **http://localhost:5173**
API docs: **http://localhost:8000/docs**

---

## Project Structure

```
GermlineRx/
├── CLAUDE.md                          ← this file
├── germline_webapp/
│   ├── docker-compose.yml             ← optional Docker setup
│   ├── backend/
│   │   ├── requirements.txt
│   │   ├── app/
│   │   │   ├── main.py                ← FastAPI app, CORS config
│   │   │   ├── api/
│   │   │   │   └── routes.py          ← POST /api/analyze, /normalize, /upload, GET /health
│   │   │   ├── engine/
│   │   │   │   ├── normalizer.py      ← free-text mutation → canonical gene + HGVS
│   │   │   │   ├── tier0.py           ← ClinVar + gnomAD variant interpretation
│   │   │   │   ├── tier1.py           ← FDA-approved therapy knowledge base (50+ genes, 100+ entries)
│   │   │   │   ├── tier2.py           ← ClinicalTrials.gov recruiting trial matching
│   │   │   │   ├── tier3.py           ← Emerging pipeline knowledge base
│   │   │   │   ├── eligibility.py     ← NLP trial eligibility checker
│   │   │   │   └── plain_language.py  ← Patient-friendly summary generator
│   │   │   ├── enrichment/
│   │   │   │   └── datalake.py        ← Biomni datalake reader (OMIM, GWAS, DDInter, BioGRID, etc.)
│   │   │   ├── models/
│   │   │   │   └── schemas.py         ← Pydantic request/response models
│   │   │   └── parsers/
│   │   │       ├── pdf_parser.py      ← Extract variants from PDF genetic reports
│   │   │       └── vcf_parser.py      ← Parse annotated VCF files
│   └── frontend/
│       ├── package.json
│       ├── vite.config.ts             ← proxies /api/* → localhost:8000
│       ├── tailwind.config.js         ← custom brand color palette
│       └── src/
│           ├── App.tsx                ← main app, disclaimer modal, nav, demo cases
│           ├── types/index.ts         ← all TypeScript interfaces
│           ├── utils/api.ts           ← API calls (normalize, analyze, upload)
│           └── components/
│               ├── input/
│               │   ├── ManualEntry.tsx   ← free-text condition + mutation input, gene autocomplete
│               │   └── FileUpload.tsx    ← PDF/VCF drag-and-drop upload
│               └── results/
│                   ├── ResultsPanel.tsx  ← 4-tier results + enrichment panel
│                   ├── TrialCard.tsx     ← individual clinical trial display
│                   └── ConfidenceBadge.tsx
```

---

## Architecture

```
Browser (React @ :5173)
    │
    │  POST /api/analyze
    ▼
FastAPI Backend (@ :8000)
    │
    ├── normalizer.py        free-text → HGVS (80+ aliases + regex fallback)
    ├── tier0.py             ClinVar API (NCBI) + gnomAD GraphQL
    ├── tier1.py             curated KB (no external calls)
    ├── tier2.py             ClinicalTrials.gov v2 API
    ├── tier3.py             curated KB (no external calls)
    └── datalake.py          reads local Biomni files:
                               ~/Desktop/PROJECTS/.../Biomni/data/biomni_data/data_lake/
```

**Key principle:** The browser never calls external APIs directly. All secrets and heavy data stay on the server.

---

## The Biomni Datalake

Located at:
```
/Users/luj12/Desktop/PROJECTS/Agentic Workflow/Biomni/data/biomni_data/data_lake/
```

Set via `BIOMNI_DATA_PATH` env var to override.

| File | Used for |
|---|---|
| `omim.parquet` | Gene MIM numbers + phenotypes |
| `DisGeNET.parquet` | Gene-disease associations |
| `gwas_catalog.pkl` | GWAS trait associations |
| `broad_repurposing_hub_phase_moa_target_info.parquet` | Drug repurposing candidates |
| `ddinter_*.csv` (7 files) | Drug-drug interaction safety flags |
| `affinity_capture-ms.parquet`, `two-hybrid.parquet`, `proximity_label-ms.parquet` | BioGRID protein-protein interactions |
| `gene_info.parquet` | Ensembl ID → gene symbol mapping (needed for BioGRID) |
| `kg.csv` | Knowledge graph: 8M edges, gene→disease→drug (replaces Orphanet) |

All loaded lazily with `@lru_cache` — only read once per server process.

---

## External APIs Used (No Keys Required)

| API | What for | Rate limit |
|---|---|---|
| ClinVar (NCBI E-utilities) | Variant pathogenicity classification | 3/s (10/s with NCBI_API_KEY) |
| gnomAD GraphQL | Population allele frequency | ~10/s |
| ClinicalTrials.gov v2 | Recruiting clinical trials | ~10/s |

**Optional env vars** (not required, improve rate limits):
```
NCBI_API_KEY=...       # increases ClinVar from 3→10 req/s
```

---

## Gene Normalizer

**File:** `backend/app/engine/normalizer.py`

Converts free-text patient input → canonical `(gene, HGVS, functional_class)`.

**Resolution order:**
1. Exact alias lookup (80+ curated entries: F508del, V30M, HbS, A4V, etc.)
2. Substring alias match
3. HGVS `c.` notation passthrough (uses gene extracted from condition field)
4. rsID passthrough
5. Exon deletion range (DMD-specific)
6. Single exon deletion
7. Protein notation (e.g. p.R403Q)
8. Gene-only fallback from disease name
9. UNKNOWN

**Gene symbol recognition:** regex covers ~80 genes including APOE, PCSK9, LRRK2, PTEN, APC, FBN1, PKD1, HFE, ATP7B, all cardiac genes, etc.

**Known limitation:** Any gene not in the regex returns UNKNOWN for HGVS inputs.

**Planned fix:** Replace regex with NCBI gene_info file lookup (~20k genes, full coverage).

---

## Therapy Knowledge Base (Tier 1)

**File:** `backend/app/engine/tier1.py` — `THERAPY_KB` list

50+ genes covered, 100+ entries. To add a new gene:

```python
{
    "gene": "YOUR_GENE",
    "match_functional_classes": None,   # None = all variants; or ["specific_fc"]
    "action_type": "drug",              # "drug", "surveillance", or "surgery"
    "drug_name": "Drug Name (Brand)",
    "action": "Mechanism description.",
    "fda_approved": True,
    "approval_year": "2024",
    "evidence_level": "FDA_approved",
    "line": "1st-line (indication)",
    "caveat": "Any caveats.",
    "source": "FDA NDA/BLA number",
},
```

---

## Schemas (source of truth for frontend/backend contract)

**File:** `backend/app/models/schemas.py`

Key response: `AnalyzeResponse` contains:
- `tier0`: ClinVar classification, gnomAD AF, confidence
- `tier1`: drugs[], surveillance[]
- `tier2`: trials[] with eligibility checks
- `tier3`: pipeline[]
- `enrichment`: omim, disgenet_diseases, gwas_associations, broad_hub_drugs, ddi_flags, ppi_partners, orphan

Frontend types mirror this in `frontend/src/types/index.ts`.

---

## Known Issues / TODOs

| Issue | Priority | Notes |
|---|---|---|
| Gene normalizer only covers ~80 genes via regex | High | Fix: replace with NCBI gene_info file |
| gnomAD query is gene-level only, not variant-level | Medium | Variant-level needs exact genomic position |
| No caching of ClinVar/gnomAD results | Medium | Same variant queried multiple times hits API each time |
| No user authentication | Low | No history, no audit trail |
| cyvcf2 dependency fails to install on macOS | Low | VCF parser uses fallback; skip in requirements for local dev |
| Biomni datalake path has desktop path as fallback | Low | Set BIOMNI_DATA_PATH env var if on a different machine |

---

## Test Cases (Gold Standard)

```bash
# CFTR F508del — expect: FULLY_ACTIONABLE, Trikafta
curl -s -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"variant":{"gene":"CFTR","hgvs":"c.1521_1523del","disease":"Cystic Fibrosis","age":24,"patient_label":"Test","functional_class":"f508del"}}'

# HBB sickle cell — expect: FULLY_ACTIONABLE, Casgevy
curl -s -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"variant":{"gene":"HBB","hgvs":"c.20A>T","disease":"Sickle Cell Disease","age":35,"patient_label":"Test","functional_class":"sickle_cell"}}'

# BRCA2 — expect: FULLY_ACTIONABLE, Olaparib
curl -s -X POST http://localhost:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"variant":{"gene":"BRCA2","hgvs":"p.Arg2336His","disease":"Hereditary Breast Cancer","age":25,"patient_label":"Test","functional_class":null}}'
```

---

## Environment Variables

```bash
# Optional — improve ClinVar rate limits
NCBI_API_KEY=your_ncbi_key

# Override Biomni datalake location
BIOMNI_DATA_PATH=/path/to/data_lake

# Backend config
CORS_ORIGINS=http://localhost:5173
LOG_LEVEL=INFO
```

Create `.env` in `germline_webapp/backend/` and it will be loaded automatically.
