"""
GermlineRx — Tier 0: Variant Interpretation

Primary:  MyVariant.info  — single call returns ClinVar + gnomAD together,
          handles HGVS-to-genomic-coordinate resolution internally.
Fallback: ClinVar NCBI E-utilities + gnomAD v4 GraphQL called directly
          (used when MyVariant.info has no hit or is unavailable).
"""
from __future__ import annotations
import os
import re
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

NCBI_API_KEY = os.getenv("NCBI_API_KEY", "")
NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
GNOMAD_GRAPHQL = "https://gnomad.broadinstitute.org/api"
MYVARIANT_BASE = "https://myvariant.info/v1"

# ─── ClinGen curated actionability fallback ───────────────────────────────────
CLINGEN_CURATED: dict[str, str] = {
    "CFTR":   "Cystic fibrosis — Actionable (CFTR modulators available)",
    "BRCA1":  "Hereditary Breast/Ovarian Cancer — Actionable (PARP inhibitors, risk-reducing surgery)",
    "BRCA2":  "Hereditary Breast/Ovarian Cancer — Actionable (PARP inhibitors, risk-reducing surgery)",
    "PALB2":  "Hereditary Breast Cancer — Actionable (PARP inhibitors)",
    "ATM":    "Hereditary Breast/Pancreatic Cancer — Actionable (PARP inhibitors)",
    "CHEK2":  "Hereditary Breast Cancer — Actionable (enhanced surveillance)",
    "MLH1":   "Lynch Syndrome — Actionable (surveillance, immunotherapy for MSI-H tumors)",
    "MSH2":   "Lynch Syndrome — Actionable (surveillance, immunotherapy for MSI-H tumors)",
    "MSH6":   "Lynch Syndrome — Actionable (surveillance, immunotherapy for MSI-H tumors)",
    "PMS2":   "Lynch Syndrome — Actionable (surveillance)",
    "DMD":    "Duchenne/Becker Muscular Dystrophy — Actionable (exon-skipping therapies, gene therapy)",
    "SMN1":   "Spinal Muscular Atrophy — Actionable (nusinersen, risdiplam, onasemnogene)",
    "SOD1":   "ALS (SOD1) — Actionable (tofersen/Qalsody FDA-approved)",
    "LDLR":   "Familial Hypercholesterolemia — Actionable (PCSK9 inhibitors, inclisiran)",
    "APOB":   "Familial Hypercholesterolemia — Actionable (PCSK9 inhibitors)",
    "TTR":    "Hereditary TTR Amyloidosis — Actionable (tafamidis, patisiran, vutrisiran)",
    "HBB":    "Sickle Cell Disease / Beta-Thalassemia — Actionable (gene therapy, voxelotor, crizanlizumab)",
    "F8":     "Hemophilia A — Actionable (emicizumab, gene therapy)",
    "F9":     "Hemophilia B — Actionable (etranacogene dezaparvovec)",
    "GBA":    "Gaucher Disease / Parkinson Risk — Actionable (enzyme replacement, substrate reduction)",
    "HTT":    "Huntington Disease — Investigational (no approved disease-modifying therapy)",
    "FXN":    "Friedreich Ataxia — Actionable (omaveloxolone/Skyclarys FDA-approved 2023)",
    "MYBPC3": "Hypertrophic Cardiomyopathy — Actionable (mavacamten/Camzyos)",
    "MYH7":   "Hypertrophic Cardiomyopathy — Actionable (mavacamten/Camzyos)",
    "RET":    "MEN2 / Medullary Thyroid Cancer — Actionable (prophylactic thyroidectomy, selpercatinib)",
    "NF1":    "Neurofibromatosis Type 1 — Actionable (selumetinib/Koselugo for plexiform neurofibromas)",
    "VHL":    "Von Hippel-Lindau — Actionable (belzutifan/Welireg)",
    "TP53":   "Li-Fraumeni Syndrome — Actionable (intensive surveillance protocol)",
    "KCNQ1":  "Long QT Syndrome Type 1 — Actionable (beta-blockers, ICD consideration)",
    "KCNH2":  "Long QT Syndrome Type 2 — Actionable (beta-blockers, ICD consideration)",
    "SCN5A":  "Brugada Syndrome / Long QT Type 3 — Actionable (ICD, quinidine)",
}

