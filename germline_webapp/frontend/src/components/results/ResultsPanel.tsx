import { useState } from 'react'
import type { AnalyzeResponse, EnrichmentResult, ActionPlan } from '../../types'
import ConfidenceBadge from './ConfidenceBadge'
import TrialCard from './TrialCard'

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  FULLY_ACTIONABLE:     { bg: 'bg-green-50 border-green-300',  text: 'text-green-700',  label: 'Fully Actionable' },
  PARTIALLY_ACTIONABLE: { bg: 'bg-blue-50 border-blue-300',    text: 'text-blue-700',   label: 'Partially Actionable' },
  INVESTIGATIONAL_ONLY: { bg: 'bg-yellow-50 border-yellow-300',text: 'text-yellow-700', label: 'Investigational Only' },
  NOT_ACTIONABLE:       { bg: 'bg-gray-50 border-gray-300',    text: 'text-gray-600',   label: 'Not Actionable' },
}

interface Props { data: AnalyzeResponse; onReset: () => void }

// Extracts the best single brand name for DailyMed search
function getDrugSearchTerm(drugName: string): string {
  const brandMatch = drugName.match(/\(([^)]+)\)/)
  if (brandMatch?.[1]) {
    return brandMatch[1].split(/[\/+]/)[0].trim()
  }
  return drugName.split('(')[0].trim().split(/[\/+]/)[0].trim()
}

// Returns a direct FDA Drugs@FDA URL using NDA/BLA number if available, else brand name search
function getFDAUrl(drugName: string, source: string | null | undefined): string {
  const appMatch = source?.match(/(?:NDA|BLA)\s*(\d+)/i)
  if (appMatch) {
    return `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${appMatch[1]}`
  }
  const term = getDrugSearchTerm(drugName)
  return `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=BasicSearch.process&searchTerm=${encodeURIComponent(term)}`
}

// Returns false for medical procedures/devices that have no drug package label
const NON_DRUG_TERMS = ['phlebotomy', 'icd', 'implantable cardioverter', 'beta-blocker', 'investigational']
function isDrugLinkable(drugName: string): boolean {
  const lower = drugName.toLowerCase()
  return !NON_DRUG_TERMS.some(term => lower.includes(term))
}

const UNCERTAIN_CLASSIFICATIONS = ['uncertain', 'benign', 'likely benign', 'vus']
function isUncertainClassification(classification: string): boolean {
  const lower = classification.toLowerCase()
  return UNCERTAIN_CLASSIFICATIONS.some(t => lower.includes(t))
}

// ─── ClinVar pathogenicity badge ────────────────────────────────────────────────────
function ClinVarBadge({ classification, clinvarId }: { classification: string; clinvarId: string | null }) {
  const lower = classification.toLowerCase()
  let cls = 'bg-gray-100 border-gray-300 text-gray-600'
  let icon = '❓'
  if (lower.includes('pathogenic') && !lower.includes('likely') && !lower.includes('benign')) {
    cls = 'bg-red-100 border-red-300 text-red-700'; icon = '⚠️'
  } else if (lower.includes('likely pathogenic')) {
    cls = 'bg-orange-100 border-orange-300 text-orange-700'; icon = '⚠️'
  } else if (lower.includes('uncertain') || lower.includes('vus') || lower.includes('conflicting')) {
    cls = 'bg-yellow-100 border-yellow-300 text-yellow-700'; icon = '⚠️'
  } else if (lower.includes('likely benign')) {
    cls = 'bg-blue-100 border-blue-300 text-blue-700'; icon = '✅'
  } else if (lower.includes('benign')) {
    cls = 'bg-green-100 border-green-300 text-green-700'; icon = '✅'
  }
  const badge = (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${cls}`}>
      <span>{icon}</span>
      <span>ClinVar: {classification}</span>
    </span>
  )
  if (clinvarId) {
    return (
      <a
        href={`https://www.ncbi.nlm.nih.gov/clinvar/variation/${clinvarId}`}
        target="_blank" rel="noopener noreferrer"
        className="hover:opacity-80 transition-opacity"
        title={`ClinVar variation ${clinvarId}`}
      >
        {badge}
      </a>
    )
  }
  return badge
}

