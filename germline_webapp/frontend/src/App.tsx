import { useState } from 'react'
import ManualEntry from './components/input/ManualEntry'
import FileUpload from './components/input/FileUpload'
import ResultsPanel from './components/results/ResultsPanel'
import { analyzeVariant } from './utils/api'
import { staticAnalyze } from './static-mode/staticEngine'
import type { AnalyzeResponse } from './types'

const STATIC_MODE = import.meta.env.VITE_STATIC_MODE === 'true'

type Tab = 'manual' | 'upload'

function DisclaimerModal({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
        <div className="text-center mb-6">
          <span className="text-4xl">🧬</span>
          <h2 className="text-xl font-bold text-gray-900 mt-3">GermlineRx</h2>
          <p className="text-sm text-gray-500">Genetic Therapy & Trial Matcher</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-900 leading-relaxed">
          <p className="font-semibold mb-1">Important Notice</p>
          <p>
            GermlineRx provides information for <strong>educational and research purposes only</strong>.
            It is not a substitute for advice from a qualified healthcare professional.
            Do not make medical decisions based solely on these results.
          </p>
          <p className="mt-2">
            Always consult a genetic counselor, physician, or specialist before taking any action
            based on information displayed here.
          </p>
        </div>
        <button
          onClick={onAccept}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition"
        >
          I understand — Continue
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false)
  const [tab, setTab] = useState<Tab>('manual')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<AnalyzeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async (
    gene: string, hgvs: string, disease: string,
    age: number | null, fc: string | null, sex?: string | null
  ) => {
    setLoading(true); setError(null); setResults(null)
    try {
      const data = STATIC_MODE
        ? await staticAnalyze(gene, hgvs, disease, age, fc, sex)
        : await analyzeVariant(gene, hgvs, disease, age, fc)
      setResults(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleVariantFromUpload = (gene: string, hgvs: string, disease: string) => {
    handleAnalyze(gene, hgvs, disease, null, null, null)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {!disclaimerAccepted && <DisclaimerModal onAccept={() => setDisclaimerAccepted(true)} />}
      {/* Nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {results && (
              <button
                onClick={() => setResults(null)}
                className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium transition"
              >
                ← New Search
              </button>
            )}
            <button
              onClick={() => setResults(null)}
              className="flex items-center gap-2 hover:opacity-80 transition"
            >
              <span className="text-2xl">🧬</span>
              <div className="text-left">
                <h1 className="text-lg font-bold text-gray-900 leading-none">GermlineRx</h1>
                <p className="text-xs text-gray-400">Genetic Therapy & Trial Matcher</p>
              </div>
            </button>
          </div>
          <div className="flex items-center gap-4">
            {results && (
              <span className="text-xs text-gray-500 hidden sm:block">
                {results.gene} {results.hgvs}
              </span>
            )}
            {!STATIC_MODE && (
              <a
                href="http://localhost:8000/docs"
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-brand-600 hover:underline"
              >
                API Docs
              </a>
            )}
            {STATIC_MODE && (
              <a
                href="https://huggingface.co/spaces/Rita9CoreX/germline-rx"
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-brand-600 hover:underline"
              >
                Full version ↗
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {!results ? (
          <div className="max-w-xl mx-auto">
            {/* Hero */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Find treatments matched to your mutation
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Enter your genetic variant to instantly see FDA-approved therapies,
                recruiting clinical trials you may qualify for, and emerging research programs.
              </p>
            </div>

            {/* Input card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-gray-200">
                <button
                  className={`flex-1 py-3 text-sm font-medium transition ${
                    tab === 'manual'
                      ? 'text-brand-600 border-b-2 border-brand-600 bg-white'
                      : 'text-gray-500 hover:text-gray-700 bg-gray-50'
                  }`}
                  onClick={() => setTab('manual')}
                >
                  ✏️ Enter Mutation
                </button>
                {!STATIC_MODE && (
                  <button
                    className={`flex-1 py-3 text-sm font-medium transition ${
                      tab === 'upload'
                        ? 'text-brand-600 border-b-2 border-brand-600 bg-white'
                        : 'text-gray-500 hover:text-gray-700 bg-gray-50'
                    }`}
                    onClick={() => setTab('upload')}
                  >
                    📄 Upload Report
                  </button>
                )}
                {STATIC_MODE && (
                  <button
                    className={`flex-1 py-3 text-sm font-medium transition ${
                      tab === 'upload'
                        ? 'text-brand-600 border-b-2 border-brand-600 bg-white'
                        : 'text-gray-500 hover:text-gray-700 bg-gray-50'
                    }`}
                    onClick={() => setTab('upload')}
                  >
                    📄 Upload Report
                  </button>
                )}
              </div>

              <div className="p-6">
                {tab === 'manual' ? (
                  <ManualEntry onAnalyze={handleAnalyze} loading={loading} />
                ) : (
                  <FileUpload onVariantSelected={handleVariantFromUpload} />
                )}
              </div>
            </div>

            {/* Loading */}
            {loading && (
              <div className="mt-6 text-center">
                <div className="inline-flex items-center gap-2 text-sm text-gray-500">
                  <svg className="animate-spin h-4 w-4 text-brand-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Running 4-tier analysis (ClinVar · gnomAD · ClinicalTrials.gov)...
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Demo chips */}
            <div className="mt-6">
              <p className="text-xs font-semibold text-gray-500 mb-2 text-center uppercase tracking-wide">Example cases</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  { label: '🫁 CFTR F508del', sublabel: 'CF · ♂ age 24', gene: 'CFTR', hgvs: 'c.1521_1523del', disease: 'Cystic Fibrosis (CFTR)', age: 24, fc: 'f508del', sex: 'MALE' as const },
                  { label: '💪 DMD Exon 50 del', sublabel: 'Duchenne MD · ♂ age 12', gene: 'DMD', hgvs: 'c.6439-?_6912+?del', disease: 'Duchenne Muscular Dystrophy (DMD)', age: 12, fc: null, sex: 'MALE' as const },
                  { label: '🧠 SOD1 A4V', sublabel: 'ALS · age 52', gene: 'SOD1', hgvs: 'c.14C>T', disease: 'ALS — SOD1', age: 52, fc: 'sod1_als', sex: null },
                  { label: '❤️ TTR V30M', sublabel: 'Amyloidosis · age 45', gene: 'TTR', hgvs: 'c.148G>A', disease: 'TTR Amyloidosis', age: 45, fc: null, sex: null },
                  { label: '🎗️ BRCA2 c.5946del', sublabel: 'Hereditary Cancer · ♀ age 35', gene: 'BRCA2', hgvs: 'c.5946del', disease: 'Hereditary Breast/Ovarian Cancer', age: 35, fc: null, sex: 'FEMALE' as const },
                  { label: '🩸 HBB HbS', sublabel: 'Sickle Cell · age 28', gene: 'HBB', hgvs: 'c.20A>T', disease: 'Sickle Cell Disease', age: 28, fc: 'sickle_cell', sex: null },
                  { label: '🧬 APOE4', sublabel: "Alzheimer's risk · age 60", gene: 'APOE', hgvs: 'c.388T>C', disease: "Alzheimer's Disease (APOE)", age: 60, fc: null, sex: null },
                ].map(demo => (
                  <button
                    key={demo.label}
                    className="flex flex-col items-center text-xs bg-white border border-gray-200 text-gray-600 px-3 py-2 rounded-xl hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50 transition shadow-sm"
                    onClick={() => handleAnalyze(demo.gene, demo.hgvs, demo.disease, demo.age, demo.fc, demo.sex)}
                  >
                    <span className="font-semibold">{demo.label}</span>
                    <span className="text-gray-400 mt-0.5">{demo.sublabel}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-4 text-sm text-gray-500 bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
              <p>
                <span className="font-medium text-gray-700">GermlineRx</span> matched your variant against FDA-approved therapies,
                recruiting clinical trials, and emerging research programs.
                {!STATIC_MODE && ' Enrichment data from Biomni biomedical databases.'}
              </p>
              <button
                onClick={() => setResults(null)}
                className="shrink-0 text-xs bg-brand-50 text-brand-700 border border-brand-200 px-3 py-1.5 rounded-full hover:bg-brand-100 transition font-medium"
              >
                ← New Search
              </button>
            </div>
            <ResultsPanel data={results} onReset={() => setResults(null)} />
          </div>
        )}
      </main>
    </div>
  )
}
