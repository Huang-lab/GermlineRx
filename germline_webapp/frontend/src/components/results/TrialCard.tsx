import type { TrialResult } from '../../types'

const ELIGIBILITY_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  ELIGIBLE:           { bg: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-700',  label: 'Eligible' },
  LIKELY_ELIGIBLE:    { bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-700',   label: 'Likely Eligible' },
  CHECK_WITH_DOCTOR:  { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', label: 'Check with Doctor' },
  INELIGIBLE:         { bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-700',    label: 'Ineligible' },
}

interface Props { trial: TrialResult }

export default function TrialCard({ trial }: Props) {
  const style = ELIGIBILITY_STYLES[trial.eligibility_overall] || ELIGIBILITY_STYLES.CHECK_WITH_DOCTOR
  const hasInclusion = trial.inclusion_bullets.length > 0
  const hasExclusion = trial.exclusion_bullets.length > 0

  return (
    <div className={`border ${style.border} rounded-xl p-4 ${style.bg}`}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${style.border} ${style.bg} ${style.text}`}>
          {style.label}
        </span>
        {trial.phase && trial.phase !== 'NA' && (
          <span className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
            {trial.phase}
          </span>
        )}
        <span className="text-xs text-gray-400 font-mono ml-auto">{trial.nct_id}</span>
      </div>

      <h4 className="text-sm font-semibold text-gray-800 leading-snug mb-1">{trial.title}</h4>

      {/* Interventions */}
      {trial.interventions.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {trial.interventions.map((iv, i) => (
            <span key={i} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded">
              {iv}
            </span>
          ))}
        </div>
      )}

      {/* Eligibility criteria — always visible bullet points */}
      {(hasInclusion || hasExclusion) && (
        <div className="mt-2 space-y-3">
          {hasInclusion && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Inclusion Criteria</p>
              <ul className="space-y-1">
                {trial.inclusion_bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                    <span className="mt-0.5 text-green-500 font-bold flex-shrink-0">•</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasExclusion && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Exclusion Criteria</p>
              <ul className="space-y-1">
                {trial.exclusion_bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-500">
                    <span className="mt-0.5 text-red-400 font-bold flex-shrink-0">•</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center gap-3 flex-wrap border-t border-gray-200 pt-2">
        <a
          href={trial.url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-brand-600 hover:underline font-medium"
        >
          View on ClinicalTrials.gov →
        </a>
        {trial.contact_email && (
          <a href={`mailto:${trial.contact_email}`} className="text-xs text-gray-500 hover:underline">
            Contact trial team
          </a>
        )}
      </div>
    </div>
  )
}
