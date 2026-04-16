"""
GermlineRx — Biomni Datalake Enrichment
Reads directly from the Biomni datalake instead of calling external APIs.
No API keys required for: OMIM, DisGeNET, GWAS, DDInter, BioGRID, Broad Hub, Orphanet (via kg.csv).

Datalake path is controlled by BIOMNI_DATA_PATH env var (default: looks in
standard Biomni install locations).
"""
from __future__ import annotations

import os
import glob
import pickle
import logging
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Locate datalake ──────────────────────────────────────────────────────────

def _find_datalake() -> str:
    """Find the Biomni datalake directory."""
    candidates = [
        os.environ.get("BIOMNI_DATA_PATH", ""),
        os.path.expanduser("~/Desktop/PROJECTS/Agentic Workflow/Biomni/data/biomni_data/data_lake"),
        os.path.expanduser("~/biomni_data/data_lake"),
        "./data/biomni_data/data_lake",
    ]
    for path in candidates:
        if path and os.path.isdir(path) and os.listdir(path):
            logger.info(f"Using Biomni datalake at: {path}")
            return path
    logger.warning("Biomni datalake not found — enrichment will be limited")
    return ""

DATALAKE = _find_datalake()


def _lake(filename: str) -> str:
    return os.path.join(DATALAKE, filename)


def _available(filename: str) -> bool:
    return bool(DATALAKE) and os.path.exists(_lake(filename))


# ─── Lazy loaders (cached in memory) ─────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_omim():
    if not _available("omim.parquet"):
        return None
    try:
        import pandas as pd
        df = pd.read_parquet(_lake("omim.parquet"))
        return df[df["Approved Gene Symbol"].notna()]
    except Exception as e:
        logger.warning(f"Failed to load OMIM: {e}")
        return None


@lru_cache(maxsize=1)
def _load_disgenet():
    if not _available("DisGeNET.parquet"):
        return None
    try:
        import pandas as pd
        return pd.read_parquet(_lake("DisGeNET.parquet"))
    except Exception as e:
        logger.warning(f"Failed to load DisGeNET: {e}")
        return None


@lru_cache(maxsize=1)
def _load_gwas():
    if not _available("gwas_catalog.pkl"):
        return None
    try:
        with open(_lake("gwas_catalog.pkl"), "rb") as f:
            return pickle.load(f)
    except Exception as e:
        logger.warning(f"Failed to load GWAS catalog: {e}")
        return None


@lru_cache(maxsize=1)
def _load_broad_hub():
    if not _available("broad_repurposing_hub_phase_moa_target_info.parquet"):
        return None
    try:
        import pandas as pd
        return pd.read_parquet(_lake("broad_repurposing_hub_phase_moa_target_info.parquet"))
    except Exception as e:
        logger.warning(f"Failed to load Broad Hub: {e}")
        return None


@lru_cache(maxsize=1)
def _load_ddinter():
    """Load and concatenate all DDInter CSV files."""
    if not DATALAKE:
        return None
    try:
        import pandas as pd
        files = glob.glob(os.path.join(DATALAKE, "ddinter_*.csv"))
        if not files:
            return None
        dfs = [pd.read_csv(f) for f in files]
        df = pd.concat(dfs, ignore_index=True)
        df["drug_a_key"] = df["Drug_A"].str.lower().str.strip()
        df["drug_b_key"] = df["Drug_B"].str.lower().str.strip()
        return df
    except Exception as e:
        logger.warning(f"Failed to load DDInter: {e}")
        return None


@lru_cache(maxsize=1)
def _load_kg():
    """Load the precision medicine knowledge graph (kg.csv)."""
    if not _available("kg.csv"):
        return None
    try:
        import pandas as pd
        return pd.read_csv(_lake("kg.csv"), low_memory=False)
    except Exception as e:
        logger.warning(f"Failed to load knowledge graph: {e}")
        return None