// ─── gnomAD allele frequency badge ─────────────────────────────────────────────────
function GnomADBadge({ af, url }: { af: number | null; url?: string | null }) {
  let label: string
  let cls: string
  if (af === null) {
    label = 'AF: Not in gnomAD'; cls = 'bg-gray-100 border-gray-300 text-gray-500'
  } else if (af > 0.01) {
    label = `AF: ${af.toFixed(4)} — Common`; cls = 'bg-green-100 border-green-300 text-green-700'
  } else if (af > 0.001) {
    label = `AF: ${af.toFixed(5)} — Rare`; cls = 'bg-blue-100 border-blue-300 text-blue-700'
  } else if (af > 0.0001) {
    label = `AF: ${af.toFixed(6)} — Very Rare`; cls = 'bg-orange-100 border-orange-300 text-orange-700'
  } else {
    label = `AF: ${af.toExponential(2)} — Ultra-Rare`; cls = 'bg-red-100 border-red-300 text-red-700'
  }
  const badge = (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${cls}`}>
      <span>gnomAD {label}</span>
    </span>
  )
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
         className="hover:opacity-80 transition-opacity" title="View on gnomAD">
        {badge} <span className="text-xs text-brand-500">↗</span>
      </a>
    )
  }
  return badge
}

function ActionPlanCard({ plan, gene }: { plan: ActionPlan; gene: string }) {
  const config = {
    green: { bg: 'bg-green-50 border-green-300',  icon: '🟢', label: 'FDA-Approved Treatment Available' },
    amber: { bg: 'bg-amber-50 border-amber-300',  icon: '🟡', label: 'Clinical Trials Available' },
    red:   { bg: 'bg-red-50 border-red-200',       icon: '🔴', label: 'No Matched Therapy Found' },
  }[plan.status]
  return (
    <div className={`rounded-xl border-2 p-4 ${config.bg}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{config.icon}</span>
        <h3 className="font-bold text-gray-900 text-sm tracking-wide">{config.label} — {gene}</h3>
      </div>
      <ol className="space-y-2.5">
        {plan.bullets.map((b, i) => (
          <li key={i} className="flex gap-3">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest w-24 shrink-0 pt-0.5">{b.label}</span>
            <span className="text-sm text-gray-800 leading-relaxed">
              {b.text}
              {b.url && (
                <a href={b.url} target="_blank" rel="noopener noreferrer"
                   className="ml-1 text-brand-600 hover:underline text-xs">
                  View ↗
                </a>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function ResultsPanel({ data, onReset }: Props) {
  const [view, setView] = useState<'patient' | 'clinician'>('patient')
  const status = STATUS_STYLES[data.overall_status] || STATUS_STYLES.NOT_ACTIONABLE

  return (
    <div className="space-y-6">
      {/* Action Plan — always first */}
      {data.action_plan && (
        <ActionPlanCard plan={data.action_plan} gene={data.gene} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {data.gene} {data.hgvs}
          </h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${status.bg} ${status.text}`}>
              {status.label}
            </span>
            <ConfidenceBadge confidence={data.tier0.confidence} stars={data.tier0.review_stars} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Patient / Clinician toggle */}
          <div className="no-print flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            <button
              className={`px-3 py-1.5 transition ${view === 'patient' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              onClick={() => setView('patient')}
            >Patient</button>
            <button
              className={`px-3 py-1.5 transition ${view === 'clinician' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              onClick={() => setView('clinician')}
            >Clinician</button>
          </div>
          <button
            onClick={() => window.print()}
            className="no-print text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-1"
          >
            ↓ PDF
          </button>
          <button onClick={onReset} className="no-print text-xs text-gray-400 hover:text-gray-600 underline">
            New search
          </button>
        </div>
      </div>

      {/* Patient summary */}
      {view === 'patient' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-gray-800 leading-relaxed">{data.patient_summary}</p>
          {data.patient_next_steps.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-bold text-gray-700 mb-2">What you can do next:</h3>
              <ol className="space-y-2">
                {data.patient_next_steps.map((step, i) => (
                  <li key={i} className="text-sm text-gray-700 leading-relaxed">{step}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Clinician notes */}
      {view === 'clinician' && data.clinician_notes.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-2">Technical Details</h3>
          <ul className="space-y-1">
            {data.clinician_notes.map((note, i) => (
              <li key={i} className="text-xs font-mono text-gray-600">{note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tier 0 */}
      <TierSection title="Variant Interpretation" icon="🔬" count={null}>
        {data.hgvs === 'unknown' && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            No specific variant provided — showing gene-level results. Enter a mutation (e.g. c.5946del) for variant-specific ClinVar evidence.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {/* ClinVar + gnomAD badges span full width */}
          <div className="col-span-2 flex items-center gap-2 flex-wrap">
            <ClinVarBadge
              classification={data.tier0.classification}
              clinvarId={data.tier0.clinvar_id}
            />
            <GnomADBadge af={data.tier0.gnomad_af} url={data.tier0.gnomad_url} />
          </div>
          {data.hgvs !== 'unknown' && (
            <InfoRow label="Evidence" value={
              <span title={data.tier0.review_status}>
                {Array.from({ length: 4 }, (_, i) => (
                  <span key={i} className={i < data.tier0.review_stars ? 'text-yellow-400' : 'text-gray-200'}>★</span>
                ))}
                <span className="text-xs text-gray-400 ml-1">({data.tier0.review_status})</span>
              </span>
            } />
          )}
          {data.tier0.clinvar_id && (
            <InfoRow label="ClinVar ID" value={
              <a href={`https://www.ncbi.nlm.nih.gov/clinvar/variation/${data.tier0.clinvar_id}`}
                 target="_blank" rel="noopener noreferrer"
                 className="text-brand-600 hover:underline">
                {data.tier0.clinvar_id}
              </a>
            } />
          )}
          {data.tier0.clingen_note && (
            <div className="col-span-2">
              <InfoRow label="ClinGen" value={data.tier0.clingen_note} />
            </div>
          )}
        </div>
      </TierSection>

      {/* Tier 1 — Approved Therapies */}
      <TierSection title="FDA-Approved Therapies" icon="💊" count={data.tier1.drugs.length}>
        {/* Pathogenicity gate warning */}
        {data.tier1.drugs.length > 0 && isUncertainClassification(data.tier0.classification) && (
          <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            ⚠ Your variant is classified as <strong>{data.tier0.classification}</strong>.
            Therapies shown are associated with the <strong>{data.gene}</strong> gene broadly —
            confirm with a genetic counselor whether they apply to your specific variant.
          </div>
        )}
        {data.tier1.drugs.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">No curated FDA therapy data exists for this variant.</p>
            <a
              href={`https://platform.opentargets.org/search?q=${encodeURIComponent(data.gene)}&entityNames=target`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center text-xs text-brand-600 hover:underline"
            >
              Explore gene-level drug associations on OpenTargets ↗
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {data.tier1.drugs.map((drug, i) => {
              const linkable = drug.fda_approved && isDrugLinkable(drug.drug_name)
              const fdaUrl = getFDAUrl(drug.drug_name, drug.source)
              return (
              <div key={i} className="border border-gray-200 rounded-lg p-3 bg-white">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  {linkable ? (
                    <a
                      href={fdaUrl}
                      target="_blank" rel="noopener noreferrer"
                      className="text-sm font-bold text-brand-700 hover:underline"
                    >
                      {drug.drug_name} ↗
                    </a>
                  ) : (
                    <span className="text-sm font-bold text-brand-700">{drug.drug_name}</span>
                  )}
                  <div className="flex gap-1.5 flex-wrap">
                    {drug.fda_approved && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        FDA Approved{drug.approval_year ? ` ${drug.approval_year}` : ''}
                      </span>
                    )}
                    {drug.line && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        {drug.line}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{drug.action}</p>
                {drug.caveat && (
                  <p className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1 mt-2">
                    ⚠ {drug.caveat}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Source: {drug.source || 'OpenFDA'}{' '}
                  {linkable && (
                    <a
                      href={fdaUrl}
                      target="_blank" rel="noopener noreferrer"
                      className="text-brand-500 hover:underline ml-1"
                    >
                      FDA Drugs@FDA ↗
                    </a>
                  )}
                </p>
              </div>
              )
            })}
          </div>
        )}
        {data.tier1.surveillance.length > 0 && (
          <div className="mt-3 space-y-2">
            <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide">Surveillance & Guidelines</h4>
            {data.tier1.surveillance.map((s, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3 bg-white">
                <p className="text-xs text-gray-700 leading-relaxed">{s.recommendation}</p>
                {view === 'clinician' && s.source && (
                  <p className="text-xs text-gray-400 mt-1">Source: {s.source}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </TierSection>

      {/* Tier 2 — Clinical Trials */}
      <TierSection title="Recruiting Clinical Trials" icon="🏥"
        count={data.tier2.trials.length}
        subtitle="Confirm eligibility with your care team"
      >
        {data.tier2.trials.length === 0 ? (
          <p className="text-sm text-gray-500">No matching recruiting trials found at this time.</p>
        ) : (
          <div className="space-y-3">
            {data.tier2.trials.map((trial, i) => (
              <TrialCard key={i} trial={trial} gene={data.gene} />
            ))}
          </div>
        )}
        {(data.tier2.total_ineligible ?? 0) > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            {data.tier2.total_ineligible} additional trial{data.tier2.total_ineligible === 1 ? '' : 's'} not shown — age or sex outside eligibility range.
          </p>
        )}
        {data.tier2.see_more_url && (data.tier2.total_eligible ?? 0) > 10 && (
          <div className="mt-3 text-center">
            <a href={data.tier2.see_more_url} target="_blank" rel="noopener noreferrer"
               className="text-xs text-brand-600 hover:underline">
              See {(data.tier2.total_eligible ?? 0) - 10} more interventional trial{((data.tier2.total_eligible ?? 0) - 10) === 1 ? '' : 's'} on ClinicalTrials.gov ↗
            </a>
          </div>
        )}
      </TierSection>

      {/* Disclaimer */}
      <p className="text-xs text-gray-400 border-t pt-4 leading-relaxed">
        This information is for educational purposes only and does not constitute medical advice.
        Always consult a qualified healthcare provider before making any medical decisions.
        Clinical trial eligibility must be confirmed directly with the trial team.
      </p>
    </div>
  )
}

function TierSection({
  title, icon, count, subtitle, children, defaultOpen = true
}: {
  title: string; icon: string; count: number | null; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="font-semibold text-sm text-gray-800">{title}</span>
          {count !== null && (
            <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">
              {count}
            </span>
          )}
          {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 font-medium">{label}</dt>
      <dd className="text-sm text-gray-800 mt-0.5">{value}</dd>
    </div>
  )
}

function EnrichmentSection({ enrichment }: { enrichment: EnrichmentResult }) {
  const hasData =
    enrichment.omim?.mim_number ||
    enrichment.orphan?.rare_diseases?.length > 0 ||
    enrichment.orphan?.orphan_drugs?.length > 0 ||
    enrichment.broad_hub_drugs?.length > 0 ||
    enrichment.ddi_flags?.length > 0

  if (!hasData) return null

  return (
    <TierSection title="Enrichment (Biomni Datalake)" icon="🗄️" count={null} defaultOpen={false}>
      <div className="space-y-4">

        {/* DDI Safety Flags — shown first as warnings */}
        {enrichment.ddi_flags?.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">Drug-Drug Interaction Warnings</h4>
            <div className="space-y-1.5">
              {enrichment.ddi_flags.map((flag, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                  flag.level.toLowerCase() === 'major'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  <span className="font-bold">{flag.level.toUpperCase()}</span>
                  <span>{flag.drug_a} + {flag.drug_b}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OMIM */}
        {enrichment.omim?.mim_number && (
          <div>
            <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">OMIM</h4>
            <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs space-y-1">
              <div className="flex gap-2">
                <span className="text-gray-400">MIM:</span>
                <a
                  href={`https://omim.org/entry/${enrichment.omim.mim_number}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-brand-600 hover:underline font-medium"
                >
                  {enrichment.omim.mim_number}
                </a>
                {enrichment.omim.gene_name && (
                  <span className="text-gray-600">— {enrichment.omim.gene_name}</span>
                )}
              </div>
              {enrichment.omim.phenotypes?.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {enrichment.omim.phenotypes.map((ph, i) => (
                    <li key={i} className="text-gray-600">• {ph}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Orphan Diseases & Drugs */}
        {(enrichment.orphan?.rare_diseases?.length > 0 || enrichment.orphan?.orphan_drugs?.length > 0) && (
          <div>
            <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Rare / Orphan Diseases</h4>
            {enrichment.orphan.rare_diseases?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {enrichment.orphan.rare_diseases.map((d, i) => (
                  <span key={i} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full capitalize">
                    {d}
                  </span>
                ))}
              </div>
            )}
            {enrichment.orphan.orphan_drugs?.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Drugs with orphan indication for this gene:</p>
                <div className="space-y-1">
                  {enrichment.orphan.orphan_drugs.map((od, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-white border border-gray-200 rounded px-3 py-1.5">
                      <span className="font-medium text-gray-800">{od.drug}</span>
                      <span className="text-gray-400">→</span>
                      <span className="text-gray-600 capitalize">{od.indication}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Broad Hub Drug Repurposing */}
        {enrichment.broad_hub_drugs?.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Drug Repurposing Candidates (Broad Hub)</h4>
            <div className="space-y-1.5">
              {enrichment.broad_hub_drugs.map((d, i) => (
                <div key={i} className="text-xs bg-white border border-gray-200 rounded px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-800">{d.drug_name}</span>
                    <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{d.clinical_phase}</span>
                    {d.disease_area && d.disease_area !== 'None' && (
                      <span className="text-gray-500">{d.disease_area}</span>
                    )}
                  </div>
                  {d.moa && d.moa !== 'None' && (
                    <p className="text-gray-500 mt-0.5">{d.moa}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </TierSection>
  )
}
