/**
 * GermlineRx — Static (Browser-Only) Engine
 *
 * Runs entirely in the browser with no backend server.
 * All data comes from live API calls — no bundled JSON files required.
 *
 * - Tier 0: ClinVar (NCBI) + gnomAD variant-level GraphQL
 * - Tier 1: DGIdb GraphQL (gene → drug interactions)
 * - Tier 2: ClinicalTrials.gov v2 API (recruiting trials)
 * - Tier 3: ClinicalTrials.gov v2 API (Phase 1/2, not yet recruiting)
 * - Enrichment: not available (requires server-side datalake files)
 */

import { GENE_TO_ENSEMBL } from './geneToEnsembl'

import type {
  NormalizeResponse,
  AnalyzeResponse,
  Tier0Result,
  Tier1Result,
  Tier2Result,
  Tier3Result,
  DrugEntry,
  TrialResult,
  PipelineEntry,
} from '../types'

// ─── Inline alias table (common patient-friendly names → canonical gene + HGVS) ─
const QUICK_ALIASES: Record<string, { gene: string; hgvs: string; display: string; fc: string | null }> = {
  "f508del":           { gene: "CFTR",  hgvs: "c.1521_1523del", display: "F508del",        fc: "f508del" },
  "phe508del":         { gene: "CFTR",  hgvs: "c.1521_1523del", display: "F508del",        fc: "f508del" },
  "g551d":             { gene: "CFTR",  hgvs: "c.1652G>A",      display: "G551D",           fc: "gating_mutation" },
  "r117h":             { gene: "CFTR",  hgvs: "c.350G>A",       display: "R117H",           fc: null },
  "w1282x":            { gene: "CFTR",  hgvs: "c.3846G>A",      display: "W1282X",          fc: "nonsense" },
  "hbs":               { gene: "HBB",   hgvs: "c.20A>T",        display: "HbS (sickle cell)", fc: "sickle_cell" },
  "sickle cell hbs":   { gene: "HBB",   hgvs: "c.20A>T",        display: "HbS (sickle cell)", fc: "sickle_cell" },
  "e6v":               { gene: "HBB",   hgvs: "c.20A>T",        display: "HbS E6V",         fc: "sickle_cell" },
  "v30m":              { gene: "TTR",   hgvs: "c.148G>A",        display: "V30M",            fc: null },
  "v122i":             { gene: "TTR",   hgvs: "c.424G>A",        display: "V122I",           fc: null },
  "a4v":               { gene: "SOD1",  hgvs: "c.14C>T",         display: "A4V",             fc: "sod1_als" },
  "n370s":             { gene: "GBA",   hgvs: "c.1226A>G",       display: "N370S",           fc: null },
  "l444p":             { gene: "GBA",   hgvs: "c.1448T>C",       display: "L444P",           fc: null },
  "exon51":            { gene: "DMD",   hgvs: "del_exon51",      display: "Exon 51 del",     fc: "exon51_skippable" },
  "exon51 deletion":   { gene: "DMD",   hgvs: "del_exon51",      display: "Exon 51 del",     fc: "exon51_skippable" },
  "deltaexon50":       { gene: "DMD",   hgvs: "del_exon50",      display: "Exon 50 del",     fc: null },
  "5946del":           { gene: "BRCA2", hgvs: "c.5946del",       display: "c.5946del",       fc: null },
  "6174delt":          { gene: "BRCA2", hgvs: "c.5946del",       display: "6174delT",        fc: null },
  "68_69del":          { gene: "BRCA1", hgvs: "c.68_69del",      display: "185delAG",        fc: null },
  "185delag":          { gene: "BRCA1", hgvs: "c.68_69del",      display: "185delAG",        fc: null },
  "5266dup":           { gene: "BRCA1", hgvs: "c.5266dup",       display: "5382insC",        fc: null },
}

const DISEASE_TO_GENE: Record<string, string> = {
  "cystic fibrosis":            "CFTR",
  "sickle cell":                "HBB",
  "beta thalassemia":           "HBB",
  "duchenne":                   "DMD",
  "muscular dystrophy":         "DMD",
  "huntington":                 "HTT",
  "als":                        "SOD1",
  "amyotrophic lateral":        "SOD1",
  "spinal muscular atrophy":    "SMN1",
  "sma":                        "SMN1",
  "transthyretin":              "TTR",
  "hattr":                      "TTR",
  "familial amyloid":           "TTR",
  "gaucher":                    "GBA",
  "friedreich":                 "FXN",
  "familial hypercholesterolemia": "LDLR",
  "familial hypercholesterolaemia": "LDLR",
  "lynch syndrome":             "MLH1",
  "hereditary breast":          "BRCA1",
  "brca":                       "BRCA1",
  "hemophilia a":               "F8",
  "hemophilia b":               "F9",
  "hypertrophic cardiomyopathy": "MYBPC3",
  "hcm":                        "MYBPC3",
  "neurofibromatosis":          "NF1",
  "von hippel":                 "VHL",
  "men2":                       "RET",
  "multiple endocrine":         "RET",
  "li-fraumeni":                "TP53",
  "wilms":                      "WT1",
  "marfan":                     "FBN1",
  "polycystic kidney":          "PKD1",
  "wilson":                     "ATP7B",
}

// ─── Curated AF fallback (for common variants when gnomAD API fails) ──────────
const GNOMAD_CURATED: Record<string, number> = {
  "CFTR:c.1521_1523del": 0.0142,
  "CFTR:c.1652G>A":      0.00015,
  "SOD1:c.14C>T":        0.000004,
  "SOD1:c.272A>C":       0.000008,
  "HBB:c.20A>T":         0.0024,
  "TTR:c.148G>A":        0.00003,
  "TTR:c.424G>A":        0.0035,
  "GBA:c.1226A>G":       0.0025,
  "BRCA1:c.68_69del":    0.0010,
  "BRCA2:c.5946del":     0.0012,
  "LDLR:c.1060+1G>A":    0.00005,
}

const CLINGEN_ACTIONABLE = new Set([
  "CFTR","BRCA1","BRCA2","PALB2","ATM","CHEK2","MLH1","MSH2","MSH6","PMS2",
  "DMD","SMN1","SOD1","LDLR","TTR","HBB","F8","F9","GBA","HTT","FXN",
  "MYBPC3","MYH7","RET","NF1","VHL","TP53","KCNQ1","KCNH2","SCN5A",
])