@lru_cache(maxsize=1)
def _load_biogrid():
    """Load BioGRID PPI files + gene_info for Ensembl→symbol mapping."""
    ppi_files = [
        "affinity_capture-ms.parquet",
        "two-hybrid.parquet",
        "proximity_label-ms.parquet",
    ]
    available = [f for f in ppi_files if _available(f)]
    if not available or not _available("gene_info.parquet"):
        return None, None
    try:
        import pandas as pd

        gene_info = pd.read_parquet(_lake("gene_info.parquet"))
        ensembl_to_symbol = (
            gene_info[gene_info["gene_name"].notna()]
            .drop_duplicates("gene_id")
            .set_index("gene_id")["gene_name"]
            .to_dict()
        )

        dfs = [pd.read_parquet(_lake(f)) for f in available]
        ppi = pd.concat(dfs, ignore_index=True)
        return ppi, ensembl_to_symbol
    except Exception as e:
        logger.warning(f"Failed to load BioGRID: {e}")
        return None, None


# ─── Public enrichment functions ─────────────────────────────────────────────

def get_omim_info(gene: str) -> dict:
    """Return OMIM MIM number and phenotypes for a gene."""
    df = _load_omim()
    if df is None:
        return {}
    rows = df[df["Approved Gene Symbol"].str.upper() == gene.upper()]
    if rows.empty:
        return {}
    row = rows.iloc[0]
    phenotypes_raw = row.get("Phenotypes")
    phenotypes = []
    if phenotypes_raw and str(phenotypes_raw) != "nan":
        # Each phenotype is semicolon-separated
        for ph in str(phenotypes_raw).split(";"):
            ph = ph.strip()
            if ph:
                phenotypes.append(ph)
    return {
        "mim_number": str(int(row["MIM Number"])) if row.get("MIM Number") else None,
        "gene_name": row.get("Gene Name"),
        "phenotypes": phenotypes[:5],
    }


def get_disgenet_diseases(gene: str) -> list[str]:
    """Return diseases associated with a gene from DisGeNET."""
    df = _load_disgenet()
    if df is None:
        return []
    gene_upper = gene.upper()
    matches = []
    for _, row in df.iterrows():
        genes_str = str(row.get("Genes", ""))
        if gene_upper in genes_str:
            matches.append(str(row["Disorder"]))
        if len(matches) >= 8:
            break
    return matches


def get_gwas_associations(gene: str) -> list[dict]:
    """Return top GWAS trait associations for a gene."""
    df = _load_gwas()
    if df is None:
        return []
    mask = df["MAPPED_GENE"].fillna("").str.contains(gene, case=False, na=False)
    hits = df[mask].copy()
    if hits.empty:
        return []
    hits = hits.sort_values("PVALUE_MLOG", ascending=False).drop_duplicates("DISEASE/TRAIT")
    results = []
    for _, row in hits.head(5).iterrows():
        results.append({
            "trait": str(row.get("DISEASE/TRAIT", "")),
            "p_value": str(row.get("P-VALUE", "")),
            "pubmed_id": str(int(row["PUBMEDID"])) if row.get("PUBMEDID") else None,
        })
    return results


def get_broad_hub_drugs(gene: str) -> list[dict]:
    """Return drug repurposing candidates targeting a gene from Broad Hub."""
    df = _load_broad_hub()
    if df is None:
        return []
    # target column is pipe-delimited gene symbols
    mask = df["target"].fillna("").str.contains(
        r"(?:^|\|)" + gene.upper() + r"(?:\||$)", regex=True, na=False
    )
    hits = df[mask]
    if hits.empty:
        return []
    results = []
    for _, row in hits.head(8).iterrows():
        results.append({
            "drug_name": str(row.get("pert_iname", "")),
            "clinical_phase": str(row.get("clinical_phase", "")),
            "moa": str(row.get("moa", "")),
            "disease_area": str(row.get("disease_area", "")),
            "indication": str(row.get("indication", "")),
        })
    return results


def get_ddi_flags(drug_names: list[str]) -> list[dict]:
    """Check for major/moderate drug-drug interactions among given drugs."""
    df = _load_ddinter()
    if df is None or not drug_names:
        return []

    drug_keys = [d.lower().strip() for d in drug_names]
    flags = []
    seen = set()

    for i, drug_a in enumerate(drug_keys):
        for drug_b in drug_keys[i + 1:]:
            mask = (
                ((df["drug_a_key"] == drug_a) & (df["drug_b_key"] == drug_b)) |
                ((df["drug_a_key"] == drug_b) & (df["drug_b_key"] == drug_a))
            )
            hits = df[mask]
            for _, row in hits.iterrows():
                level = str(row.get("Level", ""))
                if level.lower() in ("major", "moderate"):
                    key = tuple(sorted([drug_a, drug_b]))
                    if key not in seen:
                        seen.add(key)
                        flags.append({
                            "drug_a": str(row.get("Drug_A", drug_a)),
                            "drug_b": str(row.get("Drug_B", drug_b)),
                            "level": level,
                        })
    return flags