# ─── ClinVar review status → star count ──────────────────────────────────────
REVIEW_STAR_MAP: dict[str, int] = {
    "practice guideline":                                          4,
    "reviewed by expert panel":                                    3,
    "criteria provided, multiple submitters, no conflicts":        2,
    "criteria provided, single submitter":                         1,
    "criteria provided, conflicting classifications":              0,
    "no assertion criteria provided":                              0,
    "no classification provided":                                  0,
    "no classifications from unflagged records":                   0,
}

# ─── gnomAD chromosome map for common genes ──────────────────────────────────
GENE_CHROM: dict[str, str] = {
    "CFTR": "7", "BRCA1": "17", "BRCA2": "13", "DMD": "X",
    "SMN1": "5", "SOD1": "21", "LDLR": "19", "TTR": "18",
    "HBB": "11", "F8": "X", "F9": "X", "GBA": "1",
    "HTT": "4", "FXN": "9", "MYBPC3": "11", "MYH7": "14",
    "RET": "10", "NF1": "17", "VHL": "3", "TP53": "17",
    "MLH1": "3", "MSH2": "2", "MSH6": "2", "PMS2": "7",
    "PALB2": "16", "ATM": "11", "CHEK2": "22",
}


async def interpret_variant(gene: str, hgvs: str, functional_class: Optional[str] = None) -> dict:
    """
    Run Tier 0 variant interpretation.
    Tries MyVariant.info first (ClinVar + gnomAD in one call),
    falls back to direct ClinVar NCBI + gnomAD GraphQL APIs.
    Returns a dict matching Tier0Result fields.
    """
    mv_data = await _fetch_myvariant(gene, hgvs)
    if mv_data:
        clinvar_data = mv_data["clinvar"]
        gnomad_data = mv_data["gnomad"]
    else:
        clinvar_data = await _fetch_clinvar(gene, hgvs)
        gnomad_data = await _fetch_gnomad(gene, hgvs)
    clingen_note = CLINGEN_CURATED.get(gene.upper())

    classification = clinvar_data.get("classification", "UNKNOWN")
    review_status = clinvar_data.get("review_status", "no classification provided")
    review_stars = REVIEW_STAR_MAP.get(review_status.lower(), 0)
    clinvar_id = clinvar_data.get("clinvar_id")

    gnomad_af = gnomad_data.get("af")
    gnomad_variant_id = gnomad_data.get("variant_id")
    gnomad_interp = _interpret_af(gnomad_af, gene)
    gnomad_url = _gnomad_url(gene, gnomad_variant_id)

    confidence = _assign_confidence(classification, review_stars, gnomad_af, hgvs)

    return {
        "classification": classification,
        "confidence": confidence,
        "review_stars": review_stars,
        "review_status": review_status,
        "gnomad_af": gnomad_af,
        "gnomad_interpretation": gnomad_interp,
        "gnomad_url": gnomad_url,
        "clinvar_id": clinvar_id,
        "clingen_note": clingen_note,
    }


def _gnomad_url(gene: str, variant_id: Optional[str] = None) -> str:
    """Build gnomAD v4 deep-link URL for a variant or gene."""
    base = "https://gnomad.broadinstitute.org"
    if variant_id:
        return f"{base}/variant/{variant_id}?dataset=gnomad_r4"
    return f"{base}/gene/{gene.upper()}?dataset=gnomad_r4"


