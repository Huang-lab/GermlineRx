import { useState } from 'react'
import type { TrialResult } from '../../types'

const ELIGIBILITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ELIGIBLE:           { bg: 'bg-green-50 border-green-300',  text: 'text-green-700',  label: 'Eligible' },
  LIKELY_ELIGIBLE:    { bg: 'bg-blue-50 border-blue-300',    text: 'text-blue-700',   label: 'Likely Eligible' },
  CHECK_WITH_DOCTOR:  { bg: 'bg-yellow-50 border-yellow-300',text: 'text-yellow-700', label: 'Check with Doctor' },
  INELIGIBLE:         { bg: 'bg-red-50 border-red-300',      text: 'text-red-700',    label: 'Ineligible' },
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

interface Props { trial: TrialResult }

export default function TrialCard({ trial }: Props) {
  const [expanded, setExpanded] = useState(false)
  const style = ELIGIBILITY_STYLES[trial.eligibility_overall] || ELIGIBILITY_STYLES.CHECK_WITH_DOCTOR

  return (
    <div className={`border rounded-xl p-4 ${style.bg} transition`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${style.bg} ${style.text}`}>
              {style.label}
            </span>
            {trial.phase && (
              <span className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                {trial.phase}
              </span>
            )}
            <span className="text-xs text-gray-400 font-mono">{trial.nct_id}</span>
          </div>
          <h4 className="text-sm font-semibold text-gray-800 leading-snug">{trial.title}</h4>
          <p className="text-xs text-gray-600 mt-1">{trial.eligibility_plain}</p>
        </div>
      </div>

      {/* Interventions */}
      {trial.interventions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {trial.interventions.map((iv, i) => (
            <span key={i} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded">
              {iv}
            </span>
          ))}
        </div>
      )}

      {/* Expandable criteria */}
      {trial.criterion_checks.length > 0 && (
        <div className="mt-3">
          <button
            className="text-xs text-brand-600 hover:underline font-medium"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Hide' : 'Show'} eligibility criteria ({trial.criterion_checks.length})
          </button>
          {expanded && (
            <ul className="mt-2 space-y-1">
              {trial.criterion_checks.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className={`font-bold mt-0.5 ${STATUS_COLORS[c.status]}`}>
                    {STATUS_ICONS[c.status]}
                  </span>
                  <div>
                    <span className="font-medium text-gray-700">{c.criterion}:</span>{' '}
                    <span className="text-gray-500">{c.explanation}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Footer links */}
      <div className="mt-3 flex items-center gap-3 flex-wrap">
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