def get_ppi_partners(gene: str, top_n: int = 10) -> list[str]:
    """Return top protein interaction partners for a gene from BioGRID."""
    ppi, ensembl_to_symbol = _load_biogrid()
    if ppi is None:
        return []

    # Find Ensembl ID for the gene
    gene_upper = gene.upper()
    gene_ensembl = {v: k for k, v in ensembl_to_symbol.items() if v and v.upper() == gene_upper}
    if not gene_ensembl:
        return []

    gene_ids = list(gene_ensembl.values())
    mask = ppi["gene_a_id"].isin(gene_ids) | ppi["gene_b_id"].isin(gene_ids)
    hits = ppi[mask]

    partners = set()
    for _, row in hits.iterrows():
        a = ensembl_to_symbol.get(row["gene_a_id"], "")
        b = ensembl_to_symbol.get(row["gene_b_id"], "")
        if a and a.upper() != gene_upper:
            partners.add(a)
        if b and b.upper() != gene_upper:
            partners.add(b)

    return sorted(partners)[:top_n]


def get_orphan_info(gene: str) -> dict:
    """
    Return orphan disease and drug info for a gene using the knowledge graph.
    Replaces Orphanet API — no registration required.

    Returns:
    - rare_diseases: list of disease names associated with this gene
    - orphan_drugs: list of drugs with an indication for those diseases AND targeting this gene
    """
    kg = _load_kg()
    if kg is None:
        return {"rare_diseases": [], "orphan_drugs": []}

    # Step 1: find diseases associated with this gene (disease_protein relation)
    gene_disease = kg[
        (kg["relation"] == "disease_protein") &
        (kg["x_name"].str.upper() == gene.upper())
    ]
    disease_names = gene_disease["y_name"].dropna().unique().tolist()

    # Step 2: find drugs that target this gene (drug_protein relation)
    gene_drugs = kg[
        (kg["relation"] == "drug_protein") &
        (kg["y_name"].str.upper() == gene.upper())
    ]
    targeting_drug_ids = set(gene_drugs["x_id"].dropna().unique())

    # Step 3: find drugs with indication for those diseases
    if disease_names and targeting_drug_ids:
        disease_set = set(d.lower() for d in disease_names)
        indications = kg[
            (kg["relation"] == "indication") &
            (kg["x_id"].isin(targeting_drug_ids)) &
            (kg["y_name"].str.lower().isin(disease_set))
        ]
        orphan_drugs = []
        seen = set()
        for _, row in indications.iterrows():
            drug = str(row["x_name"])
            disease = str(row["y_name"])
            if drug not in seen:
                seen.add(drug)
                orphan_drugs.append({"drug": drug, "indication": disease})
    else:
        orphan_drugs = []

    return {
        "rare_diseases": disease_names[:10],
        "orphan_drugs": orphan_drugs[:8],
    }


def enrich_gene(gene: str, tier1_drug_names: list[str]) -> dict:
    """
    Run all enrichment for a gene. Returns a dict with:
    - omim: MIM number + phenotypes
    - disgenet_diseases: associated disorders
    - gwas_associations: GWAS trait hits
    - broad_hub_drugs: repurposing candidates
    - ddi_flags: drug-drug interaction warnings
    - ppi_partners: top interacting proteins
    """
    return {
        "omim": get_omim_info(gene),
        "disgenet_diseases": get_disgenet_diseases(gene),
        "gwas_associations": get_gwas_associations(gene),
        "broad_hub_drugs": get_broad_hub_drugs(gene),
        "ddi_flags": get_ddi_flags(tier1_drug_names),
        "ppi_partners": get_ppi_partners(gene),
        "orphan": get_orphan_info(gene),
    }
