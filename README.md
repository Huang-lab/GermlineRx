# GermlineRx

**Patient-facing germline variant → therapy & trial matcher**

Enter a genetic variant (e.g. `CFTR F508del`, `BRCA2 6174delT`, `HBB HbS`) and get:

- **Tier 0** — Variant interpretation (ClinVar pathogenicity, gnomAD allele frequency)
- **Tier 1** — FDA-approved therapies for your gene/variant (50+ genes, 100+ entries)
- **Tier 2** — Recruiting clinical trials from ClinicalTrials.gov, age-filtered
- **Tier 3** — Emerging pipeline programs (CRISPR, ASO, gene therapy, mRNA)
- **Enrichment** — OMIM, DisGeNET, GWAS, BioGRID, drug-drug interactions, orphan drugs

No API keys required. All external sources (ClinVar, gnomAD, ClinicalTrials.gov) are free and public.

---

## Quick Start

**Prerequisites:** Python 3.9+, Node 18+

```bash
# 1. Clone
git clone https://github.com/Huang-lab/GermlineRx.git
cd GermlineRx

# 2. Start backend
cd germline_webapp/backend
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 3. Start frontend (new terminal)
cd germline_webapp/frontend
npm install
npm run dev
```

Open **http://localhost:5173**

---

## Browser-Only (Static) Mode

Run GermlineRx entirely in the browser — no backend server needed. Deploys as a static site to GitHub Pages.

```bash
# 1. Export knowledge bases to JSON
python scripts/export_kb_to_json.py

# 2. Build static frontend
cd germline_webapp/frontend
VITE_STATIC_MODE=true npm run build

# 3. Preview locally
npx serve dist
```

In static mode, Tier 0 and Tier 2 call ClinVar and ClinicalTrials.gov directly from the browser. Enrichment data (OMIM, GWAS, BioGRID) is not available.

---

## External APIs Used

| API | Purpose | Key Required? |
|-----|---------|--------------|
| [ClinVar (NCBI)](https://www.ncbi.nlm.nih.gov/clinvar/) | Variant pathogenicity | No (optional `NCBI_API_KEY` for higher rate limit) |
| [gnomAD GraphQL](https://gnomad.broadinstitute.org) | Population allele frequency | No |
| [ClinicalTrials.gov v2](https://clinicaltrials.gov/api/v2/) | Recruiting trials | No |

---

## Project Structure

```
GermlineRx/
├── germline_webapp/
│   ├── backend/          Python/FastAPI — normalizer, tier0-3, enrichment
│   └── frontend/         React/Vite/Tailwind
├── scripts/
│   └── export_kb_to_json.py   — generates JSON for static mode
└── CLAUDE.md             Full developer reference
```

---

## Configuration

Copy `germline_webapp/backend/.env.example` to `.env` to set optional environment variables:

```bash
NCBI_API_KEY=...          # improves ClinVar rate limit 3→10 req/s
BIOMNI_DATA_PATH=...      # path to local enrichment datalake
```

---

> **Disclaimer:** GermlineRx is for educational and research purposes only. It is not a substitute for advice from a qualified healthcare professional. Always consult a genetic counselor or physician before making any medical decisions.
