import type { TrialResult } from '../../types'
import React, { useState } from 'react'

const ELIGIBILITY_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  ELIGIBLE:           { bg: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-700',  label: 'Eligible' },
  LIKELY_ELIGIBLE:    { bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-700',   label: 'Likely Eligible' },
  CHECK_WITH_DOCTOR:  { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', label: 'Check with Doctor' },
  INELIGIBLE:         { bg: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-700',    label: 'Ineligible' },
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
  const [detailsOpen, setDetailsOpen] = useState(false)
  const style = ELIGIBILITY_STYLES[trial.eligibility_overall] || ELIGIBILITY_STYLES.CHECK_WITH_DOCTOR

  const isPositive = trial.eligibility_overall === 'ELIGIBLE' || trial.eligibility_overall === 'LIKELY_ELIGIBLE'

  // Only show critical issues inline (NOT_MET or WARNING, non-exclusion)
  const criticalChecks = trial.criterion_checks.filter(
    c => !c.isExclusion && (c.status === 'NOT_MET' || c.status === 'WARNING')
  )
  const exclusionChecks = trial.criterion_checks.filter(c => c.isExclusion)
  const allChecks = trial.criterion_checks

  // Cap interventions at 3 visible
  const MAX_IV = 3
  const visibleIV = trial.interventions.slice(0, MAX_IV)
  const extraIV = trial.interventions.length - MAX_IV

  const hasInclusion = trial.inclusion_bullets.length > 0
  const hasExclusion = trial.exclusion_bullets.length > 0
  const hasDetails = allChecks.length > 0 || hasInclusion || hasExclusion

  return (
    <div className={`border ${style.border} rounded-xl p-4 ${style.bg}`}>
      {/* Row 1 — Status + phase + NCT */}
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

      {/* Row 2 — Title */}
      <h4 className="text-sm font-semibold text-gray-800 leading-snug mb-2">
        {trial.title.length > 100 ? trial.title.slice(0, 100) + '…' : trial.title}
      </h4>

      {/* Row 3 — Plain-language summary */}
      {trial.eligibility_plain && (
        <p className="text-xs text-gray-600 mb-3 leading-relaxed">{trial.eligibility_plain}</p>
      )}

      {/* Row 4 — Top interventions (capped at 3) */}
      {visibleIV.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {visibleIV.map((iv, i) => (
            <span key={i} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded">
              {iv}
            </span>
          ))}
          {extraIV > 0 && (
            <span className="text-xs text-gray-400 px-1 py-0.5">+{extraIV} more</span>
          )}
        </div>
      )}

      {/* Row 5 — Critical inline warnings (NOT_MET / WARNING only) */}
      {criticalChecks.length > 0 && (
        <div className="mb-3 space-y-1">
          {criticalChecks.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
              <span className="font-bold">✗</span>
              <span><span className="font-medium">{c.criterion}:</span> {c.explanation}</span>
            </div>
          ))}
        </div>
      )}

      {/* Row 6 — Exclusion flags */}
      {exclusionChecks.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {exclusionChecks.map((c, i) => (
            <span key={i} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
              ⚠ {c.criterion}
            </span>
          ))}
        </div>
      )}

      {/* Row 7 — Patient nudge + action links */}
      <div className="flex items-center gap-3 flex-wrap border-t border-gray-200 pt-3 mt-1">
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
        {isPositive && (
          <span className="text-xs text-green-700 ml-auto">
            Bring this to your next doctor visit
          </span>
        )}
      </div>

      {/* Row 8 — Collapsed doctor details */}
      {hasDetails && (
        <div className="mt-3 border-t border-gray-200 pt-2">
          <button
            onClick={() => setDetailsOpen(v => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer w-full text-left"
          >
            {detailsOpen ? '▲' : '▼'} Details for your doctor
          </button>
          {detailsOpen && (
            <div className="mt-2 space-y-3">
              {/* All structured checks */}
              {allChecks.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Eligibility Check</p>
                  <ul className="space-y-1">
                    {allChecks.map((c, i) => {
                      const icon = c.status === 'MET' ? '✓' : c.status === 'NOT_MET' ? '✗' : c.status === 'WARNING' ? '!' : '?'
                      const color = c.status === 'MET' ? 'text-green-600' : c.status === 'NOT_MET' ? 'text-red-600' : c.status === 'WARNING' ? 'text-yellow-600' : 'text-gray-400'
                      return (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <span className={`font-bold mt-0.5 flex-shrink-0 ${color}`}>{icon}</span>
                          <div>
                            <span className="font-medium text-gray-700">{c.criterion}:</span>{' '}
                            <span className="text-gray-500">{c.explanation}</span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* Full inclusion/exclusion criteria */}
              {(hasInclusion || hasExclusion) && (
                <div className="space-y-3 border-t border-gray-100 pt-2">
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
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