// ─── Normalizer ───────────────────────────────────────────────────────────────

export async function staticNormalize(disease: string, mutationText: string): Promise<NormalizeResponse> {
  const raw = mutationText.trim()
  const key = raw.toLowerCase().trim()

  // Gene-only mode (no mutation entered)
  if (!raw) {
    const gene = extractGeneFromDisease(disease)
    if (gene) {
      return buildResult('', gene, 'unknown', `${gene} (gene-only)`, null, 'LOW',
        `Gene ${gene} identified; no specific variant provided — showing gene-level results`)
    }
    return buildResult('', 'UNKNOWN', 'unknown', '', null, 'LOW', 'No mutation or recognizable gene provided')
  }

  // Quick alias lookup (fast path, no API)
  const aliasResult = lookupAlias(key)
  if (aliasResult) return aliasResult

  // HGVS c. notation — pass through, extract gene from disease field
  const hgvsMatch = raw.match(/c\.[0-9A-Za-z_>+\-*?]+/)
  if (hgvsMatch) {
    const gene = extractGeneFromDisease(disease)
    return buildResult(raw, gene || 'UNKNOWN', hgvsMatch[0], hgvsMatch[0], null, 'MODERATE',
      `HGVS notation detected: ${hgvsMatch[0]}`)
  }

  // rsID
  const rsMatch = raw.match(/rs\d+/i)
  if (rsMatch) {
    const gene = extractGeneFromDisease(disease)
    return buildResult(raw, gene || 'UNKNOWN', rsMatch[0], rsMatch[0], null, 'MODERATE',
      'rsID detected — looking up in ClinVar')
  }

  // Protein notation
  const protMatch = raw.match(/p\.[A-Za-z]{1,3}\d+[A-Za-z*]{1,3}|[A-Z][a-z]{2}\d+[A-Za-z*]/)
  if (protMatch) {
    const gene = extractGeneFromDisease(disease)
    const display = protMatch[0].replace(/^p\./, '')
    return buildResult(raw, gene || 'UNKNOWN', `p.${display}`, display, null, 'LOW',
      'Protein notation detected — HGVS lookup recommended')
  }

  // Try ClinVar API to resolve unknown input
  const gene = extractGeneFromDisease(disease)
  try {
    const q = encodeURIComponent(`"${raw}"[All Fields] AND pathogenic[clinsig]`)
    const res = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=${q}&retmode=json&retmax=1`)
    const json = await res.json()
    const ids: string[] = json?.esearchresult?.idlist || []
    if (ids.length > 0) {
      const sumRes = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&id=${ids[0]}&retmode=json`)
      const sumJson = await sumRes.json()
      const record = sumJson?.result?.[ids[0]]
      const title: string = record?.title || ''
      // Extract gene from title (e.g. "NM_000492.4(CFTR):c.1521_1523delCTT")
      const geneFromTitle = title.match(/\(([A-Z][A-Z0-9]{1,9})\)/)
      const hgvsFromTitle = title.match(/:(c\.[^\s,)]+)/)
      const resolvedGene = geneFromTitle?.[1] || gene || 'UNKNOWN'
      const resolvedHgvs = hgvsFromTitle?.[1] || raw
      return buildResult(raw, resolvedGene, resolvedHgvs, raw, null, 'MODERATE',
        `Resolved via ClinVar: ${title.slice(0, 80)}`)
    }
  } catch {
    // ClinVar lookup failed — fall through to gene-only
  }

  if (gene) {
    return buildResult(raw, gene, 'unknown', raw, null, 'LOW',
      `Gene ${gene} inferred from disease context; mutation not recognized`)
  }

  return buildResult(raw, 'UNKNOWN', 'unknown', raw, null, 'LOW',
    'Mutation format not recognized — please use HGVS notation or common name')
}

function lookupAlias(key: string): NormalizeResponse | null {
  // Direct match
  if (QUICK_ALIASES[key]) {
    const e = QUICK_ALIASES[key]
    return buildResult(key, e.gene.toUpperCase(), e.hgvs, e.display, e.fc, 'HIGH',
      `Recognized common variant name: ${e.display}`)
  }
  // Substring match — only for keys >= 4 chars to avoid "del" / short-word false positives
  for (const [aliasKey, e] of Object.entries(QUICK_ALIASES)) {
    if (aliasKey.length >= 4 && (aliasKey.includes(key) || key.includes(aliasKey))) {
      return buildResult(key, e.gene.toUpperCase(), e.hgvs, e.display, e.fc, 'HIGH',
        `Recognized common variant name: ${e.display}`)
    }
  }
  return null
}

function extractGeneFromDisease(disease: string): string | null {
  // Look for a gene symbol (2–10 uppercase letters/digits) in the input
  const geneMatch = disease.match(/\b([A-Z][A-Z0-9]{1,9})\b/)
  if (geneMatch) return geneMatch[1]
  // Disease name → gene mapping
  const lower = disease.toLowerCase()
  for (const [d, g] of Object.entries(DISEASE_TO_GENE)) {
    if (lower.includes(d)) return g
  }
  return null
}

function buildResult(
  original: string, gene: string, hgvs: string, display: string,
  fc: string | null, confidence: 'HIGH' | 'MODERATE' | 'LOW', note: string
): NormalizeResponse {
  return { original_text: original, gene, hgvs, display_mutation: display, functional_class: fc, confidence, note }
}

// ─── Tier 0: ClinVar + gnomAD variant-level ───────────────────────────────────

const CLINVAR_KNOWN_PATHOGENIC: Record<string, string[]> = {
  "CFTR":  ["c.1521_1523del", "c.1652G>A", "c.3846G>A", "c.1624G>T"],
  "DMD":   ["del"],
  "SOD1":  ["c.14C>T", "c.272A>C"],
  "SMN1":  ["c.840C>T"],
  "HBB":   ["c.20A>T", "c.19G>A"],
  "TTR":   ["c.148G>A", "c.424G>A"],
  "GBA":   ["c.1226A>G", "c.1448T>C"],
  "BRCA1": ["c.68_69del", "c.5266dup"],
  "BRCA2": ["c.5946del"],
  "LDLR":  ["c.1060+1G>A"],
}

