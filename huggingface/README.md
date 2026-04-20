---
title: GermlineRx
emoji: 🧬
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 8000
pinned: false
---

# GermlineRx Backend

FastAPI backend for GermlineRx — Genetic Variant → Treatment Matcher.

- **Tier 0** ClinVar + gnomAD variant interpretation
- **Tier 1** FDA-approved therapies (92 entries, 48 genes)
- **Tier 2** Live ClinicalTrials.gov recruiting trials
- **Tier 3** Emerging pipeline (CRISPR, ASO, gene therapy)
- **Enrichment** Biomni datalake (OMIM, DisGeNET, GWAS, DDI, BioGRID)

API docs available at `/docs`.
