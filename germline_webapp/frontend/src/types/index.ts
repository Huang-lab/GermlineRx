export interface NormalizeResponse {
  original_text: string
  gene: string
  hgvs: string
  display_mutation: string
  functional_class: string | null
  confidence: 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN'
  note: string
}

export interface Tier0Result {
  classification: string
  confidence: 'HIGH' | 'MODERATE' | 'LOW' | 'NOT_ACTIONABLE'
  review_stars: number
  review_status: string
  gnomad_af: number | null
  gnomad_interpretation: string
  gnomad_url?: string | null
  clinvar_id: string | null
  clingen_note: string | null
}

export interface DrugEntry {
  drug_name: string
  action: string
  fda_approved: boolean
  approval_year: string | null
  evidence_level: string
  line: string | null
  caveat: string | null
  source: string | null
}

export interface SurveillanceEntry {
  recommendation: string
  action_type: string
  evidence_level: string
  source: string | null
}

export interface Tier1Result {
  drugs: DrugEntry[]
  surveillance: SurveillanceEntry[]
}

export interface CriterionCheck {
  criterion: string
  status: 'MET' | 'NOT_MET' | 'UNKNOWN' | 'WARNING'
  explanation: string
  isExclusion?: boolean
}

export interface TrialResult {
  nct_id: string
  title: string
  phase: string | null
  conditions: string[]
  interventions: string[]
  eligibility_overall: 'ELIGIBLE' | 'LIKELY_ELIGIBLE' | 'CHECK_WITH_DOCTOR' | 'INELIGIBLE' | 'UNKNOWN'
  eligibility_plain: string
  criterion_checks: CriterionCheck[]
  inclusion_bullets: string[]
  exclusion_bullets: string[]
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  url: string
}

export interface Tier2Result {
  trials: TrialResult[]
  total_fetched: number
  total_after_scoring: number
}

export interface PipelineEntry {
  gene: string
  approach: string
  description: string
  stage: string
  target: string | null
  key_programs: string[]
  caveat: string | null
  n_of_1_flag: boolean
}

export interface Tier3Result {
  pipeline: PipelineEntry[]
}

export interface OmimInfo {
  mim_number: string | null
  gene_name: string | null
  phenotypes: string[]
}

export interface GwasAssociation {
  trait: string
  p_value: string
  pubmed_id: string | null
}

export interface BroadHubDrug {
  drug_name: string
  clinical_phase: string
  moa: string
  disease_area: string
  indication: string
}

export interface DdiFlag {
  drug_a: string
  drug_b: string
  level: string
}

export interface OrphanDrug {
  drug: string
  indication: string
}

export interface OrphanInfo {
  rare_diseases: string[]
  orphan_drugs: OrphanDrug[]
}

export interface EnrichmentResult {
  omim: OmimInfo
  disgenet_diseases: string[]
  gwas_associations: GwasAssociation[]
  broad_hub_drugs: BroadHubDrug[]
  ddi_flags: DdiFlag[]
  ppi_partners: string[]
  orphan: OrphanInfo
}

export interface AnalyzeResponse {
  patient_label: string
  gene: string
  hgvs: string
  display_mutation: string
  functional_class: string | null
  overall_status: 'FULLY_ACTIONABLE' | 'PARTIALLY_ACTIONABLE' | 'INVESTIGATIONAL_ONLY' | 'NOT_ACTIONABLE'
  tier0: Tier0Result
  tier1: Tier1Result
  tier2: Tier2Result
  tier3: Tier3Result
  enrichment?: EnrichmentResult
  patient_summary: string
  patient_next_steps: string[]
  clinician_notes: string[]
}

export interface ExtractedVariant {
  gene: string
  hgvs: string
  confidence: string
  raw_text: string
  classification: string | null
}

export interface UploadResponse {
  file_type: string
  variants_found: number
  variants: ExtractedVariant[]
  parse_warnings: string[]
}
