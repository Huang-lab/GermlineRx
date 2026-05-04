# GermlineRx Vercel Agent Plan (Active)

## Product Behavior (Deployment Target)

A patient enters a genetic variant (for example, `BRCA2 c.5946del` or `CFTR F508del`).
The deployed app returns exactly three outputs:

1. Variant annotation:
- ClinVar classification
- gnomAD allele frequency
- Data path: MyVariant.info first, ClinVar/NCBI fallback

2. FDA-approved therapies:
- Matched to the entered gene/variant when possible
- Real FDA label-backed entries from OpenFDA API
- Curated variant-level FDA matches may be merged when OpenFDA is sparse

3. Clinical trials:
- Recruiting interventional studies from ClinicalTrials.gov v2 API
- Eligibility pre-screening (age/sex + criteria parsing)
- Top 10 ranked trials only

Out of scope for this Vercel target:
- Tier 3 emerging pipeline output
- Biomni enrichment modules

## Runtime Architecture

- Frontend: React + Vite on Vercel
- Serverless: `api/proxy.js` and `api/gnomad.js`
- Browser does not call disallowed upstreams directly; fallback through proxy allowlist

Required upstreams:
- `myvariant.info`
- `eutils.ncbi.nlm.nih.gov`
- `api.fda.gov`
- `clinicaltrials.gov`
- `gnomad.broadinstitute.org` (optional fallback)

## Implementation Checklist

1. Contract and UI
- Ensure `AnalyzeResponse` contains only tier0, tier1, tier2 for deployed flow
- Remove Tier 3 and enrichment messaging from active UI
- Keep medical disclaimer and clinician caveats

2. Tier 0
- Keep MyVariant-first variant lookup for AF and ClinVar variant id
- Keep NCBI ClinVar fallback for classification/review fields
- Return `classification`, `review_status`, `review_stars`, `gnomad_af`

3. Tier 1
- Query OpenFDA labels for gene/mutation indication text
- Normalize/merge duplicate drug names
- Keep only FDA-approved entries in patient-facing result set
- Merge curated variant-level FDA entries when OpenFDA has no direct hit

4. Tier 2
- Query ClinicalTrials.gov v2 with:
  - `overallStatus=RECRUITING`
  - `studyType=INTERVENTIONAL`
- Apply relevance scoring and eligibility pre-screening
- Return top 10 eligible trials and include totals

5. Verification
- Build succeeds: `npm run build`
- Smoke cases:
  - `CFTR c.1521_1523del`
  - `BRCA2 c.5946del`
  - `HBB c.20A>T`
- Confirm results show only:
  - Variant annotation
  - FDA-approved therapies
  - Recruiting top 10 trials

## Operational Notes

- Upstream API outages should not hard-fail the entire report; return partial results with caveats.
- Trial list cap is fixed at 10 for deterministic UX.
- Keep source labels explicit (`OpenFDA`, `ClinicalTrials.gov`, `ClinVar`, `gnomAD`).
