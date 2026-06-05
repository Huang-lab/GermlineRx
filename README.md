# GermlineRx: Germline Variant Therapy & Trial Matcher

GermlineRx translates a germline genetic variant into actionable clinical intelligence — variant interpretation, FDA-approved therapies, and recruiting clinical trials — entirely in the browser, with no backend server required.

**Live:** [germline-rx.vercel.app](https://germline-rx.vercel.app) · Auto-deploys on every push to `main`

---

## What It Does

Enter a variant in any format — `CFTR F508del`, `BRCA2 c.5946del`, `HBB HbS`, `APOE4`, `SOD1 A4V` — and GermlineRx returns a structured, three-tier report in seconds.

**Tier 0 — Variant Interpretation**
- ClinVar pathogenicity classification (Pathogenic / VUS / Benign) with evidence star rating
- gnomAD population allele frequency (how rare is this variant?)
- Variant resolved via MyVariant.info first, then ClinVar direct lookup as fallback

**Tier 1 — FDA-Approved Therapies**
- Curated variant-matched drug knowledge base (50+ genes, 100+ entries with NDA/BLA numbers)
- Supplemented by live OpenFDA drug label search for broader gene coverage
- Each entry links to FDA Drugs@FDA for the full approval record

**Tier 2 — Recruiting Clinical Trials**
- Live query to ClinicalTrials.gov v2 API — results are always current
- Automatic eligibility pre-screening by age and sex
- Top 10 ranked interventional trials with contact info and direct ClinicalTrials.gov links

---

## How It Works (Architecture)

The app runs entirely in the browser — no Python server, no backend to maintain. Every query makes live API calls directly from the user's browser:

```
Browser (React + TypeScript)
    │
    ├── MyVariant.info          → gnomAD allele frequency + ClinVar variant ID
    ├── NCBI E-utilities        → ClinVar pathogenicity classification
    ├── OpenFDA                 → FDA drug label search (CORS fallback via /api/proxy)
    └── ClinicalTrials.gov v2   → Recruiting trial search (CORS fallback via /api/proxy)

Vercel serverless functions (api/)
    ├── api/proxy.js            → CORS fallback proxy for OpenFDA + ClinicalTrials.gov
    └── api/gnomad.js           → gnomAD GraphQL proxy (fallback if MyVariant misses AF)
```

All APIs are free and require no account or key.

---

## Gene Coverage

**Tier 0 and Tier 2 work for any gene** — ClinVar and ClinicalTrials.gov accept any gene symbol or HGVS notation.

**Tier 1 FDA therapy matching** is most complete for genes with curated entries:

CFTR · DMD · SMN1 · SOD1 · HTT · TTR · HBB · BRCA1 · BRCA2 · MLH1 · MSH2 · MSH6 · PMS2 · LDLR · PCSK9 · APOE · GBA · FXN · F8 · F9 · RET · TP53 · PTEN · NF1 · VHL · MYBPC3 · MYH7 · KCNQ1 · SCN5A · PKD1 · FBN1 · ATP7B · PKHD1 · PAH · GAA · SCN1A · GJB2 · and more

For genes not in the curated list, OpenFDA drug label search provides broader fallback coverage.

---

## Demo Cases

| Variant | Expected Result |
|---------|----------------|
| CFTR F508del | FULLY_ACTIONABLE — Trikafta (elexacaftor/tezacaftor/ivacaftor) |
| DMD Exon 50 del | FULLY_ACTIONABLE — Eteplirsen (Exondys 51), Elevidys, Deflazacort |
| SOD1 A4V | FULLY_ACTIONABLE — Tofersen (Qalsody) |
| TTR V30M | FULLY_ACTIONABLE — Tafamidis (Vyndaqel), Patisiran (Onpattro) |
| BRCA2 c.5946del | FULLY_ACTIONABLE — Olaparib (Lynparza), Niraparib |
| HBB HbS | FULLY_ACTIONABLE — Casgevy, Lyfgenia, Hydroxyurea |
| APOE4 | FULLY_ACTIONABLE — Lecanemab (Leqembi), Donanemab (Kisunla) |

---

## Running Locally

**Prerequisites:** Node 18+

```bash
git clone https://github.com/Huang-lab/GermlineRx.git
cd GermlineRx/germline_webapp/frontend
npm install
npm run dev
```

Open **http://localhost:5173**

The dev server proxies `/api/*` to `localhost:8000` if a local Python backend is running, but the app is fully functional without it — all API calls fall through to the live external APIs.

---

## Project Structure

```
germline_webapp/frontend/
├── src/
│   ├── App.tsx                        # Main app shell, disclaimer modal, demo cases
│   ├── components/
│   │   ├── input/ManualEntry.tsx      # Variant + condition input, gene autocomplete
│   │   └── results/ResultsPanel.tsx   # Three-tier results display
│   └── static-mode/
│       ├── staticEngine.ts            # Browser-only analysis engine (Tier 0/1/2)
│       ├── variantDrugKB.ts           # Curated FDA drug + surveillance knowledge base
│       ├── geneToEnsembl.ts           # Gene symbol → Ensembl ID mapping
│       └── staticPdfParser.ts         # Client-side PDF genetic report parser
├── api/
│   ├── proxy.js                       # Vercel serverless CORS proxy (OpenFDA, CT.gov)
│   └── gnomad.js                      # Vercel serverless gnomAD GraphQL proxy
└── vercel.json
```

---

## External APIs Used

| API | Purpose | CORS |
|-----|---------|------|
| MyVariant.info | gnomAD AF + ClinVar variant ID in one call | Open (direct) |
| NCBI E-utilities (ClinVar) | Pathogenicity classification | Open (direct) |
| OpenFDA | FDA drug label search | Via `/api/proxy` |
| ClinicalTrials.gov v2 | Recruiting trial search | Via `/api/proxy` |
| gnomAD GraphQL | Population AF fallback | Via `/api/gnomad` |

---

## License

MIT License. See [LICENSE](LICENSE) for details.

> **Disclaimer:** GermlineRx is for educational and research purposes only. It is not a substitute for advice from a qualified healthcare professional. Always consult a genetic counselor, physician, or specialist before making any medical decisions.