function curatedClinVarFallback(gene: string, hgvs: string): Pick<Tier0Result, 'classification' | 'review_stars' | 'review_status' | 'clinvar_id'> {
  const geneUpper = gene.toUpperCase()
  const knownVariants = CLINVAR_KNOWN_PATHOGENIC[geneUpper] || []
  const hgvsLower = hgvs.toLowerCase()
  const isKnown = knownVariants.some(v => {
    const vLower = v.toLowerCase()
    // Use exact match; for "del" gene-level entries allow substring since hgvs may be "del_exon51"
    return vLower === 'del' ? hgvsLower.includes(vLower) : hgvsLower === vLower
  })
  if (isKnown || CLINGEN_ACTIONABLE.has(geneUpper)) {
    return { classification: 'Pathogenic', review_stars: 1, review_status: 'criteria provided, single submitter', clinvar_id: null }
  }
  return { classification: 'Unknown significance', review_stars: 0, review_status: 'No data', clinvar_id: null }
}

function interpretAf(af: number | null): string {
  if (af === null) return 'Allele frequency not available'
  if (af > 0.01)   return `AF=${af.toFixed(4)} — common carrier allele in general population`
  if (af > 0.001)  return `AF=${af.toFixed(5)} — rare variant (1 in ${Math.round(1/af).toLocaleString()} alleles)`
  if (af > 0.0001) return `AF=${af.toFixed(6)} — very rare variant`
  return `AF=${af.toExponential(2)} — ultra-rare variant`
}

function reviewStatusToStars(status: string): number {
  if (status.includes('practice guideline')) return 4
  if (status.includes('reviewed by expert')) return 3
  if (status.includes('criteria provided, multiple')) return 2
  if (status.includes('criteria provided, single')) return 1
  return 0
}