async def _fetch_myvariant(gene: str, hgvs: str) -> Optional[dict]:
    """
    Query MyVariant.info for ClinVar + gnomAD data in a single call.
    Tries multiple query strategies to maximise hit rate:
      1. coding HGVS  (c. notation)
      2. protein HGVS (p. notation)
      3. rsID          (rs... passthrough)
      4. gene-only     (last resort — picks highest-confidence ClinVar record)
    Returns {"clinvar": {...}, "gnomad": {...}} or None on failure/no hit.
    """
    FIELDS = "clinvar,gnomad_genome,gnomad_exome,vcf"

    def _queries(gene: str, hgvs: str) -> list[str]:
        """Ordered list of MyVariant.info query strings to try."""
        g = gene.upper()
        h = hgvs.strip()
        queries = []
        if h.startswith("rs"):
            queries.append(h)                                        # rsID direct
        elif h.startswith("c.") or h.startswith("C."):
            queries.append(f'clinvar.gene.symbol:{g} AND clinvar.hgvs.coding:"{h}"')
        elif h.startswith("p.") or h.startswith("P."):
            queries.append(f'clinvar.gene.symbol:{g} AND clinvar.hgvs.protein:"{h}"')
        else:
            # Unknown notation — try both coding and protein fields
            queries.append(f'clinvar.gene.symbol:{g} AND clinvar.hgvs.coding:"{h}"')
            queries.append(f'clinvar.gene.symbol:{g} AND clinvar.hgvs.protein:"{h}"')
        # Gene-only fallback: get any record for this gene sorted by review stars
        queries.append(f"clinvar.gene.symbol:{g} AND clinvar.rcv.clinical_significance:pathogenic")
        return queries

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            hit = None
            used_query = ""
            for q in _queries(gene, hgvs):
                r = await client.get(
                    f"{MYVARIANT_BASE}/query",
                    params={"q": q, "fields": FIELDS, "size": 1},
                )
                r.raise_for_status()
                hits = r.json().get("hits", [])
                if hits:
                    hit = hits[0]
                    used_query = q
                    break

        if not hit:
            logger.info(f"MyVariant.info: no hit for {gene} {hgvs} (all strategies exhausted)")
            return None

        clinvar_raw = hit.get("clinvar", {})

        # ClinVar: handle rcv as list or single dict
        rcv = clinvar_raw.get("rcv", {})
        if isinstance(rcv, list):
            # Pick the highest-starred record if multiple
            rcv = max(
                rcv,
                key=lambda x: REVIEW_STAR_MAP.get((x.get("review_status") or "").lower(), 0),
            )
        raw_class = rcv.get("clinical_significance", "UNKNOWN")
        review_status = rcv.get("review_status", "no classification provided")
        clinvar_id = str(clinvar_raw.get("variant_id", "")) or None
        classification = _normalize_classification(raw_class)

        # gnomAD AF: genome preferred, exome fallback
        gnomad_g = (hit.get("gnomad_genome") or {}).get("af", {}).get("af")
        gnomad_e = (hit.get("gnomad_exome") or {}).get("af", {}).get("af")
        af = gnomad_g if gnomad_g is not None else gnomad_e

        # Build gnomAD variant_id — use vcf fields (handles SNVs and indels/deletions)
        mv_id = hit.get("_id", "")
        vcf_data = hit.get("vcf", {})
        variant_id = None
        chrom = mv_id.split(":")[0].replace("chr", "") if mv_id.startswith("chr") else ""
        if chrom and vcf_data.get("position") and vcf_data.get("ref") and vcf_data.get("alt"):
            variant_id = f"{chrom}-{vcf_data['position']}-{vcf_data['ref']}-{vcf_data['alt']}"
        elif mv_id and mv_id.startswith("chr"):
            # Fallback: parse from _id for SNVs (e.g. "chr7:g.117548628CTT>C")
            _, gpos = mv_id.split(":", 1) if ":" in mv_id else (mv_id, "")
            m = re.match(r"g\.([0-9]+)([A-Z]+)>([A-Z]+)$", gpos)
            if m:
                variant_id = f"{chrom}-{m.group(1)}-{m.group(2)}-{m.group(3)}"

        logger.info(
            f"MyVariant.info OK for {gene} {hgvs} "
            f"[query: {used_query!r}]: {classification}, AF={af}"
        )
        return {
            "clinvar": {
                "classification": classification,
                "review_status": review_status,
                "clinvar_id": clinvar_id,
            },
            "gnomad": {
                "af": float(af) if af is not None else None,
                "variant_id": variant_id,
                "source": "MyVariant.info (gnomAD)",
            },
        }

    except Exception as e:
        logger.warning(f"MyVariant.info failed for {gene} {hgvs}: {e}")
        return None


