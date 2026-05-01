import { useState, useEffect, useRef } from 'react'
import { normalizeVariant } from '../../utils/api'
import type { NormalizeResponse } from '../../types'
import SexSelector from './SexSelector'

// Gene suggestions for autocomplete
const GENE_SUGGESTIONS = [
  'CFTR', 'DMD', 'SOD1', 'SMN1', 'BRCA1', 'BRCA2', 'MLH1', 'MSH2', 'MSH6',
  'TTR', 'HBB', 'LDLR', 'MYBPC3', 'MYH7', 'HTT', 'FXN', 'GBA', 'F8', 'F9',
  'NF1', 'VHL', 'RET', 'TP53', 'PALB2', 'ATM', 'CHEK2', 'PMS2',
  'TSC1', 'TSC2', 'PTEN', 'APC', 'FBN1', 'PKD1', 'PKD2', 'HFE', 'ATP7B',
  'KCNQ1', 'KCNH2', 'SCN5A', 'LMNA', 'PKP2', 'COL3A1', 'RB1', 'STK11',
  'CDH1', 'HNF1A', 'GCK', 'PCSK9', 'APOE', 'LRRK2',
]

interface Props {
  onAnalyze: (gene: string, hgvs: string, disease: string, age: number | null, fc: string | null, sex: string | null) => void
  loading: boolean
}

export default function ManualEntry({ onAnalyze, loading }: Props) {
  const [conditionText, setConditionText] = useState('')
  const [mutationText, setMutationText] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<string>('')
  const [normalized, setNormalized] = useState<NormalizeResponse | null>(null)
  const [normalizing, setNormalizing] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filteredGenes = conditionText.length >= 1
    ? GENE_SUGGESTIONS.filter(g => g.toLowerCase().startsWith(conditionText.toUpperCase().trim()))
    : []

  useEffect(() => {
    if (!conditionText.trim()) { setNormalized(null); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setNormalizing(true)
      try {
        const result = await normalizeVariant(conditionText, mutationText)
        setNormalized(result)
      } catch { setNormalized(null) }
      finally { setNormalizing(false) }
    }, 600)
  }, [mutationText, conditionText])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!normalized || normalized.gene === 'UNKNOWN') return
    onAnalyze(
      normalized.gene,
      normalized.hgvs,
      conditionText,
      age !== '' ? parseInt(age) : null,
      normalized.functional_class,
      sex !== '' ? sex : null,
    )
  }

  const confidenceColor = (c: string) =>
    c === 'HIGH' ? 'text-green-600' : c === 'MODERATE' ? 'text-yellow-600' : 'text-red-500'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Condition / Gene free-text */}
      <div className="relative">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          1. Your condition or gene
        </label>
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="e.g. Cystic Fibrosis, CFTR, BRCA2, sickle cell disease…"
          value={conditionText}
          onChange={e => { setConditionText(e.target.value); setShowSuggestions(true) }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onFocus={() => setShowSuggestions(true)}
          autoComplete="off"
        />
        <p className="text-xs text-gray-400 mt-1">
          Type a disease name, gene symbol, or any description from your genetic report.
        </p>
        {/* Gene autocomplete dropdown */}
        {showSuggestions && filteredGenes.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-md max-h-44 overflow-y-auto">
            {filteredGenes.map(gene => (
              <li key={gene}>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700"
                  onMouseDown={() => { setConditionText(gene); setShowSuggestions(false) }}
                >
                  {gene}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mutation input */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          2. Your mutation or variant <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          type="text"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="e.g. F508del, c.1521_1523del, V30M, Exon 50 deletion, HbS…"
          value={mutationText}
          onChange={e => setMutationText(e.target.value)}
        />
        <p className="text-xs text-gray-400 mt-1">
          Any format works — protein notation, HGVS, common name, or rsID. Leave blank to search by gene only.
        </p>

        {/* Real-time normalization feedback */}
        {normalizing && (
          <p className="text-xs text-gray-400 mt-1.5 animate-pulse">Recognizing mutation...</p>
        )}
        {normalized && !normalizing && (
          <div className={`mt-1.5 text-xs rounded-md px-3 py-1.5 ${
            normalized.gene !== 'UNKNOWN'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {normalized.gene !== 'UNKNOWN' ? (
              <>
                <span className="font-semibold">Recognized:</span>{' '}
                {normalized.gene} {normalized.display_mutation} → HGVS: {normalized.hgvs}
                {normalized.functional_class && (
                  <span className="ml-2 text-gray-500">({normalized.functional_class})</span>
                )}
                <span className={`ml-2 font-semibold ${confidenceColor(normalized.confidence)}`}>
                  {normalized.confidence}
                </span>
                {normalized.note && (
                  <span className="ml-2 text-gray-500 italic">{normalized.note}</span>
                )}
              </>
            ) : (
              <span>{normalized.note || 'Mutation not recognized. Try a different format or gene symbol.'}</span>
            )}
          </div>
        )}
      </div>

      {/* Age */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          3. Age <span className="font-normal text-gray-400">(optional — used for trial matching)</span>
        </label>
        <input
          type="number" min="0" max="120"
          className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="e.g. 24"
          value={age}
          onChange={e => setAge(e.target.value)}
        />
      </div>

      <SexSelector value={sex} onChange={setSex} />

      <button
        type="submit"
        disabled={loading || !normalized || normalized.gene === 'UNKNOWN'}
        className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-lg transition text-sm"
      >
        {loading ? 'Analyzing...' : 'Find Therapies & Trials'}
      </button>
    </form>
  )
}
