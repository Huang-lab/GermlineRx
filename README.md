# GermlineRx: A Patient-Facing Germline Variant Therapy & Trial Matcher

GermlineRx translates a germline genetic variant into actionable clinical intelligence — FDA-approved therapies, recruiting clinical trials, emerging pipeline programs, and deep biomedical enrichment — in seconds.

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

**Enrichment (full mode only)**
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
│           └── static-mode/           # Browser-only engine (GitHub Pages)
├── api/
│   └── gnomad.js                     # Vercel serverless function — gnomAD proxy (avoids CORS)
└── .github/workflows/deploy.yml      # Auto-deploy to GitHub Pages on push
```

---

## Hosting

### Vercel (static, recommended)
Auto-deploys on every push to `main`. Live at **https://germline-rx.vercel.app**

All tiers use live APIs — no Python, no JSON files, no pre-build step. Tier 0 calls ClinVar + gnomAD (via a Vercel serverless proxy to avoid CORS), Tier 1 calls DGIdb, Tier 2/3 call ClinicalTrials.gov. Enrichment not available.

### GitHub Pages (static)
Auto-deploys on every push to `main`. Live at **https://huang-lab.github.io/GermlineRx**

Same browser-only engine as Vercel. Note: gnomAD variant-level AF requires the Vercel serverless proxy (`/api/gnomad`) — on GitHub Pages it falls back to curated values. Enrichment not available.

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