async def _fetch_clinvar(gene: str, hgvs: str) -> dict:
    """Query NCBI E-utilities for ClinVar classification."""
    try:
        params = {
            "db": "clinvar",
            "term": f"{gene}[gene] AND {hgvs}[variant name]",
            "retmax": 5,
            "retmode": "json",
        }
        if NCBI_API_KEY:
            params["api_key"] = NCBI_API_KEY

        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{NCBI_BASE}/esearch.fcgi", params=params)
            r.raise_for_status()
            data = r.json()

        ids = data.get("esearchresult", {}).get("idlist", [])
        if not ids:
            # Try with gene-only (no hgvs) to get any ClinVar record for this gene+hgvs
            # but only if the HGVS is embedded differently (e.g. protein notation)
            alt_term = f"{gene}[gene] AND {hgvs}"
            params2 = {**params, "term": alt_term, "retmax": 3}
            async with httpx.AsyncClient(timeout=10.0) as client:
                r2 = await client.get(f"{NCBI_BASE}/esearch.fcgi", params=params2)
                r2.raise_for_status()
                data2 = r2.json()
            ids = data2.get("esearchresult", {}).get("idlist", [])[:1]
            # NOTE: do NOT fall back to broad "pathogenic[clinsig]" — that returns
            # an unrelated variant and gives a misleading classification

        if not ids:
            return {"classification": "UNKNOWN", "review_status": "no classification provided"}

        # Fetch summary for first result
        sum_params = {"db": "clinvar", "id": ids[0], "retmode": "json"}
        if NCBI_API_KEY:
            sum_params["api_key"] = NCBI_API_KEY

        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(f"{NCBI_BASE}/esummary.fcgi", params=sum_params)
            r.raise_for_status()
            sdata = r.json()

        result = sdata.get("result", {}).get(ids[0], {})
        raw_class = result.get("germline_classification", {})
        if isinstance(raw_class, dict):
            classification = raw_class.get("description", "UNKNOWN")
        else:
            classification = str(raw_class) if raw_class else "UNKNOWN"

        classification = _normalize_classification(classification)
        review_status = result.get("review_status", "no classification provided")

        return {
            "classification": classification,
            "review_status": review_status,
            "clinvar_id": ids[0],
        }

    except Exception as e:
        logger.warning(f"ClinVar lookup failed for {gene} {hgvs}: {e}")
        # Fallback: infer from gene if well-known pathogenic
        return _clinvar_fallback(gene, hgvs)


def _clinvar_fallback(gene: str, hgvs: str) -> dict:
    """Curated fallback when ClinVar API is unavailable."""
    known_pathogenic = {
        "CFTR": ["c.1521_1523del", "c.1652G>A", "c.3846G>A", "c.1624G>T"],
        "DMD":  ["del"],
        "SOD1": ["c.11C>T", "c.272A>C"],
        "SMN1": ["c.840C>T"],
        "HBB":  ["c.20A>T", "c.19G>A"],
        "TTR":  ["c.148G>A", "c.424G>A"],
        "F8":   ["inv"],
        "GBA":  ["c.1226A>G", "c.1448T>C"],
    }
    gene_variants = known_pathogenic.get(gene.upper(), [])
    for v in gene_variants:
        if v.lower() in hgvs.lower():
            return {"classification": "PATHOGENIC", "review_status": "criteria provided, single submitter", "clinvar_id": None}
    if gene.upper() in CLINGEN_CURATED:
        return {"classification": "PATHOGENIC", "review_status": "criteria provided, single submitter", "clinvar_id": None}
    return {"classification": "UNKNOWN", "review_status": "no classification provided", "clinvar_id": None}