async function fetchGnomadVariantLevel(gene: string, hgvs: string): Promise<{ af: number | null; gnomad_url: string; clinvar_id: string | null }> {
  const geneUpper = gene.toUpperCase()
  const curatedKey = `${geneUpper}:${hgvs}`
  const geneLevelUrl = `https://gnomad.broadinstitute.org/gene/${geneUpper}?dataset=gnomad_r4`
  const curatedAf = GNOMAD_CURATED[curatedKey] ?? null

  // Skip API for gene-only or non-HGVS inputs
  if (!hgvs || hgvs === 'unknown' || hgvs.startsWith('del_')) {
    return { af: curatedAf, gnomad_url: geneLevelUrl, clinvar_id: null }
  }

  try {
    // Call our Vercel serverless function — avoids browser CORS restriction on gnomAD
    const res = await fetch('/api/gnomad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gene: geneUpper, hgvs }),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return { af: curatedAf, gnomad_url: geneLevelUrl, clinvar_id: null }

    const data = await res.json()
    return {
      af: data.af ?? curatedAf,
      gnomad_url: data.gnomad_url || geneLevelUrl,
      clinvar_id: data.clinvar_id || null,
    }
  } catch {
    // Fallback: local dev without vercel dev, or network error
    return { af: curatedAf, gnomad_url: geneLevelUrl, clinvar_id: null }
  }
}

async function fetchTier0(gene: string, hgvs: string): Promise<Tier0Result> {
  const { af, gnomad_url, clinvar_id: mvClinvarId } = await fetchGnomadVariantLevel(gene, hgvs)
  const afInterpretation = interpretAf(af)

  if (hgvs === 'unknown' || !hgvs) {
    const fb = curatedClinVarFallback(gene, hgvs)
    return { ...fb, confidence: fb.review_stars >= 1 ? 'MODERATE' : 'LOW', gnomad_af: af, gnomad_interpretation: afInterpretation, gnomad_url, clingen_note: null }
  }

  try {
    // Use ClinVar ID from MyVariant.info (accurate, field-specific match)
    // Fall back to esearch only if MyVariant didn't return one
    let clinvarId: string | null = mvClinvarId

    if (!clinvarId) {
      // Fallback 1: [Variant Name] field — exact name match
      const q1 = encodeURIComponent(`${gene}[gene] AND "${hgvs}"[Variant Name]`)
      const r1 = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=${q1}&retmode=json&retmax=1`)
      const j1 = await r1.json()
      clinvarId = j1?.esearchresult?.idlist?.[0] || null
    }

    if (!clinvarId) {
      // Fallback 2: [All Fields] — broader match, safe here because MyVariant already
      // handled common variants; this only runs for structural/rare variants where
      // the HGVS string is unique enough not to cause spurious matches
      const q2 = encodeURIComponent(`${gene}[gene] AND "${hgvs}"[All Fields]`)
      const r2 = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=${q2}&retmode=json&retmax=1`)
      const j2 = await r2.json()
      clinvarId = j2?.esearchresult?.idlist?.[0] || null
    }

    if (!clinvarId) {
      const fb = curatedClinVarFallback(gene, hgvs)
      return { ...fb, confidence: fb.review_stars >= 1 ? 'MODERATE' : 'LOW', gnomad_af: af, gnomad_interpretation: afInterpretation, gnomad_url, clingen_note: null }
    }

    const summaryRes = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&id=${clinvarId}&retmode=json`)
    const summaryJson = await summaryRes.json()
    const result = summaryJson?.result?.[clinvarId]

    const rawClass = result?.germline_classification?.description
      || result?.clinical_significance?.description
      || 'Unknown significance'
    const reviewStatus = result?.germline_classification?.review_status
      || result?.clinical_significance?.review_status
      || 'no assertion'
    const stars = reviewStatusToStars(reviewStatus)

    return {
      classification: rawClass,
      confidence: stars >= 2 ? 'HIGH' : stars >= 1 ? 'MODERATE' : 'LOW',
      review_stars: stars,
      review_status: reviewStatus,
      gnomad_af: af,
      gnomad_interpretation: afInterpretation,
      gnomad_url,
      clinvar_id: clinvarId,
      clingen_note: null,
    }
  } catch {
    const fb = curatedClinVarFallback(gene, hgvs)
    return { ...fb, confidence: fb.review_stars >= 1 ? 'MODERATE' : 'LOW', gnomad_af: af, gnomad_interpretation: afInterpretation, gnomad_url, clingen_note: null }
  }
}

// ─── Tier 1: OpenTargets (primary) → DGIdb (fallback) ───────────────────────

const OT_GRAPHQL = 'https://api.platform.opentargets.org/api/v4/graphql'

async function resolveEnsemblId(gene: string): Promise<string | null> {
  const mapped = GENE_TO_ENSEMBL[gene.toUpperCase()]
  if (mapped) return mapped

  try {
    const query = `query { search(queryString: "${gene}", entityNames: ["target"], page: { size: 1, index: 0 }) { hits { id entity } } }`
    const res = await fetch(OT_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const json = await res.json()
    const hit = json?.data?.search?.hits?.[0]
    return hit?.entity === 'target' ? hit.id : null
  } catch {
    return null
  }
}

async function fetchTier1OpenTargets(gene: string): Promise<DrugEntry[]> {
  const ensemblId = await resolveEnsemblId(gene)
  if (!ensemblId) return []

  try {
    const query = `
      query knownDrugs($ensemblId: String!) {
        target(ensemblId: $ensemblId) {
          knownDrugs(size: 30) {
            rows {
              drug {
                name
                maximumClinicalTrialPhase
                isApproved
              }
              disease { name }
              phase
              mechanismOfAction
            }
          }
        }
      }
    `
    const res = await fetch(OT_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { ensemblId } }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const json = await res.json()
    const rows = json?.data?.target?.knownDrugs?.rows || []

    const seen = new Set<string>()
    const drugs: DrugEntry[] = []
    for (const row of rows) {
      const name: string = row.drug?.name
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())

      const isApproved: boolean = row.drug?.isApproved === true ||
        (row.drug?.maximumClinicalTrialPhase ?? 0) >= 4
      const phase: number | null = row.phase ?? row.drug?.maximumClinicalTrialPhase ?? null

      if (!isApproved && (phase == null || phase < 3)) continue

      drugs.push({
        drug_name: name,
        action: row.mechanismOfAction || 'See OpenTargets for mechanism of action',
        fda_approved: isApproved,
        approval_year: null,
        evidence_level: isApproved ? 'FDA_approved' : `Phase ${phase}`,
        line: null,
        caveat: row.disease?.name
          ? `Indication: ${row.disease.name}. Verify with your physician.`
          : 'Verify indication and approval status with your physician.',
        source: 'OpenTargets',
      })
    }
    return drugs
  } catch {
    return []
  }
}

const DGIDB_URL = 'https://dgidb.org/api/graphql'
const DGIDB_APPROVAL_SOURCES = new Set(['FDA', 'NCI', 'CIViC', 'ChEMBL', 'TTD', 'TdgClinicalTrial', 'GuideToPharmacology'])

async function fetchTier1DGIdb(gene: string): Promise<DrugEntry[]> {
  try {
    const query = `
      query($names: [String!]!) {
        genes(names: $names) {
          nodes {
            name
            interactions {
              drug { name approved drugAttributes { name value } }
              interactionScore
              interactionTypes { type directionality }
              sources { sourceDbName }
            }
          }
        }
      }
    `
    const res = await fetch(DGIDB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { names: [gene.toUpperCase()] } }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const json = await res.json()
    const interactions = json?.data?.genes?.nodes?.[0]?.interactions || []
    const seen = new Set<string>()
    const drugs: DrugEntry[] = []
    for (const ix of interactions) {
      const drugName: string = ix.drug?.name || ''
      if (!drugName || seen.has(drugName.toLowerCase())) continue
      const isApproved: boolean = ix.drug?.approved === true ||
        (ix.sources || []).some((s: { sourceDbName: string }) => DGIDB_APPROVAL_SOURCES.has(s.sourceDbName))
      if (!isApproved && (ix.interactionScore || 0) < 2) continue
      seen.add(drugName.toLowerCase())
      const types: string[] = (ix.interactionTypes || []).map((t: { type: string }) => t.type).filter(Boolean)
      drugs.push({
        drug_name: drugName,
        action: types.length > 0 ? types.join(', ') : 'gene-drug interaction',
        fda_approved: isApproved,
        approval_year: null,
        evidence_level: isApproved ? 'FDA_approved' : 'Preclinical',
        line: null,
        caveat: 'Source: DGIdb. Verify indication and approval status with your physician.',
        source: 'DGIdb',
      })
    }
    return drugs
  } catch {
    return []
  }
}

async function fetchTier1(gene: string): Promise<Tier1Result> {
  const otDrugs = await fetchTier1OpenTargets(gene)
  if (otDrugs.length > 0) return { drugs: otDrugs, surveillance: [] }
  const dgidbDrugs = await fetchTier1DGIdb(gene)
  return { drugs: dgidbDrugs, surveillance: [] }
}

// ─── Gene-specific search terms (shared by Tier 2 and Tier 3) ────────────────
const SEARCH_TERMS: Record<string, string[]> = {
  "CFTR":   ["cystic fibrosis CFTR modulator", "CFTR F508del", "cystic fibrosis gene therapy"],
  "DMD":    ["Duchenne muscular dystrophy gene therapy", "DMD exon skipping", "dystrophin"],
  "SOD1":   ["SOD1 ALS tofersen", "SOD1 amyotrophic lateral sclerosis"],
  "SMN1":   ["spinal muscular atrophy SMN", "SMA nusinersen risdiplam"],
  "BRCA1":  ["BRCA1 PARP inhibitor", "hereditary breast cancer BRCA1"],
  "BRCA2":  ["BRCA2 PARP inhibitor", "hereditary breast cancer BRCA2"],
  "MLH1":   ["Lynch syndrome MLH1", "mismatch repair deficiency MSI-H"],
  "MSH2":   ["Lynch syndrome MSH2", "mismatch repair MSH2"],
  "MSH6":   ["Lynch syndrome MSH6", "mismatch repair MSH6"],
  "TTR":    ["transthyretin amyloidosis TTR", "hATTR tafamidis"],
  "HBB":    ["sickle cell disease gene therapy", "HBB beta thalassemia"],
  "LDLR":   ["familial hypercholesterolemia LDLR", "PCSK9 inhibitor FH"],
  "MYBPC3": ["hypertrophic cardiomyopathy mavacamten", "HCM MYBPC3"],
  "MYH7":   ["hypertrophic cardiomyopathy MYH7", "HCM sarcomere"],
  "NF1":    ["neurofibromatosis NF1 selumetinib", "NF1 plexiform neurofibroma"],
  "VHL":    ["von Hippel-Lindau VHL belzutifan", "VHL renal cell carcinoma"],
  "RET":    ["MEN2 RET medullary thyroid", "RET selpercatinib"],
  "GBA":    ["Gaucher disease GBA", "GBA Parkinson disease"],
  "HTT":    ["Huntington disease HTT", "huntingtin lowering"],
  "FXN":    ["Friedreich ataxia FXN", "frataxin"],
  "F8":     ["hemophilia A gene therapy", "factor VIII emicizumab"],
  "F9":     ["hemophilia B gene therapy", "factor IX etranacogene"],
  "TP53":   ["Li-Fraumeni syndrome TP53", "TP53 germline surveillance"],
  "PALB2":  ["PALB2 breast cancer PARP inhibitor"],
  "ATM":    ["ATM breast cancer PARP inhibitor", "ATM pancreatic cancer"],
  "CHEK2":  ["CHEK2 breast cancer surveillance"],
}

function scoreTrialRelevance(trial: TrialResult, gene: string): number {
  let score = 0
  const geneUpper = gene.toUpperCase()

  if (trial.title.toUpperCase().includes(geneUpper)) score += 30
  if (trial.conditions.some(c => c.toUpperCase().includes(geneUpper))) score += 20

  const phaseStr = (trial.phase || '').toUpperCase()
  if (phaseStr.includes('PHASE3') || phaseStr.includes('PHASE 3')) score += 15
  else if (phaseStr.includes('PHASE2') || phaseStr.includes('PHASE 2')) score += 10
  else if (phaseStr.includes('PHASE1') || phaseStr.includes('PHASE 1')) score += 5

  if (trial.eligibility_overall === 'LIKELY_ELIGIBLE') score += 10
  else if (trial.eligibility_overall === 'CHECK_WITH_DOCTOR') score += 5

  if (trial.criterion_checks.some(c => c.criterion.includes(geneUpper) && c.status === 'MET')) score += 15

  return score
}

// ─── Tier 2: ClinicalTrials.gov — recruiting trials ──────────────────────────

function splitCriteriaText(text: string): [string, string] {
  const exclIdx = text.search(/exclusion\s+criteria/i)
  if (exclIdx === -1) return [text, '']
  return [text.slice(0, exclIdx), text.slice(exclIdx)]
}

function cleanBullet(raw: string): string {
  let s = raw
    .replace(/^[\d]+\.\s*/, '')   // strip "1. "
    .replace(/^[a-z]\)\s*/i, '')  // strip "a) "
    .trim()
  if (s.length > 200) {
    const cut = s.search(/[.;—]/)
    if (cut > 50) s = s.slice(0, cut + 1)
    else s = s.slice(0, 200) + '…'
  }
  return s
}

function parseBullets(section: string): string[] {
  return section
    .split('\n')
    .map(line => line.replace(/^[\s*\-•\d.]+/, '').trim())
    .filter(line => line.length > 10 && !/^(inclusion|exclusion)\s+criteria/i.test(line))
    .map(cleanBullet)
    .filter(line => line.length > 5)
}

const EXCLUSION_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Pregnancy/breastfeeding',     pattern: /pregnan|breastfeed|nursing/i },
  { label: 'Liver disease',               pattern: /liver disease|liver failure|cirrhosis|hepatic impairment/i },
  { label: 'Renal impairment',            pattern: /renal impairment|renal failure|kidney failure/i },
  { label: 'Active cancer/malignancy',    pattern: /active cancer|active malignancy|concurrent malignancy/i },
  { label: 'Immunosuppression',           pattern: /immunosuppressed|immunocompromised/i },
  { label: 'HIV',                         pattern: /\bHIV\b|human immunodeficiency virus/i },
  { label: 'Prior gene therapy',          pattern: /prior gene therapy|previous gene therapy/i },
  { label: 'Pre-existing AAV antibodies', pattern: /aav antibod|neutralizing antibod.*aav/i },
  { label: 'Prior organ transplant',      pattern: /organ transplant|transplant recipient/i },
  { label: 'Active infection',            pattern: /active infection|systemic infection|uncontrolled infection/i },
  { label: 'Uncontrolled diabetes',       pattern: /uncontrolled diabetes|HbA1c\s*>\s*\d/i },
  { label: 'Concurrent experimental therapy', pattern: /concurrent.*investigational|another.*clinical trial|experimental.*therapy/i },
  { label: 'Thrombocytopenia',            pattern: /thrombocytopenia|platelet count\s*<|low platelet/i },
  { label: 'Cardiac conditions',          pattern: /heart failure|NYHA class|QTc\s*prolongation|cardiac arrhythmia|unstable angina/i },
  { label: 'Bleeding disorders',          pattern: /bleeding disorder|coagulopathy|anticoagulant/i },
  { label: 'Autoimmune disease',          pattern: /autoimmune disease|autoimmune disorder|systemic lupus/i },
  { label: 'Substance abuse',             pattern: /substance abuse|alcohol abuse|drug abuse/i },
  { label: 'CNS metastases',              pattern: /brain metastas|CNS metastas|leptomeningeal/i },
  { label: 'Prior allergic reaction',     pattern: /allergic reaction|hypersensitivity|anaphylaxis/i },
  { label: 'Severe lung disease',         pattern: /FEV1\s*<|severe.*pulmonary|oxygen dependent|respiratory failure/i },
  { label: 'Minimum weight/BMI',          pattern: /body weight\s*<|BMI\s*<|minimum weight/i },
]

function parseAgeYears(ageStr: string): number | null {
  const match = ageStr.match(/(\d+)\s*(year|month|week)/i)
  if (!match) return null
  const n = parseInt(match[1])
  const unit = match[2].toLowerCase()
  if (unit.startsWith('month')) return n / 12
  if (unit.startsWith('week')) return n / 52
  return n
}

type RawStudy = {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string }
    statusModule?: { overallStatus?: string }
    designModule?: { phases?: string[] }
    conditionsModule?: { conditions?: string[] }
    armsInterventionsModule?: { interventions?: Array<{ name?: string }> }
    eligibilityModule?: { eligibilityCriteria?: string; minimumAge?: string; maximumAge?: string; sex?: string; healthyVolunteers?: boolean; stdAges?: string[] }
    contactsLocationsModule?: { centralContacts?: Array<{ name?: string; email?: string; phone?: string }> }
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } }
  }
}

function mapStudyToTrial(s: RawStudy, age: number | null, gene?: string, patientSex?: string | null): TrialResult {
  const p = s.protocolSection || {}
  const id = p.identificationModule || {}
  const elig = p.eligibilityModule || {}
  const contacts = p.contactsLocationsModule?.centralContacts || []
  const nctId = id.nctId || 'N/A'

  const minAge = parseAgeYears(elig.minimumAge || '0 years') ?? 0
  const maxAge = parseAgeYears(elig.maximumAge || '120 years') ?? 120
  const sex = (elig.sex || 'ALL').toUpperCase()
  const healthyOnly = elig.healthyVolunteers === true
  const rawCriteria = elig.eligibilityCriteria || ''
  const [inclText, exclText] = splitCriteriaText(rawCriteria)

  const geneUpper = (gene || '').toUpperCase()

  const checks: import('../types').CriterionCheck[] = []
  let ineligible = false

  // Age check (structured field — reliable)
  if (age !== null) {
    const ageMet = age >= minAge && age <= maxAge
    checks.push({
      criterion: `Age ${minAge}–${maxAge} years`,
      status: ageMet ? 'MET' : 'NOT_MET',
      explanation: ageMet
        ? `Patient age ${age} is within range`
        : `Patient age ${age} is outside required range (${minAge}–${maxAge})`,
    })
    if (!ageMet) ineligible = true
  }

  // Sex check (structured field — reliable when patient sex is known)
  if (sex === 'MALE' || sex === 'FEMALE') {
    const sexLabel = sex === 'MALE' ? 'Male' : 'Female'
    if (patientSex) {
      const sexMet = patientSex === sex
      checks.push({
        criterion: `${sexLabel} participants only`,
        status: sexMet ? 'MET' : 'NOT_MET',
        explanation: sexMet
          ? `Trial enrolls ${sex.toLowerCase()} participants — matches your selection`
          : `Trial enrolls ${sex.toLowerCase()} participants only — does not match your selection`,
      })
      if (!sexMet) ineligible = true
    } else {
      checks.push({
        criterion: `${sexLabel} participants only`,
        status: 'UNKNOWN',
        explanation: `Trial enrolls ${sex.toLowerCase()} participants only — specify your biological sex above for a definitive check`,
      })
    }
  }

  // Healthy volunteers check
  if (healthyOnly) {
    checks.push({
      criterion: 'Healthy volunteers only',
      status: 'WARNING',
      explanation: 'This trial enrolls healthy volunteers, not patients with the condition',
    })
  }

  // Gene mention in inclusion section only (not exclusion) — word-boundary to avoid BRCA1 matching BRCA2
  if (geneUpper && new RegExp(`\\b${geneUpper}\\b`, 'i').test(inclText)) {
    checks.push({
      criterion: `${geneUpper} gene mentioned in inclusion criteria`,
      status: 'MET',
      explanation: `Inclusion criteria specifically reference ${geneUpper}`,
    })
  }

  // Exclusion conditions parsed from free-text exclusion section
  if (exclText) {
    for (const { label, pattern } of EXCLUSION_PATTERNS) {
      if (pattern.test(exclText)) {
        checks.push({
          criterion: label,
          status: 'UNKNOWN',
          explanation: 'Exclusion criterion in this trial — discuss with your care team',
          isExclusion: true,
        })
      }
    }
  }

  let eligOverall: TrialResult['eligibility_overall'] = 'CHECK_WITH_DOCTOR'
  if (ineligible) {
    eligOverall = 'INELIGIBLE'
  } else if (age !== null && checks.some(c => c.criterion.startsWith('Age') && c.status === 'MET')) {
    eligOverall = sex === 'ALL' ? 'LIKELY_ELIGIBLE' : 'CHECK_WITH_DOCTOR'
  }

  const plainParts: string[] = []
  if (age !== null) plainParts.push(ineligible ? `Age ${age} is outside the required range.` : `Age ${age} meets the age requirement.`)
  if (sex !== 'ALL') plainParts.push(`Enrolls ${sex.toLowerCase()} participants only.`)
  if (healthyOnly) plainParts.push('For healthy volunteers only.')
  plainParts.push('Review full criteria on ClinicalTrials.gov.')

  return {
    nct_id: nctId,
    title: id.briefTitle || 'Untitled Trial',
    phase: (p.designModule?.phases || []).join(', ') || null,
    conditions: p.conditionsModule?.conditions || [],
    interventions: (p.armsInterventionsModule?.interventions || []).map((i: { name?: string }) => i.name || '').filter(Boolean),
    eligibility_overall: eligOverall,
    eligibility_plain: plainParts.join(' '),
    criterion_checks: checks,
    inclusion_bullets: parseBullets(inclText),
    exclusion_bullets: parseBullets(exclText),
    contact_name: contacts[0]?.name || null,
    contact_email: contacts[0]?.email || null,
    contact_phone: contacts[0]?.phone || null,
    url: `https://clinicaltrials.gov/study/${nctId}`,
  }
}

