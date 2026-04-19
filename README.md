# GermlineRx: A Patient-Facing Germline Variant Therapy & Trial Matcher

GermlineRx translates a germline genetic variant into actionable clinical intelligence — FDA-approved therapies, recruiting clinical trials, emerging pipeline programs, and deep biomedical enrichment — in seconds.

| Deployment | URL | Mode |
|------------|-----|------|
| GitHub Pages (static) | [huang-lab.github.io/GermlineRx](https://huang-lab.github.io/GermlineRx) | Browser-only, no backend |
| Vercel + Render (full) | [germline-rx.vercel.app](https://germline-rx.vercel.app) | All features, free cloud backend |

---

## Overview

Most genomic variant tools are built for clinicians or bioinformaticians. GermlineRx is designed for patients and researchers who want to understand what a germline variant means for treatment options today and clinical opportunities tomorrow.

Enter any variant in any format — `CFTR F508del`, `BRCA2 c.5946del`, `HBB HbS`, `APOE c.388T>C` — and GermlineRx returns a structured, tiered report.

---

## Key Capabilities

**Tier 0 — Variant Interpretation**
- ClinVar pathogenicity classification with review star rating
- gnomAD population allele frequency and rarity interpretation
- Supports HGVS, protein notation, common names, rsIDs, and exon deletions

**Tier 1 — FDA-Approved Therapies**
- Curated knowledge base covering 50+ genes and 100+ FDA-approved therapy entries
- Matched to variant functional class (e.g. F508del, gating mutation, nonsense, sickle cell)
- Includes drug name, approval year, indication line, caveats, and FDA source

**Tier 2 — Recruiting Clinical Trials**
- Live query to ClinicalTrials.gov v2 API
- Age-filtered eligibility checking with plain-language explanations
- Direct links to trial pages and contact information

**Tier 3 — Emerging Pipeline**
- CRISPR, ASO, mRNA, gene therapy, and RNAi programs in active development
- Stage-annotated (Preclinical → Phase 3) with key programs and caveats

**Enrichment (local mode)**
- OMIM gene-phenotype associations
- DisGeNET gene-disease scores
- GWAS catalog trait associations
- Broad Repurposing Hub drug candidates
- Drug-drug interaction flags (DDInter)
- BioGRID protein-protein interactions
- Orphan disease and orphan drug mapping

---

## Supported Genes (examples)

CFTR · DMD · SMN1 · SOD1 · HTT · TTR · HBB · BRCA1 · BRCA2 · MLH1 · MSH2 · LDLR · PCSK9 · APOE · GBA · F8 · F9 · RET · TP53 · PTEN · APC · VHL · NF1 · MYBPC3 · MYH7 · KCNQ1 · SCN5A · PKD1 · FBN1 · ATP7B · and 20+ more

---

## Getting Started

**Prerequisites:** Python 3.9+, Node 18+

```bash
# Clone
git clone https://github.com/Huang-lab/GermlineRx.git
cd GermlineRx

# Backend
cd germline_webapp/backend
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend (new terminal)
cd germline_webapp/frontend
npm install
npm run dev
```

Open **http://localhost:5173**

---

## External APIs

All APIs are free and require no account or key.

| API | Purpose | Key Required |
|-----|---------|--------------|
| ClinVar (NCBI E-utilities) | Variant pathogenicity | No (optional for higher rate limit) |
| gnomAD GraphQL | Population allele frequency | No |
| ClinicalTrials.gov v2 | Recruiting trial search | No |

---

## Project Structure

```
GermlineRx/
├── germline_webapp/
│   ├── backend/
│   │   ├── app/
│   │   │   ├── engine/
│   │   │   │   ├── normalizer.py      # Free-text variant → canonical gene + HGVS
│   │   │   │   ├── tier0.py           # ClinVar + gnomAD interpretation
│   │   │   │   ├── tier1.py           # FDA-approved therapy KB
│   │   │   │   ├── tier2.py           # ClinicalTrials.gov matching
│   │   │   │   └── tier3.py           # Emerging pipeline KB
│   │   │   ├── enrichment/
│   │   │   │   └── datalake.py        # Biomni datalake reader
│   │   │   └── api/routes.py          # POST /api/analyze, /normalize, /upload
│   │   └── requirements.txt
│   └── frontend/
│       └── src/
│           ├── App.tsx
│           ├── components/            # Input forms, results panels, trial cards
│           └── static-mode/           # Browser-only engine (no backend needed)
├── scripts/
│   └── export_kb_to_json.py          # Export KBs to JSON for static mode
├── vercel.json                        # Vercel frontend deploy config
├── germline_webapp/backend/render.yaml  # Render.com backend deploy config
└── .github/workflows/deploy.yml      # Auto-deploy to GitHub Pages
```

---

## Hosting Options

### Option 1 — GitHub Pages (static, no backend)
Auto-deploys on every push to `main` via `.github/workflows/deploy.yml`.
Live at: **https://huang-lab.github.io/GermlineRx**

Tier 1 and Tier 3 run from bundled JSON. Tier 0 and Tier 2 call ClinVar and ClinicalTrials.gov directly from the browser. Enrichment not available.

### Option 2 — Vercel + Render (full stack, all features)

**Architecture:**
```
Browser → Vercel (React frontend) → Render.com (FastAPI backend)
                                         ├── ClinVar API
                                         ├── gnomAD API
                                         └── ClinicalTrials.gov API
```

**Backend on Render.com** (free tier):
1. New Web Service → connect `Huang-lab/GermlineRx`
2. Root directory: `germline_webapp/backend`
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Env var: `CORS_ORIGINS=https://germline-rx.vercel.app`

**Frontend on Vercel** (free):
1. Import `Huang-lab/GermlineRx`
2. Root directory: `germline_webapp/frontend`
3. Build: `npm run build` (no VITE_STATIC_MODE)
4. Output: `dist`

The `vercel.json` in the frontend directory automatically proxies `/api/*` calls to the Render backend — no code changes needed.

---

## Static (Browser-Only) Mode

GermlineRx can run entirely in the browser with no backend server, deployed as a static site.

```bash
# Export knowledge bases to JSON
python scripts/export_kb_to_json.py

# Build and preview
cd germline_webapp/frontend
VITE_STATIC_MODE=true npm run build
npx serve dist
```

In static mode, Tier 1 and Tier 3 run from bundled JSON. Tier 0 and Tier 2 call ClinVar and ClinicalTrials.gov directly from the browser. Enrichment data requires local mode.

---

## Configuration

Copy `germline_webapp/backend/.env.example` to `.env`:

```bash
NCBI_API_KEY=your_key       # Optional — raises ClinVar limit from 3 to 10 req/s
BIOMNI_DATA_PATH=/path/to/data_lake   # Required for enrichment features
```

---

## Example Variants

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

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

> **Disclaimer:** GermlineRx is for educational and research purposes only. It is not a substitute for advice from a qualified healthcare professional. Always consult a genetic counselor or physician before making any medical decisions.
