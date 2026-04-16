"""
GermlineRx — FastAPI Routes
POST /api/normalize  — mutation text → canonical HGVS
POST /api/analyze    — full 4-tier pipeline
POST /api/upload     — PDF or VCF variant extraction
"""
from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File

from ..models.schemas import (
    NormalizeRequest, NormalizeResponse,
    AnalyzeRequest, AnalyzeResponse,
    EnrichmentResult, OmimInfo, GwasAssociation, BroadHubDrug, DdiFlag, OrphanInfo, OrphanDrug,
    UploadResponse,
)
from ..engine.normalizer import normalize_mutation
from ..engine.tier0 import interpret_variant
from ..engine.tier1 import match_tier1
from ..engine.tier2 import match_tier2
from ..engine.tier3 import match_tier3
from ..engine.plain_language import generate_patient_summary
from ..enrichment.datalake import enrich_gene
from ..parsers.pdf_parser import parse_pdf
from ..parsers.vcf_parser import parse_vcf

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


@router.post("/normalize", response_model=NormalizeResponse)
async def normalize(req: NormalizeRequest):
    """Normalize a plain-language mutation description to canonical gene + HGVS."""
    try:
        result = normalize_mutation(req.disease, req.mutation_text)
        return NormalizeResponse(**result)
    except Exception as e:
        logger.error(f"Normalize error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    """Run the full 4-tier GermlineRx analysis pipeline."""
    v = req.variant
    gene = v.gene.upper()
    hgvs = v.hgvs
    fc = v.functional_class
    age = v.age
    disease = v.disease

    try:
        # Tier 0 — variant interpretation
        tier0 = await interpret_variant(gene, hgvs, fc)

        # Gate on confidence
        if tier0["confidence"] == "NOT_ACTIONABLE":
            tier1 = {"drugs": [], "surveillance": []}
            tier2 = {"trials": [], "total_fetched": 0, "total_after_scoring": 0}
            tier3 = {"pipeline": []}
        else:
            # Tier 1 — approved therapies
            tier1 = match_tier1(gene, hgvs, fc)

            # Tier 2 — clinical trials (async)
            tier2 = await match_tier2(gene, hgvs, fc, disease, age)

            # Tier 3 — emerging pipeline
            tier3 = match_tier3(gene)

        # Enrichment — Biomni datalake (no API keys needed)
        tier1_drug_names = [d["drug_name"] for d in tier1.get("drugs", [])]
        raw_enrichment = enrich_gene(gene, tier1_drug_names)
        raw_orphan = raw_enrichment["orphan"]
        enrichment = EnrichmentResult(
            omim=OmimInfo(**raw_enrichment["omim"]) if raw_enrichment["omim"] else OmimInfo(),
            disgenet_diseases=raw_enrichment["disgenet_diseases"],
            gwas_associations=[GwasAssociation(**x) for x in raw_enrichment["gwas_associations"]],
            broad_hub_drugs=[BroadHubDrug(**x) for x in raw_enrichment["broad_hub_drugs"]],
            ddi_flags=[DdiFlag(**x) for x in raw_enrichment["ddi_flags"]],
            ppi_partners=raw_enrichment["ppi_partners"],
            orphan=OrphanInfo(
                rare_diseases=raw_orphan["rare_diseases"],
                orphan_drugs=[OrphanDrug(**x) for x in raw_orphan["orphan_drugs"]],
            ),
        )

        # Plain language synthesis
        summary, next_steps, clinician_notes, overall_status = generate_patient_summary(
            gene=gene, hgvs=hgvs,
            display_mutation=v.hgvs,  # will be overridden by normalizer display if available
            disease=disease,
            tier0=tier0, tier1=tier1, tier2=tier2, tier3=tier3,
            age=age,
        )

        return AnalyzeResponse(
            patient_label=v.patient_label,
            gene=gene,
            hgvs=hgvs,
            display_mutation=hgvs,
            functional_class=fc,
            overall_status=overall_status,
            tier0=tier0,
            tier1=tier1,
            tier2=tier2,
            tier3=tier3,
            enrichment=enrichment,
            patient_summary=summary,
            patient_next_steps=next_steps,
            clinician_notes=clinician_notes,
        )

    except Exception as e:
        logger.error(f"Analyze error for {gene} {hgvs}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/upload", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)):
    """Parse a PDF genetic report or annotated VCF file."""
    filename = file.filename or ""
    content = await file.read()

    if filename.lower().endswith(".pdf"):
        result = parse_pdf(content)
    elif filename.lower().endswith((".vcf", ".vcf.gz")):
        result = parse_vcf(content, filename)
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload a .pdf, .vcf, or .vcf.gz file."
        )

    return UploadResponse(**result)


@router.get("/health")
async def health():
    return {"status": "ok", "service": "GermlineRx"}