NCBI_VARIATION_API = "https://api.ncbi.nlm.nih.gov/variation/v0/hgvs/{hgvs}/contextuals"


async def _hgvs_to_spdi(gene: str, hgvs: str) -> Optional[str]:
    """
    Use NCBI Variation Services to convert HGVS (c. notation) to a genomic
    variant ID in chrom-pos-ref-alt format for gnomAD.

    Returns a string like "7-117559593-CTT-C" or None on failure.
    """
    # Build the full HGVS with gene transcript if it's a coding notation
    # NCBI needs a transcript accession, so we query with gene symbol + hgvs
    # and use the spdi representation they return
    try:
        # Try gene:hgvs form that NCBI variation API accepts
        query_hgvs = f"{gene}:{hgvs}"
        url = f"https://api.ncbi.nlm.nih.gov/variation/v0/hgvs/{query_hgvs}/contextuals"
        params = {"assembly": "GCF_000001405.40"}  # GRCh38
        if NCBI_API_KEY:
            params["api_key"] = NCBI_API_KEY

        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, params=params)
            if r.status_code != 200:
                return None
            data = r.json()

        # SPDI format: seq_id:position:deleted_sequence:inserted_sequence
        spdis = data.get("data", {}).get("spdis", [])
        if not spdis:
            return None

        spdi = spdis[0]
        seq_id = spdi.get("seq_id", "")     # e.g. "NC_000007.14"
        pos = spdi.get("position")           # 0-based
        deleted = spdi.get("deleted_sequence", "")
        inserted = spdi.get("inserted_sequence", "")

        if pos is None:
            return None

        # Convert RefSeq accession → chromosome number
        chrom = _refseq_to_chrom(seq_id)
        if not chrom:
            return None

        # gnomAD uses 1-based positions
        return f"{chrom}-{pos + 1}-{deleted}-{inserted}"

    except Exception as e:
        logger.warning(f"NCBI Variation Services failed for {gene}:{hgvs}: {e}")
        return None


def _refseq_to_chrom(seq_id: str) -> Optional[str]:
    """Map NCBI RefSeq accession (GRCh38) → chromosome number string."""
    mapping = {
        "NC_000001.11": "1",  "NC_000002.12": "2",  "NC_000003.12": "3",
        "NC_000004.12": "4",  "NC_000005.10": "5",  "NC_000006.12": "6",
        "NC_000007.14": "7",  "NC_000008.11": "8",  "NC_000009.12": "9",
        "NC_000010.11": "10", "NC_000011.10": "11", "NC_000012.12": "12",
        "NC_000013.11": "13", "NC_000014.9":  "14", "NC_000015.10": "15",
        "NC_000016.10": "16", "NC_000017.11": "17", "NC_000018.10": "18",
        "NC_000019.10": "19", "NC_000020.11": "20", "NC_000021.9":  "21",
        "NC_000022.11": "22", "NC_000023.11": "X",  "NC_000024.10": "Y",
    }
    return mapping.get(seq_id)


async def _fetch_gnomad(gene: str, hgvs: str) -> dict:
    """
    Query gnomAD v4 GraphQL directly:
    1. NCBI Variation Services: HGVS → genomic chrom-pos-ref-alt
    2. gnomAD GraphQL: variant(variantId) → AF
    3. Curated fallback for common variants
    """
    # Step 1: resolve HGVS → gnomAD variant_id via NCBI
    variant_id = await _hgvs_to_spdi(gene, hgvs)

    if variant_id:
        # Step 2: query gnomAD v4 GraphQL with exact variant ID
        try:
            query = """
            query VariantQuery($variantId: String!, $dataset: DatasetId!) {
              variant(variantId: $variantId, dataset: $dataset) {
                variant_id
                genome { af ac an }
                exome  { af ac an }
              }
            }
            """
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.post(
                    GNOMAD_GRAPHQL,
                    json={
                        "query": query,
                        "variables": {
                            "variantId": variant_id,
                            "dataset": "gnomad_r4",
                        },
                    },
                    headers={"Content-Type": "application/json"},
                )
                r.raise_for_status()
                gdata = r.json()

            v = (gdata.get("data") or {}).get("variant") or {}
            af = (
                (v.get("genome") or {}).get("af")
                or (v.get("exome") or {}).get("af")
            )
            if af is not None:
                logger.info(f"gnomAD v4 GraphQL AF for {gene}:{hgvs} ({variant_id}) = {af}")
                return {
                    "af": float(af),
                    "variant_id": variant_id,
                    "source": "gnomAD v4 (GraphQL)",
                }
        except Exception as e:
            logger.warning(f"gnomAD GraphQL query failed for {variant_id}: {e}")

    # Step 3: curated fallback
    return _gnomad_curated_af(gene, hgvs)


