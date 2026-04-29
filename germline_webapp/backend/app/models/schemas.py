"""
GermlineRx — Pydantic v2 request/response schemas
"""
from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel, Field


# ─── Input models ────────────────────────────────────────────────────────────

class NormalizeRequest(BaseModel):
    disease: str = Field(..., example="Cystic fibrosis (CFTR)")
    mutation_text: str = Field(..., example="F508del")


class VariantInput(BaseModel):
    gene: str = Field(..., example="CFTR")
    hgvs: str = Field(..., example="c.1521_1523del")
    disease: str = Field(..., example="Cystic fibrosis (CFTR)")
    age: Optional[int] = Field(None, ge=0, le=120, example=24)
    patient_label: str = Field("Patient", example="Patient")
    functional_class: Optional[str] = Field(None, example="f508del")


class AnalyzeRequest(BaseModel):
    variant: VariantInput


# ─── Normalize response ───────────────────────────────────────────────────────

class NormalizeResponse(BaseModel):
    original_text: str
    gene: str
    hgvs: str
    display_mutation: str
    functional_class: Optional[str]
    confidence: str          # HIGH | MODERATE | LOW | UNKNOWN
    note: str


# ─── Tier 0 ──────────────────────────────────────────────────────────────────

class Tier0Result(BaseModel):
    classification: str      # PATHOGENIC | LIKELY_PATHOGENIC | VUS | BENIGN | UNKNOWN
    confidence: str          # HIGH | MODERATE | LOW | NOT_ACTIONABLE
    review_stars: int        # 0–4
    review_status: str
    gnomad_af: Optional[float]
    gnomad_interpretation: str
    gnomad_url: Optional[str] = None
    clinvar_id: Optional[str]
    clingen_note: Optional[str]


# ─── Tier 1 ──────────────────────────────────────────────────────────────────

class DrugEntry(BaseModel):
    drug_name: str
    action: str
    fda_approved: bool
    approval_year: Optional[str]
    evidence_level: str
    line: Optional[str]
    caveat: Optional[str]
    source: Optional[str]


class SurveillanceEntry(BaseModel):
    recommendation: str
    action_type: str         # surveillance | surgery
    evidence_level: str
    source: Optional[str]


class Tier1Result(BaseModel):
    drugs: List[DrugEntry]
    surveillance: List[SurveillanceEntry]


# ─── Tier 2 ──────────────────────────────────────────────────────────────────

class CriterionCheck(BaseModel):
    criterion: str
    status: str              # MET | NOT_MET | UNKNOWN | WARNING
    explanation: str


class TrialResult(BaseModel):
    nct_id: str
    title: str
    phase: Optional[str]
    conditions: List[str]
    interventions: List[str]
    relevance_score: float
    eligibility_overall: str  # ELIGIBLE | LIKELY_ELIGIBLE | CHECK_WITH_DOCTOR | INELIGIBLE
    eligibility_plain: str
    criterion_checks: List[CriterionCheck]
    contact_name: Optional[str]
    contact_email: Optional[str]
    contact_phone: Optional[str]
    url: str


class Tier2Result(BaseModel):
    trials: List[TrialResult]
    total_fetched: int
    total_after_scoring: int


# ─── Tier 3 ──────────────────────────────────────────────────────────────────

class PipelineEntry(BaseModel):
    gene: str
    approach: str
    description: str
    stage: str
    target: Optional[str]
    key_programs: List[str]
    caveat: Optional[str]
    n_of_1_flag: bool


class Tier3Result(BaseModel):
    pipeline: List[PipelineEntry]


# ─── Enrichment (Biomni datalake) ────────────────────────────────────────────

class OmimInfo(BaseModel):
    mim_number: Optional[str] = None
    gene_name: Optional[str] = None
    phenotypes: List[str] = []


class GwasAssociation(BaseModel):
    trait: str
    p_value: str
    pubmed_id: Optional[str] = None


class BroadHubDrug(BaseModel):
    drug_name: str
    clinical_phase: str
    moa: str
    disease_area: str
    indication: str


class DdiFlag(BaseModel):
    drug_a: str
    drug_b: str
    level: str


class OrphanDrug(BaseModel):
    drug: str
    indication: str


class OrphanInfo(BaseModel):
    rare_diseases: List[str] = []
    orphan_drugs: List[OrphanDrug] = []


class EnrichmentResult(BaseModel):
    omim: OmimInfo = OmimInfo()
    disgenet_diseases: List[str] = []
    gwas_associations: List[GwasAssociation] = []
    broad_hub_drugs: List[BroadHubDrug] = []
    ddi_flags: List[DdiFlag] = []
    ppi_partners: List[str] = []
    orphan: OrphanInfo = OrphanInfo()


# ─── Full analysis response ───────────────────────────────────────────────────

class AnalyzeResponse(BaseModel):
    patient_label: str
    gene: str
    hgvs: str
    display_mutation: str
    functional_class: Optional[str]
    overall_status: str      # FULLY_ACTIONABLE | PARTIALLY_ACTIONABLE | INVESTIGATIONAL_ONLY | NOT_ACTIONABLE
    tier0: Tier0Result
    tier1: Tier1Result
    tier2: Tier2Result
    tier3: Tier3Result
    enrichment: Optional[EnrichmentResult] = None
    patient_summary: str
    patient_next_steps: List[str]
    clinician_notes: List[str]


# ─── Upload response ──────────────────────────────────────────────────────────

class ExtractedVariant(BaseModel):
    gene: str
    hgvs: str
    confidence: str
    raw_text: str
    classification: Optional[str]


class UploadResponse(BaseModel):
    file_type: str
    variants_found: int
    variants: List[ExtractedVariant]
    parse_warnings: List[str]
