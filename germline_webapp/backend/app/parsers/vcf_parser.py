"""
GermlineRx — VCF Parser
Parses ClinVar-annotated VCF files (SnpEff/VEP format) for pathogenic germline variants.
"""
from __future__ import annotations
import re
import gzip
import io
from typing import List

_CLNSIG = re.compile(r"CLNSIG=([^;\s]+)")
_CLNDN = re.compile(r"CLNDN=([^;\s]+)")
_GENE_ANN = re.compile(r"(?:ANN|CSQ)=[^;]*\|([A-Z][A-Z0-9]{1,9})\|")
_HGVS_C_ANN = re.compile(r"c\.[^\|,\s]{3,30}")

PATHOGENIC_TERMS = {"pathogenic", "likely_pathogenic", "pathogenic/likely_pathogenic"}


def parse_vcf(file_bytes: bytes, filename: str = "") -> dict:
    """Parse a VCF or VCF.gz file and extract pathogenic germline variants."""
    warnings = []
    variants = []
    seen = set()

    try:
        if filename.endswith(".gz") or file_bytes[:2] == b"\x1f\x8b":
            text = gzip.decompress(file_bytes).decode("utf-8", errors="replace")
        else:
            text = file_bytes.decode("utf-8", errors="replace")
    except Exception as e:
        return {"file_type": "vcf", "variants_found": 0, "variants": [],
                "parse_warnings": [f"VCF decode error: {e}"]}

    for line in text.splitlines():
        if line.startswith("#"):
            continue

        parts = line.split("\t")
        if len(parts) < 8:
            continue

        chrom, pos, vid, ref, alt, qual, filt, info = parts[:8]
        info_str = info

        # Check ClinVar significance
        clnsig_match = _CLNSIG.search(info_str)
        if not clnsig_match:
            continue

        clnsig = clnsig_match.group(1).lower().replace(" ", "_")
        if not any(term in clnsig for term in PATHOGENIC_TERMS):
            continue

        # Extract gene from ANN/CSQ field
        gene_match = _GENE_ANN.search(info_str)
        gene = gene_match.group(1).upper() if gene_match else "UNKNOWN"

        # Extract HGVS c. notation
        hgvs_match = _HGVS_C_ANN.search(info_str)
        hgvs = hgvs_match.group(0) if hgvs_match else f"{chrom}:{pos}{ref}>{alt}"

        key = f"{gene}:{hgvs}"
        if key in seen:
            continue
        seen.add(key)

        # Disease name
        clndn_match = _CLNDN.search(info_str)
        disease = clndn_match.group(1).replace("_", " ") if clndn_match else ""

        confidence = "HIGH" if "pathogenic" in clnsig and "likely" not in clnsig else "MEDIUM"

        variants.append({
            "gene": gene,
            "hgvs": hgvs,
            "confidence": confidence,
            "raw_text": f"{chrom}:{pos} {ref}>{alt} ({clnsig})",
            "classification": clnsig_match.group(1),
        })

    if not variants:
        warnings.append("No pathogenic/likely pathogenic variants found in VCF. "
                        "Ensure VCF has ClinVar CLNSIG annotations.")

    return {
        "file_type": "vcf",
        "variants_found": len(variants),
        "variants": variants,
        "parse_warnings": warnings,
    }