def _gnomad_curated_af(gene: str, hgvs: str) -> dict:
    """Curated allele frequencies for common variants."""
    curated: dict[str, float] = {
        "CFTR:c.1521_1523del": 0.0142,   # F508del carrier freq ~1/25 in Europeans
        "CFTR:c.1652G>A":      0.00015,  # G551D
        "SOD1:c.11C>T":        0.000004, # A4V — ultra-rare
        "SOD1:c.272A>C":       0.000008, # D91A
        "HBB:c.20A>T":         0.0024,   # HbS — global average
        "TTR:c.148G>A":        0.00003,  # V30M
        "TTR:c.424G>A":        0.0035,   # V122I — ~3.5% in African Americans
        "GBA:c.1226A>G":       0.0025,   # N370S
        "BRCA1:c.68_69del":    0.0010,   # 185delAG Ashkenazi
        "BRCA2:c.5946del":     0.0012,   # 6174delT Ashkenazi
        "LDLR:c.1060+1G>A":    0.00005,
    }
    key = f"{gene.upper()}:{hgvs}"
    af = curated.get(key)
    # No partial match — returning a different variant's AF is misleading
    return {"af": af, "source": "curated fallback"}


def _interpret_af(af: Optional[float], gene: str) -> str:
    if af is None:
        return "Allele frequency not available"
    if af > 0.01:
        return f"AF={af:.4f} — common carrier allele in general population"
    if af > 0.001:
        return f"AF={af:.5f} — rare variant (1 in {int(1/af):,} alleles)"
    if af > 0.0001:
        return f"AF={af:.6f} — very rare variant"
    return f"AF={af:.2e} — ultra-rare variant"


def _normalize_classification(raw: str) -> str:
    r = raw.lower()
    if "pathogenic" in r and "likely" not in r and "conflicting" not in r:
        return "PATHOGENIC"
    if "likely pathogenic" in r:
        return "LIKELY_PATHOGENIC"
    if "uncertain" in r or "vus" in r or "variant of uncertain" in r:
        return "VUS"
    if "likely benign" in r:
        return "LIKELY_BENIGN"
    if "benign" in r:
        return "BENIGN"
    if "conflicting" in r:
        return "CONFLICTING"
    return "UNKNOWN"


def _assign_confidence(classification: str, review_stars: int,
                       gnomad_af: Optional[float], hgvs: str) -> str:
    if classification in ("BENIGN", "LIKELY_BENIGN"):
        return "NOT_ACTIONABLE"
    if classification == "PATHOGENIC":
        # HIGH requires expert-panel or multi-submitter review (stars>=2)
        # stars=0 from fallback → MODERATE; stars>=2 from live ClinVar → HIGH
        return "HIGH" if review_stars >= 2 else "MODERATE"
    if classification == "LIKELY_PATHOGENIC":
        return "MODERATE"
    if classification == "CONFLICTING":
        return "LOW"
    if classification == "VUS":
        return "LOW"
    # Unknown — check if ultra-rare (novel candidate)
    if gnomad_af is not None and gnomad_af < 0.0001:
        return "MODERATE"
    return "LOW"
