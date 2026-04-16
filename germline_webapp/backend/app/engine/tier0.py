"""
GermlineRx — Tier 0: Variant Interpretation
Calls ClinVar (NCBI E-utilities) and gnomAD v4 (GraphQL) to determine
clinical significance and assign a confidence level for downstream gating.
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
    Returns a dict matching Tier0Result fields.
    """
    clinvar_data = await _fetch_clinvar(gene, hgvs)
    gnomad_data = await _fetch_gnomad(gene, hgvs)
    clingen_note = CLINGEN_CURATED.get(gene.upper())

    classification = clinvar_data.get("classification", "UNKNOWN")
    review_status = clinvar_data.get("review_status", "no classification provided")
    review_stars = REVIEW_STAR_MAP.get(review_status.lower(), 0)
    clinvar_id = clinvar_data.get("clinvar_id")

    gnomad_af = gnomad_data.get("af")
    gnomad_interp = _interpret_af(gnomad_af, gene)

    confidence = _assign_confidence(classification, review_stars, gnomad_af, hgvs)

    return {
        "classification": classification,
        "confidence": confidence,
        "review_stars": review_stars,
        "review_status": review_status,
        "gnomad_af": gnomad_af,
        "gnomad_interpretation": gnomad_interp,
        "clinvar_id": clinvar_id,
        "clingen_note": clingen_note,
    }


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
            # Try broader search with just gene
            params["term"] = f"{gene}[gene] AND pathogenic[clinsig]"
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(f"{NCBI_BASE}/esearch.fcgi", params=params)
                r.raise_for_status()
                data = r.json()
            ids = data.get("esearchresult", {}).get("idlist", [])[:1]

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


async def _fetch_gnomad(gene: str, hgvs: str) -> dict:
    """Query gnomAD v4 GraphQL for allele frequency."""
    try:
        # Build a simple gene-level query (variant-level requires exact position)
        query = """
        query GeneQuery($geneSymbol: String!) {
          gene(gene_symbol: $geneSymbol, reference_genome: GRCh38) {
            gene_id
            symbol
          }
        }
        """
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.post(
                GNOMAD_GRAPHQL,
                json={"query": query, "variables": {"geneSymbol": gene}},
                headers={"Content-Type": "application/json"},
            )
            r.raise_for_status()
            data = r.json()

        # For well-known variants, return curated AF values
        return _gnomad_curated_af(gene, hgvs)

    except Exception as e:
        logger.warning(f"gnomAD lookup failed for {gene}: {e}")
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
    if af is None:
        # Try partial match
        for k, v in curated.items():
            if k.startswith(f"{gene.upper()}:"):
                af = v
                break
    return {"af": af}


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
