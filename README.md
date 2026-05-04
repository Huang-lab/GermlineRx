# GermlineRx: A Patient-Facing Germline Variant Therapy & Trial Matcher

GermlineRx translates a germline genetic variant into actionable clinical intelligence in three outputs: variant interpretation, FDA-approved therapies, and recruiting clinical trials.

| Deployment | URL | Mode |
|------------|-----|------|
| Vercel (static, recommended) | [germline-rx.vercel.app](https://germline-rx.vercel.app) | Browser-only, live APIs, auto-deploys on push |
| GitHub Pages (static) | [huang-lab.github.io/GermlineRx](https://huang-lab.github.io/GermlineRx) | Browser-only, live APIs |
| HuggingFace Spaces (full) | [Rita9CoreX-germline-rx.hf.space](https://Rita9CoreX-germline-rx.hf.space) | All features, full backend + enrichment |

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
- OpenFDA drug labels (live) plus curated FDA fallback entries
- Matched to gene/variant context and deduplicated in the UI
- Includes drug name, approval details, caveats, and FDA/OpenFDA source links

**Tier 2 — Recruiting Clinical Trials**
- Live query to ClinicalTrials.gov v2 API
- Eligibility pre-screening (age/sex/criteria) with plain-language explanations
- Direct links to trial pages and contact information
- Returns top 10 ranked recruiting interventional studies

---

## Supported Genes (examples)

CFTR · DMD · SMN1 · SOD1 · HTT · TTR · HBB · BRCA1 · BRCA2 · MLH1 · MSH2 · LDLR · PCSK9 · APOE · GBA · F8 · F9 · RET · TP53 · PTEN · APC · VHL · NF1 · MYBPC3 · MYH7 · KCNQ1 · SCN5A · PKD1 · FBN1 · ATP7B · and 20+ more

---

## Getting Started (Local)

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
├── .github/
│   └── workflows/
│       └── deploy.yml                 # Auto-deploy to GitHub Pages on push to main
├── germline_webapp/
│   ├── backend/
│   │   ├── app/
│   │   │   ├── api/routes.py          # POST /api/analyze, /normalize, /upload, GET /health
│   │   │   ├── engine/
│   │   │   │   ├── normalizer.py      # Free-text variant → canonical gene + HGVS
│   │   │   │   ├── tier0.py           # ClinVar + gnomAD interpretation
│   │   │   │   ├── tier1.py           # FDA-approved therapy KB
│   │   │   │   ├── tier2.py           # ClinicalTrials.gov matching
│   │   │   │   └── tier3.py           # Emerging pipeline KB
│   │   │   ├── enrichment/datalake.py # Biomni datalake reader
│   │   │   ├── models/schemas.py      # API request/response schemas
│   │   │   └── parsers/               # PDF/VCF parsers
│   │   └── requirements.txt
│   └── frontend/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/            # Input + results UI
│       │   └── static-mode/           # Browser-only analysis engine
│       ├── api/
│       │   ├── gnomad.js              # Vercel serverless gnomAD proxy
│       │   └── proxy.js               # CORS fallback proxy
│       ├── vite.config.ts
│       └── vercel.json
├── README.md
└── LICENSE
```

---

## Hosting

### Vercel (static, recommended)
Auto-deploys on every push to `main`. Live at **https://germline-rx.vercel.app**

The app runs fully in-browser with live APIs and no backend requirement for deployment. Tier 0 uses ClinVar + gnomAD (MyVariant.info first, then fallback), Tier 1 uses OpenFDA + curated FDA fallback, Tier 2 uses ClinicalTrials.gov v2.

### GitHub Pages (static)
Auto-deploys on every push to `main`. Live at **https://huang-lab.github.io/GermlineRx**

Same browser-only engine as Vercel. Trial and therapy outputs are fully live from ClinicalTrials.gov and OpenFDA.

### HuggingFace Spaces (full stack)
Full backend served via Docker at **https://Rita9CoreX-germline-rx.hf.space**

Frontend and backend run in the same container. All 4 tiers + enrichment available (enrichment requires datalake files).

---

## Configuration

Copy `germline_webapp/backend/.env.example` to `.env`:

```bash
NCBI_API_KEY=your_key       # Optional — raises ClinVar limit from 3 to 10 req/s
BIOMNI_DATA_PATH=/path/to/data_lake   # Required for enrichment features
```

---

## Example Queries

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
