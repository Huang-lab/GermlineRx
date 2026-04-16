"""
GermlineRx — PDF Parser
Extracts genetic variants from clinical genetic test report PDFs.
"""
from __future__ import annotations
import re
import io
import sys
import os
from typing import List

try:
    from pypdf import PdfReader
    PYPDF_AVAILABLE = True
except ImportError:
    PYPDF_AVAILABLE = False

# Import NCBI gene set from normalizer (covers ~20,000 genes)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
try:
    from engine.normalizer import _load_ncbi_genes, _FALLBACK_GENES
except Exception:
    _load_ncbi_genes = lambda: set()
    _FALLBACK_GENES: set = set()

_HGVS_C = re.compile(r"c\.([^\s,;|]{3,30})", re.I)
_HGVS_C_WITH_GENE = re.compile(r"([A-Z][A-Z0-9]{1,9})\s+c\.([^\s,;|]{3,30})", re.I)
_GENE_TOKEN = re.compile(r"\b([A-Z][A-Z0-9]{1,9})\b")
_CLASSIFICATION = re.compile(
    r"\b(Pathogenic|Likely\s+Pathogenic|Variant\s+of\s+Uncertain\s+Significance|"
    r"VUS|Likely\s+Benign|Benign)\b", re.I
)


def parse_pdf(file_bytes: bytes) -> dict:
    """Extract variants from a PDF genetic report."""
    warnings = []

    if not PYPDF_AVAILABLE:
        return {"file_type": "pdf", "variants_found": 0, "variants": [],
                "parse_warnings": ["pypdf not installed"]}

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as e:
        return {"file_type": "pdf", "variants_found": 0, "variants": [],
                "parse_warnings": [f"PDF read error: {e}"]}

    valid_genes = _load_ncbi_genes() or _FALLBACK_GENES
    variants = []
    seen = set()

    # Pass 1: HGVS c. notation with gene on same line
    for m in _HGVS_C_WITH_GENE.finditer(text):
        gene_candidate = m.group(1).upper()
        hgvs = f"c.{m.group(2)}"
        if gene_candidate not in valid_genes:
            continue
        key = f"{gene_candidate}:{hgvs}"
        if key in seen:
            continue
        seen.add(key)
        context = text[max(0, m.start()-200):m.end()+200]
        class_match = _CLASSIFICATION.search(context)
        classification = class_match.group(0) if class_match else None
        confidence = "HIGH" if classification and "pathogenic" in classification.lower() else "MEDIUM"
        variants.append({
            "gene": gene_candidate, "hgvs": hgvs, "confidence": confidence,
            "raw_text": m.group(0).strip(), "classification": classification,
        })

    # Pass 2: HGVS c. anywhere — find nearest gene in surrounding ±300 chars
    for m in _HGVS_C.finditer(text):
        hgvs = f"c.{m.group(1)}"
        context = text[max(0, m.start()-300):m.end()+300]
        gene_candidate = None
        for token in _GENE_TOKEN.findall(context):
            if token in valid_genes and len(token) >= 2:
                gene_candidate = token
                break
        if not gene_candidate:
            continue
        key = f"{gene_candidate}:{hgvs}"
        if key in seen:
            continue
        seen.add(key)
        class_match = _CLASSIFICATION.search(context)
        classification = class_match.group(0) if class_match else None
        confidence = "HIGH" if classification and "pathogenic" in classification.lower() else "MEDIUM"
        variants.append({
            "gene": gene_candidate, "hgvs": hgvs, "confidence": confidence,
            "raw_text": f"{gene_candidate} {hgvs}", "classification": classification,
        })

    if not variants:
        warnings.append("No HGVS variants detected in PDF. Try manual entry.")

    return {
        "file_type": "pdf",
        "variants_found": len(variants),
        "variants": variants,
        "parse_warnings": warnings,
    }