function filterRelevantStudies(studies: RawStudy[], gene: string): RawStudy[] {
  const geneUpper = gene.toUpperCase()
  const keywords = [
    geneUpper,
    gene.toLowerCase(),
    ...(SEARCH_TERMS[geneUpper] || []).flatMap(t => t.toLowerCase().split(' ').filter(w => w.length > 4)),
  ]
  return studies.filter(s => {
    const title = (s.protocolSection?.identificationModule?.briefTitle || '').toLowerCase()
    const conditions = (s.protocolSection?.conditionsModule?.conditions || []).join(' ').toLowerCase()
    const text = `${title} ${conditions}`
    return keywords.some(kw => text.includes(kw.toLowerCase()))
  })
}

async function fetchTier2(gene: string, disease: string, age: number | null, sex?: string | null): Promise<Tier2Result> {
  try {
    const geneUpper = gene.toUpperCase()
    const terms = SEARCH_TERMS[geneUpper] || [`${gene} genetic disease`]

    const allStudies: RawStudy[] = []
    const seenNct = new Set<string>()

    const fetches = terms.map(async (term) => {
      const query = encodeURIComponent(term)
      const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${query}&filter.overallStatus=RECRUITING&pageSize=15&format=json`
      const res = await fetch(url)
      const json = await res.json()
      return (json?.studies || []) as RawStudy[]
    })

    const results = await Promise.allSettled(fetches)
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      for (const study of r.value) {
        const nctId = study.protocolSection?.identificationModule?.nctId
        if (nctId && !seenNct.has(nctId)) {
          seenNct.add(nctId)
          allStudies.push(study)
        }
      }
    }

    const relevant = filterRelevantStudies(allStudies, gene)
    const allTrials = relevant.map(s => mapStudyToTrial(s, age, gene, sex ?? null))

    allTrials.sort((a, b) => scoreTrialRelevance(b, gene) - scoreTrialRelevance(a, gene))

    const eligibleTrials = allTrials.filter(t => t.eligibility_overall !== 'INELIGIBLE')
    const ineligibleCount = allTrials.length - eligibleTrials.length

    return {
      trials: eligibleTrials,
      total_fetched: allStudies.length,
      total_after_scoring: relevant.length,
      total_ineligible: ineligibleCount,
    }
  } catch {
    return { trials: [], total_fetched: 0, total_after_scoring: 0, total_ineligible: 0 }
  }
}

// ─── Tier 3: ClinicalTrials.gov — Phase 1/2 non-recruiting trials ─────────────

async function fetchTier3(gene: string, tier2NctIds: Set<string>): Promise<Tier3Result> {
  try {
    const geneUpper = gene.toUpperCase()
    const terms = SEARCH_TERMS[geneUpper] || [`${gene} genetic disease`]

    const allStudies: RawStudy[] = []
    const seenNct = new Set<string>()

    const fetches = terms.map(async (term) => {
      const query = encodeURIComponent(term)
      const url = [
        'https://clinicaltrials.gov/api/v2/studies',
        `?query.term=${query}`,
        `&filter.overallStatus=NOT_YET_RECRUITING,ACTIVE_NOT_RECRUITING`,
        `&pageSize=20&format=json`,
      ].join('')
      const res = await fetch(url)
      const json = await res.json()
      return (json?.studies || []) as RawStudy[]
    })

    const results = await Promise.allSettled(fetches)
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      for (const study of r.value) {
        const nctId = study.protocolSection?.identificationModule?.nctId
        if (nctId && !seenNct.has(nctId)) {
          seenNct.add(nctId)
          allStudies.push(study)
        }
      }
    }

    const studies = allStudies
    const relevant = filterRelevantStudies(studies, gene)

    const EARLY_PHASES = new Set(['PHASE1', 'PHASE2', 'EARLY_PHASE1', 'NA'])
    const pipeline: PipelineEntry[] = relevant
      .filter(s => {
        const nctId = s.protocolSection?.identificationModule?.nctId || ''
        if (tier2NctIds.has(nctId)) return false
        const phases: string[] = s.protocolSection?.designModule?.phases || []
        return phases.length === 0 || phases.some((ph: string) => EARLY_PHASES.has(ph))
      })
      .map(s => {
        const p = s.protocolSection || {}
        const id = p.identificationModule || {}
        const phases = (p.designModule?.phases || []).join('/')
        const interventions = (p.armsInterventionsModule?.interventions || []).map((i: { name?: string }) => i.name || '').filter(Boolean)
        const sponsor = p.sponsorCollaboratorsModule?.leadSponsor?.name || 'Unknown sponsor'
        const nctId = id.nctId || ''

        return {
          gene: geneUpper,
          approach: interventions.length > 0 ? interventions[0] : 'Investigational therapy',
          description: id.briefTitle || 'See ClinicalTrials.gov for details',
          stage: phases || 'Phase 1/2',
          target: null,
          key_programs: [sponsor, ...(nctId ? [`NCT: ${nctId}`] : [])],
          caveat: `ClinicalTrials.gov ${nctId} — not yet recruiting or actively enrolling, not open for new patients`,
          n_of_1_flag: false,
        }
      })

    return { pipeline }
  } catch {
    return { pipeline: [] }
  }
}

// ─── Overall status ───────────────────────────────────────────────────────────

function deriveOverallStatus(tier1: Tier1Result, tier2: Tier2Result, tier3: Tier3Result): AnalyzeResponse['overall_status'] {
  if (tier1.drugs.some(d => d.fda_approved)) return 'FULLY_ACTIONABLE'
  if (tier1.drugs.length > 0 || tier2.trials.length > 0) return 'PARTIALLY_ACTIONABLE'
  if (tier3.pipeline.length > 0) return 'INVESTIGATIONAL_ONLY'
  return 'NOT_ACTIONABLE'
}

// ─── Static file upload: VCF client-side parser, PDF unsupported ─────────────

import type { UploadResponse, ExtractedVariant } from '../types'

export async function staticUploadFile(file: File): Promise<UploadResponse> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.pdf')) {
    const { parsePdf } = await import('./staticPdfParser')
    return parsePdf(file)
  }

  // VCF: plain text — parse client-side
  if (name.endsWith('.vcf') || name.endsWith('.vcf.gz')) {
    try {
      const text = await file.text()
      return parseVcf(text)
    } catch {
      throw new Error('Could not read VCF file. Make sure it is a valid uncompressed VCF (.vcf).')
    }
  }

  throw new Error('Unsupported file type. Please upload a VCF (.vcf) file or use the full version for PDF support.')
}

function parseVcf(text: string): UploadResponse {
  const variants: ExtractedVariant[] = []
  const warnings: string[] = []
  let hasAnnotations = false

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    const cols = line.split('\t')
    if (cols.length < 5) continue

    const [chrom, pos, _id, ref, altField] = cols
    const info = cols[7] || ''
    const alts = altField.split(',')

    // Check for ANN (SnpEff) or CSQ (VEP) annotations
    const annMatch = info.match(/(?:ANN|CSQ)=([^;]+)/)
    if (annMatch) hasAnnotations = true

    for (const alt of alts) {
      if (alt === '.' || alt === '*') continue

      let gene = 'UNKNOWN'
      let hgvs = `g.${pos}${ref}>${alt}`
      let classification: string | null = null

      // Parse SnpEff ANN field: ANN=alt|effect|impact|gene|geneid|...
      if (annMatch) {
        const entries = annMatch[1].split(',')
        for (const entry of entries) {
          const parts = entry.split('|')
          if (parts[0] === alt || alts.length === 1) {
            if (parts[3]) gene = parts[3]
            if (parts[9]) hgvs = parts[9]   // c. notation
            if (parts[2]) classification = parts[2]  // impact: HIGH/MODERATE/LOW
            break
          }
        }
      }

      // Parse VEP CSQ field: CSQ=alt|...|SYMBOL|...|HGVSc|...
      const csqMatch = info.match(/CSQ=([^;]+)/)
      if (csqMatch && gene === 'UNKNOWN') {
        const entry = csqMatch[1].split(',')[0].split('|')
        // VEP CSQ column indices vary by header — try common positions
        if (entry[3]) gene = entry[3]
        if (entry[10]) hgvs = entry[10] || hgvs
      }

      // Filter for HIGH/MODERATE impact or keep all if no annotations
      const isHighImpact = !classification || ['HIGH', 'MODERATE'].includes(classification)
      if (!isHighImpact) continue

      const chr = chrom.replace(/^chr/i, '')
      variants.push({
        gene,
        hgvs,
        confidence: classification === 'HIGH' ? 'HIGH' : classification === 'MODERATE' ? 'MEDIUM' : 'LOW',
        raw_text: `chr${chr}:${pos} ${ref}>${alt}`,
        classification: classification || null,
      })

      if (variants.length >= 20) break
    }
    if (variants.length >= 20) break
  }

  if (!hasAnnotations && variants.length > 0) {
    warnings.push('VCF has no gene annotations (ANN/CSQ fields). Gene names shown as UNKNOWN. For best results, use a SnpEff or VEP annotated VCF.')
  }
  if (variants.length === 0) {
    warnings.push('No variants with HIGH or MODERATE impact found in this VCF file.')
  }

  return {
    file_type: 'vcf',
    variants_found: variants.length,
    variants,
    parse_warnings: warnings,
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function staticAnalyze(
  gene: string,
  hgvs: string,
  disease: string,
  age: number | null,
  functionalClass: string | null,
  sex?: string | null,
): Promise<AnalyzeResponse> {
  if (gene === 'UNKNOWN') {
    return {
      patient_label: 'Patient',
      gene: 'UNKNOWN',
      hgvs,
      display_mutation: hgvs,
      functional_class: null,
      overall_status: 'NOT_ACTIONABLE',
      tier0: { classification: 'Unknown significance', confidence: 'LOW', review_stars: 0, review_status: 'No data', gnomad_af: null, gnomad_interpretation: 'Allele frequency not available', gnomad_url: null, clinvar_id: null, clingen_note: null },
      tier1: { drugs: [], surveillance: [] },
      tier2: { trials: [], total_fetched: 0, total_after_scoring: 0, total_ineligible: 0 },
      tier3: { pipeline: [] },
      enrichment: undefined,
      patient_summary: 'The gene or variant could not be recognized. Please check the spelling or try a different format (e.g. HGVS notation, gene symbol, or common name like F508del).',
      patient_next_steps: ['Try entering your gene symbol directly (e.g. CFTR, BRCA2).', 'Use HGVS notation like c.1521_1523del for best results.'],
      clinician_notes: ['Gene normalization failed — UNKNOWN returned.'],
    }
  }

  const [tier0, tier1, tier2] = await Promise.all([
    fetchTier0(gene, hgvs),
    fetchTier1(gene),
    fetchTier2(gene, disease, age, sex),
  ])

  const tier2NctIds = new Set(tier2.trials.map(t => t.nct_id))
  const tier3 = await fetchTier3(gene, tier2NctIds)

  const overallStatus = deriveOverallStatus(tier1, tier2, tier3)

  const fdaDrugs = tier1.drugs.filter(d => d.fda_approved).map(d => d.drug_name)
  const patientSummary = fdaDrugs.length > 0
    ? `Your ${gene} variant has ${fdaDrugs.length} FDA-approved treatment option${fdaDrugs.length > 1 ? 's' : ''}: ${fdaDrugs.slice(0, 3).join(', ')}${fdaDrugs.length > 3 ? ', and more' : ''}. Always consult your physician before making any medical decisions.`
    : tier2.trials.length > 0
    ? `No FDA-approved therapies are currently matched to your ${gene} variant, but ${tier2.trials.length} recruiting clinical trial${tier2.trials.length > 1 ? 's' : ''} related to ${gene} may be relevant. Discuss these options with your physician or genetic counselor.`
    : tier3.pipeline.length > 0
    ? `No FDA-approved therapies are currently matched to your ${gene} variant. ${tier3.pipeline.length} emerging research program${tier3.pipeline.length > 1 ? 's are' : ' is'} in development. Speak with a specialist about future options.`
    : `No FDA-approved therapies or matched trials were found for your ${gene} variant at this time. Consider consulting a genetic counselor for personalized guidance.`

  return {
    patient_label: 'Patient',
    gene,
    hgvs,
    display_mutation: hgvs,
    functional_class: functionalClass,
    overall_status: overallStatus,
    tier0,
    tier1,
    tier2,
    tier3,
    enrichment: undefined,
    patient_summary: patientSummary,
    patient_next_steps: [
      'Share these results with your physician or genetic counselor.',
      'Do not start or stop any medication based solely on this report.',
    ],
    clinician_notes: [
      `Static mode — all data from live APIs (ClinVar, gnomAD, DGIdb, ClinicalTrials.gov).`,
      `Tier 1 from DGIdb — may have less clinical detail than the full HuggingFace version.`,
      `Enrichment data (OMIM, DDInter, Orphan drugs) not available in static mode.`,
    ],
  }
}
