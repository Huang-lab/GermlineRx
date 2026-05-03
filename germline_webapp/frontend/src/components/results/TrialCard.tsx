import type { TrialResult } from '../../types'
import React from 'react'

const ELIGIBILITY_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  ELIGIBLE:           { bg: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-700',  label: 'Eligible' },
  LIKELY_ELIGIBLE:    { bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-700',   label: 'Likely Eligible' },
  CHECK_WITH_DOCTOR:  { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', label: 'Check with Doctor' },
  INELIGIBLE:         { bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-700',    label: 'Ineligible' },
}

const STATUS_ICONS: Record<string, string> = {
  MET:     '✓',
  NOT_MET: '✗',
  UNKNOWN: '?',
  WARNING: '!',
}
const STATUS_COLORS: Record<string, string> = {
  MET:     'text-green-600',
  NOT_MET: 'text-red-600',
  UNKNOWN: 'text-gray-400',
  WARNING: 'text-yellow-600',
}

interface Props { trial: TrialResult; gene?: string }

function highlightGene(text: string, gene?: string): React.ReactNode {
  if (!gene) return text
  const regex = new RegExp(`(\\b${gene}\\b)`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    regex.test(part) ? <strong key={i} className="text-brand-700">{part}</strong> : part
  )
}

export default function TrialCard({ trial, gene }: Props) {
  const style = ELIGIBILITY_STYLES[trial.eligibility_overall] || ELIGIBILITY_STYLES.CHECK_WITH_DOCTOR
  const hasInclusion = trial.inclusion_bullets.length > 0
  const hasExclusion = trial.exclusion_bullets.length > 0
  const structuredChecks = trial.criterion_checks.filter(c => !c.isExclusion)

  return (
    <div className={`border ${style.border} rounded-xl p-4 ${style.bg}`}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${style.border} ${style.bg} ${style.text}`}>
          {style.label}
        </span>
        {trial.phase && trial.phase !== 'NA' && trial.phase.trim() && (
          <span className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
            {trial.phase}
          </span>
        )}
        <span className="text-xs text-gray-400 font-mono ml-auto">{trial.nct_id}</span>
      </div>

      <h4 className="text-sm font-semibold text-gray-800 leading-snug mb-1">
        {trial.title.length > 120 ? trial.title.slice(0, 120) + '…' : trial.title}
      </h4>

      {/* Plain-language eligibility summary */}
      {trial.eligibility_plain && (
        <p className="text-xs text-gray-500 italic mb-2 leading-relaxed">{trial.eligibility_plain}</p>
      )}

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

      {/* Eligibility judgment — structured checks */}
      {structuredChecks.length > 0 && (
        <div className="mb-3 bg-white/70 rounded-lg px-3 py-2 border border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Eligibility Check</p>
          <ul className="space-y-1">
            {structuredChecks.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className={`font-bold mt-0.5 flex-shrink-0 ${STATUS_COLORS[c.status]}`}>
                  {STATUS_ICONS[c.status]}
                </span>
                <div>
                  <span className="font-medium text-gray-700">{c.criterion}:</span>{' '}
                  <span className="text-gray-500">{c.explanation}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {trial.criterion_checks.filter(c => c.isExclusion).length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Possible Exclusions to Discuss</p>
          <div className="flex flex-wrap gap-1.5">
            {trial.criterion_checks.filter(c => c.isExclusion).map((c, i) => (
              <span key={i} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-full">
                ⚠ {c.criterion}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Full criteria — bullet points from ClinicalTrials.gov */}
      {(hasInclusion || hasExclusion) && (
        <details className="mt-2">
          <summary className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">
            Show full eligibility criteria (for your doctor)
          </summary>
          <div className="mt-2 space-y-3 border-t border-gray-200 pt-2">
            {hasInclusion && (
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Inclusion Criteria</p>
                <ul className="space-y-1">
                  {trial.inclusion_bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                      <span className="mt-0.5 text-green-500 font-bold flex-shrink-0">•</span>
                      {highlightGene(b, gene)}
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
                      {highlightGene(b, gene)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center gap-3 flex-wrap border-t border-gray-200 pt-2">
        <a
          href={trial.url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-brand-600 hover:underline font-medium"
        >
          View on ClinicalTrials.gov →
        </a>
        {(trial.contact_email || trial.contact_phone || trial.contact_name) && (
          <a
            href={trial.contact_email ? `mailto:${trial.contact_email}` : trial.url}
            target={trial.contact_email ? undefined : '_blank'}
            rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:underline"
          >
            Contact trial team
          </a>
        )}
      </div>
    </div>
  )
}
