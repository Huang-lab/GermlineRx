
```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                              G E R M L I N E R x                               ║
║                     Genetic Variant → Treatment Matcher                        ║
╚══════════════════════════════════════════════════════════════════════════════════╝

  YOU (Browser)
  ┌─────────────────────────────────┐
  │  Type: "CFTR F508del, age 24"   │
  │  or upload a PDF / VCF report   │
  └────────────────┬────────────────┘
                   │ POST /api/analyze
                   ▼
╔══════════════════════════════════════════════════════════════════════════════════╗
║  BACKEND  (Python / FastAPI — localhost:8000)                                  ║
║                                                                                 ║
║  ┌─────────────────────────────────────────────────────────────────────────┐   ║
║  │ STEP 1 — NORMALIZER                                                     │   ║
║  │  "F508del"  ──►  gene: CFTR  │  HGVS: c.1521_1523del  │  fc: f508del   │   ║
║  │  80+ aliases + HGVS regex + disease-name lookup                         │   ║
║  └─────────────────────────────────────────────────────────────────────────┘   ║
║                   │                                                             ║
║       ┌───────────┴──────────────────────────────────────┐                     ║
║       │ run in parallel                                   │                     ║
║       ▼                                                   ▼                     ║
║  ┌─────────────────────┐    ┌──────────────────────────────────────────────┐   ║
║  │ TIER 0              │    │ ENRICHMENT (Biomni Datalake — local files)   │   ║
║  │ Variant Science     │    │                                              │   ║
║  │                     │    │  omim.parquet      → MIM number + phenotypes │   ║
║  │ ClinVar API  ──────►│    │  DisGeNET.parquet  → disease associations    │   ║
║  │  pathogenicity      │    │  gwas_catalog.pkl  → GWAS trait hits         │   ║
║  │  review stars       │    │  broad_hub.parquet → drug repurposing        │   ║
║  │                     │    │  ddinter_*.csv     → DDI safety flags        │   ║
║  │ gnomAD API   ──────►│    │  biogrid files     → protein partners        │   ║
║  │  allele freq        │    │  kg.csv            → orphan diseases + drugs │   ║
║  └─────────────────────┘    └──────────────────────────────────────────────┘   ║
║       │                                                                         ║
║       ▼                                                                         ║
║  ┌─────────────────────┐    ┌─────────────────────┐    ┌────────────────────┐  ║
║  │ TIER 1              │    │ TIER 2              │    │ TIER 3             │  ║
║  │ FDA Therapies       │    │ Clinical Trials     │    │ Emerging Pipeline  │  ║
║  │                     │    │                     │    │                    │  ║
║  │ Curated KB          │    │ ClinicalTrials.gov  │    │ Curated KB         │  ║
║  │ 28 genes            │    │ API → score →       │    │ CRISPR, ASO,       │  ║
║  │ 40+ drug entries    │    │ eligibility NLP     │    │ gene therapy,      │  ║
║  │                     │    │ age filter          │    │ base editing       │  ║
║  │ e.g. Trikafta       │    │ e.g. NCT04058054    │    │ e.g. NTLA-2001     │  ║
║  └─────────────────────┘    └─────────────────────┘    └────────────────────┘  ║
║       │                            │                           │                ║
║       └────────────────────────────┴───────────────────────────┘                ║
║                                    │                                            ║
║                                    ▼                                            ║
║  ┌─────────────────────────────────────────────────────────────────────────┐   ║
║  │ PLAIN LANGUAGE GENERATOR                                                │   ║
║  │  → patient summary  │  next steps  │  clinician notes  │  overall status│   ║
║  └─────────────────────────────────────────────────────────────────────────┘   ║
╚══════════════════════════════════════════════════════════════════════════════════╝
                   │ JSON response
                   ▼
  ┌─────────────────────────────────┐
  │  FRONTEND  (React — :5173)      │
  │                                 │
  │  Tier 0  Variant Science        │
  │  Tier 1  FDA Drugs        💊    │
  │  Tier 2  Clinical Trials  🏥    │
  │  Tier 3  Pipeline         🧬    │
  │  Enrichment (Biomni)      🗄️    │
  └─────────────────────────────────┘


KEY DESIGN DECISIONS
────────────────────
  ✓  Browser never calls external APIs directly — all logic stays on server
  ✓  Enrichment reads LOCAL files — no OMIM/DisGeNET/BioGRID API keys needed
  ✓  Biomni datalake (~11GB) shared with Biomni agent — download once, use everywhere
  ✓  Curated KBs (Tier 1, Tier 3) for speed + reliability — no LLM hallucination
  ✓  Tier 2 uses live ClinicalTrials.gov — always current recruiting trials
  ✓  Graceful degradation — each layer returns empty/null if data unavailable
```
